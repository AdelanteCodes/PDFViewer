// Label- and position-based AWB extraction. No customer, airline or amount is hardcoded.
const tidy = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const numeric = v => /^-?\d+(?:\.\d+)?$/.test(String(v).replace(/,/g, '')) ? Number(String(v).replace(/,/g, '')) : null;
const definitions = [
  ['Shipper', /shipper[’'s]*\s+name\s+and\s+address/i, 'block'],
  ['Shipper account', /shipper[’'s]*\s+account\s+(?:number|no\.?)/i, 'single'],
  ['Consignee', /consignee[’'s]*\s+name\s+and\s+address/i, 'block'],
  ['Consignee account', /consignee[’'s]*\s+account\s+(?:number|no\.?)/i, 'single'],
  ['Carrier', /issued\s+by/i, 'single'],
  ['Issuing agent', /issuing\s+carrier[’'s]*\s+agent\s+name\s+and\s+city/i, 'block'],
  ['Accounting information', /accounting\s+information/i, 'block'],
  ['Agent IATA code', /agent[’'s]*\s+iata\s+code/i, 'single'],
  ['Agent account', /account\s+no\./i, 'single'],
  ['Departure', /airport\s+of\s+departure(?:\s*\([^)]*\))?(?:\s+and\s+requested\s+routing)?/i, 'single'],
  ['Reference number', /referr?ence\s+number/i, 'single'],
  ['Optional shipping information', /optional\s+shipping\s+information/i, 'single'],
  ['Destination', /airport\s+of\s+destination/i, 'single'],
  ['Flight / date', /requested\s+flight\s*\/?\s*date/i, 'single'],
  ['Insurance', /amount\s+of\s+insurance/i, 'single'],
  ['Handling instructions', /handling\s+information/i, 'block'],
  ['Goods', /nature\s+and\s+quantity\s+of\s+goods/i, 'goods'],
  ['Other charges', /other\s+charges(?!\s+due)/i, 'block'],
  ['Charges due agent', /(?:total\s+)?other\s+charges\s+due\s+agent/i, 'single'],
  ['Charges due carrier', /(?:total\s+)?other\s+charges\s+due\s+carrier/i, 'single'],
  ['Total prepaid', /total\s+prepaid/i, 'single'],
  ['Total collect', /total\s+collect(?:ed)?/i, 'single'],
  ['Valuation charge', /valuation\s+charge/i, 'single'],
  ['Currency', /\bcurrency\b(?!\s+conversion)/i, 'single'],
  ['Declared value for carriage', /declared\s+value\s+for\s+carriage/i, 'single'],
  ['Declared value for customs', /declared\s+value\s+for\s+customs/i, 'single'],
];

function linesOf(tokens) {
  const lines = [];
  for (const t of [...tokens].sort((a,b)=>b.y-a.y || a.x-b.x)) {
    let line = lines.find(l=>Math.abs(l.y-t.y)<3);
    if (!line) {line={y:t.y,tokens:[]};lines.push(line);}
    line.tokens.push(t);
  }
  return lines.map(l=>{l.tokens.sort((a,b)=>a.x-b.x);l.text=l.tokens.map(t=>t.text).join(' ');return l;}).sort((a,b)=>b.y-a.y);
}

export function parseAwbPage(tokens, page=1, filename='',pageWidth=595) {
  const scale=pageWidth/595;if(scale!==1)tokens=tokens.map(t=>({...t,x:t.x/scale,x2:t.x2/scale,y:t.y/scale}));
  const lines=linesOf(tokens), text=lines.map(l=>l.text).join('\n');
  const formHints=['shipper','consignee','chargeable','freight','airport'].filter(s=>text.toLowerCase().includes(s)).length;
  if (!/air\s*way\s*bill|air\s*consignment\s*note|\b[MH]AWB\b/i.test(text)&&!(formHints>=3&&/\b\d{3}[-\s]+\d{4}[-\s]?\d{4}\b/.test(text))) return null;
  const anchors=[];
  for (const line of lines) for (const [field,pattern,kind] of definitions) {
    const match=line.text.match(pattern);if(!match||anchors.some(a=>a.field===field))continue;
    let pos=0;const spans=line.tokens.map(t=>{const a=pos;pos+=t.text.length+1;return {t,a,b:pos-1};});
    const chosen=spans.filter(s=>s.b>match.index && s.a<match.index+match[0].length);
    if(chosen.length)anchors.push({field,kind,y:line.y,x:chosen[0].t.x,x2:chosen.at(-1).t.x2,label:match[0]});
  }
  const right=Math.max(...tokens.map(t=>t.x2),1), left=Math.min(...tokens.map(t=>t.x),0);
  const values={};
  const rightColumn=anchors.find(a=>a.field==='Carrier')?.x;
  const chargesColumn=anchors.find(a=>a.field==='Other charges')?.x;
  for (const a of anchors) {
    // Neighbour labels establish the columns, so shifted/scaled forms keep working.
    const neighbours=anchors.filter(b=>b!==a&&Math.abs(a.y-b.y)<8&&b.x>a.x+8);
    let hi=Math.min(...neighbours.map(b=>b.x-2),right+1);
    if(/account/i.test(a.field)&&rightColumn>a.x)hi=Math.min(hi,rightColumn-2);
    if(['Shipper','Consignee','Issuing agent'].includes(a.field)&&rightColumn>a.x)hi=Math.min(hi,rightColumn-2);
    if(/Charges due|Total prepaid|Total collect|Valuation charge/.test(a.field)&&chargesColumn)hi=Math.min(hi,chargesColumn-2);
    if(a.field==='Insurance')hi=Math.min(hi,a.x+Math.max(a.x2-a.x,70));
    if(a.field==='Goods')hi=right+1;
    const below=anchors.filter(b=>b.y<a.y-7&&b.x<hi&&b.x2>a.x+3);
    let bottom=Math.max(...below.map(b=>b.y+3),a.y-(a.kind==='single'?42:a.kind==='goods'?190:120));
    if(a.field==='Handling instructions')bottom=Math.max(bottom,...lines.filter(l=>l.y<a.y&&/gross|chargeable|no\.?\s*of/i.test(l.text)).map(l=>l.y+3));
    const lo=/Charges due|Total prepaid|Valuation charge/.test(a.field)?left:a.x-2;
    let candidates=lines.filter(l=>l.y<a.y-4&&l.y>bottom).map(l=>({y:l.y,text:l.tokens.filter(t=>t.x>=lo&&t.x<hi).map(t=>t.text).join(' ')})).filter(l=>l.text&&!/^(?:incl\.?\s*dimensions|and\s+city|weight|charge|ppd\s+coll)/i.test(l.text));
    if(/Charges due|Total prepaid|Total collect|Valuation charge/.test(a.field))candidates=candidates.filter(l=>numeric(l.text)!==null);
    if(a.field==='Currency')candidates=candidates.map(l=>({...l,text:(l.text.match(/\b[A-Z]{3}\b/)||[])[0]||''})).filter(l=>l.text);
    if(a.field==='Insurance')candidates=candidates.filter(l=>/^(?:NIL|NVD|NCV|XXX|[\d,.]+)$/i.test(l.text));
    if(/Declared value/.test(a.field))candidates=candidates.filter(l=>/^(?:NIL|NVD|NCV|XXX|[\d,.]+)$/i.test(l.text));
    if(/account/i.test(a.field)&&a.field!=='Accounting information')candidates=candidates.filter(l=>/^[\w./ -]{1,35}$/.test(l.text)&&!/^air waybill/i.test(l.text));
    if(a.field==='Flight / date')candidates=candidates.filter(l=>/^[A-Z0-9 -]{2,12}(?:\s+\d{1,2}[-/A-Z0-9 ]+)?$/.test(l.text));
    if(a.kind==='single')candidates=candidates.slice(0,1);
    const value=candidates.map(l=>l.text).join('\n');
    if(value)values[a.field]=value;
  }
  const awbMatch=text.match(/\b(\d{3})[-\s]+(\d{4})[-\s]?(\d{4})\b/);
  const reference=awbMatch?`${awbMatch[1]}-${awbMatch[2]}${awbMatch[3]}`:(text.match(/\b(?:MAWB|HAWB|AWB)(?:\s*(?:NO\.?|NUMBER))?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]{5,})/i)||[])[1]||'';
  const row={Page:page,'Source file':filename,'AWB number':reference,...values};
  const inlineAliases={Shipper:'shipper(?: name)?',Consignee:'consignee(?: name)?',Carrier:'(?:issuing )?(?:carrier|airline)',Departure:'(?:origin|departure)(?: airport)?',Destination:'destination(?: airport)?',Currency:'currency',Pieces:'(?:number of pieces|pieces|packages)','Gross weight':'gross weight','Chargeable weight':'chargeable weight',Rate:'(?:rate|rate per (?:kg|lb))','Total prepaid':'total prepaid','Total collect':'total collect',Goods:'(?:goods|description of goods)', 'Handling instructions':'(?:handling instructions|handling information)'};
  for(const [name,alias]of Object.entries(inlineAliases)){if(row[name]!==undefined&&row[name]!=='')continue;const match=text.match(new RegExp(`(?:^|\\n)\\s*${alias}\\s*[:=]\\s*([^\\n]+)`,'i'));if(match)row[name]=['Pieces','Gross weight','Chargeable weight','Rate','Total prepaid','Total collect'].includes(name)&&numeric(match[1])!==null?numeric(match[1]):match[1].trim();}
  row['Payment terms']=(text.match(/\bFREIGHT\s+(?:PREPAID|COLLECT)\b/i)||[])[0]||'';
  row.Dimensions=[...text.matchAll(/\b\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*\/\s*\d+)?/gi)].map(m=>m[0]).join('\n');
  row['HS code']=(text.match(/\bHS\s*CODE\s*[:#]?\s*(\d+)/i)||[])[1]||'';
  row['IEC number']=(text.match(/\bIEC\s*(?:NO\.?)?\s*[:#]?\s*([A-Z0-9]+)/i)||[])[1]||'';
  const weightHeader=lines.find(l=>/gross/i.test(l.text)&&/chargeable/i.test(l.text));
  const cargo=[];
  if(weightHeader){
    const candidates=lines.filter(l=>l.y<weightHeader.y&&l.y>weightHeader.y-120);
    let lastY=null;
    for(const l of candidates){
      const ts=l.tokens, nums=ts.filter(t=>numeric(t.text)!==null);
      if(nums.length<4||numeric(ts[0]?.text)===null)continue;
      if(lastY!==null&&lastY-l.y>35)break;
      const unit=ts.findIndex(t=>/^(?:K|KG|KGS|L|LB|LBS)$/i.test(t.text.replace(/[^A-Za-z]/g,'')));
      if(unit<2)continue;
      const after=ts.slice(unit+1).filter(t=>numeric(t.text)!==null);
      if(after.length<3)continue;
      cargo.push({Page:page,'AWB number':reference,Pieces:numeric(ts[0].text),'Gross weight':numeric(ts[unit-1].text),'Weight unit':ts[unit].text.replace(/[^A-Za-z]/g,''),'Rate class':ts[unit+1]?.text.replace(/[^A-Za-z]/g,'')||'','Chargeable weight':numeric(after[after.length-3].text),Rate:numeric(after[after.length-2].text),Total:numeric(after[after.length-1].text)});lastY=l.y;
    }
  }
  if(cargo.length){for(const f of ['Pieces','Gross weight','Chargeable weight','Total'])row[f]=cargo.reduce((s,r)=>s+(r[f]??0),0);row['Weight unit']=cargo[0]['Weight unit'];row.Rate=cargo.length===1?cargo[0].Rate:'';}
  const volume=text.match(/volume\s*weight\s*[:=]?\s*([\d,.]+)\s*([a-z]+)/i);
  if(volume){row['Volume weight']=numeric(volume[1]);row['Volume unit']=volume[2];}
  row['Invoice references']=[...text.matchAll(/invoice\s*\.?\s*no\.?\s*[:#]?\s*([^\n]+)/gi)].map(m=>m[1].trim()).join('\n');
  if(cargo.length){const first=lines.find(l=>l.tokens.filter(t=>numeric(t.text)!==null).length>=5&&l.tokens.some(t=>/^(K|KG|KGS|L|LB|LBS)$/i.test(t.text.replace(/[^A-Za-z]/g,''))));if(first){const nums=first.tokens.filter(t=>numeric(t.text)!==null);const last=nums.at(-1);const start=first.tokens.find(t=>t.x>last.x2+2);if(start){const stop=anchors.find(a=>a.field==='Other charges')?.y??first.y-200;row.Goods=lines.filter(l=>l.y<=first.y+3&&l.y>stop+10).map(l=>l.tokens.filter(t=>t.x>=start.x-3).map(t=>t.text).join(' ')).filter(Boolean).join('\n');}}}
  const date=text.match(/\b(?:0?[1-9]|[12]\d|3[01])[-/](?:[A-Za-z]{3}|0?[1-9]|1[0-2])[-/](?:19|20)\d{2}\b/g)||[];
  row['Dates found']=[...new Set(date)].join('\n');
  const charges=[];
  const chargeLines=text.split('\n').filter(l=>[...l.matchAll(/\b[A-Z][A-Z0-9]{1,10}\s*[:=]\s*[\d,.]+/g)].length>=2);
  const chargesText=[...new Set([...(values['Other charges']||'').split('\n').filter(l=>/\b[A-Z]{2,}\s*[:=]\s*[\d,.]+/.test(l)),...chargeLines])].join('\n');
  if(chargesText)row['Other charges']=chargesText;
  for(const m of chargesText.matchAll(/\b([A-Z][A-Z0-9 /-]{1,12})\s*[:=]\s*(-?[\d,]+(?:\.\d+)?)/g))charges.push({Page:page,'AWB number':reference,'Charge code':m[1].trim(),Amount:numeric(m[2])});
  for(const f of ['Charges due agent','Charges due carrier','Total prepaid','Total collect','Valuation charge'])if(row[f]!==undefined){const n=numeric(row[f]);if(n!==null)row[f]=n;}
  // Always retain every extracted word, including unrecognized labels and legal text.
  const details=[];
  for(const [field,value] of Object.entries(row))if(!['Page','Source file','AWB number'].includes(field)&&value!=='')details.push({Page:page,'AWB number':reference,Field:field,Value:value});
  for(const l of text.split('\n')){const m=l.match(/^\s*([A-Za-z][A-Za-z0-9 &'()/.\-]{1,45})\s*:\s*(.+)$/);if(m)details.push({Page:page,'AWB number':reference,Field:`Detected label: ${m[1].trim()}`,Value:m[2].trim()});}
  for(let i=0;i<text.length;i+=6000)details.push({Page:page,'AWB number':reference,Field:`Full page text${i?` (continued ${i/6000+1})`:''}`,Value:text.slice(i,i+6000)});
  const warnings=[];
  const review=[];if(cargo.some(c=>c['Gross weight']>c['Chargeable weight']*1.05))review.push('Gross weight exceeds chargeable weight; verify the original.');if(cargo.some(c=>Math.abs(c.Rate*c['Chargeable weight']-c.Total)>Math.max(1,Math.abs(c.Total)*.02)))review.push('Rate × chargeable weight differs from the cargo total; verify the original.');if(review.length){row['Review notes']=review.join(' ');details.push({Page:page,'AWB number':reference,Field:'Review notes',Value:row['Review notes']});warnings.push(`Page ${page}: ${row['Review notes']}`);}
  const missing=['AWB number','Shipper','Consignee','Departure','Destination'].filter(f=>!row[f]);
  if(missing.length)warnings.push(`Page ${page}: could not identify ${missing.join(', ')}. All extracted text is available in AWB details and Page text.`);
  warnings.push(`Page ${page}: AWB fields are detected from labels and positions. Check them against the original; blank fields are not zero.`);
  return {row,cargo,charges,details,warnings};
}

export function awbDatasets(results) {
  const make=(id,label,rows)=>{const fields=[...new Set(rows.flatMap(Object.keys))];const types=Object.fromEntries(fields.map(f=>[f,f==='Page'||['Pieces','Gross weight','Chargeable weight','Rate','Total','Volume weight','Amount','Charges due agent','Charges due carrier','Total prepaid','Total collect','Valuation charge'].includes(f)?'number':'text']));return {id,label,fields,rows,types};};
  if(!results.length)return [];
  const out=[make('awb','Air waybills',results.map(r=>r.row)),make('awb-details','AWB details and full text',results.flatMap(r=>r.details))];
  if(results.some(r=>r.cargo.length))out.push(make('awb-cargo','AWB cargo lines',results.flatMap(r=>r.cargo)));
  if(results.some(r=>r.charges.length))out.push(make('awb-charges','AWB charge breakdown',results.flatMap(r=>r.charges)));
  return out;
}
