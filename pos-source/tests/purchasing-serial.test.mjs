import test from 'node:test';
import assert from 'node:assert/strict';
import {classicBluetoothSupported,connectPurchasingSerial,disconnectPurchasingSerial,printPurchasingSerial} from '../src/purchasingSerial.js';
import {buildPurchasingEscPos} from '../src/purchasingBluetooth.js';

const purchase={number:'TEST',status:'draft',supplier_name:'MP-5810',total:1000,
 items:[{name:'Tes printer',quantity:1,unit:'pcs',estimated_cost:1000}]};

test('Web Serial connection requires a compatible browser',()=>{
 assert.equal(classicBluetoothSupported(),false);
});

test('Web Serial sends ESC/POS bytes for MP-5810 in 58mm chunks and releases writer lock',async()=>{
 const actual=[];
 let locks=0;
 const fakePort={
  writable:{
   getWriter(){
    locks++;
    return {
     async write(bytes){assert.ok(bytes.length<=128);actual.push(...bytes)},
     releaseLock(){locks--}
    };
   }
  }
 };
 const expected=buildPurchasingEscPos([purchase],58);
 const printed=await printPurchasingSerial({port:fakePort},[purchase],58);
 assert.equal(printed,expected.length);
 assert.equal(locks,0);
 assert.deepEqual(actual,Array.from(expected));
});

test('Web Serial warns about uncertain partial printing when a write fails',async()=>{
 let released=false;
 const fakePort={writable:{getWriter(){return{
  async write(){throw Error('Koneksi terputus')},
  releaseLock(){released=true}
 }}}};
 await assert.rejects(()=>printPurchasingSerial({port:fakePort},[purchase]),/Periksa hasil printer sebelum mengulang/);
 assert.equal(released,true);
});

test('Web Serial rejects printing when no port has been opened',async()=>{
 await assert.rejects(()=>printPurchasingSerial(null,[purchase]),/belum terhubung/);
});

test('Disconnect closes an open serial port',async()=>{
 let closed=false;
 await disconnectPurchasingSerial({port:{close:async()=>{closed=true}}});
 assert.equal(closed,true);
});
