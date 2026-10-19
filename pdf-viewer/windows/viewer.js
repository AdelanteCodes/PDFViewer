'use strict';
const $=id=>document.getElementById(id);
const MAX_UPLOAD=100*1024*1024;
let job=null,doc=null,pdfURL=null,offset=0,sort='',direction='asc',count=0;
let generation=0,querySerial=0,pollTimer=null,inputTimer=null,xhr=null,exporting=false,loading=false;
const fieldMemory=new Map();
const money=n=>new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n);
const dataset=()=>doc?.datasets.find(d=>d.id===$('dataset').value);
const selectedFields=()=>[...$('fields').querySelectorAll('input:checked')].map(c=>c.value);
function option(parent,label,value=label){const o=document.createElement('option');o.textContent=label;o.value=value;parent.append(o)}
async function api(url,options){const r=await fetch(url,options);const body=await r.json();if(!r.ok)throw Error(body.error||'Request failed.');return body}
function filters(){return {dataset:$('dataset').value,agency:$('agency').value,type:$('type').value,ticket:$('ticket').value,query:$('query').value,from:$('from').value,to:$('to').value,sort,direction}}
function exportButtons(){for(const fmt of ['pdf','xlsx'])$('export-'+fmt).disabled=exporting||loading||!count||!selectedFields().length}
function pageLink(page){const a=document.createElement('a');a.href='#preview';a.textContent=page;a.onclick=()=>{$('preview').open=true;$('document').src=pdfURL+'#page='+page};return a}
function render(result){
  const d=dataset(),fields=selectedFields();count=result.count;
  $('count').textContent=count;$('amount-stat').hidden=$('balance-stat').hidden=!result.totals;
  if(result.totals){$('total').textContent=money(result.totals['Transaction amount']);$('balance').textContent=money(result.totals['Balance payable'])}
  $('head').replaceChildren();$('rows').replaceChildren();
  $('empty').textContent=!fields.length?'Select at least one field.':!count?'No records match your filters.':'';
  if(fields.length){
    const header=document.createElement('tr');
    for(const field of fields){const th=document.createElement('th'),button=document.createElement('button');button.textContent=field+(sort===field?(direction==='asc'?' ↑':' ↓'):'');th.setAttribute('aria-sort',sort===field?(direction==='asc'?'ascending':'descending'):'none');button.onclick=()=>{direction=sort===field&&direction==='asc'?'desc':'asc';sort=field;offset=0;loadRows()};th.append(button);header.append(th)}
    $('head').append(header);
    const fragment=document.createDocumentFragment();
    for(const record of result.rows){const row=document.createElement('tr');for(const field of fields){const cell=document.createElement('td'),value=record[field];if(field==='Page')cell.append(pageLink(value));else if(d.types[field]==='number'&&typeof value==='number'){cell.className='number';cell.textContent=money(value)}else cell.textContent=value??'';row.append(cell)}fragment.append(row)}
    $('rows').append(fragment);
  }
  $('page-label').textContent=count?`${offset+1}–${Math.min(offset+result.limit,count)} of ${count}`:'0 records';
  const allRows=$('page-size').value==='all';
  $('prev').hidden=allRows;$('next').hidden=allRows;$('page-label').hidden=allRows;$('prev').disabled=offset===0;$('next').disabled=offset+result.limit>=count;$('clear-sort').hidden=!sort;
}
async function loadRows(){
  if(!job||!doc)return;const serial=++querySerial,token=generation;loading=true;exportButtons();$('empty').textContent='Loading…';
  try{const params=new URLSearchParams({...filters(),offset,limit:$('page-size').value});const result=await api(`/jobs/${job}/records?${params}`);if(serial!==querySerial||token!==generation)return;if(result.count&&offset>=result.count){offset=0;return loadRows()}render(result)}
  catch(e){if(serial===querySerial&&token===generation){count=0;$('head').replaceChildren();$('rows').replaceChildren();$('empty').textContent=e.message}}
  finally{if(serial===querySerial&&token===generation){loading=false;exportButtons()}}
}
function chooseDataset(){
  const d=dataset();sort='';direction='asc';offset=0;
  $('billing-filters').hidden=d.id!=='airline';
  $('ticket-hint').textContent=d.id==='airline'?'Matches ticket numbers and related ticket references; spaces and hyphens are ignored.':'Searches this table or text view. Choose Page text to find a ticket anywhere in the document. Spaces and hyphens are ignored.';
  for(const id of ['agency','type','from','to'])$(id).value='';
  $('fields').replaceChildren();
  const defaults=d.fields;
  const enabled=fieldMemory.get(d.id)||defaults;
  for(const field of d.fields){const label=document.createElement('label'),cb=document.createElement('input');cb.type='checkbox';cb.value=field;cb.checked=enabled.includes(field);cb.onchange=()=>{fieldMemory.set(d.id,selectedFields());loadRows()};label.append(cb,document.createTextNode(field));$('fields').append(label)}
  loadRows();
}
function ready(metadata){
  doc=metadata;fieldMemory.clear();$('title').textContent=doc.title;$('meta').textContent=`${doc.filename} · ${doc.pages} pages${doc.period?' · '+doc.period:''}`;
  $('warnings').replaceChildren();for(const warning of doc.warnings){const p=document.createElement('p');p.className='notice small';p.textContent=warning;$('warnings').append(p)}
  $('summary-box').hidden=!doc.summary;$('summary').textContent=doc.summary;
  $('dataset').replaceChildren();for(const d of doc.datasets)option($('dataset'),`${d.label} (${d.count} records)`,d.id);
  for(const [id,values,label] of [['agency',doc.agencies||[],'All agencies'],['type',doc.transaction_types||[],'All types']]){$(id).replaceChildren();option($(id),label,'');values.forEach(v=>option($(id),v))}
  $('query').value='';$('ticket').value='';$('results').hidden=false;chooseDataset();
}
async function poll(id,token){
  try{const status=await api('/jobs/'+id);if(token!==generation)return;
    $('status').textContent=status.message+ (status.total?` (${status.done}/${status.total} pages)`:'');$('progress').value=status.total?status.done/status.total*100:0;
    if(status.state==='ready'){$('cancel').hidden=true;$('progress').hidden=true;ready(status.document);$('status').textContent='Ready. Select a view and the fields you want.';return}
    if(status.state==='error'||status.state==='cancelled'){throw Error(status.error||'Processing cancelled.')}
    pollTimer=setTimeout(()=>poll(id,token),600);
  }catch(e){if(token===generation){$('status').className='error';$('status').textContent=e.message;$('cancel').hidden=true;$('progress').hidden=true}}
}
async function stop(){
  generation++;querySerial++;clearTimeout(pollTimer);if(xhr){xhr.abort();xhr=null}
  const old=job;job=null;doc=null;count=0;loading=false;$('results').hidden=true;$('cancel').hidden=true;$('open').disabled=false;$('progress').hidden=true;exportButtons();
  if(old){try{await api(`/jobs/${old}/cancel`,{method:'POST'})}catch{}}
  if(pdfURL){URL.revokeObjectURL(pdfURL);pdfURL=null;$('document').src='about:blank'}
  $('status').className='';$('status').textContent='Cancelled. Temporary processing files are being removed.';
}
$('upload').onsubmit=async event=>{
  event.preventDefault();const file=$('pdf').files[0];if(!file)return;
  if(file.size>MAX_UPLOAD){$('status').className='error';$('status').textContent='Choose a PDF up to 100 MB (100 MiB).';return}
  const password=$('password').value;await stop();const token=++generation;
  $('status').textContent='Uploading…';$('open').disabled=true;$('cancel').hidden=false;$('progress').hidden=false;$('progress').value=0;
  job=crypto.randomUUID().replaceAll('-','');
  const upload=new XMLHttpRequest();xhr=upload;upload.open('POST','/upload');upload.setRequestHeader('X-Upload-ID',job);upload.setRequestHeader('Content-Type','application/pdf');upload.setRequestHeader('X-Filename',encodeURIComponent(file.name));upload.setRequestHeader('X-PDF-Password',encodeURIComponent(password));
  upload.upload.onprogress=e=>{if(token!==generation)return;if(e.lengthComputable){$('progress').value=e.loaded/e.total*100;$('status').textContent=`Uploading… ${Math.round(e.loaded/e.total*100)}%`}};
  upload.onload=()=>{if(token!==generation){try{const id=JSON.parse(upload.responseText).id;if(id)fetch(`/jobs/${id}/cancel`,{method:'POST'})}catch{}return}xhr=null;$('open').disabled=false;$('password').value='';try{const result=JSON.parse(upload.responseText);if(upload.status!==202)throw Error(result.error||'Upload failed.');job=result.id;pdfURL=URL.createObjectURL(file);$('document').src=pdfURL;$('progress').value=0;poll(job,token)}catch(e){$('status').className='error';$('status').textContent=e.message;$('cancel').hidden=true;$('progress').hidden=true}};
  upload.onerror=()=>{if(token===generation){xhr=null;$('open').disabled=false;$('cancel').hidden=true;$('progress').hidden=true;$('status').textContent='Upload failed. Check the local app is still running.'}};
  upload.send(file);
};
async function download(fmt){
  if(!job||!count||!selectedFields().length)return;
  const token=generation,payload={...filters(),job,fields:selectedFields()};exporting=true;exportButtons();$('export-status').className='';$('export-status').textContent='Preparing all matching records…';
  try{const response=await fetch('/export/'+fmt,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!response.ok)throw Error((await response.json()).error);const blob=await response.blob();if(token!==generation)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='selected-pdf-information.'+fmt;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);$('export-status').textContent='Download ready.'}
  catch(e){if(token===generation){$('export-status').className='error';$('export-status').textContent=e.message||'Export failed.'}}
  finally{exporting=false;exportButtons()}
}
$('dataset').onchange=chooseDataset;$('cancel').onclick=stop;
$('export-pdf').onclick=()=>download('pdf');$('export-xlsx').onclick=()=>download('xlsx');
for(const id of ['agency','type','from','to'])$(id).onchange=()=>{offset=0;loadRows()};
for(const id of ['ticket','query'])$(id).oninput=()=>{clearTimeout(inputTimer);inputTimer=setTimeout(()=>{offset=0;loadRows()},250)};
$('prev').onclick=()=>{offset=Math.max(0,offset-Number($('page-size').value));loadRows()};$('next').onclick=()=>{offset+=Number($('page-size').value);loadRows()};$('page-size').onchange=()=>{offset=0;loadRows()};
$('clear-sort').onclick=()=>{sort='';direction='asc';offset=0;loadRows()};
$('all').onclick=()=>{$('fields').querySelectorAll('input').forEach(c=>c.checked=true);fieldMemory.set(dataset().id,selectedFields());loadRows()};
$('reset').onclick=()=>{fieldMemory.delete(dataset().id);chooseDataset()};
window.addEventListener('pagehide',()=>{if(job)navigator.sendBeacon(`/jobs/${job}/cancel`,'')});
api('/capabilities').then(c=>{$('ocr').textContent=c.ocr.message;if(!c.ocr.available)$('ocr').className='notice small'}).catch(()=>{$('ocr').textContent='Keep the launcher window open while using this app.'});
