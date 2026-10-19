// Rebuild a page exclusively from the painted pixels. No original PDF objects,
// text streams, attachments or annotations are copied into this new page.
export async function rebuildImagePage(target,pdfPage,paint){
  const base=pdfPage.getViewport({scale:1});
  const scale=Math.min(1.5,Math.sqrt(12000000/(base.width*base.height)));
  const view=pdfPage.getViewport({scale}),canvas=document.createElement('canvas');
  canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
  try{
    const context=canvas.getContext('2d');
    await pdfPage.render({canvasContext:context,viewport:view}).promise;
    paint(context,canvas.width,canvas.height);
    const image=await target.embedPng(canvas.toDataURL('image/png'));
    const page=target.addPage([base.width,base.height]);
    page.drawImage(image,{x:0,y:0,width:base.width,height:base.height});
    return page;
  }finally{canvas.width=0;canvas.height=0;}
}
