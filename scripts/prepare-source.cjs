const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dest=path.join(root,'build-source');
fs.rmSync(dest,{recursive:true,force:true});fs.mkdirSync(dest,{recursive:true});
for(const name of ['app','scripts','test','runtime','extensions'])fs.cpSync(path.join(root,name),path.join(dest,name),{recursive:true});
for(const name of ['package.json','package-lock.json','README.txt'])fs.copyFileSync(path.join(root,name),path.join(dest,name));
