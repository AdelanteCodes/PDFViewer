import {rankPassages,summarizePassages} from './assistant-core.js';
let model=null,passages=[],vectors=[];
self.onmessage=async({data})=>{try{
 if(data.type==='index'){const {pipeline,env}=await import('./vendor/ai/transformers.min.js');env.allowLocalModels=false;env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;env.backends.onnx.wasm.wasmPaths=new URL('./vendor/ai/',import.meta.url).href;
 model??=await pipeline('feature-extraction','Xenova/all-MiniLM-L6-v2',{quantized:true,revision:'751bff37182d3f1213fa05d7196b954e230abad9',progress_callback:p=>{if(p.status==='progress')self.postMessage({type:'progress',message:'Downloading local AI model: '+(p.progress||0).toFixed(0)+'% · '+p.file});}});
 passages=data.passages;vectors=[];for(let i=0;i<passages.length;i+=6){const output=await model(passages.slice(i,i+6).map(p=>p.text),{pooling:'mean',normalize:true});vectors.push(...output.tolist());self.postMessage({type:'progress',message:`Reading passages ${Math.min(i+6,passages.length)} of ${passages.length} locally…`});}self.postMessage({type:'ready'});
 }else if(data.type==='ask'){if(!model||!vectors.length)throw Error('Enable the assistant for the current PDF first.');const output=await model(data.question,{pooling:'mean',normalize:true});self.postMessage({type:'answer',results:rankPassages(passages,vectors,output.tolist()[0]),heading:'Relevant passages — check the source pages'});
 }else if(data.type==='summary'){if(!vectors.length)throw Error('Read the current PDF first.');self.postMessage({type:'answer',results:summarizePassages(passages,vectors),heading:'Extractive summary — selected sentences from your PDF'});}
 }catch(e){self.postMessage({type:'error',message:e.message||String(e)});}};
