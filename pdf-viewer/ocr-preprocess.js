// Remove long straight form rules without removing ordinary short text strokes.
export function rulingMask(data,width,height){
 const mask=new Uint8Array(width*height),dark=(x,y)=>{const i=(y*width+x)*4;return data[i]+data[i+1]+data[i+2]<330;};
 const minX=Math.max(60,Math.floor(width*.12)),minY=Math.max(60,Math.floor(height*.045));
 for(let y=0;y<height;y++){let start=-1;for(let x=0;x<=width;x++){if(x<width&&dark(x,y)){if(start<0)start=x;}else if(start>=0){if(x-start>=minX)for(let xx=start;xx<x;xx++)for(let dy=-1;dy<=1;dy++)if(y+dy>=0&&y+dy<height)mask[(y+dy)*width+xx]=1;start=-1;}}}
 for(let x=0;x<width;x++){let start=-1;for(let y=0;y<=height;y++){if(y<height&&dark(x,y)){if(start<0)start=y;}else if(start>=0){if(y-start>=minY)for(let yy=start;yy<y;yy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<width)mask[yy*width+x+dx]=1;start=-1;}}}
 return mask;
}
export function removeRuling(canvas){const ctx=canvas.getContext('2d',{willReadFrequently:true}),image=ctx.getImageData(0,0,canvas.width,canvas.height),mask=rulingMask(image.data,canvas.width,canvas.height);for(let i=0;i<mask.length;i++)if(mask[i])image.data[i*4]=image.data[i*4+1]=image.data[i*4+2]=255;ctx.putImageData(image,0,0);}
