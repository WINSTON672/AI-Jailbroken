const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {Updates,newer}=require('../app/updates.cjs');
function fixture(platform='win32',fetcher){const updater=new EventEmitter();updater.setFeedURL=v=>updater.feed=v;updater.checkForUpdates=async()=>updater.emit('update-available',{version:'0.3.3'});updater.downloadUpdate=async()=>updater.emit('update-downloaded');updater.quitAndInstall=()=>{updater.installed=true;};const u=new Updates({version:'0.3.2',platform,packaged:true,emit:()=>{},updater,fetcher,openExternal:async url=>{updater.opened=url;}});return {u,updater};}
test('update download and install require separate explicit actions',async()=>{
 const {u,updater}=fixture();assert.equal(updater.autoDownload,false);assert.equal(updater.autoInstallOnAppQuit,false);
 assert.throws(()=>u.install(),/No downloaded/);
 await u.check();assert.equal(u.state.status,'available');assert.equal(updater.installed,undefined);
 await u.download();assert.equal(u.state.status,'downloaded');assert.equal(updater.installed,undefined);
 u.install();assert.equal(updater.installed,true);
});
test('failed checks remain retryable',async()=>{
 const {u,updater}=fixture();updater.checkForUpdates=async()=>{throw Error('offline');};
 await u.check();assert.equal(u.state.status,'error');assert.equal(u.checking,false);
 updater.checkForUpdates=async()=>updater.emit('update-not-available');await u.check();assert.equal(u.state.status,'current');
});
test('Mac detects a newer release and opens only the fixed release URL',async()=>{
 const {u,updater}=fixture('darwin',async()=>({ok:true,json:async()=>({tag_name:'deepseek-desk-v0.3.3',html_url:'https://evil.invalid'})}));
 await u.check();assert.equal(u.state.status,'available');await u.download();
 assert.equal(updater.opened,'https://github.com/WINSTON672/deepseek-desk/releases/latest');
 assert.equal(updater.installed,undefined);
});
test('version comparison does not offer downgrades or malformed releases',()=>{
 assert.equal(newer('0.3.10','0.3.2'),true);assert.equal(newer('0.3.1','0.3.2'),false);assert.equal(newer('bad','0.3.2'),false);assert.equal(newer('0.3.2','0.3.2'),false);
});
