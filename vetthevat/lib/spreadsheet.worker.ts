import * as XLSX from "xlsx";
const scope=globalThis as unknown as {onmessage:((event:MessageEvent<ArrayBuffer>)=>void)|null;postMessage:(message:unknown)=>void};
scope.onmessage=event=>{
  try{
    const bytes=new Uint8Array(event.data);
    if(bytes.length>5*1024*1024||bytes[0]!==0x50||bytes[1]!==0x4b||bytes[2]!==3||bytes[3]!==4)throw new Error("Choose a valid XLSX workbook up to 5 MB.");
    const workbook=XLSX.read(bytes,{type:"array",cellDates:true,raw:true});
    if(!workbook.SheetNames.length||workbook.SheetNames.length>20)throw new Error("Use a workbook with 1 to 20 sheets.");
    let cells=0,characters=0;
    const sheets=Object.fromEntries(workbook.SheetNames.map(name=>{
      const rows=XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name],{header:1,raw:true,defval:""});
      if(rows.length>5001||rows.some(row=>row.length>100))throw new Error("Limit each sheet to 5,000 transactions and 100 columns.");
      return [name,rows.map(row=>row.map(value=>{const text=value instanceof Date?`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`:String(value??"");cells++;characters+=text.length;if(text.length>2000||cells>100000||characters>2*1024*1024)throw new Error("Statement exceeds parsing output limits.");return text;}))];
    }));
    scope.postMessage({ok:true,sheets});
  }catch{scope.postMessage({ok:false});}
};
