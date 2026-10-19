import './compatibility.js';
import {pageNumbers} from './pdf-core.js';
import {parseMapping,extractMapped} from './extraction-mapping.js';
import {parseAwbPage, awbDatasets} from './awb.js';
import {exportRowsPdf, exportRowsExcel} from './export-tools.js';
import {removeRuling} from './ocr-preprocess.js';
import * as pdfjs from './vendor/5d7045df35c11cd12cb2.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = './pdfjs-worker.js';
const $ = id => document.getElementById(id);
const MAX_UPLOAD = 100 * 1024 * 1024;
const AIRLINE_FIELDS = ['Page','Agency','Agency code','Type','Document number','Date','Transaction amount','Fare','Taxes (codes)','Fees (codes)','Penalties (codes)','Net sales','Commission','Discount','Tax on commission','Balance payable','Payment code','Related document','Notes'];
const TYPES = {TKTT:'Ticket',RFND:'Refund',CANX:'Cancellation',EMDA:'EMD-A',EMDS:'EMD-S',SPDR:'Debit memo'};
let workspaceFile=null,workspaceRevision=null,resultVersion=0;let pdfUrl = '', datasets = [], sort = '', direction = 'asc', offset = 0, filtered = [], fieldMemory = new Map(), ocrWorker = null, activeLoadingTask = null, cancelRequested = false;
const clean = value => String(value ?? '').trim();
const money = value => new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(Number(value)||0);
const normalizedTicket = value => clean(value).replace(/[\s-]+/g,'').toLowerCase();
const escapeHtml = value => clean(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function status(message, error=false){$('status').textContent=message;$('status').classList.toggle('error',error)}
function pageLink(page){const a=document.createElement('a');a.href='#preview';a.textContent=page;a.onclick=()=>{$('preview').open=true;$('document').src=pdfUrl+'#page='+page};return a}
function number(value){const v=clean(value).replace(/[,*]/g,'').replace(/,/g,'');return /^-?\d+(?:\.\d+)?$/.test(v)?Number(v):null}
function makeTokens(items){
  const tokens=[];
  for(const item of items){if(!item.str?.trim())continue;const words=item.str.trim().split(/\s+/);let total=words.reduce((n,w)=>n+w.length,0)||1,used=0;
    for(const word of words){const x=item.transform[4]+item.width*used/total,w=item.width*word.length/total;tokens.push({text:word,x,x2:x+w,y:item.transform[5]});used+=word.length}}
  return tokens;
}
function groupLines(tokens){const lines=[];for(const t of [...tokens].sort((a,b)=>b.y-a.y||a.x-b.x)){let line=lines.find(l=>Math.abs(l.y-t.y)<3);if(!line){line={y:t.y,tokens:[]};lines.push(line)}line.tokens.push(t)}return lines.map(l=>{l.tokens.sort((a,b)=>a.x-b.x);l.text=l.tokens.map(t=>t.text).join(' ');return l}).sort((a,b)=>b.y-a.y)}
function cellText(tokens,lo,hi,width){const scale=841/width;return tokens.filter(t=>t.x*scale>=lo&&t.x*scale<hi).map(t=>t.text).join(' ')}
function airlineRows(pageLines,width){
  const rows=[];let agency='',agencyCode='',current=null;const agencies=new Set(),codes=new Set();
  for(const line of pageLines){const tokens=line.tokens,text=line.text;const a=text.match(/^(14-\d\s+\d+\s+\d)\s+(?:AE|HE)\s+(.+)/);
    if(a){agencyCode=a[1];agency=a[2];agencies.add(agency);codes.add(agencyCode);current=null;continue}
    const kind=(tokens[0]?.text||'').replace(/^\+/,'');
    if(TYPES[kind]&&/^\d+$/.test(tokens[1]?.text||'')&&tokens.length>2){const row=Object.fromEntries(AIRLINE_FIELDS.map(k=>[k,'']));Object.assign(row,{Page:0,Agency:agency,'Agency code':agencyCode,Type:TYPES[kind],'Document number':tokens[1].text,Date:tokens[2].text,'Payment code':cellText(tokens,249,280,width)});
      for(const [field,lo,hi] of [['Transaction amount',280,340],['Fare',340,390],['Net sales',530,573],['Commission',610,645],['Discount',690,721],['Tax on commission',732,770],['Balance payable',770,841]])row[field]=number(cellText(tokens,lo,hi,width));
      for(const [field,lo,hi] of [['Taxes (codes)',390,440],['Fees (codes)',440,486],['Penalties (codes)',486,530]])row[field]=cellText(tokens,lo,hi,width);
      if(tokens[0]?.text.startsWith('+'))row.Notes='Conjunction document; amounts may be on the preceding ticket.';rows.push(row);current=row;continue}
    if(!current)continue;if(text.includes('TOTAL')||text.startsWith('***')){current=null;continue}
    const related=text.match(/RTDN:\s*(\d+)/);if(related){current['Related document']=related[1];continue}
    if(/TOUR:|ESAC:|RMIC:/.test(text)){current.Notes=(current.Notes+' '+text).trim();continue}
    if(tokens[0]?.x*841/width>=390&&tokens[0]?.x*841/width<530){for(const [field,lo,hi] of [['Taxes (codes)',390,440],['Fees (codes)',440,486],['Penalties (codes)',486,530]]){const extra=cellText(tokens,lo,hi,width);if(extra)current[field]=[current[field],extra].filter(Boolean).join('; ')}}
  }
  return {rows,agencies:[...agencies],types:[...new Set(rows.map(r=>r.Type))],codes:[...codes]};
}
function splitCells(line){const cells=[];for(const t of line.tokens){let prev=cells[cells.length-1];if(!prev||t.x-prev.end>24)cells.push({x:t.x,end:t.x2,text:t.text});else{prev.text+=' '+t.text;prev.end=t.x2}}return cells}
function extractTableBlocks(pageLines,pageNo){
  const candidates=pageLines.map(line=>({line,cells:splitCells(line)})).filter(x=>x.cells.length>=2);
  const blocks=[];let run=[];const flush=()=>{if(run.length>=3){const width=Math.max(...run.map(x=>x.cells.length));if(width>=2){const all=run.map(x=>x.cells.map(c=>c.text));const first=all[0],numeric=first.filter(Boolean).some(v=>number(v)!==null);const header=!numeric;let names=(header?first:Array.from({length:width},(_,i)=>`Column ${i+1}`)).map((v,i)=>clean(v)||`Column ${i+1}`);const seen=new Set();names=names.map((v,i)=>{let n=v,seq=2;while(seen.has(n)||n==='Page')n=`${v} (${seq++})`;seen.add(n);return n});const body=header?all.slice(1):all;const rows=body.map(values=>{const row={Page:pageNo};names.forEach((name,i)=>row[name]=values[i]||'');return row}).filter(row=>names.some(name=>row[name]));if(rows.length)blocks.push({fields:['Page',...names],rows})}}run=[]};
  for(const entry of candidates){const expected=run.length?run[run.length-1].cells.length:entry.cells.length;if(run.length&&Math.abs(entry.cells.length-expected)>1)flush();run.push(entry)}flush();return blocks;
}
async function recognizePage(page){
  const {default:Tesseract}=await import('./vendor/fd043b290c6bcc76edae.mjs');
  if(!ocrWorker)ocrWorker=await Tesseract.createWorker($('ocr-language').value,1,{workerPath:new URL('./vendor/f800025af8c01050c78d.mjs',import.meta.url).href,corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',langPath:'https://tessdata.projectnaptha.com/4.0.0',workerBlobURL:true,logger:m=>{if(m.status==='recognizing text')$('progress').value=Math.min(99,Number(m.progress||0)*100)}});
  const base=page.getViewport({scale:1}),scale=Math.min(3,2400/base.width,3200/base.height),viewport=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const ctx=canvas.getContext('2d',{willReadFrequently:true});await page.render({canvasContext:ctx,viewport}).promise;removeRuling(canvas);await ocrWorker.setParameters({tessedit_pageseg_mode:'11',preserve_interword_spaces:'1'});const result=await ocrWorker.recognize(canvas);const words=(result.data.words||[]).map(w=>({text:w.text,x:w.bbox.x0/scale,x2:w.bbox.x1/scale,y:(canvas.height-w.bbox.y1)/scale}));const lines=groupLines(words);canvas.width=0;canvas.height=0;return {text:lines.map(l=>l.text).join('\n'),tokens:words,lines,confidence:result.data.confidence};
}
async function closeOcr(){if(ocrWorker){const w=ocrWorker;ocrWorker=null;await w.terminate()}}
async function needsOcr(page,text){
  if(text.replace(/\s/g,'').length<12)return true;
  if(text.length>=1000)return false;
  const ops=await page.getOperatorList(),stack=[];let matrix=[1,0,0,1,0,0],area=0;
  for(let i=0;i<ops.fnArray.length;i++){const op=ops.fnArray[i],args=ops.argsArray[i];if(op===pdfjs.OPS.save)stack.push([...matrix]);else if(op===pdfjs.OPS.restore)matrix=stack.pop()||[1,0,0,1,0,0];else if(op===pdfjs.OPS.transform)matrix=pdfjs.Util.transform(matrix,args);else if(op===pdfjs.OPS.paintImageXObject||op===pdfjs.OPS.paintInlineImageXObject)area=Math.max(area,Math.abs(matrix[0]*matrix[3]-matrix[1]*matrix[2]));}
  return area/((page.view[2]-page.view[0])*(page.view[3]-page.view[1]))>.55;
}
async function processPdf(file,password,objectUrl){
  if(file.size>MAX_UPLOAD)throw Error('Choose a PDF up to 100 MiB.');if(file.type&&file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf'))throw Error('Choose a PDF file.');
  cancelRequested=false;const task=pdfjs.getDocument({url:objectUrl,password:password||undefined,rangeChunkSize:65536});activeLoadingTask=task;
  let pdf;try{pdf=await task.promise}catch(e){if(e.name==='PasswordException')throw Error(e.code===pdfjs.PasswordResponses.INCORRECT_PASSWORD?'Incorrect PDF password. Try again.':'This PDF needs a password. Enter the password and try again.');throw e}
  const awbs=[],pages=[],airlineData={rows:[],agencies:new Set(),types:new Set()},tableMap=new Map(),warnings=[];let fullText='',period='';
  for(const index of pageNumbers($('read-pages').value,pdf.numPages)){const p=index+1;if(cancelRequested)throw Error('Processing cancelled.');$('progress').value=(p-1)/pdf.numPages*100;status(`Reading page ${p} of ${pdf.numPages}…`);const page=await pdf.getPage(p),content=await page.getTextContent();let tokens=makeTokens(content.items),lines=groupLines(tokens),text=lines.map(l=>l.text).join('\n');
    if(await needsOcr(page,text)){status(`Running OCR on scanned page ${p} of ${pdf.numPages}…`);try{const ocr=await recognizePage(page);text=ocr.text;tokens=ocr.tokens;lines=ocr.lines;warnings.push(`Page ${p}: OCR used. Verify recognized text and amounts against the original.${ocr.confidence<65?' Recognition confidence is low.':''}`);}catch(err){warnings.push(`Page ${p}: OCR could not run (${err.message}).`)} }
    if(cancelRequested)throw Error('Processing cancelled.');
    const awb=parseAwbPage(tokens,p,file.name,page.view[2]-page.view[0]);if(awb){awbs.push(awb);warnings.push(...awb.warnings)}
    const width=page.view[2]-page.view[0];const bill=airlineRows(lines,width);bill.rows.forEach(r=>r.Page=p);airlineData.rows.push(...bill.rows);bill.agencies.forEach(a=>airlineData.agencies.add(a));bill.types.forEach(t=>airlineData.types.add(t));
    for(const block of extractTableBlocks(lines,p)){const key=JSON.stringify(block.fields);if(!tableMap.has(key))tableMap.set(key,{fields:block.fields,rows:[]});tableMap.get(key).rows.push(...block.rows)}
    pages.push({Page:p,Text:text});fullText+=`\n${text}`;page.cleanup();
  }
  if(fullText.includes('Billing Period:'))period=(fullText.match(/Billing Period:\s*(.*?)(?:REFERENCE:|\n|$)/)||[])[1]?.trim()||'';
  datasets=[{id:'text',label:'Page text',fields:['Page','Text'],rows:pages,types:{Page:'number',Text:'text'}}];
  if(airlineData.rows.length){datasets.unshift({id:'airline',label:'Airline billing records',fields:AIRLINE_FIELDS,rows:airlineData.rows,types:Object.fromEntries(AIRLINE_FIELDS.map(f=>[f,['Page','Transaction amount','Fare','Net sales','Commission','Discount','Tax on commission','Balance payable'].includes(f)?'number':f==='Date'?'date':'text']))});$('billing-filters').hidden=false;fillSelect('agency',['All agencies',...airlineData.agencies]);fillSelect('type',['All types',...airlineData.types]);}
  else{$('billing-filters').hidden=true}
  let i=0;for(const d of tableMap.values()){if(d.rows.length){d.id=`table${i++}`;d.label=`Detected table ${i} (${d.rows.length} rows)`;inferTypes(d);datasets.push(d)}}
  datasets.unshift(...awbDatasets(awbs));
  for(const d of datasets)if(!d.types)inferTypes(d);
  if(airlineData.rows.length&&fullText.toUpperCase().includes('FCAIBILLDET')){$('billing-filters').hidden=false}else{$('billing-filters').hidden=true}
  if(pdfUrl)URL.revokeObjectURL(pdfUrl);pdfUrl=objectUrl;$('document').src=pdfUrl;$('title').textContent=file.name;$('meta').textContent=`${pdf.numPages} pages${period?' · '+period:''}`;$('warnings').replaceChildren(...warnings.map(w=>{const p=document.createElement('p');p.className='small';p.textContent=w;return p}));
  $('document-info').hidden=false;$('controls').hidden=false;$('results').hidden=false;$('dataset').replaceChildren(...datasets.map(d=>{const o=document.createElement('option');o.value=d.id;o.textContent=`${d.label} · ${d.rows.length}`;return o}));fieldMemory.clear();$('ticket').value='';$('query').value='';$('from').value='';$('to').value='';chooseDataset();$('progress').value=100;status(`Ready. ${pages.length} of ${pdf.numPages} pages processed on this device.`);
}
function inferTypes(d){d.types={};for(const field of d.fields){if(field==='Page'){d.types[field]='number';continue}const vals=d.rows.map(r=>r[field]).filter(v=>v!==''&&v!=null),identifier=/ticket|document|number|\bid\b|code|reference|account|phone|zip/i.test(field);if(vals.length&&!identifier&&vals.every(v=>number(v)!==null)){d.types[field]='number';d.rows.forEach(r=>{if(r[field]!==''&&r[field]!=null)r[field]=number(r[field])})}else if(vals.length&&/date|issued|due/i.test(field)&&vals.every(v=>Date.parse(v))){d.types[field]='date'}else d.types[field]='text'}}
function fillSelect(id,values){const select=$(id);select.replaceChildren();for(const [i,v] of values.entries()){const o=document.createElement('option');o.value=i===0?'':v;o.textContent=v;select.append(o)}}
function dataset(){return datasets.find(d=>d.id===$('dataset').value)}
function selectedFields(){return [...$('fields').querySelectorAll('input:checked')].map(i=>i.value)}
function chooseDataset(){const d=dataset();if(!d)return;$('billing-filters').hidden=d.id!=='airline';sort='';direction='asc';offset=0;$('fields').replaceChildren();const enabled=fieldMemory.get(d.id)||d.fields;for(const f of d.fields){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=f;input.checked=enabled.includes(f);input.onchange=()=>{fieldMemory.set(d.id,selectedFields());render()};label.append(input,document.createTextNode(f));$('fields').append(label)}render()}
function getRows(){const d=dataset();if(!d)return[];let rows=d.rows.filter(r=>{if(d.id==='airline'){if($('agency').value&&r.Agency!==$('agency').value)return false;if($('type').value&&r.Type!==$('type').value)return false;const day=dateValue(r.Date);if($('from').value&&day&&day<$('from').value)return false;if($('to').value&&day&&day>$('to').value)return false}
    const t=normalizedTicket($('ticket').value),q=$('query').value.trim().toLowerCase();if(t&&!Object.entries(r).some(([k,v])=>(d.id==='text'||/document|ticket|reference|awb/i.test(k))&&normalizedTicket(v).includes(t)))return false;if(q&&!Object.values(r).some(v=>clean(v).toLowerCase().includes(q)))return false;return true});
  if(sort){const type=d.types[sort];rows.sort((a,b)=>{const x=a[sort],y=b[sort],blankX=x===''||x==null,blankY=y===''||y==null;if(blankX||blankY)return blankX===blankY?0:blankX?1:-1;let c;if(type==='number')c=Number(x)-Number(y);else if(type==='date')c=(Date.parse(dateValue(x)||x)||0)-(Date.parse(dateValue(y)||y)||0);else c=clean(x).localeCompare(clean(y),undefined,{numeric:true,sensitivity:'base'});return direction==='asc'?c:-c})}
  return rows}
function dateValue(value){const v=clean(value);let m=v.match(/^(\d{1,2})[-/]?([A-Za-z]{3})[-/]?(\d{2,4})$/);if(m){const months='jan feb mar apr may jun jul aug sep oct nov dec'.split(' '),mm=months.indexOf(m[2].toLowerCase())+1;let yy=Number(m[3]);if(yy<100)yy+=2000;if(mm)return `${yy}-${String(mm).padStart(2,'0')}-${String(Number(m[1])).padStart(2,'0')}`}m=v.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);if(m)return `${m[3]}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[1])).padStart(2,'0')}`;return ''}
function render(){resultVersion++;$('prepared-export')?.remove();if(preparedExportUrl){URL.revokeObjectURL(preparedExportUrl);preparedExportUrl=null;}const d=dataset();if(!d)return;filtered=getRows();const fields=selectedFields(),all=$('page-size').value==='all',size=all?Math.max(filtered.length,1):Number($('page-size').value);if(offset>=filtered.length&&filtered.length)offset=0;const visible=filtered.slice(offset,offset+size);$('count').textContent=filtered.length;$('empty').textContent=!fields.length?'Select at least one field.':!filtered.length?'No records match your filters.':'';$('head').replaceChildren();$('rows').replaceChildren();
  const totals=d.id==='airline';$('amount-stat').hidden=$('balance-stat').hidden=!totals;if(totals){$('total').textContent=money(filtered.reduce((s,r)=>s+(Number(r['Transaction amount'])||0),0));$('balance').textContent=money(filtered.reduce((s,r)=>s+(Number(r['Balance payable'])||0),0))}
  if(fields.length){const tr=document.createElement('tr');for(const f of fields){const th=document.createElement('th'),b=document.createElement('button');b.type='button';b.textContent=f+(sort===f?(direction==='asc'?' ↑':' ↓'):'');b.onclick=()=>{direction=sort===f&&direction==='asc'?'desc':'asc';sort=f;offset=0;render()};th.append(b);tr.append(th)}$('head').append(tr);const frag=document.createDocumentFragment();for(const r of visible){const tr=document.createElement('tr');for(const f of fields){const td=document.createElement('td'),v=r[f];if(f==='Page')td.append(pageLink(v));else if($('edit-results').checked&&d.id!=='text'&&!/^source (file|sheet)$/i.test(f)){const input=document.createElement('input');input.value=v??'';input.setAttribute('aria-label',`Correct ${f} on page ${r.Page||'unknown'}`);input.onchange=()=>{const raw=input.value;if(d.types[f]==='number'&&raw.trim()!==''&&!Number.isFinite(Number(raw))){status('Enter a valid number or leave the value blank.',true);input.value=r[f]??'';return;}r[f]=d.types[f]==='number'&&raw.trim()!==''?Number(raw):raw;status('Correction applied. Exports include this value.');render();};td.append(input);}else{td.textContent=v??'';if(d.types[f]==='number')td.className='number'}tr.append(td)}frag.append(tr)}$('rows').append(frag)}
  $('page-label').textContent=filtered.length?`${offset+1}–${Math.min(offset+size,filtered.length)} of ${filtered.length}`:'0 records';$('prev').hidden=all;$('next').hidden=all;$('page-label').hidden=all;$('prev').disabled=offset===0;$('next').disabled=offset+size>=filtered.length;$('clear-sort').hidden=!sort;$('export-pdf').disabled=$('export-xlsx').disabled=!filtered.length||!fields.length}
async function exportExcel(){const version=resultVersion,result=await exportRowsExcel(selectedFields(),filtered,'pdf-viewer-results.xlsx',{prepareOnly:true});if(version===resultVersion)offerExport(result);else status('Results changed while exporting. Prepare the export again.',true);}
async function exportPdf(){const version=resultVersion,result=await exportRowsPdf(selectedFields(),filtered,'pdf-viewer-results.pdf',{prepareOnly:true});if(version===resultVersion)offerExport(result);else status('Results changed while exporting. Prepare the export again.',true);}
$('open').onclick=async()=>{const file=$('file').files[0]||workspaceFile;if(!file){status('Choose a PDF first.',true);return}$('open').disabled=true;$('cancel').hidden=false;$('progress').hidden=false;$('progress').value=0;$('document-info').hidden=$('controls').hidden=$('results').hidden=true;const objectUrl=URL.createObjectURL(file);try{await processPdf(file,$('password').value,objectUrl)}catch(e){URL.revokeObjectURL(objectUrl);status(cancelRequested?'Processing cancelled.':e.message||'Could not read this PDF.',true)}finally{await Promise.allSettled([activeLoadingTask?.destroy(),closeOcr()]);activeLoadingTask=null;$('open').disabled=false;$('cancel').hidden=true;$('progress').hidden=true}};
$('cancel').onclick=()=>{cancelRequested=true;activeLoadingTask?.destroy();closeOcr().catch(()=>{});status('Cancelling PDF processing…')};
$('dataset').onchange=chooseDataset;$('all').onclick=()=>{$('fields').querySelectorAll('input').forEach(i=>i.checked=true);fieldMemory.set(dataset().id,selectedFields());render()};$('reset').onclick=()=>{fieldMemory.delete(dataset().id);chooseDataset()};$('clear-sort').onclick=()=>{sort='';direction='asc';offset=0;render()};$('prev').onclick=()=>{offset=Math.max(0,offset-Number($('page-size').value));render()};$('next').onclick=()=>{offset+=Number($('page-size').value);render()};$('page-size').onchange=()=>{offset=0;render()};for(const id of ['ticket','query'])$(id).oninput=()=>{offset=0;render()};for(const id of ['agency','type','from','to'])$(id).onchange=()=>{offset=0;render()};$('export-xlsx').onclick=()=>exportExcel().catch(e=>status(e.message,true));$('export-pdf').onclick=()=>exportPdf().catch(e=>status(e.message,true));


$('edit-results').onchange=render;
$('apply-mapping').onclick=()=>{try{const pages=datasets.find(d=>d.id==='text')?.rows;if(!pages)throw Error('Read a PDF first.');const mapped=extractMapped(pages,parseMapping($('mapping-rules').value),$('title').textContent);datasets=datasets.filter(d=>d.id!=='mapped');datasets.push(mapped);$('dataset').querySelector('option[value="mapped"]')?.remove();const option=document.createElement('option');option.value='mapped';option.textContent=mapped.label;$('dataset').append(option);$('dataset').value='mapped';fieldMemory.delete('mapped');chooseDataset();$('mapping-status').textContent='Mapping applied. Check Review notes and compare values with the original.';}catch(e){$('mapping-status').textContent=e.message;}};
$('save-mapping').onclick=()=>{try{parseMapping($('mapping-rules').value);localStorage.setItem('pdf-extraction-mapping',$('mapping-rules').value);$('mapping-status').textContent='Mapping settings saved on this device. No document saved.';}catch(e){$('mapping-status').textContent=e.message;}};
$('load-mapping').onclick=()=>{try{$('mapping-rules').value=localStorage.getItem('pdf-extraction-mapping')||'';$('mapping-status').textContent='Saved mapping loaded.';}catch(e){$('mapping-status').textContent='Browser storage is unavailable.';}};
if(new URLSearchParams(location.search).has('workspace')&&parent!==window){
 window.addEventListener('message',async event=>{if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='pdf-open'||!(event.data.bytes instanceof Uint8Array))return;const file=new File([event.data.bytes],event.data.name||'workspace-document.pdf',{type:'application/pdf'}),url=URL.createObjectURL(file);workspaceFile=file;workspaceRevision=event.data.revision;$('open').disabled=true;$('cancel').hidden=false;$('progress').hidden=false;try{await processPdf(file,'',url);}catch(e){URL.revokeObjectURL(url);status(e.message,true);}finally{await Promise.allSettled([activeLoadingTask?.destroy(),closeOcr()]);activeLoadingTask=null;$('open').disabled=false;$('cancel').hidden=true;$('progress').hidden=true;}});
 parent.postMessage({type:'pdf-editor-ready'},location.origin);
}

let preparedExportUrl=null;
function offerExport({blob,filename}){
 if(new URLSearchParams(location.search).has('workspace')&&parent!==window)parent.postMessage({type:'pdf-export-ready',blob,filename,revision:workspaceRevision},location.origin);
 if(preparedExportUrl)URL.revokeObjectURL(preparedExportUrl);preparedExportUrl=URL.createObjectURL(blob);
 let link=$('prepared-export');if(!link){link=document.createElement('a');link.id='prepared-export';link.className='button';$('export-xlsx').parentElement.append(link);}
 link.href=preparedExportUrl;link.download=filename;link.textContent=`Save ${filename.endsWith('.xlsx')?'Excel':'PDF'} file`;
 status('Export prepared. Use the Save file link beside the export buttons to download it.');
}
