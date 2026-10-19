import './compatibility.js';
import {headingRow,combineTables,sheetName,populated,columnNames} from './excel-core.js';
const $=id=>document.getElementById(id);let tables=[],combined=null,XLSX=null;
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function invalidate(){combined=null;$('download').disabled=true;$('summary').textContent='Preview again after changing your selection.';}
function selected(){return tables.filter(t=>t.enabled);}
function showSheets(){
  $('sheets').replaceChildren();for(const t of tables){
    const box=document.createElement('div');box.className='sheet';const label=document.createElement('label');label.className='check';const check=document.createElement('input');check.type='checkbox';check.checked=true;check.onchange=()=>{t.enabled=check.checked;invalidate();};label.append(check,document.createTextNode(`${t.filename} — ${t.sheet} (${t.rows.length} rows)`));
    const head=document.createElement('label');head.textContent='Heading row';const input=document.createElement('input');input.type='number';input.min='1';input.max=String(t.rows.length);input.value=String(t.header+1);input.setAttribute('aria-label',`Heading row for ${t.filename} ${t.sheet}`);
    const sample=document.createElement('p');sample.className='small';const update=()=>{t.header=Math.max(0,Math.min(t.rows.length-1,Number(input.value)-1));sample.textContent=(t.rows[t.header]||[]).map(v=>String(v??'')).join(' · ');invalidate();};input.onchange=update;head.append(input);const mapping=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Map column names';mapping.append(summary);const drawMapping=()=>{mapping.querySelectorAll('label').forEach(e=>e.remove());const width=t.rows.slice(t.header).reduce((n,row)=>Math.max(n,row.length),0);for(const name of columnNames(t.rows[t.header]||[],width)){const l=document.createElement('label');l.textContent=name;const v=document.createElement('input');v.value=t.mapping?.[name]||name;v.onchange=()=>{t.mapping??=Object.create(null);t.mapping[name]=v.value;invalidate();};l.append(v);mapping.append(l);}};const updateHeader=input.onchange;input.onchange=()=>{updateHeader();t.mapping=Object.create(null);drawMapping();};update();drawMapping();box.append(label,head,sample,mapping);$('sheets').append(box);
  }
}
$('read').onclick=async()=>{
  const files=[...$('files').files];if(!files.length){status('Choose spreadsheets first.',true);return;}
  if(files.some(f=>f.size>50*1024*1024)||files.reduce((s,f)=>s+f.size,0)>100*1024*1024){status('Choose files up to 50 MiB each, and 100 MiB combined.',true);return;}
  $('read').disabled=true;$('settings').hidden=true;tables=[];invalidate();let formulaCount=0;
  try{XLSX??=await import('./vendor/9ff26da861539cadf028.mjs');
    for(const file of files){status(`Reading ${file.name}…`);const book=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true,cellNF:true,raw:true});
      for(const name of book.SheetNames){const ws=book.Sheets[name];if(!ws['!ref'])continue;const range=XLSX.utils.decode_range(ws['!ref']);if(range.e.r-range.s.r>200000||range.e.c-range.s.c>2000)throw Error(`${file.name}: worksheet is too large for this tool. Split it into smaller files.`);
        for(const addr of Object.keys(ws)){if(addr.startsWith('!'))continue;const cell=ws[addr];if(cell.f){formulaCount++;if(cell.v===undefined)throw Error(`${file.name}, ${name}, ${addr}: formula has no saved result. Recalculate and save the workbook in Excel first.`);}if(cell.t==='e')throw Error(`${file.name}, ${name}, ${addr}: fix the spreadsheet error before combining.`);if(cell.t==='n'&&/^0{2,}$/.test(cell.z||'')){cell.v=cell.w||String(cell.v).padStart(cell.z.length,'0');cell.t='s';}}
        const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:'',blankrows:true});if(rows.some(populated))tables.push({filename:file.name,sheet:name,rows,header:headingRow(rows),enabled:true});
      }
    }
    if(!tables.length)throw Error('No populated worksheets found.');showSheets();$('settings').hidden=false;status(`Read ${files.length} files and ${tables.length} worksheets.${formulaCount?` ${formulaCount} formulas will use saved values.`:''}`);
  }catch(e){status(e.message||'Could not read these spreadsheets.',true);}finally{$('read').disabled=false;}
};
$('preview').onclick=()=>{
  try{const ts=selected();if(!ts.length)throw Error('Select at least one worksheet.');if(ts.some(t=>!Number.isInteger(t.header)||t.header<0||t.header>=t.rows.length))throw Error('Choose a valid heading row.');combined=combineTables(ts,$('source').checked,{deduplicate:$('mode').value==='append'&&$('deduplicate').checked});if(!combined.rows.length)throw Error('No data rows below the selected headings.');if($('mode').value==='append'&&combined.rows.length>1048575)throw Error('Too many rows for one worksheet. Use separate tabs or smaller batches.');if($('mode').value==='append'&&combined.fields.length>16384)throw Error('Too many columns for Excel.');
    $('head').replaceChildren();$('body').replaceChildren();const tr=document.createElement('tr');for(const f of combined.fields){const th=document.createElement('th');th.textContent=f;tr.append(th);}$('head').append(tr);for(const r of combined.rows.slice(0,10)){const tr=document.createElement('tr');for(const f of combined.fields){const td=document.createElement('td');td.textContent=r[f] instanceof Date?r[f].toISOString().slice(0,10):String(r[f]??'');tr.append(td);}$('body').append(tr);}
    $('summary').textContent=`${combined.rows.length} data rows (${combined.removed||0} duplicates removed) from ${ts.length} worksheets. Preview shows the first 10. ${$('mode').value==='append'?'Matching headings share a column.':'Download keeps the selected worksheets in separate tabs.'}`;$('download').disabled=false;
  }catch(e){invalidate();$('summary').textContent=e.message;}
};
$('mode').onchange=$('source').onchange=$('deduplicate').onchange=invalidate;
$('download').onclick=()=>{try{
  if(!combined)throw Error('Preview your selection first.');const book=XLSX.utils.book_new();
  if($('mode').value==='append'){const ws=XLSX.utils.aoa_to_sheet([combined.fields,...combined.rows.map(r=>combined.fields.map(f=>r[f]??''))],{cellDates:true});ws['!cols']=combined.fields.map(()=>({wch:24}));ws['!autofilter']={ref:ws['!ref']};XLSX.utils.book_append_sheet(book,ws,'Combined');}
  else{const used=new Set();for(const t of selected()){const c=combineTables([t],$('source').checked);const ws=XLSX.utils.aoa_to_sheet([c.fields,...c.rows.map(r=>c.fields.map(f=>r[f]??''))],{cellDates:true});ws['!cols']=c.fields.map(()=>({wch:24}));ws['!autofilter']={ref:ws['!ref']};XLSX.utils.book_append_sheet(book,ws,sheetName(`${t.filename.replace(/\.[^.]+$/,'')} ${t.sheet}`,used));}}
  XLSX.writeFile(book,'combined-spreadsheets.xlsx',{cellDates:true});$('summary').textContent='Combined workbook downloaded. Formula cells contain saved values.';
 }catch(e){$('summary').textContent=e.message;}};
