const {test}=require('node:test'),assert=require('node:assert/strict');
const {WslSetup,ubuntuRows}=require('../app/wsl.cjs');
test('WSL list parses localized states and rejects headers',()=>{
 assert.deepEqual(ubuntuRows(' NAME STATE VERSION\n* Ubuntu-24.04 Arrêté 2\n Ubuntu Running 1'),[{name:'Ubuntu-24.04',version:2},{name:'Ubuntu',version:1}]);
});
test('ready requires WSL2 and an executable Linux user probe',async()=>{
 const w=new WslSetup(async(_f,args)=>args[0]==='--list'?'* Ubuntu Stopped 2':'alice\n','win32');
 assert.equal((await w.inspect()).ready,true);
 const old=new WslSetup(async()=>'* Ubuntu Stopped 1','win32');
 assert.equal((await old.inspect()).state,'wsl1');
 const broken=new WslSetup(async(_f,args)=>{if(args[0]==='--list')return '* Ubuntu Stopped 2';throw Error('needs initialization');},'win32');
 assert.equal((await broken.inspect()).ready,false);
});
test('installer waits, handles reboot, and releases busy state',async()=>{
 let installArgs;
 const w=new WslSetup(async(file,args)=>{if(file==='wsl.exe')return '';installArgs=args;return '3010\n';},'win32');
 assert.match(await w.install(),/requires a restart/);
 assert.match(installArgs.at(-1),/-Wait -PassThru/);
 assert.equal(w.busy,false);
});
test('installer errors and cancellation never report success',async()=>{
 const w=new WslSetup(async(file)=>{if(file==='wsl.exe')return '';throw Error('operation canceled');},'win32');
 await assert.rejects(w.install(),/did not complete.*canceled/);
 assert.equal(w.busy,false);
 const bad=new WslSetup(async(file)=>file==='wsl.exe'?'':'42','win32');
 await assert.rejects(bad.install(),/exited with code 42/);
});
test('successful installer probes readiness again instead of assuming success',async()=>{
 const w=new WslSetup(async(file)=>file==='wsl.exe'?'':'0','win32');
 assert.match(await w.install(),/not registered/);
});
test('Mac does not launch WSL installation',async()=>{
 const w=new WslSetup(async()=>{throw Error('must not execute');},'darwin');
 assert.equal((await w.inspect()).state,'unsupported');
 await assert.rejects(w.install(),/only on Windows/);
});
