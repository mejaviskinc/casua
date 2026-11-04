export function payrollNet({base_salary=0,allowance=0,bonus=0,deduction=0}={}){
 return Number(base_salary)+Number(allowance)+Number(bonus)-Number(deduction);
}
export function validPayrollAmounts(values){
 return ['base_salary','allowance','bonus','deduction'].every(k=>{
  const n=Number(values[k]);return Number.isSafeInteger(n)&&n>=0&&n<=1_000_000_000;
 })&&payrollNet(values)>=0;
}
export function paidPayrollsForMonth(payrolls,month,resetAt=null){
 return (payrolls||[]).filter(p=>p.status==='paid'&&typeof p.paid_on==='string'&&p.paid_on.startsWith(month)&&(!resetAt||new Date(p.updated_at)>=new Date(resetAt)));
}
