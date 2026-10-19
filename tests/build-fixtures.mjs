import fs from 'node:fs/promises';
import path from 'node:path';
import {PDFDocument,PDFName,PDFString} from 'pdf-lib';
const directory=path.resolve(process.argv[2]||'test-results');await fs.mkdir(directory,{recursive:true});
const doc=await PDFDocument.create();for(let i=0;i<3;i++){const p=doc.addPage([595,842]);p.drawText(`TEST DOCUMENT PAGE ${i+1}`,{x:40,y:780,size:20});p.drawText(`Group ${i<2?'ALPHA':'BETA'}`,{x:40,y:740,size:14});p.drawText('Public sample for document tool verification.',{x:40,y:700,size:12});}
const field=doc.getForm().createTextField('Customer');field.setText('Example');field.addToPage(doc.getPage(0),{x:40,y:600,width:200,height:30});const check=doc.getForm().createCheckBox('Accepted');check.addToPage(doc.getPage(0),{x:260,y:600,width:20,height:20});
await fs.writeFile(path.join(directory,'three-pages.pdf'),await doc.save());console.log(directory);
