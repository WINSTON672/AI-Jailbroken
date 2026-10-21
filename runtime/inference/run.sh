#!/usr/bin/env bash
#
# Run the reference inference on a converted checkpoint.
#
#   ./run.sh /path/to/DeepSeek-V4.1-Exp-TP8
#   ./run.sh /path/to/DeepSeek-V4.1-Exp-TP8 examples/example_harmony.json
#   MP=4 ./run.sh /path/to/DeepSeek-V4.1-Exp-TP4
#
# Paths inside an example are resolved from this directory, so run it from anywhere.

set -euo pipefail
cd "$(dirname "$0")"

CKPT_PATH="${1:-${CKPT_PATH:-}}"
INPUT_FILE="${2:-${INPUT_FILE:-examples/example_harmony.json}}"
MP="${MP:-8}"
CONFIG="${CONFIG:-config.json}"

usage() {
    echo "usage: $0 <checkpoint-dir> [input-file]" >&2
    echo >&2
    echo "  checkpoint-dir  holds model0-mp${MP}.safetensors .. model$((MP - 1))-mp${MP}.safetensors," >&2
    echo "                  as produced by convert.py --model-parallel ${MP}" >&2
    echo "  input-file      TXT or JSON prompts (default: examples/example.txt)" >&2
    echo >&2
    echo "  MP=${MP}  CONFIG=${CONFIG}   override with environment variables" >&2
    exit 1
}

[ -n "${CKPT_PATH}" ] || usage

if [ ! -d "${CKPT_PATH}" ]; then
    echo "error: checkpoint directory not found: ${CKPT_PATH}" >&2
    usage
fi

missing=0
for rank in $(seq 0 $((MP - 1))); do
    if [ ! -f "${CKPT_PATH}/model${rank}-mp${MP}.safetensors" ]; then
        missing=$((missing + 1))
    fi
done
if [ "${missing}" -ne 0 ]; then
    echo "error: ${CKPT_PATH} is missing ${missing} of the ${MP} shards MP=${MP} needs" >&2
    echo "       expected model0-mp${MP}.safetensors .. model$((MP - 1))-mp${MP}.safetensors" >&2
    usage
fi

[ -f "${INPUT_FILE}" ] || { echo "error: input file not found: ${INPUT_FILE}" >&2; usage; }

torchrun --nproc-per-node "${MP}" generate.py \
    --ckpt-path "${CKPT_PATH}" \
    --config "${CONFIG}" \
    --input-file "${INPUT_FILE}"
