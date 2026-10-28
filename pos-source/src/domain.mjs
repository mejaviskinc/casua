export const money = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n)||0);
export const dayKey = d => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d));
export const todayKey = () => dayKey(new Date());
export const categories = ['Coffee','Non-Coffee','Coffee Beans','Food','Snack'];
export const stages = ['new','preparing','ready','completed'];
export const stageNames = {pending:'Menunggu konfirmasi',new:'Pesanan Baru',preparing:'Sedang Dibuat',ready:'Siap Diambil',completed:'Selesai',cancelled:'Dibatalkan'};
// Discounts apply to the base menu price only; size and topping extras remain at full price.
export function menuDiscount(product){
 const base=Math.max(0,Math.trunc(Number(product?.price)||0));
 const value=Math.max(0,Math.trunc(Number(product?.discount_value)||0));
 if(product?.discount_type==='percent')return Math.min(base,Math.round(base*Math.min(value,100)/100));
 if(product?.discount_type==='amount')return Math.min(base,value);
 return 0;
}
export function menuPrice(product){return Math.max(0,Math.trunc(Number(product?.price)||0))-menuDiscount(product);}
export function menuUnitPrice(product,size='',topping=''){return menuPrice(product)+Number(product.sizes?.find(s=>s.name===size)?.extra||0)+Number(product.toppings?.find(t=>t.name===topping)?.extra||0);}
export function menuDiscountLabel(product){return product?.discount_type==='percent'?('Diskon '+Number(product.discount_value||0)+'%'):'Diskon '+money(menuDiscount(product));}
export function totals(items,discount=0){const subtotal=items.reduce((s,i)=>s+(Number(i.unit_price)||0)*i.quantity,0); const cut=Math.min(subtotal,Math.max(0,Number(discount)||0));return {subtotal,discount:cut,total:subtotal-cut};}
export function operationalSummary(orders,expenses,date=todayKey()){const paid=orders.filter(o=>o.payment_status==='paid'&&o.status!=='cancelled'&&dayKey(o.paid_at||o.created_at)===date);const revenue=paid.reduce((s,o)=>s+Number(o.total),0);const spending=expenses.filter(e=>e.spent_on===date).reduce((s,e)=>s+Number(e.amount),0);return {paid,revenue,spending,profit:revenue-spending,transactions:paid.length,active:orders.filter(o=>!['cancelled','completed'].includes(o.status)).length};}
export function orderPayload(cart,extra,id){if(!cart.length)throw new Error('Pilih menu terlebih dahulu.');return {request_id:id,items:cart.map(i=>({product_id:i.product_id,quantity:i.quantity,size:i.size||'',topping:i.topping||''})),...extra};}

export function randomId(){if(crypto.randomUUID)return crypto.randomUUID();const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);}
