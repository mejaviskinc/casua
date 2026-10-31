import test from 'node:test';
import assert from 'node:assert/strict';
import {connectPurchasingQz,printPurchasingQz} from '../src/purchasingQz.js';

const example={number:12,status:'draft',supplier_name:'Toko Kopi',total:22000,items:[{name:'Gula',quantity:2,unit:'kg',estimated_cost:22000}]};
test('QZ printer discovery lists macOS-installed printers',async()=>{
 const old=globalThis.window;
 globalThis.window={qz:{
  websocket:{isActive:()=>false,connect:async()=>{}},
  printers:{find:async()=>['YICHiP3121 USB Portable Printer','Other Printer']}
 }};
 try{assert.deepEqual(await connectPurchasingQz(),['YICHiP3121 USB Portable Printer','Other Printer'])}finally{globalThis.window=old}
});

test('QZ prints raw ESC/POS base64 with forceRaw enabled on macOS',async()=>{
 const old=globalThis.window;
 let configCaptured,payloadCaptured;
 globalThis.window={qz:{
  websocket:{isActive:()=>true,connect:async()=>{}},
  configs:{create:(printer,options)=>{configCaptured={printer,options};return configCaptured}},
  print:async(config,payload)=>{payloadCaptured=payload}
 }};
 try{
  const count=await printPurchasingQz('YICHiP3121 USB Portable Printer',[example],58);
  assert.equal(configCaptured.printer,'YICHiP3121 USB Portable Printer');
  assert.equal(configCaptured.options.forceRaw,true);
  assert.equal(payloadCaptured[0].type,'raw');
  assert.equal(payloadCaptured[0].flavor,'base64');
  const decoded=Buffer.from(payloadCaptured[0].data,'base64');
  assert.equal(decoded.length,count);
  assert.match(decoded.toString('latin1'),/CAUSA CAFE/);
  assert.match(decoded.toString('latin1'),/PC-0012/);
 }finally{globalThis.window=old}
});

test('QZ refuses print without a selected destination',async()=>{
 await assert.rejects(()=>printPurchasingQz('',[example]),/Pilih printer/);
});
