import test from 'node:test';
import assert from 'node:assert/strict';
import {payrollNet,validPayrollAmounts,paidPayrollsForMonth} from '../src/payrollMath.mjs';

test('gaji bersih menghitung pokok, tunjangan, bonus, dan potongan',()=>{
 assert.equal(payrollNet({base_salary:2500000,allowance:300000,bonus:125000,deduction:25000}),2900000);
});
test('menolak potongan melebihi pendapatan dan nominal negatif/pecahan',()=>{
 assert.equal(validPayrollAmounts({base_salary:500000,allowance:0,bonus:0,deduction:500001}),false);
 assert.equal(validPayrollAmounts({base_salary:-1,allowance:0,bonus:0,deduction:0}),false);
 assert.equal(validPayrollAmounts({base_salary:100.4,allowance:0,bonus:0,deduction:0}),false);
 assert.equal(validPayrollAmounts({base_salary:500000,allowance:0,bonus:0,deduction:25000}),true);
});
test('laporan hanya menghitung gaji dibayar pada bulan dan periode reset yang benar',()=>{
 const p=[
  {id:1,status:'draft',paid_on:null,net_pay:1000000},
  {id:2,status:'paid',paid_on:'2026-11-01',updated_at:'2026-11-01T12:00:00Z',net_pay:2000000},
  {id:3,status:'paid',paid_on:'2026-11-04',updated_at:'2026-11-04T12:00:00Z',net_pay:3000000},
  {id:4,status:'paid',paid_on:'2026-10-30',updated_at:'2026-10-30T12:00:00Z',net_pay:4000000},
 ];
 assert.deepEqual(paidPayrollsForMonth(p,'2026-11').map(x=>x.id),[2,3]);
 assert.deepEqual(paidPayrollsForMonth(p,'2026-11','2026-11-02T00:00:00Z').map(x=>x.id),[3]);
});
