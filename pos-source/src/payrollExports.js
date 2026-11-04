import {money} from './domain.mjs';
import {download} from './exports.js';

const amount=n=>Number(n)||0;
export async function exportPayrollExcel(rows,period){
 const ExcelJS=await import('exceljs');
 const wb=new ExcelJS.default.Workbook();
 const sheet=wb.addWorksheet('Penggajian');
 sheet.columns=[
  {header:'Periode',key:'period',width:16},{header:'Karyawan',key:'name',width:28},
  {header:'Gaji Pokok (Rp)',key:'base',width:20},{header:'Tunjangan (Rp)',key:'allowance',width:20},
  {header:'Bonus (Rp)',key:'bonus',width:20},{header:'Potongan (Rp)',key:'deduction',width:20},
  {header:'Gaji Bersih (Rp)',key:'net',width:23},{header:'Status',key:'status',width:15},
  {header:'Dibayar Tanggal',key:'paid',width:19},{header:'Metode',key:'method',width:17},{header:'Catatan',key:'note',width:42}
 ];
 for(const p of rows)sheet.addRow({period:p.period.slice(0,7),name:p.staff_name,base:amount(p.base_salary),allowance:amount(p.allowance),bonus:amount(p.bonus),deduction:amount(p.deduction),net:amount(p.net_pay),status:p.status==='paid'?'Dibayar':'Draft',paid:p.paid_on||'',method:p.payment_method==='cash'?'Tunai':p.payment_method==='transfer'?'Transfer':'',note:p.note||''});
 sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
 sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF084DA8'}};
 for(let n=2;n<=sheet.rowCount;n++)for(let col=3;col<=7;col++)sheet.getRow(n).getCell(col).numFmt='"Rp" #,##0';
 sheet.views=[{state:'frozen',ySplit:1}];
 const b=await wb.xlsx.writeBuffer();
 download('CAUSA-Penggajian-'+period+'.xlsx',b,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
export async function exportPayslipPDF(p){
 if(p.status!=='paid')throw new Error('Slip resmi hanya tersedia untuk gaji yang sudah dibayar.');
 const {jsPDF}=await import('jspdf');
 const pdf=new jsPDF({unit:'mm',format:'a4'});
 pdf.setFillColor(8,77,168);pdf.rect(0,0,210,35,'F');pdf.setTextColor(255,255,255);pdf.setFont('helvetica','bold');pdf.setFontSize(20);pdf.text('CAUSA CAFE',17,17);pdf.setFontSize(11);pdf.text('SLIP GAJI KARYAWAN',17,26);
 pdf.setTextColor(39,55,78);pdf.setFont('helvetica','normal');pdf.setFontSize(11);
 pdf.text('Nama karyawan',17,49);pdf.text(': '+p.staff_name,75,49);
 pdf.text('Periode gaji',17,58);pdf.text(': '+p.period.slice(0,7),75,58);
 pdf.text('Tanggal dibayar',17,67);pdf.text(': '+p.paid_on,75,67);
 pdf.text('Metode',17,76);pdf.text(': '+(p.payment_method==='cash'?'Tunai':'Transfer bank'),75,76);
 const {default:autoTable}=await import('jspdf-autotable');
 autoTable(pdf,{startY:90,head:[['Rincian','Nominal']],body:[
   ['Gaji pokok',money(p.base_salary)],['Tunjangan',money(p.allowance)],['Bonus',money(p.bonus)],['Potongan','- '+money(p.deduction)],['GAJI BERSIH',money(p.net_pay)]
  ],theme:'grid',headStyles:{fillColor:[8,77,168]},bodyStyles:{fontSize:11},columnStyles:{1:{halign:'right'}},
  didParseCell:cell=>{if(cell.row.index===4){cell.cell.styles.fontStyle='bold';cell.cell.styles.fillColor=[237,245,255]}}
 });
 if(p.note){pdf.setTextColor(74,87,106);pdf.setFontSize(9);pdf.text('Catatan: '+pdf.splitTextToSize(p.note,168).join(' '),17,pdf.lastAutoTable.finalY+12)}
 pdf.setFontSize(9);pdf.setTextColor(118,127,145);pdf.text('Diterbitkan oleh CAUSA CAFE · Konfirmasi pembayaran oleh Owner',17,273);
 const safe=(p.staff_name||'karyawan').normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,50);
 pdf.save('CAUSA-Slip-Gaji-'+safe+'-'+p.period.slice(0,7)+'.pdf');
}
