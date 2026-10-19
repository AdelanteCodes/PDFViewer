import test from 'node:test';
import assert from 'node:assert/strict';
import * as lib from '../pdf-viewer/vendor/1b66d097fa5b86e8ecea.mjs';
import {pageNumbers,splitGroups,transformPdf,mergePdfs} from '../pdf-viewer/pdf-core.js';
import {combineTables,headingRow,sheetName} from '../pdf-viewer/excel-core.js';
import {parseAwbPage,awbDatasets} from '../pdf-viewer/awb.js';
import {rulingMask} from '../pdf-viewer/ocr-preprocess.js';

test('OCR rules are removed without removing short character strokes',()=>{
 const width=200,height=200,data=new Uint8ClampedArray(width*height*4).fill(255);const black=(x,y)=>{const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0;};for(let x=0;x<width;x++)black(x,50);for(let y=0;y<height;y++)black(100,y);for(let y=80;y<95;y++)black(20,y);const mask=rulingMask(data,width,height);assert.equal(mask[50*width+150],1);assert.equal(mask[150*width+100],1);assert.equal(mask[85*width+20],0);
});

test('page ranges validate bounds, descending ranges and explicit duplicates',()=>{
 assert.deepEqual(pageNumbers('3-1,2',3),[2,1,0]);assert.deepEqual(pageNumbers('1,1,2',3,{duplicates:true}),[0,0,1]);
 for(const value of ['0','4','x','1,'])assert.throws(()=>pageNumbers(value,3));
 assert.deepEqual(splitGroups('1-2;3',3),[[0,1],[2]]);
});
test('Excel columns align by headings and retain blanks, zeroes and provenance',()=>{
 const tables=[{filename:'a.xlsx',sheet:'A',header:0,rows:[['AWB number','Amount'],['001-00000001',0]]},{filename:'b.xlsx',sheet:'B',header:0,rows:[['amount','AWB number','New field'],[12,'002-00000002','=literal text']]}];
 const result=combineTables(tables);assert.deepEqual(result.fields,['AWB number','Amount','New field','Source file','Source sheet']);assert.equal(result.rows[0].Amount,0);assert.equal(result.rows[1].Amount,12);assert.equal(result.rows[1]['New field'],'=literal text');assert.equal(result.rows[0]['AWB number'],'001-00000001');
});
test('Excel duplicate, blank and prototype-looking headings remain distinct',()=>{
 const result=combineTables([{filename:'f',sheet:'s',header:0,rows:[['','Amount','Amount','__proto__','Source file'],[1,2,3,'safe','original']]}]);
 assert.equal(result.rows[0].__proto__,'safe');assert.equal(result.rows[0]['Amount (2)'],3);assert.equal(result.rows[0]['Source file'],'original');assert.equal(result.rows[0]['Source file (2)'],'f');
});
test('large worksheets do not overflow the JavaScript argument stack',()=>{
 const rows=[['ID'],...Array.from({length:130000},(_,i)=>[String(i).padStart(8,'0')])];const result=combineTables([{filename:'large',sheet:'data',header:0,rows}],false);assert.equal(result.rows.length,130000);assert.equal(result.rows[0].ID,'00000000');
});
test('desktop export headings and Excel sheet-name collisions',()=>{
 assert.equal(headingRow([['Selected PDF information'],['sample'],[],['Page','Text'],[1,'a']]),3);const used=new Set();assert.equal(sheetName('a/b',used),'a b');assert.equal(sheetName('a/b',used),'a b (2)');
});
function line(text,x,y,gap=7){let p=x;return text.split(' ').map(s=>{const t={text:s,x:p,x2:p+s.length*4,y};p=t.x2+gap;return t;});}
function awbTokens(scale=1,shift=0){const tokens=[...line('Air Waybill',300,800),...line('123-87654321',20,820),...line("Shipper's Name and Address",20,780),...line("Shipper's Account Number",170,780),...line('EXAMPLE EXPORTER',20,760),...line('123 TEST STREET',20,747),...line("Consignee's Name and Address",20,710),...line("Consignee's Account Number",170,710),...line('EXAMPLE IMPORTER',20,690),...line('Issued by',300,765),...line('EXAMPLE AIRLINES',300,745),...line('Airport of Departure',20,620),...line('TEST CITY',20,600),...line('Airport of Destination',20,560),...line('OTHER CITY',20,540),...line('Total Prepaid',20,100),...line('5432.10',20,80)];return tokens.map(t=>({...t,x:t.x*scale+shift,x2:t.x2*scale+shift,y:t.y*scale}));}
test('AWB values vary and fields survive horizontal translation',()=>{
 for(const shift of [0,50]){const r=parseAwbPage(awbTokens(1,shift),2,'example.pdf');assert.equal(r.row['AWB number'],'123-87654321');assert.equal(r.row.Shipper,'EXAMPLE EXPORTER\n123 TEST STREET');assert.equal(r.row.Carrier,'EXAMPLE AIRLINES');assert.equal(r.row['Total prepaid'],5432.1);assert.match(r.details.at(-1).Value,/OTHER CITY/);assert.equal(awbDatasets([r])[0].types['AWB number'],'text');}
 assert.equal(parseAwbPage(line('An ordinary document',20,800)),null);
 for(const scale of [.7,1.5,2])assert.equal(parseAwbPage(awbTokens(scale),1,'scaled.pdf',595*scale).row['Total prepaid'],5432.1);
});
test('labelled house AWBs preserve unknown fields and missing values',()=>{
 const tokens=['HAWB: EXAMPLE12345','Shipper: SAMPLE EXPORTER','Consignee: SAMPLE IMPORTER','Origin: CITY A','Destination: CITY B','Pieces: 12','Unusual label: retain this'].flatMap((s,i)=>line(s,20,800-i*25));const r=parseAwbPage(tokens);assert.equal(r.row['AWB number'],'EXAMPLE12345');assert.equal(r.row.Pieces,12);assert.equal(r.row['Total prepaid'],undefined);assert.ok(r.details.some(d=>d.Field==='Detected label: Unusual label'&&d.Value==='retain this'));
});
async function fixture(){const d=await lib.PDFDocument.create();for(const width of [200,300,400])d.addPage([width,600]);return d.save();}
test('extract / reorder / delete preserve requested page sequence',async()=>{
 const bytes=await fixture();const r=await lib.PDFDocument.load(await transformPdf(lib,bytes,'organize',{pages:'3,1,1'}));assert.deepEqual(r.getPages().map(p=>p.getWidth()),[400,200,200]);
 const d=await lib.PDFDocument.load(await transformPdf(lib,bytes,'delete',{pages:'2'}));assert.deepEqual(d.getPages().map(p=>p.getWidth()),[200,400]);await assert.rejects(()=>transformPdf(lib,bytes,'delete',{pages:'all'}));
});
test('rotation, crop, paper size, split-half and N-up output geometry',async()=>{
 const bytes=await fixture();const rot=await lib.PDFDocument.load(await transformPdf(lib,bytes,'rotate',{pages:'1',angle:90}));assert.equal(rot.getPage(0).getRotation().angle,90);assert.equal(rot.getPage(1).getRotation().angle,0);
 const crop=await lib.PDFDocument.load(await transformPdf(lib,bytes,'crop',{pages:'1',margin:10}));assert.equal(crop.getPage(0).getCropBox().width,180);await assert.rejects(()=>transformPdf(lib,bytes,'crop',{margin:500}));
 const half=await lib.PDFDocument.load(await transformPdf(lib,bytes,'half',{pages:'1',axis:'vertical'}));assert.equal(half.getPageCount(),4);assert.equal(half.getPage(0).getWidth(),100);
 const nup=await lib.PDFDocument.load(await transformPdf(lib,bytes,'nup',{per:2}));assert.equal(nup.getPageCount(),2);
 const resized=await lib.PDFDocument.load(await transformPdf(lib,bytes,'resize',{size:'a4',margin:20}));assert.equal(resized.getPage(0).getWidth(),595);
});
test('merge and alternate include every page',async()=>{
 const bytes=await fixture();const out=await lib.PDFDocument.load(await mergePdfs(lib,[bytes,bytes],true));assert.deepEqual(out.getPages().map(p=>p.getWidth()),[200,200,300,300,400,400]);
});
test('embedding honors source crop boxes and rotation',async()=>{
 const d=await lib.PDFDocument.create(),p=d.addPage([300,600]);p.drawText('Rotated test',{x:30,y:500});p.setCropBox(10,20,200,400);p.setRotation(lib.degrees(90));const out=await lib.PDFDocument.load(await transformPdf(lib,await d.save(),'flip',{axis:'horizontal'}));assert.deepEqual(out.getPage(0).getSize(),{width:400,height:200});
});
test('page copying preserves filled appearances by flattening forms',async()=>{
 const d=await lib.PDFDocument.create(),p=d.addPage();const f=d.getForm().createTextField('Example');f.setText('Retain this');f.addToPage(p,{x:30,y:30,width:200,height:30});const bytes=await d.save(),out=await lib.PDFDocument.load(await transformPdf(lib,bytes,'extract',{pages:'1'}));assert.equal(out.getForm().getFields().length,0);assert.equal((await lib.PDFDocument.load(bytes)).getForm().getTextField('Example').getText(),'Retain this');
});
test('metadata, numbering and bookmarks save valid documents',async()=>{
 const bytes=await fixture();const meta=await lib.PDFDocument.load(await transformPdf(lib,bytes,'metadata',{title:'Test',author:'Example'}));assert.equal(meta.getTitle(),'Test');
 const marks=await lib.PDFDocument.load(await transformPdf(lib,bytes,'bookmarks',{text:'1 Start\n3 End'}));assert.ok(marks.catalog.has(lib.PDFName.of('Outlines')));
 for(const kind of ['numbers','header','watermark','bates'])assert.ok((await transformPdf(lib,bytes,kind,{text:'TEST',prefix:'A-',start:1})).length);
});
