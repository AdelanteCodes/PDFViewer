import createModule from 'https://cdn.jsdelivr.net/npm/qpdf-wasm-esm-embedded@1.1.1/qpdf.mjs';
self.onmessage=async({data})=>{
  let module;
  try{let logs=[];module=await createModule({noInitialRun:true,print:()=>{},printErr:s=>logs.push(String(s))});module.FS.writeFile('/input.pdf',new Uint8Array(data.bytes));
    const args=[];if(data.password)args.push(`--password=${data.password}`);
    if(data.kind==='protect'){args.push('--encrypt',data.newPassword,data.ownerPassword||data.newPassword,'256');if(data.permissions==='view')args.push('--print=none','--modify=none','--extract=n');args.push('--');}
    if(data.kind==='unlock')args.push('--decrypt');
    if(data.kind==='compress')args.push('--object-streams=generate','--compress-streams=y','--recompress-flate','--compression-level=9');
    args.push('/input.pdf','/output.pdf');let code=0;try{code=module.callMain(args)||0;}catch(e){if(typeof e.status==='number')code=e.status;else throw e;}
    if(code!==0&&code!==3)throw Error('Could not process PDF. Check the password and file.');
    const result=module.FS.readFile('/output.pdf');self.postMessage({bytes:result.buffer},[result.buffer]);
  }catch(e){self.postMessage({error:e.message||'Could not process PDF.'});}
  finally{try{module?.FS.unlink('/input.pdf');module?.FS.unlink('/output.pdf');}catch{}self.close();}
};
