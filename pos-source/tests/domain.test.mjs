import {test} from 'node:test';import assert from 'node:assert/strict';
import {totals,operationalSummary,dayKey,orderPayload,menuDiscount,menuPrice,menuUnitPrice} from '../src/domain.mjs';
test('Jakarta date boundary uses paid date',()=>{assert.equal(dayKey('2026-10-27T18:10:00Z'),'2026-10-28')});
test('cancelled and unpaid orders never become revenue',()=>{const base={total:50000,created_at:'2026-10-27T16:00:00Z',paid_at:'2026-10-27T18:10:00Z'};const orders=[{...base,payment_status:'paid',status:'completed'},{...base,payment_status:'refunded',status:'cancelled'},{...base,payment_status:'paid',status:'cancelled'},{...base,payment_status:'unpaid',status:'pending'}];const s=operationalSummary(orders,[{spent_on:'2026-10-28',amount:10000},{spent_on:'2026-10-27',amount:5000}],'2026-10-28');assert.equal(s.revenue,50000);assert.equal(s.profit,40000);assert.equal(s.transactions,1)});
test('discount bounded to subtotal and quantities included',()=>{assert.deepEqual(totals([{unit_price:20000,quantity:3}],5000),{subtotal:60000,discount:5000,total:55000});assert.equal(totals([{unit_price:100,quantity:1}],1000).total,0)});
test('client cannot submit a price or report total',()=>{const p=orderPayload([{product_id:'abc',quantity:2,unit_price:1,name:'fake'}],{source:'pos'},'fixed');assert.equal(p.request_id,'fixed');assert.equal('unit_price' in p.items[0],false);assert.equal('total' in p,false);assert.throws(()=>orderPayload([],{},'id'))});

test('menu discount can be percentage, fixed rupiah and disabled, with modifiers not discounted',()=>{
 const p={price:25000,discount_type:'percent',discount_value:10,sizes:[{name:'Large',extra:5000}],toppings:[{name:'Syrup',extra:2000}]};
 assert.equal(menuDiscount(p),2500);
 assert.equal(menuPrice(p),22500);
 assert.equal(menuUnitPrice(p,'Large','Syrup'),29500);
 assert.equal(menuDiscount({...p,discount_type:'amount',discount_value:4000}),4000);
 assert.equal(menuUnitPrice({...p,discount_type:'none',discount_value:0},'Large','Syrup'),32000);
 assert.equal(menuDiscount({price:100,discount_type:'percent',discount_value:150}),100);
 assert.equal(menuDiscount({price:100,discount_type:'amount',discount_value:10000}),100);
});
