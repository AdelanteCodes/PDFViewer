// Convert the visual image rectangle back into PDF coordinates, including
// rotated pages, non-zero crop origins and page user-unit scaling.
export function imagePlacement(viewport,op){
  const x=op.a[0]*viewport.width,y=op.a[1]*viewport.height,w=op.width*viewport.width,h=op.height*viewport.height;
  const bottom=viewport.convertToPdfPoint(x,y+h),right=viewport.convertToPdfPoint(x+w,y+h),top=viewport.convertToPdfPoint(x,y);
  return {x:bottom[0],y:bottom[1],width:Math.hypot(right[0]-bottom[0],right[1]-bottom[1]),height:Math.hypot(top[0]-bottom[0],top[1]-bottom[1]),angle:Math.atan2(right[1]-bottom[1],right[0]-bottom[0])*180/Math.PI};
}
