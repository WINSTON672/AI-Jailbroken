const {app,BrowserWindow,ipcMain,dialog,safeStorage,shell}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {Workspace}=require('./workspace.cjs'),{runAgent}=require('./agent.cjs'),{modelBase,jsonFetch,runCommand,searchWeb,discoverModels}=require('./services.cjs');
if(!app.isPackaged && process.env.DEEPSEEK_TEST_DATA)app.setPath('userData',process.env.DEEPSEEK_TEST_DATA);
let win,workspace=null,active=null,terminal=null,settings={base:'http://127.0.0.1:11434/v1',model:'',tools:true,apiKey:'',searchKey:''},tasks=[],data;
const {Runtime,MODEL}=require('./runtime.cjs');
let runtime,updates;
const approvals=new Map();
const emit=e=>{if(win&&!win.isDestroyed())win.webContents.send('event',e);};
const saveTasks=()=>{const f=path.join(data,'tasks.json');fs.writeFileSync(f+'.tmp',JSON.stringify(tasks),{mode:0o600});fs.renameSync(f+'.tmp',f);};
const publicSettings=()=>({base:settings.base,model:settings.model,tools:settings.tools,hasApiKey:!!settings.apiKey,hasSearchKey:!!settings.searchKey,autoStart1017:settings.autoStart1017===true,secretsStored:safeStorage.isEncryptionAvailable()});
function needWorkspace(){if(!workspace)throw Error('Open a workspace folder first.');return workspace;}
function setWorkspace(root){if(active||terminal)throw Error('Stop the running task or command before changing workspace.');workspace=new Workspace(root,path.join(data,'backups'));return {root:workspace.root,files:workspace.list()};}
function approve(value,signal){return new Promise((resolve,reject)=>{const id=crypto.randomUUID();const abort=()=>{approvals.delete(id);emit({type:'approvalClosed',id});reject(Error('Task stopped.'));};signal.addEventListener('abort',abort,{once:true});approvals.set(id,answer=>{signal.removeEventListener('abort',abort);approvals.delete(id);emit({type:'approvalClosed',id});resolve(answer===true)});emit({type:'approval',id,...value});if(signal.aborted)abort();});}
function bind(name,fn){ipcMain.handle(name,async(event,...args)=>{try{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==pathToFileURL(path.join(__dirname,'index.html')).href)throw Error('Untrusted sender.');return {ok:true,value:await fn(...args)};}catch(e){return {ok:false,error:e.message};}});}
app.whenReady().then(()=>{
 data=app.getPath('userData');fs.mkdirSync(data,{recursive:true});
 runtime=new Runtime(app.isPackaged?path.join(process.resourcesPath,'runtime'):path.join(__dirname,'../runtime'),emit);
 try{const saved=JSON.parse(fs.readFileSync(path.join(data,'settings.json'),'utf8'));settings={...settings,base:modelBase(saved.base),model:String(saved.model||''),tools:saved.tools!==false,autoStart1017:saved.autoStart1017===true};for(const k of ['apiKey','searchKey'])if(saved[k]&&safeStorage.isEncryptionAvailable())settings[k]=safeStorage.decryptString(Buffer.from(saved[k],'base64'));}catch{}
 try{const loaded=JSON.parse(fs.readFileSync(path.join(data,'tasks.json'),'utf8'));if(Array.isArray(loaded))tasks=loaded.filter(t=>typeof t.id==='string'&&Array.isArray(t.items)&&Array.isArray(t.protocol)).slice(-100);}catch{}
 win=new BrowserWindow({width:1450,height:930,minWidth:980,minHeight:650,title:'DeepSeek Desk',backgroundColor:'#101214',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));win.loadFile(path.join(__dirname,'index.html'));
 const defaultRoot=path.join(app.getPath('documents'),'DeepSeek Desk Workspace');fs.mkdirSync(defaultRoot,{recursive:true});setWorkspace(defaultRoot);
 const {Updates}=require('./updates.cjs');
 updates=new Updates({version:app.getVersion(),platform:process.platform,packaged:app.isPackaged,emit,updater:process.platform==='win32'?require('electron-updater').autoUpdater:null,openExternal:u=>shell.openExternal(u)});
 updates.start();
 bind('updateState',()=>updates.state);
 bind('updateCheck',()=>updates.check());
 bind('updateDownload',()=>updates.download());
 bind('updateInstall',()=>{if(active||terminal||runtime.child||runtime.wsl.busy)throw Error('Stop the task, command, model or WSL setup before restarting.');updates.install();return true;});
 bind('init',()=>({settings:publicSettings(),tasks:tasks.map(({protocol,...t})=>t),platform:process.platform,workspace:workspace?.root||null,runtime:runtime.snapshot()}));
 bind('chooseWorkspace',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openDirectory']});if(r.canceled)return null;return setWorkspace(r.filePaths[0]);});
 bind('appSource',()=>{const dest=path.join(app.getPath('documents'),'DeepSeek Desk Source');if(!fs.existsSync(dest)){fs.mkdirSync(dest,{recursive:true});if(app.isPackaged)fs.cpSync(path.join(process.resourcesPath,'editable-source'),dest,{recursive:true});else{fs.cpSync(path.join(__dirname),path.join(dest,'app'),{recursive:true});fs.copyFileSync(path.join(app.getAppPath(),'package.json'),path.join(dest,'package.json'));}}return setWorkspace(dest);});
 bind('runtimeCheck',()=>runtime.check());
 bind('runtimeInstallWSL',()=>runtime.installWSL());
 bind('runtimeOpenUbuntu',()=>runtime.openUbuntu());
 bind('runtimeStart',async({action,hfToken})=>{if(active||terminal)throw Error('Stop the current task first.');const r=await runtime.start(action,String(hfToken||''));settings.base='http://127.0.0.1:11436/v1';settings.model=MODEL;settings.apiKey=runtime.token;settings.autoStart1017=true;const stored={base:settings.base,model:MODEL,tools:settings.tools,autoStart1017:true};if(safeStorage.isEncryptionAvailable()&&settings.searchKey)stored.searchKey=safeStorage.encryptString(settings.searchKey).toString('base64');fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify(stored),{mode:0o600});return {runtime:r,settings:publicSettings()};});
 bind('runtimeStop',()=>runtime.stop());
 bind('discover',()=>discoverModels());
 bind('openTaskWorkspace',id=>{const t=tasks.find(t=>t.id===id);if(!t)throw Error('Task not found.');return setWorkspace(t.root);});
 bind('files',()=>needWorkspace().list());bind('readFile',p=>needWorkspace().read(p));
 bind('saveFile',(p,text,hash)=>{if(active)throw Error('Wait for the agent to finish or stop it before manually saving.');const r=needWorkspace().write(p,text,hash);emit({type:'fileChanged',...r});return r;});
 bind('undo',id=>{if(active)throw Error('Stop the agent before undoing an edit.');const r=needWorkspace().restore(id);emit({type:'filesRefresh'});return r;});
 bind('searchFiles',q=>needWorkspace().search(q));
 bind('settings',s=>{if(active||terminal)throw Error('Stop running work before changing settings.');settings.base=modelBase(s.base);if(/cloud/i.test(s.model||''))throw Error('Choose a downloaded local model.');settings.model=String(s.model||'').slice(0,200);settings.tools=s.tools!==false;settings.autoStart1017=s.autoStart1017===true;for(const k of ['apiKey','searchKey']){if(s[k])settings[k]=String(s[k]).slice(0,4000);if(s['clear'+k])settings[k]='';}const stored={base:settings.base,model:settings.model,tools:settings.tools,autoStart1017:settings.autoStart1017};if(safeStorage.isEncryptionAvailable())for(const k of ['apiKey','searchKey'])if(settings[k])stored[k]=safeStorage.encryptString(settings[k]).toString('base64');fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify(stored),{mode:0o600});return publicSettings();});
 bind('models',async()=>{const d=await jsonFetch(modelBase(settings.base)+'/models',{key:settings.apiKey});return (d.data||[]).filter(x=>typeof x.id==='string').map(x=>x.id);});
 bind('newTask',title=>{needWorkspace();if(tasks.length>=100)throw Error('Task limit reached (100). Export old task data from the app data folder before clearing it.');const task={id:crypto.randomUUID(),title:String(title||'New task').slice(0,80),root:workspace.root,items:[],protocol:[],created:Date.now()};tasks.push(task);saveTasks();return task;});
 bind('send',({id,prompt})=>{if(active||terminal)throw Error('Another task or command is running.');const task=tasks.find(t=>t.id===id);if(!task)throw Error('Task not found.');if(task.root!==needWorkspace().root)throw Error('Open this task’s workspace first.');if(typeof prompt!=='string'||!prompt.trim()||prompt.length>24000)throw Error('Enter a prompt under 24,000 characters.');if(!settings.model)throw Error('Connect and select a model in Settings.');const controller=new AbortController();active=controller;runAgent({task,prompt,workspace,settings:{...settings},signal:controller.signal,emit,approve,save:saveTasks}).catch(e=>{task.protocol=[];const item={role:'notice',text:controller.signal.aborted?'Task stopped.':e.message,time:Date.now()};task.items.push(item);emit({type:'message',taskId:id,item});}).finally(()=>{ // Keep interrupted tool protocols from leaking into the next turn.
 if(controller.signal.aborted)task.protocol=[];else if(task.protocol.at(-1)?.role==='assistant'&&task.protocol.at(-1)?.tool_calls)task.protocol=[];
 saveTasks();active=null;emit({type:'done',taskId:id});});return {started:true};});
 bind('stop',()=>{active?.abort();terminal?.abort();return true;});bind('approve',(id,yes)=>{const cb=approvals.get(id);if(!cb)throw Error('This request is no longer pending.');cb(yes);return true;});
 bind('command',async command=>{if(active||terminal)throw Error('A task or command is running.');const w=needWorkspace(),c=new AbortController();terminal=c;emit({type:'terminal',text:'\n> '+command+'\n'});try{return await runCommand(command,w.root,t=>emit({type:'terminal',text:t}),c.signal);}finally{terminal=null;emit({type:'terminalDone'});}});
 bind('webSearch',async q=>searchWeb(q,settings.searchKey,AbortSignal.timeout(20000)));
 bind('openLink',u=>{const x=new URL(u);if(!['https:','http:'].includes(x.protocol)||x.username||x.password)throw Error('Use an ordinary web URL.');return shell.openExternal(x.href);});
 bind('revealData',()=>shell.openPath(data));
 if(settings.autoStart1017){settings.apiKey=runtime.token;runtime.start('start').catch(e=>runtime.update(e.message));}
 let exiting=false;app.on('before-quit',e=>{updates?.stop();active?.abort();terminal?.abort();if(runtime.child&&!exiting){e.preventDefault();exiting=true;runtime.stop().finally(()=>app.quit());}});
});
app.on('window-all-closed',()=>app.quit());
