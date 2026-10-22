"""Exact-checkpoint setup and launch; run in WSL/Linux, never substitutes models."""
import argparse,json,os,shutil,subprocess,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent
HOME=Path.home()/'.local/share/deepseek-desk-1017'
REPO='dealignai/DeepSeek-V4.1-Flash-1017-UNCENSORED-FP8'
REV='c19ca5ca4eaeb79d29fdf08aea8327da95b1116a'
WEIGHT_BYTES=510296709176

def report():
    HOME.mkdir(parents=True,exist_ok=True)
    try:
        r=subprocess.run(['nvidia-smi','--query-gpu=memory.total,memory.free','--format=csv,noheader,nounits'],capture_output=True,text=True,timeout=15,check=True)
        gpus=[list(map(int,line.split(','))) for line in r.stdout.strip().splitlines()]
    except Exception: gpus=[]
    mem=0
    try: mem=int(next(x.split()[1] for x in Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')))*1024
    except Exception: pass
    state=HOME/'ready.json'
    ready=state.exists()
    if ready:
        try:
            n=json.loads(state.read_text())['mp']
            ready=all((HOME/f'converted/model{i}-mp{n}.safetensors').is_file() for i in range(n))
        except Exception: ready=False
    disk=shutil.disk_usage(HOME).free
    reasons=[]
    warnings=[]
    if not gpus: reasons.append('NVIDIA GPUs are not visible to WSL. The exact reference runtime requires CUDA.')
    elif sum(g[1] for g in gpus)*1024**2 < WEIGHT_BYTES*1.1: warnings.append('This reference runtime needs about 523 GiB of free aggregate GPU memory as a conservative setup estimate. Detected %.1f GiB.'%(sum(g[1] for g in gpus)/1024))
    if gpus and (384%len(gpus) or 128%len(gpus) or 64%len(gpus)): reasons.append('Visible GPU count does not divide the model tensor-parallel dimensions.')
    if not ready:
        if disk<WEIGHT_BYTES*2.2: warnings.append('Fresh setup needs approximately 1.13 TB free disk for original and converted weights plus working space.')
        if mem<WEIGHT_BYTES*1.2: warnings.append('The upstream converter retains tensors in RAM; this setup requires approximately 612 GB available system RAM before conversion.')
    return {'model':REPO,'revision':REV,'gpu_count':len(gpus),'free_gpu_gib':sum(g[1] for g in gpus)/1024,'available_ram_gib':round(mem/1024**3,1),'free_disk_gib':round(disk/1024**3,1),'converted':ready,'blockers':reasons,'warnings':warnings,'note':'Conservative reference-runtime estimates, not universal hardware requirements. No CPU offload or smaller replacement is implemented.'}

def run(args): subprocess.run([str(x) for x in args],check=True)
def event(message): print(json.dumps({'status':message}),flush=True)

def enforce_report(r,try_anyway=False):
    if r['blockers']: raise SystemExit('Runtime unavailable: '+' '.join(r['blockers']))
    if r.get('warnings') and not try_anyway: raise SystemExit('Resource estimates exceeded. Enable Try anyway to proceed: '+' '.join(r['warnings']))

def main():
    p=argparse.ArgumentParser();p.add_argument('action',choices=['check','setup','start']);p.add_argument('--try-anyway',action='store_true');a=p.parse_args()
    if a.action!='check':
        if os.getsid(0)!=os.getpid(): os.setsid()
        print(json.dumps({'runtime_pid':os.getpid()}),flush=True)
    r=report();print(json.dumps(r),flush=True)
    if a.action=='check': return
    enforce_report(r,a.try_anyway)
    if r['warnings']: event('Resource estimates: '+' '.join(r['warnings']))
    py=HOME/'venv/bin/python'
    if a.action=='setup' and not r['converted']:
        event('Creating isolated Python runtime')
        if not py.exists(): run([sys.executable,'-m','venv',HOME/'venv'])
        event('Installing reference runtime dependencies')
        run([py,'-m','pip','install','-r',ROOT/'inference/requirements.txt','huggingface_hub'])
        event('Checking CUDA visibility and compiling the upstream small kernel test')
        run([py,ROOT/'inference/model.py'])
        # No model code from the hub is executed; the shipped reference source is used.
        event('Downloading exact pinned 1017 checkpoint (about 510 GB); Hugging Face downloads resume on retry')
        run([py,'-c','from huggingface_hub import snapshot_download; import sys; snapshot_download(repo_id=sys.argv[1],revision=sys.argv[2],local_dir=sys.argv[3],allow_patterns=["*.safetensors","*.json"],max_workers=2)',REPO,REV,HOME/'weights'])
        event('Converting checkpoint for the detected GPUs; this may take a long time')
        run([py,ROOT/'inference/convert.py','--hf-ckpt-path',HOME/'weights','--save-path',HOME/'converted','--model-parallel',r['gpu_count'],'--expert-dtype','fp4','--tokenizer-path',HOME/'weights'])
        (HOME/'ready.json').write_text(json.dumps({'mp':r['gpu_count'],'revision':REV}))
    if not (HOME/'ready.json').exists(): raise SystemExit('Model is not installed. Use Download & set up first.')
    mp=json.loads((HOME/'ready.json').read_text())['mp']
    if mp!=r['gpu_count']: raise SystemExit('GPU count changed since conversion; reconversion is required.')
    event('Loading exact 1017 model into GPU memory')
    os.execv(str(py),[str(py),'-m','torch.distributed.run','--standalone','--nproc_per_node',str(mp),str(ROOT/'server.py'),'--checkpoint',str(HOME/'converted')])
if __name__=='__main__': main()
