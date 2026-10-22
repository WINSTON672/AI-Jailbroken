const RELEASES='https://github.com/WINSTON672/deepseek-desk/releases';
function newer(version,current){const parse=s=>/^\d+\.\d+\.\d+$/.test(s)?s.split('.').map(Number):null;const a=parse(version),b=parse(current);if(!a||!b)return false;for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;}
class Updates {
 constructor({version,platform,packaged,emit,updater,fetcher=fetch,openExternal}){
  Object.assign(this,{version,platform,packaged,emit,updater,fetcher,openExternal});
  this.state={status:'idle',message:'Updates are checked on launch and every 6 hours.',version};this.checking=false;
  if(platform==='win32'&&packaged){
   updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowDowngrade=false;
   updater.setFeedURL({provider:'generic',url:RELEASES+'/latest/download'});
   updater.on('update-available',info=>this.set({status:'available',message:'Version '+info.version+' is available.',nextVersion:info.version}));
   updater.on('update-not-available',()=>this.set({status:'current',message:'You have the latest version ('+version+').'}));
   updater.on('download-progress',p=>this.set({status:'downloading',message:'Downloading update: '+Math.round(p.percent)+'%'}));
   updater.on('update-downloaded',()=>this.set({status:'downloaded',message:'Update downloaded. Save your files and stop running work, then install and restart.'}));
   updater.on('error',e=>this.set({status:'error',message:'Update failed: '+e.message}));
  }
 }
 set(value){this.state={...this.state,...value};this.emit({type:'update',...this.state});return this.state;}
 async check(){
  if(!this.packaged)return this.set({status:'development',message:'Update checks are available in the installed app.'});
  if(this.checking||['downloading','downloaded'].includes(this.state.status))return this.state;
  this.checking=true;this.set({status:'checking',message:'Checking GitHub for updates…'});
  try{
   if(this.platform==='win32')await this.updater.checkForUpdates();
   else{
    const r=await this.fetcher('https://api.github.com/repos/WINSTON672/deepseek-desk/releases/latest',{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw Error('GitHub returned '+r.status);
    const release=await r.json(),version=String(release.tag_name||'').replace(/^deepseek-desk-v/,'');
    if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Unrecognized release version.');
    this.set(newer(version,this.version)?{status:'available',nextVersion:version,message:'Version '+version+' is available. Download its Mac installer to update.'}:{status:'current',message:'You have the latest version ('+this.version+').'});
   }
  }catch(e){this.set({status:'error',message:'Could not check for updates: '+e.message});}
  finally{this.checking=false;}
  return this.state;
 }
 async download(){
  if(this.state.status!=='available')throw Error('Check for an available update first.');
  if(this.platform!=='win32'){await this.openExternal(RELEASES+'/latest');return this.state;}
  this.set({status:'downloading',message:'Downloading update…'});
  try{await this.updater.downloadUpdate();}catch(e){this.set({status:'error',message:'Update download failed: '+e.message});}
  return this.state;
 }
 install(){if(this.platform!=='win32'||this.state.status!=='downloaded')throw Error('No downloaded Windows update is ready.');this.updater.quitAndInstall(false,true);}
 start(){this.initial=setTimeout(()=>this.check(),15000);this.timer=setInterval(()=>this.check(),6*60*60*1000);this.initial.unref?.();this.timer.unref?.();}
 stop(){clearTimeout(this.initial);clearInterval(this.timer);}
}
module.exports={Updates,newer};
