// Pure transformation functions shared by the combiner and its regression tests.
export const populated = row => row.some(v=>v!==''&&v!==null&&v!==undefined);
export function headingRow(rows) {
  // Recognise exports from this viewer's desktop edition (metadata above headings).
  if(/selected (billing records|pdf information)/i.test(String(rows[0]?.[0]||''))){const i=rows.findIndex((r,n)=>n>0&&r.includes('Page'));if(i>=0)return i;}
  return Math.max(0,rows.findIndex(populated));
}
export function columnNames(row,width) {
  const used=new Set();return Array.from({length:width},(_,i)=>{const base=String(row[i]??'').trim()||`Column ${i+1}`;let name=base,n=2;while(used.has(name.toLocaleLowerCase()))name=`${base} (${n++})`;used.add(name.toLocaleLowerCase());return name;});
}
export function combineTables(tables,includeSource=true,{deduplicate=false}={}) {
  const fields=[],keys=new Map(),sources=[];
  for(const t of tables){const body=t.rows.slice(t.header+1).filter(populated);const width=body.reduce((n,r)=>Math.max(n,r.length),t.rows[t.header]?.length||0);const names=columnNames(columnNames(t.rows[t.header]||[],width).map(name=>t.mapping?.[name]?.trim()||name),width);for(const name of names){const key=name.trim().toLocaleLowerCase();if(!keys.has(key)){keys.set(key,name);fields.push(name);}}sources.push({t,body,names});}
  const unique=base=>{let s=base,n=2;while(fields.some(f=>f.toLocaleLowerCase()===s.toLocaleLowerCase()))s=`${base} (${n++})`;return s;};
  const fileField=unique('Source file');if(includeSource)fields.push(fileField);const sheetField=unique('Source sheet');if(includeSource)fields.push(sheetField);
  const rows=[];for(const {t,body,names} of sources)for(const cells of body){const row=Object.create(null);for(let i=0;i<names.length;i++)row[keys.get(names[i].trim().toLocaleLowerCase())]=cells[i]??'';if(includeSource){row[fileField]=t.filename;row[sheetField]=t.sheet;}rows.push(row);}
  if(deduplicate){const sourceFields=new Set(includeSource?[fileField,sheetField]:[]),dataFields=fields.filter(f=>!sourceFields.has(f)),seen=new Set(),unique=[];for(const row of rows){const key=JSON.stringify(dataFields.map(f=>{const v=row[f]??'';return v instanceof Date?['date',v.toISOString()]:[typeof v,v];}));if(!seen.has(key)){seen.add(key);unique.push(row);}}return {fields,rows:unique,removed:rows.length-unique.length};}
  return {fields,rows,removed:0};
}
export function sheetName(base,used) {
  const clean=String(base).replace(/[\\/?*\[\]:]/g,' ').slice(0,31)||'Sheet';let name=clean,n=2;while(used.has(name.toLocaleLowerCase())){const suffix=` (${n++})`;name=clean.slice(0,31-suffix.length)+suffix;}used.add(name.toLocaleLowerCase());return name;
}
