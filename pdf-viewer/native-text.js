// Browser-only native text removal. MuPDF is loaded only when an original span is edited.
export function nativeJob(payload,signal){
 return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./native-text-worker.js',import.meta.url),{type:'module'});const timer=setTimeout(()=>{worker.terminate();reject(Error('Native editing timed out. Try fewer pages.'));},90000);const abort=()=>{finish();reject(Error('Native editing cancelled. Your document is unchanged.'));};const finish=()=>{clearTimeout(timer);worker.terminate();signal?.removeEventListener('abort',abort);};signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}worker.onmessage=({data})=>{finish();data.error?reject(Error(data.error)):resolve(data.info||data.bytes);};worker.onerror=e=>{finish();reject(Error(e.message||'Native PDF engine could not load.'));};worker.postMessage(payload);});
}

export const removeOriginalText=(bytes,edits,signal)=>nativeJob({bytes:bytes.slice(),edits},signal);
export const inspectFont=(bytes,page,source)=>nativeJob({bytes:bytes.slice(),action:"font",page,source});

export const compactPdf=(bytes,signal)=>nativeJob({bytes:bytes.slice(),action:"compact"},signal);
