import {applyNativeEdits,findSourceFont} from './native-font-core.js';
self.onmessage=async({data})=>{let doc;try{const mupdf=await import('./vendor/mupdf/mupdf.js');doc=mupdf.Document.openDocument(data.bytes,'application/pdf');
 if(data.action==='font'){const page=doc.loadPage(data.page-1);try{const info=findSourceFont(mupdf,page,data.source);self.postMessage({info:{name:info.name,size:info.size,color:info.color}});info.st.destroy();}finally{page.destroy();}return;}
 if(data.action!=='compact')applyNativeEdits(mupdf,doc,data.edits);const buffer=doc.saveToBuffer('garbage=4,compress');const bytes=buffer.asUint8Array().slice();buffer.destroy();self.postMessage({bytes},[bytes.buffer]);
 }catch(e){self.postMessage({error:e.message||String(e)});}finally{doc?.destroy();}};
