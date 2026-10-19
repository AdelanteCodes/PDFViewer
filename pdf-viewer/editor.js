import './compatibility.js';
import {imagePlacement} from './image-placement.js';
import {mountStamps} from './stamps.js';
import {rebuildImagePage} from './raster-page.js';
import {rgbValue} from './pdf-core.js';
const $=id=>document.getElementById(id),canvas=$('canvas');let workspaceRevision=null;let bytes,doc,lib,js,pageNo=1,viewport,ops=[],forms=[],drawing=null,bg=null,imageData=null,rendering=false,renderVersion=0,selected=-1,moving=null,history=[],future=[],linkUpdates=new Map();
const copyOp=o=>({...o,a:[...o.a],b:[...o.b],points:o.points?.map(p=>[...p])});
function remember(){future=[];history.push(ops.map(copyOp));if(history.length>50)history.shift();}
const selectOption=document.createElement('option');selectOption.value='select';selectOption.textContent='Select / move added item';$('tool').append(selectOption);
const applyButton=document.createElement('button');applyButton.className='secondary';applyButton.textContent='Update selected text / style';applyButton.disabled=true;$('resize-edit').after(applyButton);
applyButton.onclick=()=>{if(selected<0)return;remember();Object.assign(ops[selected],{text:$('text').value,fontSize:Number($('font-size').value),font:$('font').value,color:$('color').value,lineWidth:Number($('line-width').value)});redraw();};
function updateTool(){const mode=$('tool').value,kind=mode==='select'&&selected>=0?ops[selected].kind:mode;const show={text:['text','replace','note','form-text','form-multiline','form-check','form-dropdown','form-radio'], 'font-size':['text','replace'],font:['text','replace'],color:['text','replace','ink','highlight','strike','rectangle','ellipse','note'],'line-width':['ink','strike','rectangle','ellipse'],image:['image'],url:['link'],choices:['form-dropdown','form-radio']};for(const [id,kinds]of Object.entries(show))$(id).closest('label').hidden=!kinds.includes(kind);for(const id of ['edit-width','edit-height'])$(id).closest('label').hidden=selected<0;applyButton.disabled=selected<0;}
$('tool').onchange=()=>{if($('tool').value!=='select')selected=-1;updateTool();redraw();};
$('select').onclick=()=>{$('tool').value='select';updateTool();status('Click an added item to select it, then drag to move it.');};
$('delete-edit').onclick=()=>{if(selected<0)return;remember();ops.splice(selected,1);selected=-1;redraw();};
$('resize-edit').onclick=()=>{if(selected<0)return;const op=ops[selected],w=Number($('edit-width').value)/100,h=Number($('edit-height').value)/100;if(!(w>0&&w<=1&&h>0&&h<=1)){status('Choose dimensions from 1% to 100%.',true);return;}remember();const r=rect(op);if(op.kind==='image'){op.width=w;op.height=h;}else if(op.kind==='ink'){op.points=op.points.map(p=>[op.a[0]+(p[0]-op.a[0])*w/(r[2]||.01),op.a[1]+(p[1]-op.a[1])*h/(r[3]||.01)]);}op.b=[op.a[0]+w,op.a[1]+h];redraw();};
async function libs(){lib??=await import('./vendor/1b66d097fa5b86e8ecea.mjs');if(!js){js=await import('./vendor/5d7045df35c11cd12cb2.mjs');js.GlobalWorkerOptions.workerSrc='./pdfjs-worker.js';}}
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
async function load(data){await libs();await doc?.destroy();bytes=new Uint8Array(data);doc=await js.getDocument({data:bytes.slice()}).promise;pageNo=1;ops=[];forms=[];history=[];future=[];linkUpdates.clear();selected=-1;$('page').max=String(doc.numPages);$('workspace').hidden=false;await inspectForms();await render();await stamps.restore();status(`Opened ${doc.numPages} pages. Original files are unchanged.`);}
$('open').onclick=async()=>{const f=$('file').files[0];if(!f){status('Choose a PDF first.',true);return;}if(f.size>100*1024*1024){status('Choose a PDF up to 100 MiB.',true);return;}$('open').disabled=true;try{await load(await f.arrayBuffer());}catch(e){status(e.message||'Could not open this PDF.',true);}finally{$('open').disabled=false;}};
$('blank').onclick=async()=>{try{await libs();const d=await lib.PDFDocument.create();d.addPage([595,842]);await load(await d.save());}catch(e){status(e.message,true);}};
async function inspectForms(){
  $('form-fields').replaceChildren();const d=await lib.PDFDocument.load(bytes);for(const field of d.getForm().getFields()){
    const name=field.getName(),type=['PDFCheckBox','PDFDropdown','PDFOptionList','PDFRadioGroup','PDFTextField'].find(t=>field instanceof lib[t]);const label=document.createElement('label');label.textContent=name;let input;
    if(type==='PDFCheckBox'){input=document.createElement('input');input.type='checkbox';input.checked=field.isChecked();}
    else if(type==='PDFDropdown'||type==='PDFOptionList'||type==='PDFRadioGroup'){input=document.createElement('select');const blank=document.createElement('option');blank.value='';blank.textContent='No selection';input.append(blank);for(const value of field.getOptions()){const o=document.createElement('option');o.value=o.textContent=value;input.append(o);}const chosen=field.getSelected();input.value=Array.isArray(chosen)?chosen[0]||'':chosen||'';}
    else if(type==='PDFTextField'){input=document.createElement('input');input.value=field.getText()||'';}else continue;
    label.append(input);$('form-fields').append(label);forms.push({name,type,input});
  }$('form-panel').hidden=!forms.length;
}
function point(e){const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];}
function rect(op){if(op.kind==='image')return [op.a[0],op.a[1],op.width,op.height];if(op.kind==='ink'){const xs=op.points.map(p=>p[0]),ys=op.points.map(p=>p[1]);return [Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)];}return [Math.min(op.a[0],op.b[0]),Math.min(op.a[1],op.b[1]),Math.abs(op.b[0]-op.a[0]),Math.abs(op.b[1]-op.a[1])];}
function paint(ctx,op,w,h){
 ctx.save();ctx.strokeStyle=op.color;ctx.fillStyle=op.color;ctx.lineWidth=op.lineWidth*w/(op.pageWidth||595);
 const x=op.a[0]*w,y=op.a[1]*h,r=rect(op),rx=r[0]*w,ry=r[1]*h,rw=r[2]*w,rh=r[3]*h;
 if(op.kind==='text'||op.kind==='replace'){if(op.kind==='replace'){ctx.fillStyle='white';ctx.fillRect(rx,ry,rw,rh);ctx.fillStyle=op.color;}const size=op.fontSize*w/(op.pageWidth||595);ctx.font=`${op.font.includes('Bold')?'bold ':op.font.includes('Italic')||op.font.includes('Oblique')?'italic ':''}${size}px ${op.font==='Times-Italic'?'serif':op.font==='Courier'?'monospace':'sans-serif'}`;ctx.textBaseline='top';op.text.split('\n').forEach((s,i)=>ctx.fillText(s,x,y+i*size*1.2));}
 else if(op.kind==='ink'){ctx.beginPath();op.points.forEach((p,i)=>i?ctx.lineTo(p[0]*w,p[1]*h):ctx.moveTo(p[0]*w,p[1]*h));ctx.stroke();}
 else if(op.kind==='image'){const im=op.image;ctx.drawImage(im,x,y,op.width*w,op.height*h);}
 else if(op.kind==='ellipse'){ctx.beginPath();ctx.ellipse(rx+rw/2,ry+rh/2,rw/2,rh/2,0,0,Math.PI*2);ctx.stroke();}
 else if(op.kind==='highlight'){ctx.fillStyle=op.color;ctx.globalAlpha=.3;ctx.fillRect(rx,ry,rw,rh);}
 else if(op.kind==='whiteout'||op.kind==='redact'){ctx.fillStyle=op.kind==='redact'?'black':'white';ctx.fillRect(rx,ry,rw,rh);}
 else if(op.kind==='strike'){ctx.beginPath();ctx.moveTo(rx,ry+rh/2);ctx.lineTo(rx+rw,ry+rh/2);ctx.stroke();}
 else{ctx.strokeStyle=op.kind.startsWith('form-')?'#245edb':op.color;ctx.strokeRect(rx,ry,Math.max(12,rw),Math.max(12,rh));if(op.kind==='note'||op.kind==='link'||op.kind.startsWith('form-')){ctx.font='12px sans-serif';ctx.fillText(op.kind==='link'?'Link':op.text||op.kind,rx+3,ry+14);}}
 ctx.restore();
}
function redraw(){if(!moving)updateTool();if(!bg)return;const ctx=canvas.getContext('2d');ctx.drawImage(bg,0,0);for(let i=0;i<ops.length;i++){const op=ops[i];if(op.page!==pageNo||moving&&i===selected)continue;paint(ctx,op,canvas.width,canvas.height);}if(drawing)paint(ctx,drawing,canvas.width,canvas.height);if(selected>=0&&ops[selected]?.page===pageNo){const r=rect(drawing&&moving?drawing:ops[selected]);ctx.save();ctx.strokeStyle='#245edb';ctx.setLineDash([5,5]);ctx.strokeRect(r[0]*canvas.width-3,r[1]*canvas.height-3,r[2]*canvas.width+6,r[3]*canvas.height+6);ctx.setLineDash([]);ctx.fillStyle='#245edb';ctx.fillRect((r[0]+r[2])*canvas.width-6,(r[1]+r[3])*canvas.height-6,12,12);ctx.restore();}$('undo').disabled=!history.length;$('redo-edit').disabled=!future.length;$('delete-edit').disabled=$('resize-edit').disabled=selected<0;$('edits').textContent=`${ops.length} pending edits across ${new Set(ops.map(o=>o.page)).size} pages. Preview shows page ${pageNo}.`;}
async function render(){if(!doc)return;const version=++renderVersion;rendering=true;try{const p=await doc.getPage(pageNo);viewport=p.getViewport({scale:1.5});const next=document.createElement('canvas');next.width=Math.ceil(viewport.width);next.height=Math.ceil(viewport.height);if(next.width*next.height>18000000)throw Error('Page is too large to edit on this device.');await p.render({canvasContext:next.getContext('2d'),viewport}).promise;if(version!==renderVersion)return;bg=next;canvas.width=next.width;canvas.height=next.height;$('page').value=pageNo;$('page-count').textContent=`of ${doc.numPages}`;$('prev').disabled=pageNo===1;$('next').disabled=pageNo===doc.numPages;redraw();await inspectLinks();p.cleanup();}catch(e){status(e.message,true);}finally{if(version===renderVersion)rendering=false;}}
$('prev').onclick=()=>{if(!rendering&&pageNo>1){pageNo--;render();}};$('next').onclick=()=>{if(!rendering&&pageNo<doc.numPages){pageNo++;render();}};$('page').onchange=()=>{const n=Number($('page').value);if(Number.isInteger(n)&&n>=1&&n<=doc.numPages){pageNo=n;render();}};
$('undo').onclick=()=>{if(history.length){future.push(ops.map(copyOp));ops=history.pop();}selected=-1;redraw();};
$('redo-edit').onclick=()=>{if(future.length){history.push(ops.map(copyOp));ops=future.pop();}selected=-1;redraw();};
$('image').onchange=async()=>{const f=$('image').files[0];if(!f)return;try{if(f.size>20*1024*1024)throw Error('Choose an image up to 20 MiB.');const url=URL.createObjectURL(f);try{const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;if(c.width*c.height>16000000)throw Error('Choose a smaller image.');c.getContext('2d').drawImage(im,0,0);imageData={image:im,data:c.toDataURL('image/png'),ratio:im.naturalHeight/im.naturalWidth};}finally{URL.revokeObjectURL(url);}}catch(e){status(e.message,true);}};
canvas.addEventListener('pointerdown',e=>{
 if(!doc||rendering)return;e.preventDefault();const kind=$('tool').value,text=$('text').value,fontSize=Number($('font-size').value),lineWidth=Number($('line-width').value);if(fontSize<6||fontSize>120||lineWidth<1||lineWidth>20){status('Choose a font size from 6 to 120 and line width from 1 to 20.',true);return;}
 if(kind==='select'){const p=point(e);selected=-1;for(let i=ops.length-1;i>=0;i--){const op=ops[i],r=rect(op);if(op.page===pageNo&&p[0]>=r[0]-.015&&p[0]<=r[0]+r[2]+.015&&p[1]>=r[1]-.015&&p[1]<=r[1]+r[3]+.015){selected=i;break;}}if(selected>=0){drawing=copyOp(ops[selected]);const bounds=rect(drawing);moving={start:p,original:copyOp(drawing),resize:Math.abs(p[0]-bounds[0]-bounds[2])<.025&&Math.abs(p[1]-bounds[1]-bounds[3])<.025};const r=rect(drawing);$('edit-width').value=(r[2]*100).toFixed(1);$('edit-height').value=(r[3]*100).toFixed(1);$('text').value=drawing.text;$('font-size').value=drawing.fontSize;$('font').value=drawing.font;$('color').value=drawing.color;$('line-width').value=drawing.lineWidth;canvas.setPointerCapture(e.pointerId);}redraw();return;}
 selected=-1;moving=null;
 if(['text','note'].includes(kind)&&!text){status('Enter text or a comment first.',true);return;}if(kind==='image'&&!imageData){status('Choose an image first.',true);return;}if(kind==='link'&&!/^https?:\/\//i.test($('url').value)){status('Enter a web URL beginning with https:// or http://.',true);return;}if(kind.startsWith('form-')&&!text.trim()){status('Enter a unique form field name first.',true);return;}
 const a=point(e);drawing={kind,page:pageNo,pageWidth:viewport.width/1.5,a,b:[a[0]+.15,a[1]+.04],text,fontSize,lineWidth,font:$('font').value,color:$('color').value,url:$('url').value,choices:$('choices').value,points:[a]};if(kind==='image'){Object.assign(drawing,imageData,{width:.25,height:.25*canvas.width/canvas.height*imageData.ratio});}canvas.setPointerCapture(e.pointerId);redraw();
});
canvas.addEventListener('pointermove',e=>{if(!drawing)return;e.preventDefault();const p=point(e);if(moving){const dx=p[0]-moving.start[0],dy=p[1]-moving.start[1],original=moving.original;if(moving.resize){const r=rect(original),w=Math.max(.01,p[0]-r[0]),h=Math.max(.01,p[1]-r[1]);drawing.b=[r[0]+w,r[1]+h];if(['text','replace'].includes(drawing.kind))drawing.fontSize=Math.max(6,Math.min(120,original.fontSize*h/(r[3]||.01)));if(drawing.kind==='image'){drawing.width=w;drawing.height=h;}if(drawing.kind==='ink')drawing.points=original.points.map(q=>[r[0]+(q[0]-r[0])*w/(r[2]||.01),r[1]+(q[1]-r[1])*h/(r[3]||.01)]);}else{drawing.a=[original.a[0]+dx,original.a[1]+dy];drawing.b=[original.b[0]+dx,original.b[1]+dy];drawing.points=original.points?.map(q=>[q[0]+dx,q[1]+dy]);}}else{drawing.b=p;if(drawing.kind==='ink')drawing.points.push(p);}redraw();});
function finish(){if(!drawing)return;if(drawing.kind==='ink'&&drawing.points.length<2){drawing=null;redraw();return;}if(moving){if(moving.resize||drawing.a[0]!==moving.original.a[0]||drawing.a[1]!==moving.original.a[1])remember();ops[selected]=drawing;moving=null;}else{remember();ops.push(drawing);}drawing=null;redraw();status('Edit added. Download to save your changes.');}
canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',()=>{drawing=null;moving=null;redraw();});
$('replace-all').onclick=async()=>{
 if(!doc)return;const find=$('find').value;if(!find){status('Enter text to find.',true);return;}$('replace-all').disabled=true;let count=0;
 try{remember();for(let n=1;n<=doc.numPages;n++){const p=await doc.getPage(n),v=p.getViewport({scale:1}),content=await p.getTextContent();for(const item of content.items){if(!item.str?.includes(find))continue;const tx=js.Util.transform(v.transform,item.transform),size=Math.hypot(tx[2],tx[3]),text=item.str.split(find).join($('replace').value);const a=[tx[4]/v.width,(tx[5]-size)/v.height],b=[(tx[4]+item.width)/v.width,(tx[5]+size*.25)/v.height];ops.push({kind:'replace',page:n,pageWidth:v.width,a,b,text,fontSize:size,lineWidth:1,font:'Helvetica',color:$('color').value});count++;}p.cleanup();}await render();status(`${count} text spans replaced. Check the preview before downloading.`);}catch(e){status(e.message,true);}finally{$('replace-all').disabled=false;}
};
function ascii(text){return String(text);}
async function vectorEdit(out,page,op,v,index){
 const L=lib,point=p=>v.convertToPdfPoint(p[0]*v.width,p[1]*v.height),a=point(op.a),b=point(op.b),x=Math.min(a[0],b[0]),y=Math.min(a[1],b[1]),w=Math.max(12,Math.abs(a[0]-b[0])),h=Math.max(12,Math.abs(a[1]-b[1])),color=L.rgb(...rgbValue(op.color));
 if(op.kind==='text'){const font=await out.embedFont(op.font);page.drawText(ascii(op.text),{x:a[0],y:a[1]-op.fontSize,size:op.fontSize,font,color});}
 else if(op.kind==='image'){const img=await out.embedPng(op.data),{angle,...placement}=imagePlacement(v,op);page.drawImage(img,{...placement,rotate:L.degrees(angle)});}
 else if(op.kind==='ink'){for(let i=1;i<op.points.length;i++){const p=point(op.points[i-1]),q=point(op.points[i]);page.drawLine({start:{x:p[0],y:p[1]},end:{x:q[0],y:q[1]},thickness:op.lineWidth,color});}}
 else if(op.kind==='ellipse')page.drawEllipse({x:x+w/2,y:y+h/2,xScale:w/2,yScale:h/2,borderColor:color,borderWidth:op.lineWidth});
 else if(op.kind==='strike')page.drawLine({start:{x,y:y+h/2},end:{x:x+w,y:y+h/2},thickness:op.lineWidth,color});
 else if(['rectangle','highlight','whiteout'].includes(op.kind))page.drawRectangle({x,y,width:w,height:h,...(op.kind==='rectangle'?{borderColor:color,borderWidth:op.lineWidth}:{color:op.kind==='whiteout'?L.rgb(1,1,1):color,opacity:op.kind==='highlight'?.3:1})});
 else if(op.kind==='link'||op.kind==='note'){const annot=out.context.obj({Type:'Annot',Subtype:op.kind==='link'?'Link':'Text',Rect:[x,y,x+w,y+h],...(op.kind==='link'?{Border:[0,0,0],A:{Type:'Action',S:'URI',URI:L.PDFString.of(op.url)}}:{Contents:L.PDFHexString.fromText(op.text),Name:'Comment',C:rgbValue(op.color)})});page.node.addAnnot(out.context.register(annot));}
 else if(op.kind.startsWith('form-')){const form=out.getForm();let f;const name=op.text.trim(),options={x,y,width:w,height:h};if(op.kind==='form-radio'){const existing=form.getFields().find(f=>f.getName()===name);f=existing||form.createRadioGroup(name);if(!(f instanceof L.PDFRadioGroup))throw Error(`${name} already exists as another field type.`);f.addOptionToPage(op.choices.trim()||`Choice ${index+1}`,page,options);return;}if(form.getFields().some(f=>f.getName()===name))throw Error(`Form field ${name} already exists. Use a unique name.`);if(op.kind==='form-check'){f=form.createCheckBox(name);f.addToPage(page,options);}else if(op.kind==='form-dropdown'){f=form.createDropdown(name);f.addOptions(op.choices.split(',').map(s=>s.trim()).filter(Boolean));f.addToPage(page,options);}else{f=form.createTextField(name);if(op.kind==='form-multiline')f.enableMultiline();f.addToPage(page,options);}}
}
$('save').onclick=async()=>{
 if(!doc)return;$('save').disabled=true;status('Preparing edited PDF…');
 try{const source=await lib.PDFDocument.load(bytes);for(const [key,url]of linkUpdates){const [n,index]=key.split(':').map(Number),ref=source.getPage(n-1).node.Annots()?.asArray()[index];if(ref){const a=source.context.lookup(ref),action=a.lookup(lib.PDFName.of('A'));action?.set(lib.PDFName.of('URI'),lib.PDFString.of(url));}}for(const {name,type,input} of forms){const f=source.getForm().getField(name);if(type==='PDFCheckBox')input.checked?f.check():f.uncheck();else if(type==='PDFTextField')f.setText(input.value);else if(input.value)f.select(input.value);else if(f.clear)f.clear();}
 const raster=ops.some(o=>o.kind==='redact'||o.kind==='replace');
 if(raster)source.getForm().flatten();
 const out=raster?await lib.PDFDocument.create():source;
 const renderDoc=raster?await js.getDocument({data:await source.save()}).promise:doc;
 for(let n=1;n<=doc.numPages;n++){const pageOps=ops.filter(o=>o.page===n),p=await renderDoc.getPage(n),v=p.getViewport({scale:1});let page;
  if(pageOps.some(o=>o.kind==='redact'||o.kind==='replace')){page=await rebuildImagePage(out,p,(context,w,h)=>{for(const op of pageOps.filter(o=>!o.kind.startsWith('form-')&&o.kind!=='link'&&o.kind!=='note'))paint(context,op,w,h);});for(const op of pageOps.filter(o=>o.kind.startsWith('form-')||o.kind==='link'||o.kind==='note'))await vectorEdit(out,page,op,v,ops.indexOf(op));
  }else{page=raster?out.addPage((await out.copyPages(source,[n-1]))[0]):source.getPage(n-1);for(const op of pageOps)await vectorEdit(out,page,op,v,ops.indexOf(op));}p.cleanup();
 }
 if(raster)await renderDoc.destroy();
 const result=await out.save();if(new URLSearchParams(location.search).has('workspace')&&parent!==window){parent.postMessage({type:'pdf-editor-result',bytes:result,revision:workspaceRevision},location.origin);status('Edits returned to the PDF workspace.');return;}const url=URL.createObjectURL(new Blob([result],{type:'application/pdf'})),a=document.createElement('a');a.href=url;a.download='edited-document.pdf';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status('Edited PDF downloaded. Your original is unchanged.');
 }catch(e){status(e.message||'Could not save edits.',true);}finally{$('save').disabled=false;}
};
updateTool();

if(new URLSearchParams(location.search).has('workspace')&&parent!==window){
 $('save').textContent='Apply edits to workspace';
 window.addEventListener('message',async event=>{if(event.origin!==location.origin||event.source!==parent)return;if(event.data?.type==='pdf-editor-applied'){workspaceRevision=event.data.revision;return;}if(event.data?.type!=='pdf-open'||!(event.data.bytes instanceof Uint8Array))return;try{workspaceRevision=event.data.revision;await load(event.data.bytes);}catch(e){status(e.message,true);}});
 parent.postMessage({type:'pdf-editor-ready'},location.origin);
}

async function inspectLinks(){
 const source=await lib.PDFDocument.load(bytes),refs=source.getPage(pageNo-1).node.Annots()?.asArray()||[];
 $('existing-links').replaceChildren(new Option('Choose a web link',''));
 refs.forEach((ref,index)=>{try{const a=source.context.lookup(ref);if(a.get(lib.PDFName.of('Subtype'))?.toString()!=='/Link')return;const action=a.lookup(lib.PDFName.of('A')),value=action?.lookup(lib.PDFName.of('URI'));if(!value)return;const key=`${pageNo}:${index}`,url=linkUpdates.get(key)||value.decodeText();if(/^https?:\/\//i.test(url))$('existing-links').append(new Option(url,key));}catch{}});
}
$('existing-links').onchange=()=>{$('existing-link-url').value=$('existing-links').selectedOptions[0]?.textContent||'';};
$('update-existing-link').onclick=()=>{const key=$('existing-links').value,url=$('existing-link-url').value.trim();if(!key||!/^https?:\/\//i.test(url)){status('Choose a link and enter an HTTP or HTTPS URL.',true);return;}linkUpdates.set(key,url);inspectLinks();status('Link target updated. Apply or download to save.');};
for(const [id,position] of [['align-left',0],['align-center',.5],['align-right',1]])$(id).onclick=()=>{if(selected<0)return;remember();const op=ops[selected],r=rect(op),dx=(1-r[2])*position-r[0];op.a[0]+=dx;op.b[0]+=dx;if(op.points)op.points=op.points.map(p=>[p[0]+dx,p[1]]);redraw();};

const stamps=mountStamps({status,activate(value){imageData=value;selected=-1;$('tool').value='image';updateTool();redraw();$('active-stamp').textContent=`Ready: ${value.name}. Click the PDF to place this stamp. It stays selected for the next placement and the next PDF.`;},deactivate(){imageData=null;$('active-stamp').textContent='No stamp selected.';}});
