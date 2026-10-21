// A document-scoped preview font. The PDF export keeps its original font bytes.
export function browserFont(bytes,glyphs){
 const data=new Uint8Array(bytes),v=new DataView(data.buffer,data.byteOffset,data.byteLength);
 if(data.length<12||data.length>12*1024*1024)throw Error('Unsupported preview font');
 const count=v.getUint16(4);if(count>128||12+count*16>data.length)throw Error('Invalid font tables');
 const tables=[];for(let i=0;i<count;i++){const p=12+i*16,tag=String.fromCharCode(...data.slice(p,p+4)),offset=v.getUint32(p+8),length=v.getUint32(p+12);if(offset+length>data.length)throw Error('Invalid font table');if(!['cmap','DSIG'].includes(tag))tables.push({tag,data:data.slice(offset,offset+length)});}
 const pairs=[...new Map(glyphs.filter(([u,g])=>Number.isInteger(u)&&u>0&&u<=0x10ffff&&g>0&&g<=65535))].sort((a,b)=>a[0]-b[0]);if(!pairs.length)throw Error('No preview glyphs');
 const cmap=new Uint8Array(28+pairs.length*12),c=new DataView(cmap.buffer);c.setUint16(2,1);c.setUint16(4,3);c.setUint16(6,10);c.setUint32(8,12);c.setUint16(12,12);c.setUint32(16,cmap.length-12);c.setUint32(24,pairs.length);pairs.forEach(([u,g],i)=>{const p=28+i*12;c.setUint32(p,u);c.setUint32(p+4,u);c.setUint32(p+8,g);});tables.push({tag:'cmap',data:cmap});tables.sort((a,b)=>a.tag.localeCompare(b.tag));
 const padded=n=>(n+3)&~3;let size=12+tables.length*16;const out=new Uint8Array(size+tables.reduce((n,t)=>n+padded(t.data.length),0)),o=new DataView(out.buffer);out.set(data.slice(0,4));o.setUint16(4,tables.length);const power=2**Math.floor(Math.log2(tables.length));o.setUint16(6,power*16);o.setUint16(8,Math.log2(power));o.setUint16(10,tables.length*16-power*16);
 const checksum=(a)=>{let sum=0;for(let i=0;i<a.length;i+=4)sum=(sum+(((a[i]||0)*0x1000000)+((a[i+1]||0)<<16)+((a[i+2]||0)<<8)+(a[i+3]||0)))>>>0;return sum;};let head;
 tables.forEach((t,i)=>{if(t.tag==='head'){if(t.data.length<12)throw Error('Invalid head table');t.data.fill(0,8,12);head=size;}const p=12+i*16;out.set([...t.tag].map(c=>c.charCodeAt(0)),p);o.setUint32(p+4,checksum(t.data));o.setUint32(p+8,size);o.setUint32(p+12,t.data.length);out.set(t.data,size);size+=padded(t.data.length);});if(head===undefined)throw Error('Missing head table');o.setUint32(head+8,(0xb1b0afba-checksum(out))>>>0);return out;
}
