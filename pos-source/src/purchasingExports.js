import {money} from './domain.mjs';
const stamp=(value)=>new Date(value||Date.now()).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta',day:'2-digit',month:'short',year:'numeric'});
const label={draft:'Draft',ordered:'Dipesan',received:'Diterima',cancelled:'Dibatalkan'};
const poNo=p=>'PC-'+String(p.number??'DRAFT').padStart(4,'0');
const clean=s=>String(s??'').slice(0,500);
function normalize(orders){return (Array.isArray(orders)?orders:[orders]).filter(Boolean)}
function flat(orders){return normalize(orders).flatMap(po=>(po.items||[]).map((item,index)=>({
 po, index:index+1, name:clean(item.name), qty:Number(item.quantity)||0, unit:clean(item.unit),
 amount:Number(item.estimated_cost)||0
})))}
export async function exportPurchasingPDF(orders,print=false){
 const data=normalize(orders);
 if(!data.length)throw new Error('Belum ada data purchasing yang bisa diekspor.');
 const printWindow=print?window.open('','_blank'):null;
 const {jsPDF}=await import('jspdf');
 const {default:autoTable}=await import('jspdf-autotable');
 const pdf=new jsPDF({unit:'mm',format:'a4'});
 pdf.setTextColor(8,77,168);pdf.setFont('helvetica','bold');pdf.setFontSize(17);pdf.text('CAUSA CAFE',14,18);
 pdf.setTextColor(58,75,100);pdf.setFontSize(10);pdf.text(data.length===1?'FORMULIR PEMBELIAN BAHAN':'LAPORAN PURCHASING',14,26);
 pdf.setFont('helvetica','normal');pdf.setFontSize(9);
 pdf.text('Dicetak: '+stamp(),14,33);
 let y=41;
 for(const po of data){
  if(y>210){pdf.addPage();y=17;}
  pdf.setTextColor(30,58,99);pdf.setFont('helvetica','bold');pdf.setFontSize(11);
  pdf.text(poNo(po)+' · '+label[po.status]||'',14,y);y+=6;
  pdf.setFont('helvetica','normal');pdf.setFontSize(9);pdf.setTextColor(66,83,106);
  const meta=pdf.splitTextToSize('Supplier: '+clean(po.supplier_name)+' | Tanggal: '+stamp(po.created_at)+(po.expected_date?' | Perkiraan datang: '+stamp(po.expected_date):''),180);
  pdf.text(meta,14,y);y+=meta.length*4+3;
  if(po.note){const note=pdf.splitTextToSize('Catatan: '+clean(po.note),180);pdf.text(note,14,y);y+=note.length*4+3;}
  autoTable(pdf,{startY:y,margin:{left:14,right:14},head:[['#','Bahan','Jumlah','Satuan','Estimasi biaya']],body:(po.items||[]).map((i,n)=>[n+1,clean(i.name),Number(i.quantity),clean(i.unit),money(i.estimated_cost)]),
    theme:'grid',styles:{font:'helvetica',fontSize:8,cellPadding:2.6,overflow:'linebreak'},
    headStyles:{fillColor:[8,77,168]},columnStyles:{0:{cellWidth:9},2:{cellWidth:24},3:{cellWidth:25},4:{cellWidth:34,halign:'right'}}});
  y=pdf.lastAutoTable.finalY+7;
  if(y>265){pdf.addPage();y=18;}
  pdf.setFont('helvetica','bold');pdf.setTextColor(20,45,82);pdf.text('Total estimasi: '+money(po.total),196,y,{align:'right'});y+=14;
 }
 const filename='CAUSA-Purchasing-'+(data.length===1?poNo(data[0]):new Date().toISOString().slice(0,10))+'.pdf';
 if(print){pdf.autoPrint();const url=pdf.output('bloburl');if(printWindow)printWindow.location.href=url;else pdf.save(filename);}
 else pdf.save(filename);
}
export async function exportPurchasingExcel(orders){
 const data=normalize(orders);
 if(!data.length)throw new Error('Belum ada data purchasing yang bisa diekspor.');
 const ExcelJS=(await import('exceljs')).default;
 const book=new ExcelJS.Workbook();
 const sheet=book.addWorksheet('Pembelian Bahan');
 sheet.columns=[
 {header:'Nomor PO',key:'po',width:17},
 {header:'Tanggal',key:'date',width:23},
 {header:'Supplier',key:'supplier',width:30},
 {header:'Status',key:'status',width:17},
 {header:'Estimasi datang',key:'expected',width:20},
 {header:'Bahan',key:'ingredient',width:29},
 {header:'Jumlah',key:'quantity',width:17},
 {header:'Satuan',key:'unit',width:15},
 {header:'Biaya bahan (Rp)',key:'amount',width:23},
 {header:'Total PO (Rp)',key:'total',width:22},
 {header:'Catatan',key:'note',width:45}
 ];
 flat(data).forEach(({po,name,qty,unit,amount})=>sheet.addRow({
  po:poNo(po),date:stamp(po.created_at),supplier:clean(po.supplier_name),status:label[po.status]||po.status,
  expected:po.expected_date?stamp(po.expected_date):'',ingredient:name,quantity:qty,unit,amount,
  total:Number(po.total)||0,note:clean(po.note)
 }));
 sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
 sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF084DA8'}};
 sheet.getColumn('amount').numFmt='#,##0';sheet.getColumn('total').numFmt='#,##0';
 sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:'A1',to:'K1'};
 const buffer=await book.xlsx.writeBuffer();
 const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download='CAUSA-Purchasing-'+(data.length===1?poNo(data[0]):new Date().toISOString().slice(0,10))+'.xlsx';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),3000);
}
