"""Loopback-only OpenAI-style adapter for the shipped DeepSeek reference runtime."""
import argparse,copy,json,os,sys,threading,uuid
from http.server import BaseHTTPRequestHandler,HTTPServer
from pathlib import Path
MODEL='dealignai/DeepSeek-V4.1-Flash-1017-UNCENSORED-FP8'
ROOT=Path(__file__).resolve().parent

def normalize(data):
    if data.get('model')!=MODEL: raise ValueError('This server only runs the exact 1017 checkpoint')
    if data.get('stream'): raise ValueError('Streaming is not supported by this reference adapter')
    messages=copy.deepcopy(data.get('messages'))
    if not isinstance(messages,list) or not messages: raise ValueError('messages must be nonempty')
    if data.get('tools'): messages[0]['tools']=data['tools']
    limit=int(data.get('max_tokens',1024))
    if not 1<=limit<=4096: raise ValueError('max_tokens must be 1..4096')
    return messages,limit

def main():
    import torch
    import torch.distributed as dist
    sys.path.insert(0,str(ROOT/'inference'));sys.path.insert(0,str(ROOT/'encoding'))
    from model import Transformer,ModelArgs
    from generate import generate
    from encoding import encode_messages,parse_message_from_completion_text,eos_token
    from transformers import AutoTokenizer
    from safetensors.torch import load_model
    p=argparse.ArgumentParser();p.add_argument('--checkpoint',required=True);a=p.parse_args()
    token=os.environ.get('DEEPSEEK_DESK_TOKEN')
    if not token: raise SystemExit('Missing local server authentication token')
    rank=int(os.environ.get('RANK',0));world=int(os.environ.get('WORLD_SIZE',1));local=int(os.environ.get('LOCAL_RANK',0))
    if world>1: dist.init_process_group('nccl')
    torch.cuda.set_device(local);torch.set_default_dtype(torch.bfloat16);torch.set_num_threads(8);torch.manual_seed(33377335)
    cfg=json.loads((ROOT/'inference/config.json').read_text());cfg.update(max_batch_size=1,max_seq_len=16384,temperature=0.6)
    args=ModelArgs(**cfg);tokenizer=AutoTokenizer.from_pretrained(a.checkpoint,trust_remote_code=False)
    with torch.device('cuda'): model=Transformer(args,tokenizer)
    load_model(model,str(Path(a.checkpoint)/f'model{rank}-mp{world}.safetensors'))
    torch.set_default_device('cuda')
    if world>1: dist.barrier()
    def broadcast(value):
        objs=[value]
        if world>1: dist.broadcast_object_list(objs,0)
        return objs[0]
    def infer(job):
        tokens,limit=job
        with torch.inference_mode(): out=generate(model,[tokens],limit,tokenizer.eos_token_id)[0]
        if rank: return
        text=tokenizer.decode(out)
        # Upstream generate removes EOS. Reattach only when generation ended early.
        if len(out)>=limit:
            message={'role':'assistant','content':text};reason='length'
        else:
            message=parse_message_from_completion_text(text+eos_token,thinking_mode='chat')
            reason='tool_calls' if message.get('tool_calls') else 'stop'
        return {'id':'chatcmpl-'+uuid.uuid4().hex,'object':'chat.completion','model':MODEL,'choices':[{'index':0,'finish_reason':reason,'message':message}]}
    if rank:
        while True: infer(broadcast(None))
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*_): pass
        def reply(self,status,value):
            body=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        def auth(self):
            import hmac
            return hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+token)
        def do_GET(self):
            if not self.auth(): return self.reply(401,{'error':'Unauthorized'})
            if self.path=='/v1/models': return self.reply(200,{'data':[{'id':MODEL,'object':'model'}]})
            self.reply(404,{'error':'Not found'})
        def do_POST(self):
            if not self.auth(): return self.reply(401,{'error':'Unauthorized'})
            if self.path!='/v1/chat/completions': return self.reply(404,{'error':'Not found'})
            try:
                size=int(self.headers.get('Content-Length',0))
                if not 0<size<=1000000: raise ValueError('Request exceeds size limit')
                messages,limit=normalize(json.loads(self.rfile.read(size)))
                tokens=tokenizer.encode(encode_messages(messages,thinking_mode='chat'))
                if len(tokens)+limit>args.max_seq_len: raise ValueError('Conversation exceeds 16384-token context. Start a new chat.')
            except Exception as exc: return self.reply(400,{'error':str(exc)})
            try: self.reply(200,infer(broadcast((tokens,limit))))
            except Exception as exc:
                self.reply(500,{'error':'Model inference failed: '+str(exc)})
                # All ranks must exit after a failed collective; never reuse partial state.
                os._exit(1)
    server=HTTPServer(('127.0.0.1',11436),Handler)
    print(json.dumps({'ready':True,'model':MODEL,'url':'http://127.0.0.1:11436/v1'}),flush=True)
    server.serve_forever()
if __name__=='__main__': main()
