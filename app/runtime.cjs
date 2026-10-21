const {spawn,execFile}=require('node:child_process');
const path=require('node:path'),crypto=require('node:crypto');
const MODEL='dealignai/DeepSeek-V4.1-Flash-1017-UNCENSORED-FP8';
const exec=(file,args,options={})=>new Promise((resolve,reject)=>execFile(file,args,{windowsHide:true,timeout:30000,maxBuffer:200000,...options},(e,out,err)=>e?reject(Error((err||e.message).slice(-1500))):resolve(out)));
class Runtime{
 constructor(source,emit){this.source=source;this.emit=emit;this.child=null;this.group=null;this.distro=null;this.token=crypto.randomBytes(32).toString('hex');this.ready=false;this.status='Not started';}
 snapshot(){return {running:!!this.child,ready:this.ready,status:this.status,model:MODEL};}
 update(text){this.status=text;this.emit({type:'runtime',...this.snapshot()});}
 async locate(){
  if(process.platform!=='win32')throw Error('Automatic 1017 setup targets Windows with WSL2 and NVIDIA GPUs. This Mac cannot run its CUDA reference engine.');
  const names=(await exec('wsl.exe',['--list','--quiet'],{encoding:'utf16le'})).replace(/\0/g,'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  this.distro=names.find(x=>/^Ubuntu(?:-|$)/i.test(x));
  if(!this.distro)throw Error('Ubuntu on WSL2 is not installed. Click Install WSL, finish Windows setup/reboot if requested, then retry.');
  return (await exec('wsl.exe',['-d',this.distro,'--exec','wslpath','-u',this.source])).trim();
 }
 async check(){if(this.child)throw Error('Stop the model before checking setup.');const dir=await this.locate();const out=await exec('wsl.exe',['-d',this.distro,'--exec','python3',dir+'/manage.py','check']);return JSON.parse(out.trim().split('\n').at(-1));}
 async installWSL(){if(process.platform!=='win32')throw Error('Run this on Windows.');await exec('powershell.exe',['-NoProfile','-Command',"Start-Process wsl.exe -Verb RunAs -ArgumentList '--install','--distribution','Ubuntu','--no-launch'" ]);return 'Windows setup opened. Complete its prompts and restart Windows if requested. Ubuntu may require its first-run account setup.';}
 async start(action,hfToken=''){
  if(this.child)throw Error('The runtime is already running or setting up.');
  if(!['setup','start'].includes(action))throw Error('Invalid runtime action');
  const dir=await this.locate();const check=await this.check();
  if(check.blockers.length)throw Error(check.blockers.join('\n'));
  if(action==='setup'){
   this.update('Preparing Python in Ubuntu…');
   await exec('wsl.exe',['-d',this.distro,'-u','root','--exec','sh','-c','apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y python3 python3-venv python3-pip build-essential'],{timeout:600000,maxBuffer:1000000});
  }
  const env={...process.env,DEEPSEEK_DESK_TOKEN:this.token,WSLENV:'DEEPSEEK_DESK_TOKEN:HF_TOKEN',HF_TOKEN:hfToken};
  this.child=spawn('wsl.exe',['-d',this.distro,'--exec','python3','-u',dir+'/manage.py',action],{windowsHide:true,env,stdio:['ignore','pipe','pipe']});
  this.ready=false;this.update(action==='setup'?'Starting exact 1017 setup…':'Loading exact 1017…');
  let pending='';
  this.child.stdout.on('data',b=>{pending+=b.toString();if(pending.length>200000)pending=pending.slice(-200000);let i;while((i=pending.indexOf('\n'))>=0){const line=pending.slice(0,i);pending=pending.slice(i+1);try{const d=JSON.parse(line);if(Number.isInteger(d.runtime_pid)&&d.runtime_pid>1)this.group=d.runtime_pid;if(d.status)this.update(d.status);if(d.ready===true&&d.model===MODEL){this.ready=true;this.update('Exact 1017 is ready');}}catch{}this.emit({type:'runtimeLog',text:(line+'\n').replaceAll(hfToken||'\u0000','[redacted]')});}});
  this.child.stderr.on('data',b=>this.emit({type:'runtimeLog',text:b.toString().replaceAll(hfToken||'\u0000','[redacted]')}));
  this.child.on('error',e=>this.update(e.message));
  this.child.on('close',code=>{this.child=null;this.ready=false;this.group=null;this.update(code===0?'Model stopped':'Runtime stopped (exit '+code+'). See setup log.');});
  return this.snapshot();
 }
 async stop(){if(this.group&&this.distro){await exec('wsl.exe',['-d',this.distro,'--exec','kill','-TERM','--','-'+this.group]).catch(()=>{});}this.child?.kill();this.ready=false;}
}
module.exports={Runtime,MODEL};
