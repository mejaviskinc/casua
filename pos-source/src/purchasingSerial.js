import {buildPurchasingEscPos} from './purchasingBluetooth.js';

// Chrome 117+ desktop and supported Chromium Android versions can expose
// paired Bluetooth Classic Serial Port Profile (RFCOMM) devices via Web Serial.
// Web Bluetooth GATT alone cannot reach classic-only receipt printers.
export function classicBluetoothSupported(){
 return typeof navigator!=='undefined' && typeof window!=='undefined' &&
   window.isSecureContext && typeof navigator.serial?.requestPort==='function';
}

export async function connectPurchasingSerial(){
 if(!classicBluetoothSupported())throw Error('Browser ini tidak menyediakan Web Serial untuk Bluetooth Classic. Gunakan Chrome versi terbaru atau Cetak via Sistem melalui layanan printer Android.');
 // Must run directly after a user click (requires transient activation).
 const port=await navigator.serial.requestPort();
 try{
  await port.open({baudRate:9600});
 }catch(error){
  throw Error('Port printer gagal dibuka. Pastikan MP-5810/RPP02N sudah dipasangkan lewat Bluetooth perangkat dan belum dipakai aplikasi lain. '+(error.message||''));
 }
 return {kind:'serial',port,name:'Port serial Bluetooth terpilih'};
}

export async function disconnectPurchasingSerial(connection){
 if(!connection?.port)return;
 try{await connection.port.close()}catch(error){
  if(error.name!=='InvalidStateError')throw error;
 }
}

export async function printPurchasingSerial(connection,orders,paperWidth=58){
 const port=connection?.port;
 if(!port?.writable)throw Error('Printer Bluetooth Classic belum terhubung. Pilih Hubungkan MP-5810 terlebih dahulu.');
 const bytes=buildPurchasingEscPos(orders,paperWidth);
 const writer=port.writable.getWriter();
 try{
  // Modest chunks avoid overrunning common low-cost Bluetooth printer buffers.
  for(let i=0;i<bytes.length;i+=128){
   await writer.write(bytes.slice(i,i+128));
   if(i+128<bytes.length)await new Promise(resolve=>setTimeout(resolve,20));
  }
 }catch(error){
  throw Error('Pengiriman cetak MP-5810 gagal. Periksa hasil printer sebelum mengulang agar tidak mencetak ganda. '+(error.message||''));
 }finally{writer.releaseLock()}
 return bytes.length;
}
