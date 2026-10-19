import test from 'node:test';
import assert from 'node:assert/strict';
import {DocumentSession,changedTextGroups} from '../pdf-viewer/session.js';
import {combineTables} from '../pdf-viewer/excel-core.js';
test('document history branches correctly and owns copies of source bytes',()=>{
 const s=new DocumentSession(3,100),b=new Uint8Array([1]);s.commit(b,'one.pdf');b[0]=9;
 assert.equal(s.current.bytes[0],1);s.commit([2]);s.commit([3]);assert.equal(s.undo().bytes[0],2);
 assert.equal(s.redo().bytes[0],3);s.undo();s.commit([4]);assert.equal(s.redo().bytes[0],4);assert.equal(s.entries.length,3);
 s.clear();assert.equal(s.current,null);
});
test('history respects byte budget while retaining the current document',()=>{
 const s=new DocumentSession(6,5);s.commit([1,2,3]);s.commit([4,5,6]);assert.equal(s.entries.length,1);
 s.commit(new Uint8Array(8));assert.equal(s.entries.length,1);assert.equal(s.current.bytes.length,8);
});
test('changed values split consecutive groups without combining later repeated values',()=>{
 assert.deepEqual(changedTextGroups(['A','A','B','A']),[[0,1],[2],[3]]);assert.deepEqual(changedTextGroups([]),[]);
});
test('mapped spreadsheet headings align and duplicate removal ignores provenance',()=>{
 const tables=[{filename:'a.xlsx',sheet:'A',header:0,rows:[['AWB','Amount'],['001',0],['002',2]]},{filename:'b.xlsx',sheet:'B',header:0,mapping:{Waybill:'AWB',Total:'Amount'},rows:[['Waybill','Total'],['001',0],['003',3]]}];
 const c=combineTables(tables,true,{deduplicate:true});assert.deepEqual(c.fields,['AWB','Amount','Source file','Source sheet']);assert.equal(c.rows.length,3);assert.equal(c.removed,1);assert.equal(c.rows[0].AWB,'001');assert.equal(c.rows[0].Amount,0);assert.equal(c.rows[0]['Source file'],'a.xlsx');
});
test('deduplication distinguishes numeric and string identifiers and dates',()=>{
 const t={filename:'a',sheet:'A',header:0,rows:[['id'],[1],['1'],[new Date('2020-01-01')],[new Date('2020-01-01')]]};
 assert.equal(combineTables([t],false,{deduplicate:true}).rows.length,3);
});

import {parseMapping,extractMapped} from '../pdf-viewer/extraction-mapping.js';
test('label mappings retain identifiers, numeric zero, source and missing-field warnings',()=>{
 const rules=parseMapping('AWB | Waybill: | text\nTotal | Total: | number\nDate | Date: | text');
 const result=extractMapped([{Page:5,Text:'Waybill: 001234\nTotal: 0'}],rules,'source.pdf');
 assert.equal(result.rows[0].AWB,'001234');assert.equal(result.rows[0].Total,0);assert.equal(result.rows[0].Page,5);assert.equal(result.rows[0]['Source file'],'source.pdf');assert.match(result.rows[0]['Review notes'],/Missing Date/);
 assert.throws(()=>parseMapping('Page | P | number'),/reserved/);assert.throws(()=>parseMapping('A | a\na | b'),/unique/);
});
