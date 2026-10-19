// No browser storage: document bytes live only for the lifetime of this page.
export class DocumentSession {
  constructor(limit=6,budget=180*1024*1024){this.limit=limit;this.budget=budget;this.entries=[];this.cursor=-1;this.revision=0;}
  get current(){return this.entries[this.cursor]||null;}
  commit(bytes,name='document.pdf'){
    const entry={bytes:new Uint8Array(bytes).slice(),name,revision:++this.revision};
    this.entries.splice(this.cursor+1);this.entries.push(entry);
    while(this.entries.length>1&&(this.entries.length>this.limit||this.entries.reduce((n,e)=>n+e.bytes.byteLength,0)>this.budget))this.entries.shift();
    this.cursor=this.entries.length-1;return entry;
  }
  undo(){if(this.cursor>0)this.cursor--;return this.current;}
  redo(){if(this.cursor<this.entries.length-1)this.cursor++;return this.current;}
  clear(){this.entries=[];this.cursor=-1;}
}
export function changedTextGroups(values){
  if(!values.length)return [];
  const groups=[[0]];
  for(let i=1;i<values.length;i++){
    if(values[i]!==values[i-1])groups.push([]);
    groups.at(-1).push(i);
  }
  return groups;
}
