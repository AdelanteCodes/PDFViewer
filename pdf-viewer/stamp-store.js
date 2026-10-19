// Only explicitly saved stamps belong here. PDF bytes never enter this database.
let database;
function open(){
  if(database)return database;
  database=new Promise((resolve,reject)=>{
    const request=indexedDB.open('bhavyam-pdf-stamps',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('stamps',{keyPath:'id'});
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();database=null;};resolve(db);};
    request.onerror=()=>{database=null;reject(Error('Stamp storage is unavailable. Check browser storage settings.'));};
    request.onblocked=()=>{database=null;reject(Error('Close other PDF workspace tabs and retry saving the stamp.'));};
  });return database;
}
async function operation(mode,action){
  const db=await open();return new Promise((resolve,reject)=>{
    const transaction=db.transaction('stamps',mode);let result;
    const request=action(transaction.objectStore('stamps'));
    request.onsuccess=()=>{result=request.result;};
    transaction.oncomplete=()=>resolve(result);
    transaction.onabort=transaction.onerror=()=>reject(Error('Could not save the stamp. Browser storage may be full or unavailable.'));
  });
}
export const listStamps=()=>operation('readonly',store=>store.getAll());
export async function saveStamp(record){
  if(!record.id||!record.name?.trim()||!(record.blob instanceof Blob)||record.blob.type!=='image/png')throw Error('Choose a named PNG stamp.');
  if(record.blob.size>10*1024*1024)throw Error('Use a smaller stamp image (up to 10 MiB after conversion).');
  const existing=await listStamps(),other=existing.filter(item=>item.id!==record.id);
  if(other.length>=30||other.reduce((n,item)=>n+item.blob.size,0)+record.blob.size>50*1024*1024)throw Error('Stamp storage limit reached. Remove unused stamps first.');
  await operation('readwrite',store=>store.put({...record,name:record.name.trim().slice(0,80)}));
}
export const removeStamp=id=>operation('readwrite',store=>store.delete(id));
