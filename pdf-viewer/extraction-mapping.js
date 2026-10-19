export function parseMapping(text){
  const rules=String(text).split('\n').filter(s=>s.trim()).map(line=>{
    const [name,label,type='text']=line.split('|').map(s=>s.trim());
    if(!name||!label||!['text','number'].includes(type))throw Error('Use one rule per line: Field name | Label in PDF | text or number');
    if(['Page','Source file','Review notes'].includes(name))throw Error(`${name} is reserved for source tracking.`);
    return {name,label,type};
  });
  if(!rules.length||rules.length>100)throw Error('Enter between 1 and 100 field rules.');
  if(new Set(rules.map(r=>r.name.toLowerCase())).size!==rules.length)throw Error('Field names must be unique.');
  return rules;
}
export function extractMapped(pages,rules,filename){
  const fields=['Page','Source file',...rules.map(r=>r.name),'Review notes'];
  const rows=pages.map(p=>{
    const row=Object.create(null),notes=[];row.Page=p.Page;row['Source file']=filename;
    const lines=String(p.Text).split('\n');
    for(const rule of rules){const line=lines.find(s=>s.toLowerCase().includes(rule.label.toLowerCase()));
      const at=line?.toLowerCase().indexOf(rule.label.toLowerCase());const raw=line?.slice(at+rule.label.length).replace(/^\s*[:=]?\s*/,'').trim()||'';
      if(!raw)notes.push(`Missing ${rule.name}`);
      const numeric=raw.replace(/,/g,'');
      if(rule.type==='number'&&raw&&!/^-?\d+(?:\.\d+)?$/.test(numeric))notes.push(`Review ${rule.name}: not a plain number`);
      row[rule.name]=rule.type==='number'&&raw&&/^-?\d+(?:\.\d+)?$/.test(numeric)?Number(numeric):raw;
    }
    row['Review notes']=notes.join('; ');return row;
  });
  return {id:'mapped',label:'Custom mapped fields',fields,rows,types:Object.fromEntries(fields.map(f=>[f,f==='Page'?'number':rules.find(r=>r.name===f)?.type||'text']))};
}
