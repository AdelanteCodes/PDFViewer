import {transformPdf,mergePdfs} from './pdf-core.js';
import * as lib from './vendor/1b66d097fa5b86e8ecea.mjs';
self.onmessage=async({data})=>{
  try{const bytes=['merge','alternate'].includes(data.kind)?await mergePdfs(lib,data.inputs,data.kind==='alternate'):await transformPdf(lib,data.inputs[0],data.kind,data.options);self.postMessage({bytes},[bytes.buffer]);}
  catch(error){self.postMessage({error:error.message||'Could not transform this document.'});}
};
