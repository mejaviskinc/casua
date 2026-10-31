// Web Bluetooth can reach BLE/GATT printers only. Classic Bluetooth SPP is
// supported via the operating-system print dialog, not from a web page.
const BASE = '-0000-1000-8000-00805f9b34fb';
const uuid16 = hex => '0000' + hex + BASE;
const ISSC_SERVICE = '49535343-fe7d-4ae5-8fa9-9fafd205e455';
const ISSC_WRITE = '49535343-8841-43f4-a8d4-ecbe34729bb3';
const NORDIC_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NORDIC_WRITE = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

export const BLE_PRINT_PROFILES = [
 {service:uuid16('ff00'),writes:[uuid16('ff02'),uuid16('ff01')]},
 {service:uuid16('ffe0'),writes:[uuid16('ffe1')]},
 {service:uuid16('18f0'),writes:[uuid16('2af1')]},
 {service:ISSC_SERVICE,writes:[ISSC_WRITE]},
 {service:NORDIC_SERVICE,writes:[NORDIC_WRITE]},
 {service:uuid16('fd00'),writes:[uuid16('fd01')]}
];

const labels = {draft:'Draft',ordered:'Dipesan',received:'Diterima',cancelled:'Dibatalkan'};
const rupiah = n => 'Rp ' + new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Number(n)||0);
const poNumber = po => 'PC-' + String(po.number ?? 'DRAFT').padStart(4,'0');

export function bluetoothPrinterSupported(){
 return typeof navigator !== 'undefined' && typeof window !== 'undefined' &&
  window.isSecureContext && typeof navigator.bluetooth?.requestDevice === 'function';
}
function ascii(value){
 return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^\x20-\x7E]/g,'?');
}
function wrapText(text,width){
 const output=[];
 for(const raw of ascii(text).split(/\r?\n/)){
  if(!raw){output.push('');continue}
  let line='';
  for(const word of raw.trim().split(/\s+/)){
   if(word.length>width){
    if(line){output.push(line);line=''}
    for(let at=0;at<word.length;at+=width)output.push(word.slice(at,at+width));
    continue;
   }
   if(!line){line=word}
   else if(line.length+1+word.length<=width){line+=' '+word}
   else{output.push(line);line=word}
  }
  if(line)output.push(line);
 }
 return output;
}
function pairLine(left,right,width){
 const a=ascii(left),b=ascii(right);
 if(b.length>=width)return [...wrapText(a,width),...wrapText(b,width)];
 const size=width-b.length-1;
 const lines=wrapText(a,size);
 const end=lines.pop()||'';
 return [...lines,end.padEnd(width-b.length,' ')+b];
}
function dateStamp(value){
 const d=new Date(value||Date.now());
 return Number.isNaN(d.valueOf())?'—':d.toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'});
}
export function buildPurchasingEscPos(orders,paperWidth=80){
 const data=(Array.isArray(orders)?orders:[orders]).filter(Boolean);
 if(!data.length)throw Error('Belum ada pembelian untuk dicetak.');
 const width=Number(paperWidth)===58?32:48;
 const lines=[];
 for(const po of data){
  lines.push('CAUSA CAFE','DAFTAR PEMBELIAN BAHAN','-'.repeat(width));
  lines.push(...pairLine('No:',poNumber(po),width));
  lines.push(...pairLine('Tanggal:',dateStamp(po.created_at),width));
  lines.push('Status: '+(labels[po.status]||ascii(po.status)||'-'));
  lines.push(...wrapText('Supplier: '+ascii(po.supplier_name||'-'),width));
  if(po.expected_date)lines.push(...wrapText('Estimasi datang: '+ascii(po.expected_date),width));
  lines.push('-'.repeat(width));
  for(const item of po.items||[]){
   lines.push(...wrapText(item.name,width));
   lines.push(...pairLine(ascii(item.quantity)+' '+ascii(item.unit),rupiah(item.estimated_cost),width));
  }
  lines.push('-'.repeat(width));
  lines.push(...pairLine('TOTAL ESTIMASI',rupiah(po.total),width));
  if(po.note)lines.push('Catatan:',...wrapText(po.note,width));
  lines.push('-'.repeat(width));
  lines.push(...wrapText('Purchasing - bukan bukti pembayaran',width));
  lines.push('');
  lines.push('');
 }
 // ESC @ initialize; ESC a 1 center title; ESC a 0 left content.
 // All strings are ASCII so they are safe to send to most ESC/POS printers.
 const chunks=[0x1b,0x40];
 for(const line of lines){
  for(const char of line)chunks.push(char.charCodeAt(0)<=127?char.charCodeAt(0):63);
  chunks.push(0x0a);
 }
 return Uint8Array.from(chunks);
}
export async function connectPurchasingBluetooth(){
 if(!bluetoothPrinterSupported())throw Error('Browser ini tidak mendukung Bluetooth langsung. Gunakan Chrome/Edge pada perangkat yang kompatibel, atau Cetak via Sistem untuk printer Bluetooth Classic.');
 // The device chooser must be called from a direct user click.
 const device=await navigator.bluetooth.requestDevice({
  acceptAllDevices:true,optionalServices:BLE_PRINT_PROFILES.map(p=>p.service)
 });
 let server;
 try{
  if(!device.gatt)throw Error('Printer tidak menyediakan koneksi BLE/GATT.');
  server=await device.gatt.connect();
  for(const profile of BLE_PRINT_PROFILES){
   let service;
   try{service=await server.getPrimaryService(profile.service)}catch{continue}
   const preferred=[];
   try{preferred.push(...await service.getCharacteristics())}catch{continue}
   const characteristic=preferred.find(c=>profile.writes.includes(c.uuid.toLowerCase()) && (c.properties.writeWithoutResponse||c.properties.write));
   if(characteristic)return {device,characteristic,name:device.name||'Printer Bluetooth'};
  }
  throw Error('Printer ditemukan, tetapi layanan ESC/POS BLE tidak cocok. Bila printer memakai Bluetooth Classic, gunakan Cetak via Sistem. Untuk printer BLE lain, diperlukan UUID/protokol sesuai model.');
 }catch(error){
  if(server?.connected)server.disconnect();
  throw error;
 }
}
export async function printPurchasingBluetooth(connection,orders,paperWidth=80){
 const characteristic=connection?.characteristic;
 if(!connection?.device?.gatt?.connected||!characteristic)throw Error('Printer Bluetooth belum tersambung.');
 const payload=buildPurchasingEscPos(orders,paperWidth);
 const write=characteristic.properties.writeWithoutResponse && characteristic.writeValueWithoutResponse
  ? bytes=>characteristic.writeValueWithoutResponse(bytes)
  : characteristic.properties.write && characteristic.writeValueWithResponse
   ? bytes=>characteristic.writeValueWithResponse(bytes)
   : characteristic.writeValue
    ? bytes=>characteristic.writeValue(bytes)
    : null;
 if(!write)throw Error('Printer tidak menyediakan metode penulisan BLE.');
 // Default ATT MTU often 23 (20 usable bytes). Slow writes protect small printer buffers.
 const block=20;
 for(let offset=0;offset<payload.length;offset+=block){
  if(!connection.device.gatt.connected)throw Error('Koneksi Bluetooth terputus saat mencetak. Periksa hasil cetak sebelum mencoba lagi agar tidak dobel.');
  try{await write(payload.slice(offset,offset+block))}catch(error){
   throw Error('Gagal mengirim data Bluetooth. Periksa hasil struk sebelum mengulang: '+(error.message||'kesalahan printer'));
  }
  if(offset+block<payload.length)await new Promise(resolve=>setTimeout(resolve,35));
 }
 return payload.length;
}
