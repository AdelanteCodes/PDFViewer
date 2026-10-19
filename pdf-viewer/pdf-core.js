export function pageNumbers(value,count,{duplicates=false}={}) {
  if(!String(value).trim()||String(value).trim().toLowerCase()==='all')return Array.from({length:count},(_,i)=>i);
  const pages=[];for(const part of String(value).split(',')){const m=part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);if(!m)throw Error('Use page numbers such as 1,3,5-8 or all.');const a=Number(m[1]),b=Number(m[2]||m[1]);if(a<1||b<1||a>count||b>count)throw Error(`Page numbers must be between 1 and ${count}.`);const step=a<=b?1:-1;for(let n=a;;n+=step){if(duplicates||!pages.includes(n-1))pages.push(n-1);if(n===b)break;}}
  if(!pages.length)throw Error('Choose at least one page.');return pages;
}
export function splitGroups(value,count) {
  if(!String(value).trim())return Array.from({length:count},(_,i)=>[i]);
  return String(value).split(';').map(group=>pageNumbers(group,count));
}
export function rgbValue(hex){if(!/^#[0-9a-f]{6}$/i.test(hex))throw Error('Choose a valid color.');return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);}
export function safeFilename(name){return String(name).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,160)||'document';}

async function visualPage(out,page,lib){
  const box=page.getCropBox(),angle=((page.getRotation().angle%360)+360)%360;
  if(!page.node.Contents())page.drawRectangle({x:0,y:0,width:0,height:0,opacity:0});
  const embedded=await out.embedPage(page,{left:box.x,bottom:box.y,right:box.x+box.width,top:box.y+box.height});
  const width=angle%180?box.height:box.width,height=angle%180?box.width:box.height;
  return {width,height,draw(target,x,y,w,h,flip=''){
    if(flip){target.pushOperators(lib.pushGraphicsState(),lib.concatTransformationMatrix(flip==='horizontal'?-1:1,0,0,flip==='vertical'?-1:1,flip==='horizontal'?2*x+w:0,flip==='vertical'?2*y+h:0));}
    const opts=angle===90?{x,y:y+h,xScale:h/box.width,yScale:w/box.height,rotate:lib.degrees(-90)}:angle===180?{x:x+w,y:y+h,xScale:w/box.width,yScale:h/box.height,rotate:lib.degrees(180)}:angle===270?{x:x+w,y,xScale:h/box.width,yScale:w/box.height,rotate:lib.degrees(90)}:{x,y,xScale:w/box.width,yScale:h/box.height};
    target.drawPage(embedded,opts);if(flip)target.pushOperators(lib.popGraphicsState());
  }};
}

export async function transformPdf(lib,bytes,kind,options={}) {
  const {PDFDocument,StandardFonts,rgb,degrees,PDFName,PDFString,PDFNumber}=lib;
  const src=await PDFDocument.load(bytes),count=src.getPageCount(),selected=pageNumbers(options.pages||'all',count,{duplicates:kind==='organize'}),set=new Set(selected);
  let doc=src;
  if(['extract','organize','delete','resize','flip','nup','half'].includes(kind))src.getForm().flatten();
  if(['extract','organize','delete'].includes(kind)){
    const indices=kind==='delete'?Array.from({length:count},(_,i)=>i).filter(i=>!set.has(i)):selected;
    if(!indices.length)throw Error('At least one page must remain.');doc=await PDFDocument.create();for(const p of await doc.copyPages(src,indices))doc.addPage(p);
  }else if(kind==='rotate'){const angle=Number(options.angle);if(![90,180,270].includes(angle))throw Error('Choose 90, 180 or 270 degrees.');selected.forEach(i=>{const p=doc.getPage(i);p.setRotation(degrees((p.getRotation().angle+angle)%360));});
  }else if(kind==='crop'){
    const margin=Number(options.margin);if(!Number.isFinite(margin)||margin<0)throw Error('Margins must be zero or greater.');selected.forEach(i=>{const p=doc.getPage(i),box=p.getCropBox();if(margin*2>=Math.min(box.width,box.height))throw Error('Crop margin is too large for this page.');p.setCropBox(box.x+margin,box.y+margin,box.width-2*margin,box.height-2*margin);});
  }else if(kind==='resize'||kind==='flip'||kind==='nup'||kind==='half'){
    doc=await PDFDocument.create();
    // Blank pages can legitimately omit a Contents stream; PDF embedding needs one.
    for(const i of selected){const p=src.getPage(i);if(!p.node.Contents())p.drawRectangle({x:0,y:0,width:0,height:0,opacity:0});}
    if(kind==='nup'){
      const per=Number(options.per||2);if(![2,4,6,9].includes(per))throw Error('Choose a supported pages-per-sheet value.');const cols=per===2?2:per===9?3:2,rows=Math.ceil(per/cols);
      for(let k=0;k<selected.length;k+=per){const out=doc.addPage([842,595]);for(let j=0;j<per&&k+j<selected.length;j++){const ep=await visualPage(doc,src.getPage(selected[k+j]),lib);const cw=842/cols,ch=595/rows,s=Math.min((cw-20)/ep.width,(ch-20)/ep.height);ep.draw(out,(j%cols)*cw+(cw-ep.width*s)/2,595-(Math.floor(j/cols)+1)*ch+(ch-ep.height*s)/2,ep.width*s,ep.height*s);}}
    }else for(let i=0;i<count;i++){
      const p=src.getPage(i);if(!set.has(i)){doc.addPage((await doc.copyPages(src,[i]))[0]);continue;}
      const ep=await visualPage(doc,p,lib),w=ep.width,h=ep.height;
      if(kind==='half'){
        const vertical=options.axis!=='horizontal';for(let side=0;side<2;side++){const out=doc.addPage(vertical?[w/2,h]:[w,h/2]);ep.draw(out,vertical?-side*w/2:0,vertical?0:-(1-side)*h/2,w,h);}
      }else if(kind==='flip'){
        const out=doc.addPage([w,h]);ep.draw(out,0,0,w,h,options.axis==='vertical'?'vertical':'horizontal');
      }else{
        const size=options.size==='letter'?[612,792]:options.size==='a3'?[842,1191]:[595,842],out=doc.addPage(size),m=Number(options.margin??20);if(!Number.isFinite(m)||m<0||m*2>=Math.min(...size))throw Error('Choose a smaller margin.');const scale=Math.min((size[0]-m*2)/w,(size[1]-m*2)/h);ep.draw(out,(size[0]-w*scale)/2,(size[1]-h*scale)/2,w*scale,h*scale);
      }
    }
  }else if(['watermark','numbers','header','bates'].includes(kind)){
    const font=await doc.embedFont(StandardFonts.Helvetica),color=rgb(...rgbValue(options.color||'#245edb')),size=Number(options.fontSize||12);
    if(!Number.isFinite(size)||size<6||size>160)throw Error('Font size must be between 6 and 160.');
    const start=Number(options.start??1),digits=Number(options.digits??6);if(kind==='bates'&&(!Number.isInteger(start)||start<0||!Number.isInteger(digits)||digits<1||digits>12))throw Error('Choose a nonnegative starting number and 1 to 12 digits.');
    selected.forEach((i,j)=>{const p=doc.getPage(i),box=p.getCropBox(),angle=((p.getRotation().angle%360)+360)%360,width=angle%180?box.height:box.width,height=angle%180?box.width:box.height;let text=options.text||'';if(kind==='numbers')text=`${options.prefix||''}${i+1}${options.suffix||''}`;if(kind==='bates')text=`${options.prefix||''}${String(start+j).padStart(digits,'0')}`;if(!text)throw Error('Enter the text to add.');const vx=Math.max(15,(width-font.widthOfTextAtSize(text,size))/2),vy=kind==='watermark'?height/2:options.position==='top'?height-25:20;const [x,y]=angle===90?[box.x+box.width-vy,box.y+vx]:angle===180?[box.x+box.width-vx,box.y+box.height-vy]:angle===270?[box.x+vy,box.y+box.height-vx]:[box.x+vx,box.y+vy];p.drawText(text,{x,y,size,font,color,opacity:kind==='watermark'?0.25:1,rotate:degrees(angle+(kind==='watermark'?30:0))});});
  }else if(kind==='metadata'){
    doc.setTitle(options.title||'');doc.setAuthor(options.author||'');doc.setSubject(options.subject||'');doc.setKeywords(String(options.keywords||'').split(',').map(s=>s.trim()));
  }else if(kind==='remove-annotations'){
    selected.forEach(i=>{const p=doc.getPage(i),annots=p.node.lookupMaybe(PDFName.of('Annots'),lib.PDFArray);if(!annots)return;for(let j=annots.size()-1;j>=0;j--){const a=doc.context.lookup(annots.get(j));if(a?.get(PDFName.of('Subtype'))?.toString()!=='/Widget')annots.remove(j);}});
  }else if(kind==='flatten'){
    doc.getForm().flatten();
  }else if(kind==='bookmarks'){
    const entries=String(options.text||'').split('\n').filter(s=>s.trim()).map(line=>{const m=line.match(/^(\d+)\s+(.+)$/);if(!m)throw Error('Use one bookmark per line: page number followed by title.');const n=Number(m[1]);if(n<1||n>count)throw Error('Bookmark page is outside this document.');return {page:n-1,title:m[2]};});
    if(!entries.length)throw Error('Enter at least one bookmark.');const outline=doc.context.obj({Type:'Outlines',Count:entries.length});const ref=doc.context.register(outline);const refs=entries.map(()=>doc.context.nextRef());entries.forEach((e,i)=>{const item=doc.context.obj({Title:lib.PDFHexString.fromText(e.title),Parent:ref,Dest:[doc.getPage(e.page).ref,PDFName.of('Fit')]});if(i)item.set(PDFName.of('Prev'),refs[i-1]);if(i<refs.length-1)item.set(PDFName.of('Next'),refs[i+1]);doc.context.assign(refs[i],item);});outline.set(PDFName.of('First'),refs[0]);outline.set(PDFName.of('Last'),refs.at(-1));doc.catalog.set(PDFName.of('Outlines'),ref);
  }else if(kind!=='repair')throw Error('Unknown PDF operation.');
  return doc.save({useObjectStreams:true});
}

export async function mergePdfs(lib,inputs,alternate=false) {
  if(!inputs.length)throw Error('Choose PDFs first.');const out=await lib.PDFDocument.create(),docs=[];for(const b of inputs){const d=await lib.PDFDocument.load(b);d.getForm().flatten();docs.push(d);}
  if(alternate){for(let i=0;i<Math.max(...docs.map(d=>d.getPageCount()));i++)for(const d of docs)if(i<d.getPageCount())out.addPage((await out.copyPages(d,[i]))[0]);}
  else for(const d of docs)for(const p of await out.copyPages(d,d.getPageIndices()))out.addPage(p);
  return out.save();
}
