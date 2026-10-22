import {EditorView,basicSetup} from 'codemirror';
import {EditorState,Compartment} from '@codemirror/state';
import {autocompletion} from '@codemirror/autocomplete';
import {javascript} from '@codemirror/lang-javascript';
import {json} from '@codemirror/lang-json';
import {python} from '@codemirror/lang-python';
import {html} from '@codemirror/lang-html';
import {css} from '@codemirror/lang-css';
import {markdown} from '@codemirror/lang-markdown';
import {oneDark} from '@codemirror/theme-one-dark';
const textarea=document.getElementById('editor'),host=document.createElement('div');host.id='codeEditor';textarea.before(host);textarea.hidden=true;
const language=new Compartment(),theme=new Compartment(),completion=new Compartment();let setting=false;
const view=new EditorView({parent:host,state:EditorState.create({extensions:[basicSetup,language.of(javascript()),theme.of(oneDark),completion.of(autocompletion()),EditorView.lineWrapping,EditorView.updateListener.of(u=>{if(u.docChanged&&!setting)textarea.dispatchEvent(new Event('input',{bubbles:true}));})]})});
Object.defineProperty(textarea,'value',{get:()=>view.state.doc.toString(),set:value=>{setting=true;view.dispatch({changes:{from:0,to:view.state.doc.length,insert:String(value)}});setting=false;}});
window.deskEditor={file(name){const ext=name.split('.').pop().toLowerCase();const lang=['js','jsx','mjs','cjs','ts','tsx'].includes(ext)?javascript({typescript:['ts','tsx'].includes(ext),jsx:['jsx','tsx'].includes(ext)}):ext==='json'?json():ext==='py'?python():['html','htm'].includes(ext)?html():ext==='css'?css():['md','markdown'].includes(ext)?markdown():[];view.dispatch({effects:language.reconfigure(lang)});},preferences(p){document.documentElement.dataset.theme=p.theme;view.dispatch({effects:[theme.reconfigure(p.theme==='light'?[]:oneDark),completion.reconfigure(p.autocomplete?autocompletion():autocompletion({override:[],activateOnTyping:false}))]});}};

new MutationObserver(()=>window.deskEditor.file(document.getElementById('filename').textContent.replace(/ •$/,''))).observe(document.getElementById('filename'),{childList:true,characterData:true,subtree:true});
