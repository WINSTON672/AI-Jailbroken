const {execFile}=require('node:child_process');
const run=(file,args,options={})=>new Promise((resolve,reject)=>execFile(file,args,{windowsHide:true,timeout:30000,maxBuffer:200000,...options},(err,out,stderr)=>err?reject(Error(String(stderr||err.message).replace(/\0/g,'').slice(-1500))):resolve(out)));
function ubuntuRows(text){return String(text).replace(/\0/g,'').split(/\r?\n/).flatMap(line=>{const m=line.trim().replace(/^\*\s*/,'').match(/^(Ubuntu(?:-[\w.-]+)?)\s+.+\s+([12])\s*$/i);return m?[{name:m[1],version:Number(m[2])}]:[];});}
class WslSetup {
 constructor(execute=run,platform=process.platform){this.run=execute;this.platform=platform;this.busy=false;}
 async inspect(){
  if(this.platform!=='win32')return {ready:false,state:'unsupported',message:'Automatic 1017 setup requires Windows, WSL2 and NVIDIA GPUs. On Mac, connect a local model server in Settings.'};
  let rows;
  try{rows=ubuntuRows(await this.run('wsl.exe',['--list','--verbose'],{encoding:'utf16le'}));}catch(e){return {ready:false,state:'unavailable',message:'WSL is unavailable. Click Install WSL2; if you just installed it, restart Windows and check again. '+e.message};}
  const distro=rows.find(x=>x.version===2)||rows[0];
  if(!distro)return {ready:false,state:'missing',message:'Ubuntu is not registered. Click Install WSL2. If installation already finished, restart Windows if requested, then click Open Ubuntu to finish its first launch.'};
  if(distro.version!==2)return {ready:false,state:'wsl1',distro:distro.name,message:'Ubuntu uses WSL1. Back up its data, then convert it in PowerShell with: wsl --set-version '+distro.name+' 2. Check again after conversion.'};
  try{const user=(await this.run('wsl.exe',['-d',distro.name,'--exec','id','-un'])).trim();if(!user)throw Error('No default Linux user returned.');return {ready:true,state:'ready',distro:distro.name,user,message:'Ubuntu on WSL2 is ready. Next: Check this PC, then Download & set up.'};}
  catch(e){return {ready:false,state:'initialization',distro:distro.name,message:'Ubuntu could not start. Open Ubuntu to finish its setup; restart Windows if requested. '+e.message};}
 }
 async install(update=()=>{}){
  if(this.platform!=='win32')throw Error('WSL2 installation is available only on Windows.');
  if(this.busy)throw Error('WSL installation is already running.');
  this.busy=true;
  try{
   const before=await this.inspect();if(before.ready||before.state==='wsl1')return before.message;
   update('Approve the Windows administrator prompt. Waiting for the WSL installer to finish…');
   const script="$ErrorActionPreference='Stop'; $p=Start-Process wsl.exe -Verb RunAs -ArgumentList '--install','--distribution','Ubuntu' -Wait -PassThru; Write-Output $p.ExitCode";
   const result=await this.run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{timeout:1200000});
   const code=Number(String(result).trim());
   if(!String(result).trim()||!Number.isInteger(code))throw Error('Windows installer returned no exit status. Check its window and retry Check this PC.');
   if(code===3010||code===1641)return 'Windows requires a restart. Save your work and restart, reopen DeepSeek Desk, then click Check this PC. The model has not been downloaded yet.';
   if(code!==0)throw Error('WSL installer exited with code '+code+'. Check the Windows installer window for details. If it requests a restart, restart before trying again.');
   const after=await this.inspect();return after.message;
  }catch(e){throw Error('WSL setup did not complete: '+e.message+' If you declined the administrator prompt, click Install WSL2 again to retry.');}
  finally{this.busy=false;}
 }
 async openUbuntu(){
  if(this.platform!=='win32')throw Error('Ubuntu/WSL is available only on Windows.');
  if(this.busy)throw Error('Wait for WSL installation to finish.');
  const state=await this.inspect();const name=state.distro||'Ubuntu';
  if(!/^Ubuntu(?:-[\w.-]+)?$/i.test(name))throw Error('Invalid Ubuntu distribution name.');
  await this.run('powershell.exe',['-NoProfile','-Command',"$ErrorActionPreference='Stop'; Start-Process wsl.exe -ArgumentList '-d','"+name+"'" ]);
  return 'Ubuntu opened. Complete any username/password prompts there, then return and click Check this PC.';
 }
}
module.exports={WslSetup,ubuntuRows};
