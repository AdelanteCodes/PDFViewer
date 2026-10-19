import {listStamps,saveStamp,removeStamp} from './stamp-store.js';
const $=id=>document.getElementById(id);
const LAST='pdf-last-stamp';
const getLast=()=>{try{return localStorage.getItem(LAST);}catch{return null;}};
const remember=id=>{try{id?localStorage.setItem(LAST,id):localStorage.removeItem(LAST);}catch{}};
const dataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read this stamp.'));reader.readAsDataURL(blob);});
export function mountStamps({activate,deactivate,status}){
  let records=[],active=null,selectionVersion=0;
  async function select(record,{announce=true}={}){
    const token=++selectionVersion;
    if(!record){active=null;remember(null);$('remove-stamp').disabled=true;deactivate();return;}
    const image=new Image(),url=URL.createObjectURL(record.blob);
    try{image.src=url;await image.decode();const data=await dataUrl(record.blob);if(token!==selectionVersion)return;active=record;$('remove-stamp').disabled=false;remember(record.id);$('saved-stamps').value=record.id;activate({image,data,ratio:image.naturalHeight/image.naturalWidth,name:record.name});if(announce)status(`“${record.name}” stamp ready. Click the page to place it; click again to reuse it.`);}finally{URL.revokeObjectURL(url);}
  }
  function menu(){
    $('saved-stamps').replaceChildren(new Option('Choose a saved stamp',''));
    for(const record of records)$('saved-stamps').append(new Option(record.name,record.id));
    if(active)$('saved-stamps').value=active.id;
    $('remove-stamp').disabled=!active;
  }
  async function add(blob,name){
    const record={id:crypto.randomUUID(),name,blob,createdAt:Date.now()};await saveStamp(record);records=await listStamps();menu();await select(record);$('remove-stamp').disabled=false;
  }
  const run=fn=>async()=>{try{await fn();}catch(e){status(e.message||'Could not load the stamp.',true);}};
  $('saved-stamps').onchange=run(async()=>{await select(records.find(record=>record.id===$('saved-stamps').value));$('remove-stamp').disabled=!active;});
  $('use-stamp').onclick=run(async()=>{const record=records.find(record=>record.id===$('saved-stamps').value)||active;if(!record)throw Error('Add or choose a saved stamp first.');await select(record);});
  $('remove-stamp').onclick=run(async()=>{if(!active)return;await removeStamp(active.id);await select(null);records=await listStamps();menu();status('Stamp removed from this browser. Stamps already placed in your PDF are unchanged.');});
  $('stamp-image').onchange=run(async()=>{
    const file=$('stamp-image').files[0];if(!file)return;
    if(file.size>5*1024*1024)throw Error('Choose a stamp image up to 5 MiB.');
    const url=URL.createObjectURL(file),image=new Image(),canvas=document.createElement('canvas');
    try{image.src=url;await image.decode();if(image.naturalWidth*image.naturalHeight>20000000)throw Error('Resize this image before saving it as a stamp.');const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Could not prepare the stamp image.');await add(blob,$('stamp-name').value.trim()||file.name.replace(/\.[^.]+$/,''));$('stamp-image').value='';}finally{URL.revokeObjectURL(url);canvas.width=0;canvas.height=0;}
  });
  async function textStamp(text){
    if(!text.trim())throw Error('Enter the stamp text first.');
    const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=250;const ctx=canvas.getContext('2d');ctx.strokeStyle=ctx.fillStyle=$('stamp-color').value;ctx.lineWidth=10;ctx.strokeRect(10,10,980,230);ctx.font='bold 100px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text.trim(),500,125,920);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));canvas.width=0;canvas.height=0;if(!blob)throw Error('Could not prepare the text stamp.');await add(blob,text.trim());
  }
  $('create-text-stamp').onclick=run(() =>textStamp($('stamp-name').value.slice(0,60)));
  for(const button of document.querySelectorAll('[data-stamp-preset]'))button.onclick=run(async()=>{const text=button.dataset.stampPreset,existing=records.find(record=>record.name===text);if(existing)await select(existing);else await textStamp(text);});
  const ready=(async()=>{try{records=await listStamps();menu();const last=records.find(record=>record.id===getLast());if(last){await select(last,{announce:false});$('remove-stamp').disabled=false;}}catch(e){status(e.message,true);}})();
  return {async restore(){await ready;if(active)await select(active,{announce:false});}};
}
