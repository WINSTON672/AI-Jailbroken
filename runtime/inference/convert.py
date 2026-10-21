import json
import os
import re
import shutil
from argparse import ArgumentParser
from glob import glob
from tqdm import tqdm, trange

import torch
from safetensors.torch import safe_open, save_file


FP4_TABLE = torch.tensor(
    [0.0, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 6.0, 0.0, -0.5, -1.0, -1.5, -2.0, -3.0, -4.0, -6.0], dtype=torch.float32
)


def cast_e2m1fn_to_e4m3fn(x: torch.Tensor, scale: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Casts a tensor from e2m1fn to e4m3fn losslessly.
    """
    assert x.dtype == torch.int8
    assert x.ndim == 2
    out_dim, in_dim = x.size()
    in_dim *= 2
    fp8_block_size = 32
    fp4_block_size = 32
    assert in_dim % fp8_block_size == 0 and out_dim % fp8_block_size == 0
    assert scale.size(0) == out_dim and scale.size(1) == in_dim // fp4_block_size

    x = x.view(torch.uint8)
    low = x & 0x0F
    high = (x >> 4) & 0x0F
    x = torch.stack([FP4_TABLE[low.long()], FP4_TABLE[high.long()]], dim=-1).flatten(2)

    # max_fp4 (6.0) * MAX_OFFSET must fit in e4m3fn (max 448)
    # 6.0 * 2^6 = 384 < 448; 6.0 * 2^7 = 768 > 448; so MAX_OFFSET_BITS = 6
    MAX_OFFSET_BITS = 6

    bOut = out_dim // fp8_block_size
    bIn = in_dim // fp8_block_size
    # bOut, bIn, fp8_block_size, fp8_block_size
    x = x.view(bOut, fp8_block_size, bIn, fp8_block_size).transpose(1, 2)
    # bOut, bIn, fp8_block_size * (fp8_block_size // fp4_block_size)
    scale = scale.float().view(bOut, fp8_block_size, bIn, -1).transpose(1, 2).flatten(2)
    ## bOut, bIn, 1
    scale_max_offset_bits = scale.amax(dim=-1, keepdim=True) / (2**MAX_OFFSET_BITS)
    # bOut, bIn, fp8_block_size * (fp8_block_size // fp4_block_size)
    offset = scale / scale_max_offset_bits
    # bOut, bIn, fp8_block_size, fp8_block_size
    offset = offset.unflatten(-1, (fp8_block_size, -1)).repeat_interleave(fp4_block_size, dim=-1)
    x = (x * offset).transpose(1, 2).reshape(out_dim, in_dim)
    return x.to(torch.float8_e4m3fn), scale_max_offset_bits.squeeze(-1).to(torch.float8_e8m0fnu)


mapping = {
    "embed": ("embed", 0),
    "wq_b": ("wq_b", 0),
    "wo_a": ("wo_a", 0),
    "wo_b": ("wo_b", 1),
    "head": ("head", 0),
    "attn_sink": ("attn_sink", 0),
    "weights_proj": ("weights_proj", 0),
}


def infer_num_experts(names) -> tuple[int, int]:
    """Number of routed experts in the backbone and in the MTP layers, from the weight names."""
    counts = [0, 0]
    for name in names:
        name = name.removeprefix("model.")
        match = re.search(r"(?:mlp|ffn)\.experts\.(\d+)\.", name)
        if match:
            is_mtp = name.startswith("mtp.")
            counts[is_mtp] = max(counts[is_mtp], int(match.group(1)) + 1)
    assert counts[0], "no routed experts found in the checkpoint"
    return counts[0], counts[1] or counts[0]


def main(hf_ckpt_path, save_path, mp, expert_dtype, tokenizer_path=None):
    """Shard an exported HuggingFace checkpoint into `mp` files for this inference stack."""
    torch.set_num_threads(8)
    state_dicts = [{} for _ in range(mp)]
    os.makedirs(save_path, exist_ok=True)

    index_path = os.path.join(hf_ckpt_path, "model.safetensors.index.json")
    expected_names = set(json.load(open(index_path))["weight_map"]) if os.path.exists(index_path) else None
    seen_names = set()

    all_names = expected_names
    if all_names is None:
        all_names = set()
        for file_path in glob(os.path.join(hf_ckpt_path, "*.safetensors")):
            with safe_open(file_path, framework="pt", device="cpu") as f:
                all_names.update(f.keys())
    n_experts, mtp_n_experts = infer_num_experts(all_names)
    assert n_experts % mp == 0 and mtp_n_experts % mp == 0, (n_experts, mtp_n_experts, mp)
    print(f"{n_experts=} {mtp_n_experts=}")

    for file_path in tqdm(glob(os.path.join(hf_ckpt_path, "*.safetensors"))):
        with safe_open(file_path, framework="pt", device="cpu") as f:
            for source_name in f.keys():
                seen_names.add(source_name)
                name = source_name
                if name.startswith("model."):
                    name = name[len("model.") :]
                param: torch.Tensor = f.get_tensor(source_name)
                # an MTP layer ties its token embedding and output head to the backbone's
                if name.startswith("mtp.") and name.split(".", 2)[-1] in ("embed.weight", "head.weight"):
                    continue
                name = name.replace("self_attn", "attn")
                if not name.startswith("vision."):
                    name = name.replace("mlp", "ffn")
                name = name.replace("weight_scale_inv", "scale")
                name = name.replace("e_score_correction_bias", "bias")
                if any(
                    x in name for x in ["hc", "attn_sink", "tie2eid", "tid2eid", "ape", "image_"]
                ):  # without .weight
                    key = name.split(".")[-1]
                else:
                    key = name.split(".")[-2]
                if key in mapping:
                    new_key, dim = mapping[key]
                else:
                    new_key, dim = key, None
                name = name.replace(key, new_key)
                for i in range(mp):
                    new_param = param
                    if "experts" in name and "shared_experts" not in name:
                        current_n_experts = mtp_n_experts if name.startswith("mtp.") else n_experts
                        n_local_experts = current_n_experts // mp
                        idx = int(name.split(".")[-3])
                        if idx < i * n_local_experts or idx >= (i + 1) * n_local_experts:
                            continue
                    elif ".engram.embed." in name:
                        shard_size = (param.size(0) + mp - 1) // mp
                        new_param = param[i * shard_size : (i + 1) * shard_size].contiguous()
                        if new_param.size(0) < shard_size:
                            pad_value = 1 if name.endswith(".scale") else 0
                            padding = param.new_full((shard_size - new_param.size(0), param.size(1)), pad_value)
                            new_param = torch.cat([new_param, padding])
                    elif dim is not None:
                        assert param.size(dim) % mp == 0, f"Dimension {dim} must be divisible by {mp}"
                        shard_size = param.size(dim) // mp
                        new_param = param.narrow(dim, i * shard_size, shard_size).contiguous()
                    state_dicts[i][name] = new_param

    if expected_names is not None:
        assert seen_names == expected_names, (
            f"checkpoint shards incomplete: {len(expected_names - seen_names)} tensors missing, "
            f"{len(seen_names - expected_names)} unexpected (source may be mid-upload)"
        )

    for i in trange(mp):
        names = list(state_dicts[i].keys())
        for name in names:
            if name.endswith("wo_a.weight"):
                weight = state_dicts[i][name]
                scale = state_dicts[i].pop(name.replace("weight", "scale"))
                assert weight.size(0) % scale.size(0) == 0
                assert weight.size(1) % scale.size(1) == 0
                out_block_size = weight.size(0) // scale.size(0)
                in_block_size = weight.size(1) // scale.size(1)
                assert (out_block_size, in_block_size) in ((32, 32), (128, 128)), (
                    name,
                    weight.shape,
                    scale.shape,
                )
                weight = (
                    weight.unflatten(0, (-1, out_block_size)).unflatten(-1, (-1, in_block_size)).float()
                    * scale[:, None, :, None].float()
                )
                state_dicts[i][name] = weight.flatten(2, 3).flatten(0, 1).bfloat16()
            elif "experts" in name and state_dicts[i][name].dtype == torch.int8:
                if expert_dtype == "fp8":
                    scale_name = name.replace("weight", "scale")
                    weight = state_dicts[i].pop(name)
                    scale = state_dicts[i].pop(scale_name)
                    state_dicts[i][name], state_dicts[i][scale_name] = cast_e2m1fn_to_e4m3fn(weight, scale)
                else:
                    state_dicts[i][name] = state_dicts[i][name].view(torch.float4_e2m1fn_x2)
        save_file(state_dicts[i], os.path.join(save_path, f"model{i}-mp{mp}.safetensors"))

    tokenizer_path = tokenizer_path or hf_ckpt_path
    for file in ["tokenizer.json", "tokenizer_config.json"]:
        old_file_path = os.path.join(tokenizer_path, file)
        new_file_path = os.path.join(save_path, file)
        if os.path.exists(old_file_path):
            shutil.copyfile(old_file_path, new_file_path)


if __name__ == "__main__":
    parser = ArgumentParser()
    parser.add_argument("--hf-ckpt-path", type=str, required=True)
    parser.add_argument("--save-path", type=str, required=True)
    parser.add_argument("--model-parallel", type=int, required=True)
    parser.add_argument("--expert-dtype", type=str, choices=["fp8", "fp4"], default=None)
    parser.add_argument(
        "--tokenizer-path",
        type=str,
        default=None,
        help="Optional tokenizer directory when the HF checkpoint does not contain tokenizer files",
    )
    args = parser.parse_args()
    main(args.hf_ckpt_path, args.save_path, args.model_parallel, args.expert_dtype, args.tokenizer_path)
