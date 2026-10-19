const XLSX_URL='https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
export async function exportRowsExcel(fields,rows,filename='results.xlsx') {
  if(!fields.length||!rows.length)throw Error('Select fields and at least one matching row.');
  const XLSX=await import(XLSX_URL), data=[fields];
  for(const row of rows){
    // Excel limits strings to 32767 characters. Continue long text on extra rows.
    const parts=fields.map(f=>{const v=row[f]??'';return typeof v==='string'&&v.length>32000?Array.from({length:Math.ceil(v.length/32000)},(_,i)=>v.slice(i*32000,(i+1)*32000)):[v];});
    const n=Math.max(...parts.map(p=>p.length));
    for(let i=0;i<n;i++)data.push(parts.map(p=>p[i]??''));
  }
  if(data.length>1048576)throw Error('Too many rows for one Excel worksheet. Filter the results first.');
  const sheet=XLSX.utils.aoa_to_sheet(data,{cellDates:true});
  sheet['!cols']=fields.map(f=>({wch:/text|goods|instructions|shipper|consignee|value/i.test(f)?55:24}));
  sheet['!autofilter']={ref:sheet['!ref']};
  // Strings remain strings, including values beginning with =, +, - or @.
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'PDF results');
  XLSX.writeFile(book,filename,{cellDates:true});
}

export async function exportRowsPdf(fields,rows,filename='results.pdf') {
  if(!fields.length||!rows.length)throw Error('Select fields and at least one matching row.');
  const {jsPDF}=await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm');
  const pdf=new jsPDF({unit:'pt',format:'a4'}),width=pdf.internal.pageSize.getWidth(),height=pdf.internal.pageSize.getHeight();
  let y=42,page=1;
  const heading=()=>{pdf.setFontSize(14);pdf.text('PDF Viewer results',36,32);pdf.setFontSize(8);pdf.text(`Page ${page}`,width-80,height-18);};heading();
  const write=(text,bold=false)=>{pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(9);const lines=pdf.splitTextToSize(String(text??''),width-72);for(const line of lines){if(y>height-40){pdf.addPage();page++;y=48;heading();pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(9);}pdf.text(line,36,y);y+=12;}};
  for(let i=0;i<rows.length;i++){write(`Record ${i+1} of ${rows.length}`,true);for(const f of fields){write(f,true);write(rows[i][f]??'');y+=3;}y+=12;}
  pdf.save(filename);
}
