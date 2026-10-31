import {buildPurchasingEscPos} from './purchasingBluetooth.js';

// QZ Tray is a local desktop companion, not a browser-only extension.
// Load the official browser connector only after the owner explicitly
// chooses to connect, so ordinary POS activity has no extra dependency.
const QZ_TRAY_SCRIPT='https://cdn.jsdelivr.net/npm/qz-tray@2.3.0/qz-tray.js';
let scriptLoad;
export async function getPurchasingQz(){
 if(typeof window==='undefined')throw Error('QZ Tray hanya tersedia melalui browser desktop.');
 if(window.qz?.websocket?.connect)return window.qz;
 if(!scriptLoad){
  scriptLoad=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src=QZ_TRAY_SCRIPT;
   script.async=true;
   script.onload=()=>window.qz?.websocket?.connect?resolve(window.qz):reject(Error('Library QZ Tray tidak berhasil dimuat.'));
   script.onerror=()=>reject(Error('Library QZ Tray tidak dapat diunduh. Periksa koneksi internet dan pemblokiran CDN.'));
   document.head.appendChild(script);
  }).catch(error=>{scriptLoad=null;throw error});
 }
 return scriptLoad;
}
export async function connectPurchasingQz(){
 const qz=await getPurchasingQz();
 try{
  if(!qz.websocket.isActive())await qz.websocket.connect({retries:1,delay:1});
  const printers=await qz.printers.find();
  if(!Array.isArray(printers)||!printers.length)throw Error('QZ Tray terhubung, tetapi belum ada printer di macOS. Periksa Printers & Scanners.');
  return printers;
 }catch(error){
  throw Error('Tidak bisa memakai QZ Tray. Pastikan aplikasi QZ Tray terpasang dan sedang berjalan di Mac, lalu izinkan koneksi situs CAUSA. '+(error.message||''));
 }
}
function encodeBase64(bytes){
 let binary='';
 for(let start=0;start<bytes.length;start+=8192)binary+=String.fromCharCode(...bytes.subarray(start,start+8192));
 return btoa(binary);
}
export async function printPurchasingQz(printerName,orders,paperWidth=58){
 if(typeof printerName!=='string'||!printerName.trim())throw Error('Pilih printer thermal dari daftar QZ Tray.');
 const qz=await getPurchasingQz();
 if(!qz.websocket.isActive())throw Error('QZ Tray tidak terhubung. Klik Hubungkan QZ Tray lagi.');
 const bytes=buildPurchasingEscPos(orders,paperWidth);
 try{
  await qz.print(qz.configs.create(printerName,{
   forceRaw:true,
   jobName:'CAUSA CAFE - Purchasing'
  }),[{
   type:'raw',format:'command',flavor:'base64',data:encodeBase64(bytes)
  }]);
 }catch(error){
  throw Error('QZ Tray gagal mengirim struk ke printer. Pastikan printer mendukung ESC/POS dan raw printing di macOS. Periksa apakah printer mengeluarkan kertas sebelum mencoba ulang. '+(error.message||''));
 }
 return bytes.length;
}
