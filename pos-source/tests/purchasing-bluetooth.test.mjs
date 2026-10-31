import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPurchasingEscPos,printPurchasingBluetooth,BLE_PRINT_PROFILES,bluetoothPrinterSupported} from '../src/purchasingBluetooth.js';

const purchase={
 number:23,status:'draft',created_at:'2026-10-31T05:00:00Z',
 supplier_name:'Kopi & Susu',total:125000,expected_date:'2026-11-01',
 note:'Beli di toko utama',
 items:[{name:'Biji Arabika',quantity:2,unit:'kg',estimated_cost:125000}]
};

test('Bluetooth printing offers recognized ESC/POS BLE services',()=>{
 assert.ok(BLE_PRINT_PROFILES.some(profile=>profile.service.startsWith('0000ffe0')));
 assert.ok(BLE_PRINT_PROFILES.some(profile=>profile.service.startsWith('49535343-')));
 assert.ok(BLE_PRINT_PROFILES.every(profile=>profile.writes.length));
 assert.equal(bluetoothPrinterSupported(),false);
});

test('ESC/POS thermal data is initialized and includes purchasing details',()=>{
 const bytes=buildPurchasingEscPos(purchase,58);
 assert.deepEqual(Array.from(bytes.slice(0,2)),[0x1b,0x40]);
 const content=Buffer.from(bytes).toString('ascii');
 assert.match(content,/CAUSA CAFE/);
 assert.match(content,/PC-0023/);
 assert.match(content,/Kopi & Susu/);
 assert.match(content,/Biji Arabika/);
 assert.match(content,/TOTAL ESTIMASI/);
 assert.match(content,/Rp 125.000/);
 assert.match(content,/bukan bukti\s+pembayaran/);
});

test('80 mm receipts have longer lines than 58 mm',()=>{
 const a=Buffer.from(buildPurchasingEscPos(purchase,58)).toString('ascii');
 const b=Buffer.from(buildPurchasingEscPos(purchase,80)).toString('ascii');
 assert.ok(a.includes('-'.repeat(32)));
 assert.ok(b.includes('-'.repeat(48)));
 assert.ok(!a.includes('-'.repeat(48)));
});

test('ble print splits writes into bounded chunks and preserves data',async()=>{
 const received=[];
 const connection={
  device:{gatt:{connected:true}},
  characteristic:{
   properties:{writeWithoutResponse:true},
   writeValueWithoutResponse:async bytes=>{assert.ok(bytes.length<=20);received.push(...bytes)}
  }
 };
 const expected=buildPurchasingEscPos(purchase,80);
 const size=await printPurchasingBluetooth(connection,purchase,80);
 assert.equal(size,expected.length);
 assert.deepEqual(received,Array.from(expected));
});
test('ble printing requires a connected device',async()=>{
 await assert.rejects(()=>printPurchasingBluetooth(null,[purchase]),/belum tersambung/);
});
test('ble refuses empty purchasing records',()=>{
 assert.throws(()=>buildPurchasingEscPos([]),/Belum ada pembelian/);
});
