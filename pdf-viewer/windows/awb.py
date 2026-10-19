"""AWB form extraction by labels and relative word positions, including local OCR pages."""
import re

LABELS = [
    ('Shipper', r"shipper[’'s]*\s+name\s+and\s+address", False),
    ('Shipper account', r"shipper[’'s]*\s+account\s+(?:number|no\.?)", True),
    ('Consignee', r"consignee[’'s]*\s+name\s+and\s+address", False),
    ('Consignee account', r"consignee[’'s]*\s+account\s+(?:number|no\.?)", True),
    ('Carrier', r'issued\s+by', True),
    ('Issuing agent', r"issuing\s+carrier[’'s]*\s+agent\s+name\s+and\s+city", False),
    ('Accounting information', r'accounting\s+information', False),
    ('Agent IATA code', r"agent[’'s]*\s+iata\s+code", True),
    ('Departure', r'airport\s+of\s+departure(?:\s*\([^)]*\))?(?:\s+and\s+requested\s+routing)?', True),
    ('Reference number', r'referr?ence\s+number', True),
    ('Optional shipping information', r'optional\s+shipping\s+information', True),
    ('Destination', r'airport\s+of\s+destination', True),
    ('Flight / date', r'requested\s+flight\s*/?\s*date', True),
    ('Insurance', r'amount\s+of\s+insurance', True),
    ('Currency', r'\bcurrency\b(?!\s+conversion)', True),
    ('Handling instructions', r'handling\s+information', False),
    ('Goods', r'nature\s+and\s+quantity\s+of\s+goods', False),
    ('Other charges', r'other\s+charges(?!\s+due)', False),
    ('Charges due agent', r'total\s+other\s+charges\s+due\s+agent', True),
    ('Charges due carrier', r'total\s+other\s+charges\s+due\s+carrier', True),
    ('Total prepaid', r'total\s+prepaid', True),
    ('Total collect', r'total\s+collect(?:ed)?', True),
]


def number(value):
    text = str(value).replace(',', '').strip()
    return float(text) if re.fullmatch(r'-?\d+(?:\.\d+)?', text) else None


def parse_awb(page, page_no, filename=''):
    scale=page.width/595
    words = [{**w,'x0':w['x0']/scale,'x1':w['x1']/scale,'top':w['top']/scale,'bottom':w['bottom']/scale} for w in page.extract_words()]
    lines = []
    for w in sorted(words, key=lambda w:(w['top'],w['x0'])):
        line = next((l for l in lines if abs(l['top']-w['top'])<3),None)
        if line is None:
            line = {'top':w['top'],'words':[]}
            lines.append(line)
        line['words'].append(w)
    for line in lines:
        line['words'].sort(key=lambda w:w['x0'])
        line['text'] = ' '.join(w['text'] for w in line['words'])
    text = '\n'.join(l['text'] for l in lines)
    if not re.search(r'air\s*way\s*bill|air\s*consignment\s*note|\b[MH]AWB\b',text,re.I):
        return None
    anchors = []
    for line in lines:
        for name,pattern,single in LABELS:
            m = re.search(pattern,line['text'],re.I)
            if not m or any(a['name']==name for a in anchors):
                continue
            offset,selected = 0,[]
            for w in line['words']:
                if offset+len(w['text'])>m.start() and offset<m.end():
                    selected.append(w)
                offset += len(w['text'])+1
            if selected:
                anchors.append({'name':name,'single':single,'x':selected[0]['x0'],'x2':selected[-1]['x1'],'top':line['top']})
    right=max((w['x1'] for w in words),default=page.width)
    row={'Page':page_no,'Source file':filename}
    m=re.search(r'\b(\d{3})[-\s]+(\d{4})[-\s]?(\d{4})\b',text)
    row['AWB number']=f'{m[1]}-{m[2]}{m[3]}' if m else ''
    if not row['AWB number']:
        m=re.search(r'\b(?:MAWB|HAWB|AWB)(?:\s*(?:NO\.?|NUMBER))?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]{5,})',text,re.I)
        if m:
            row['AWB number']=m[1]
    charge_x=next((a['x'] for a in anchors if a['name']=='Other charges'),right)
    carrier_x=next((a['x'] for a in anchors if a['name']=='Carrier'),right)
    for a in anchors:
        hi=min([b['x']-2 for b in anchors if b is not a and abs(b['top']-a['top'])<8 and b['x']>a['x']+8]+[right+1])
        if a['name'] in ('Shipper','Consignee','Issuing agent'):
            hi=min(hi,carrier_x-2)
        if 'account' in a['name'].lower() and a['name']!='Accounting information' and carrier_x>a['x']:
            hi=min(hi,carrier_x-2)
        if a['name']=='Insurance':
            hi=min(hi,a['x']+max(a['x2']-a['x'],70))
        financial=a['name'].startswith('Charges due') or a['name'] in ('Total prepaid','Total collect')
        if financial:
            hi=min(hi,charge_x-2)
        end=min([b['top']-3 for b in anchors if b['top']>a['top']+7 and b['x']<hi and b['x2']>a['x']+3]+[a['top']+(42 if a['single'] else 120)])
        if a['name']=='Handling instructions':
            end=min([l['top']-3 for l in lines if l['top']>a['top'] and re.search(r'gross|chargeable|no\.?\s*of',l['text'],re.I)]+[end])
        lo=0 if financial and a['name']!='Total collect' else a['x']-2
        values=[]
        for line in lines:
            if a['top']+4<line['top']<end:
                value=' '.join(w['text'] for w in line['words'] if lo<=w['x0']<hi)
                if 'account' in a['name'].lower() and a['name']!='Accounting information' and (not re.fullmatch(r'[\w./ -]{1,35}',value) or value.lower()=='air waybill'):
                    continue
                if a['name']=='Insurance' and not re.fullmatch(r'NIL|NVD|NCV|XXX|[\d,.]+',value,re.I):
                    continue
                if a['name']=='Currency':
                    match=re.search(r'\b[A-Z]{3}\b',value)
                    value=match[0] if match else ''
                if a['name']=='Flight / date' and not re.fullmatch(r'[A-Z0-9 -]{2,12}(?:\s+\d{1,2}[-/A-Z0-9 ]+)?',value):
                    continue
                if value and (not financial or number(value) is not None):
                    values.append(value)
        if a['single']:
            values=values[:1]
        if values:
            row[a['name']]=number(values[0]) if financial else '\n'.join(values)
    aliases={'Shipper':r'shipper(?: name)?','Consignee':r'consignee(?: name)?','Carrier':r'(?:issuing )?(?:carrier|airline)','Departure':r'(?:origin|departure)(?: airport)?','Destination':r'destination(?: airport)?','Currency':'currency','Pieces':r'(?:number of pieces|pieces|packages)','Gross weight':'gross weight','Chargeable weight':'chargeable weight','Rate':r'(?:rate|rate per (?:kg|lb))','Total prepaid':'total prepaid','Total collect':'total collect','Goods':r'(?:goods|description of goods)'}
    for field,alias in aliases.items():
        if row.get(field) not in (None,''):
            continue
        m=re.search(r'(?:^|\n)\s*'+alias+r'\s*[:=]\s*([^\n]+)',text,re.I)
        if m:
            row[field]=number(m[1]) if field in ('Pieces','Gross weight','Chargeable weight','Rate','Total prepaid','Total collect') and number(m[1]) is not None else m[1].strip()
    currency=re.search(r'\b(INR|USD|EUR|GBP|SGD|AED|CAD|AUD|JPY|CNY|HKD|THB|MYR|CHF)\b',text)
    if currency:
        row['Currency']=currency[1]
    row['Payment terms']=(re.search(r'\bFREIGHT\s+(?:PREPAID|COLLECT)\b',text,re.I) or [''])[0]
    row['Invoice references']='\n'.join(re.findall(r'invoice\s*\.?\s*no\.?\s*[:#]?\s*([^\n]+)',text,re.I))
    row['Dimensions']='\n'.join(re.findall(r'\b\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*\/\s*\d+)?',text,re.I))
    for field,pattern in [('HS code',r'\bHS\s*CODE\s*[:#]?\s*(\d+)'),('IEC number',r'\bIEC\s*(?:NO\.?)?\s*[:#]?\s*([A-Z0-9]+)')]:
        m=re.search(pattern,text,re.I)
        if m:
            row[field]=m[1]
    volume=re.search(r'volume\s*weight\s*[:=]?\s*([\d,.]+)\s*([a-z]+)',text,re.I)
    if volume:
        row['Volume weight'],row['Volume unit']=number(volume[1]),volume[2]
    cargo=[]
    heading=next((l for l in lines if re.search('gross',l['text'],re.I) and re.search('chargeable',l['text'],re.I)),None)
    if heading:
        for line in lines:
            if not heading['top']<line['top']<heading['top']+120:
                continue
            ws=line['words']
            unit=next((i for i,w in enumerate(ws) if re.fullmatch(r'K|KG|KGS|L|LB|LBS',w['text'],re.I)),0)
            if unit<2 or number(ws[0]['text']) is None:
                continue
            after=[w for w in ws[unit+1:] if number(w['text']) is not None]
            if len(after)<3:
                continue
            c={'Page':page_no,'AWB number':row['AWB number'],'Pieces':number(ws[0]['text']),'Gross weight':number(ws[unit-1]['text']),
               'Weight unit':ws[unit]['text'],'Chargeable weight':number(after[-3]['text']),'Rate':number(after[-2]['text']),'Total':number(after[-1]['text'])}
            cargo.append(c)
            start=next((w['x0'] for w in ws if w['x0']>after[-1]['x1']+2),None)
            if start is not None:
                end=next((a['top'] for a in anchors if a['name']=='Other charges'),line['top']+200)
                row['Goods']='\n'.join(' '.join(w['text'] for w in l['words'] if w['x0']>=start-3) for l in lines if line['top']<=l['top']<end-10).strip()
    if cargo:
        for name in ('Pieces','Gross weight','Chargeable weight','Total'):
            row[name]=sum(c[name] for c in cargo)
        row['Weight unit']=cargo[0]['Weight unit']
        row['Rate']=cargo[0]['Rate'] if len(cargo)==1 else ''
    charges=[]
    charge_text='\n'.join(l for l in row.get('Other charges','').split('\n') if re.search(r'\b[A-Z]{2,}\s*[:=]\s*[\d,.]+',l))
    if charge_text:
        row['Other charges']=charge_text
    for code,amount in re.findall(r'\b([A-Z][A-Z0-9 /-]{1,12})\s*[:=]\s*(-?[\d,]+(?:\.\d+)?)',charge_text):
        charges.append({'Page':page_no,'AWB number':row['AWB number'],'Charge code':code.strip(),'Amount':number(amount)})
    details=[{'Page':page_no,'AWB number':row['AWB number'],'Field':k,'Value':v} for k,v in row.items() if k not in ('Page','AWB number','Source file') and v!='']
    for line in text.split('\n'):
        m=re.match(r"\s*([A-Za-z][A-Za-z0-9 &'()/.\-]{1,45})\s*:\s*(.+)$",line)
        if m:
            details.append({'Page':page_no,'AWB number':row['AWB number'],'Field':'Detected label: '+m[1].strip(),'Value':m[2].strip()})
    details.extend({'Page':page_no,'AWB number':row['AWB number'],'Field':'Full page text','Value':text[i:i+6000]} for i in range(0,len(text),6000))
    return {'row':row,'cargo':cargo,'charges':charges,'details':details}


def datasets(results):
    out=[]
    for id,label,rows in [('awb','Air waybills',[r['row'] for r in results]),('awb-details','AWB details and full text',[v for r in results for v in r['details']]),('awb-cargo','AWB cargo lines',[v for r in results for v in r['cargo']]),('awb-charges','AWB charge breakdown',[v for r in results for v in r['charges']])]:
        if rows:
            fields=list(dict.fromkeys(k for row in rows for k in row))
            types={f:'number' if f=='Page' or f in ('Pieces','Gross weight','Chargeable weight','Rate','Total','Volume weight','Amount','Charges due agent','Charges due carrier','Total prepaid','Total collect') else 'text' for f in fields}
            out.append({'id':id,'label':label,'rows':rows,'fields':fields,'types':types})
    return out
