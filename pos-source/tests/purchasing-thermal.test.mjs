import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPurchasingThermalHTML} from '../src/purchasingThermal.js';

const purchase = {
 number:17,created_at:'2026-10-31T06:00:00Z',status:'ordered',
 supplier_name:'Toko Kopi & Gula',expected_date:'2026-11-01',
 note:'Pastikan stok aman',total:50000,
 items:[{name:'Biji Arabika',quantity:2,unit:'kg',estimated_cost:50000}]
};

test('thermal 58 mm contains purchase details and the correct paper size',()=>{
 const html=buildPurchasingThermalHTML([purchase],58);
 assert.match(html,/PC-0017/);
 assert.match(html,/58mm/);
 assert.match(html,/Biji Arabika/);
 assert.match(html,/50\.000/);
 assert.match(html,/Dipesan/);
 assert.match(html,/Toko Kopi &amp; Gula/);
 assert.match(html,/bukan bukti pembayaran/);
});

test('thermal 80 mm supports more than one purchasing record',()=>{
 const html=buildPurchasingThermalHTML([purchase,{...purchase,number:18}],80);
 assert.match(html,/80mm/);
 assert.match(html,/PC-0017/);
 assert.match(html,/PC-0018/);
 assert.equal((html.match(/class="receipt"/g)||[]).length,2);
});

test('thermal receipt escapes supplier and item content to prevent script injection',()=>{
 const html=buildPurchasingThermalHTML({
  ...purchase,
  supplier_name:'<img src=x onerror=alert(1)>',
  note:'<script>alert(1)</script>',
  items:[{name:'<strong>Test</strong>',quantity:1,unit:'pcs',estimated_cost:1500}]
 },58);
 assert.ok(!html.includes('<img src=x'));
 assert.ok(!html.includes('<script>alert(1)</script>'));
 assert.ok(html.includes('&lt;img'));
 assert.ok(html.includes('&lt;strong&gt;Test'));
});

test('no purchase records cannot be printed',()=>{
 assert.throws(()=>buildPurchasingThermalHTML([]),/Belum ada daftar/);
});
