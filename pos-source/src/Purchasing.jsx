import React,{useState} from 'react';
import {Plus,Check,Trash2,Package,ShoppingCart,FileText,Download,Printer,Clock,CheckCircle2,Truck,X,AlertTriangle} from 'lucide-react';
import {rpc} from './api.js';
import {money} from './domain.mjs';
import {exportPurchasingPDF,exportPurchasingExcel} from './purchasingExports.js';

const statuses={draft:'Draft',ordered:'Dipesan',received:'Diterima',cancelled:'Dibatalkan'};
const statusTone={draft:'amber',ordered:'blue',received:'green',cancelled:'red'};
const number=po=>'PC-'+String(po.number).padStart(4,'0');
const when=at=>at?new Date(at).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Jakarta'}):'—';
const lowIngredients=ingredients=>ingredients.filter(i=>Number(i.stock)<=Number(i.minimum));
const targetAmount=i=>Math.max(.001,Math.round(Math.max(Number(i.minimum)-Number(i.stock),Number(i.minimum)||1)*1000)/1000);
const starterLine=i=>({ingredient_id:i.id,quantity:targetAmount(i),estimated_cost:0});
function PurchaseDialog({data,initial,close,run,load,busy}){
 const [supplier,setSupplier]=useState('');
 const [expected,setExpected]=useState('');
 const [note,setNote]=useState('');
 const [lines,setLines]=useState(()=>initial.map(starterLine));
 const ingredients=data.ingredients;
 const allowed=ingredients.filter(i=>!lines.some(l=>l.ingredient_id===i.id));
 const update=(n,key,value)=>setLines(rows=>rows.map((r,i)=>i===n?{...r,[key]:value}:r));
 const sum=lines.reduce((n,l)=>n+(Number(l.estimated_cost)||0),0);
 const save=e=>{
  e.preventDefault();
  run(async()=>{
   if(lines.length===0)throw Error('Tambahkan minimal satu bahan belanja.');
   if(lines.some(l=>!l.ingredient_id||!Number.isFinite(Number(l.quantity))||Number(l.quantity)<=0||Number(l.quantity)>10000000||Math.abs(Math.round(Number(l.quantity)*1000)-Number(l.quantity)*1000)>0.000001||!Number.isInteger(Number(l.estimated_cost))||Number(l.estimated_cost)<0))throw Error('Periksa jumlah bahan dan estimasi biaya.');
   await rpc('create_purchase',{payload:{supplier_name:supplier.trim(),note,expected_date:expected||null,items:lines.map(l=>({ingredient_id:l.ingredient_id,quantity:Number(l.quantity),estimated_cost:Number(l.estimated_cost)}))}});
   await load();
   close();
  },'Draft daftar belanja berhasil dibuat.');
 };
 return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}><section className="modal wide" role="dialog" aria-modal="true" aria-label="Buat purchasing" tabIndex={-1}>
 <header><h2>Buat daftar belanja bahan</h2><button className="icon-btn" type="button" aria-label="Tutup" onClick={close}><X size={19}/></button></header>
 <form onSubmit={save} className="purchase-form">
 <div className="two-col"><label className="field"><span>Nama supplier / toko *</span><input required minLength={2} maxLength={120} placeholder="Contoh: Toko Bahan Kopi" value={supplier} onChange={e=>setSupplier(e.target.value)}/></label>
 <label className="field"><span>Perkiraan barang datang</span><input type="date" value={expected} onChange={e=>setExpected(e.target.value)}/></label></div>
 <label className="field"><span>Catatan pembelian</span><textarea maxLength={500} rows={2} placeholder="Instruksi pembelian, lokasi toko, kontak supplier…" value={note} onChange={e=>setNote(e.target.value)}/></label>
 <div className="purchase-lines-header"><div><strong>Daftar bahan</strong><small>Jumlah menggunakan satuan stok yang tercatat. Estimasi biaya adalah total untuk masing-masing bahan.</small></div>
 <button type="button" className="secondary small" disabled={!allowed.length} onClick={()=>setLines(rows=>[...rows,{ingredient_id:allowed[0].id,quantity:targetAmount(allowed[0]),estimated_cost:0}])}><Plus size={14}/>Tambah bahan</button></div>
 {lines.length===0?<div className="purchase-empty">Belum ada bahan dipilih. Tekan Tambah bahan untuk memulai.</div>:<div className="purchase-line-list">{lines.map((line,index)=>{
 const ingredient=ingredients.find(i=>i.id===line.ingredient_id);
 return <div className="purchase-line" key={line.ingredient_id+'-'+index}>
 <label className="field"><span>Bahan</span><select value={line.ingredient_id} onChange={e=>{const ing=ingredients.find(i=>i.id===e.target.value);setLines(rows=>rows.map((l,n)=>n===index?{...l,ingredient_id:ing.id,quantity:targetAmount(ing)}:l))}}>{ingredients.filter(i=>i.id===line.ingredient_id||!lines.some(r=>r.ingredient_id===i.id)).map(i=><option value={i.id} key={i.id}>{i.name}</option>)}</select></label>
 <label className="field"><span>Jumlah ({ingredient?.unit||'unit'})</span><input type="number" min="0.001" max="10000000" step="0.001" required value={line.quantity} onChange={e=>update(index,'quantity',e.target.value)}/></label>
 <label className="field"><span>Estimasi biaya (Rp)</span><input type="number" min="0" max="1000000000" step="1" required value={line.estimated_cost} onChange={e=>update(index,'estimated_cost',e.target.value)}/></label>
 <button className="icon-btn purchase-remove" type="button" title="Hapus bahan" aria-label={'Hapus '+(ingredient?.name||'bahan')} onClick={()=>setLines(rows=>rows.filter((_,n)=>n!==index))}><Trash2 size={17}/></button>
 </div>})}</div>}
 <div className="purchase-total"><span>Total estimasi belanja</span><strong>{money(sum)}</strong></div>
 <p className="muted small-text">Daftar belanja hanya membuat draft. Stok belum berubah dan estimasi biaya belum dicatat sebagai pengeluaran kas.</p>
 <button type="submit" className="primary full" disabled={busy||!lines.length}><Check size={16}/>Simpan draft pembelian</button>
 </form></section></div>;
}
export default function Purchasing({data,requireAuth,run,busy,load,notify}){
 const [dialog,setDialog]=useState(false),[initial,setInitial]=useState([]),[selectedId,setSelectedId]=useState(null),[filter,setFilter]=useState('Semua');
 const low=lowIngredients(data.ingredients);
 const orders=[...(data.purchase_orders||[])].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
 const view=orders.filter(po=>filter==='Semua'||po.status===filter);
 const selected=orders.find(o=>o.id===selectedId);
 const open=(auto=false)=>{if(!requireAuth(true))return;setInitial(auto?low:[]);setDialog(true)};
 const progress=(po,operation)=>{
  if(!requireAuth(true))return;
  if(operation==='receive'&&!window.confirm('Konfirmasi semua bahan pada '+number(po)+' sudah diterima sesuai jumlah? Stok otomatis akan bertambah dan proses tidak bisa dibatalkan.'))return;
  if(operation==='cancel'&&!window.confirm('Batalkan '+number(po)+'? Stok tidak akan berubah.'))return;
  run(async()=>{await rpc('progress_purchase',{purchase_id:po.id,operation});await load()},operation==='order'?'Status pembelian menjadi Dipesan.':operation==='receive'?'Pembelian diterima. Stok bahan otomatis bertambah.':'Pembelian dibatalkan.');
 };
 const exportFile=(mode,records)=>run(async()=>{
  if(mode==='pdf')await exportPurchasingPDF(records);
  if(mode==='excel')await exportPurchasingExcel(records);
  if(mode==='print')await exportPurchasingPDF(records,true);
 },mode==='print'?'Dokumen disiapkan untuk dicetak.':'Dokumen berhasil disiapkan.');
 return <div className="purchasing-workspace">
 <div className="toolbar purchase-toolbar"><div><h2>Purchasing Bahan</h2><p className="muted">Rencanakan belanja dan terima bahan untuk mengisi stok gudang.</p></div><div className="toolbar-right">
 <button className="secondary" disabled={!orders.length||busy} onClick={()=>exportFile('pdf',view)}><FileText size={16}/>PDF</button>
 <button className="secondary" disabled={!orders.length||busy} onClick={()=>exportFile('excel',view)}><Download size={16}/>Excel</button>
 <button className="secondary" disabled={!orders.length||busy} onClick={()=>exportFile('print',view)}><Printer size={16}/>Print</button>
 <button className="primary" onClick={()=>open(false)}><Plus size={17}/>Buat pembelian</button></div></div>
 <div className="purchase-stats">
 <div className="purchase-stat"><span>Bahan perlu dibeli</span><strong>{low.length}</strong><small>Stok kosong / mencapai batas minimum</small></div>
 <div className="purchase-stat"><span>Menunggu barang</span><strong>{orders.filter(x=>x.status==='ordered').length}</strong><small>Purchase order belum diterima</small></div>
 <div className="purchase-stat"><span>Estimasi belanja aktif</span><strong>{money(orders.filter(x=>['draft','ordered'].includes(x.status)).reduce((s,x)=>s+Number(x.total),0))}</strong><small>Belum menjadi pengeluaran kas</small></div>
 </div>
 {low.length>0?<section className="panel purchase-alert"><div className="purchase-alert-head"><AlertTriangle size={19}/><strong>{low.length} bahan perlu perhatian</strong><button className="primary small" onClick={()=>open(true)}>Buat belanja otomatis</button></div><div className="purchase-low-grid">{low.map(i=><div key={i.id}><strong>{i.name}</strong><small>Tersedia {i.stock} {i.unit} · minimum {i.minimum} {i.unit}</small></div>)}</div></section>:<div className="alert"><CheckCircle2 size={17}/>Semua bahan berada di atas batas minimum yang ditentukan.</div>}
 <div className="toolbar purchase-filter"><div className="category-tabs">{[['Semua','Semua'],['draft','Draft'],['ordered','Dipesan'],['received','Diterima'],['cancelled','Dibatalkan']].map(([key,label])=><button key={key} className={filter===key?'active':''} onClick={()=>setFilter(key)}>{label}</button>)}</div></div>
 <section className="panel">
 {view.length?<div className="table-scroll"><table><thead><tr><th>Nomor / Tanggal</th><th>Supplier</th><th>Bahan</th><th>Total estimasi</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{view.map(po=><tr key={po.id}><td><strong>{number(po)}</strong><small>{when(po.created_at)}</small></td><td><strong>{po.supplier_name}</strong><small>{po.expected_date?'Estimasi datang '+po.expected_date:'Tidak ada estimasi tiba'}</small></td><td>{po.items.length} bahan</td><td><strong>{money(po.total)}</strong></td><td><span className={'purchase-status '+statusTone[po.status]}>{statuses[po.status]}</span></td><td><button className="secondary small" onClick={()=>setSelectedId(po.id)}>Detail</button></td></tr>)}</tbody></table></div>:
 <div className="purchase-empty"><Package size={26}/><strong>Belum ada pembelian pada filter ini</strong><p>Mulai dengan membuat daftar belanja atau pilih status lain.</p></div>}
 </section>
 <p className="footnote">Penerimaan bahan hanya dapat dilakukan sekali dan dicatat ke Riwayat Stok. Hak akses Purchasing hanya untuk Owner/Admin.</p>
 {dialog&&<PurchaseDialog data={data} initial={initial} close={()=>setDialog(false)} run={run} load={load} busy={busy}/>}
 {selected&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&setSelectedId(null)}><section className="modal wide" role="dialog" aria-modal="true" aria-label={'Detail '+number(selected)} tabIndex={-1}>
 <header><h2>Purchase Order {number(selected)}</h2><button type="button" className="icon-btn" aria-label="Tutup" onClick={()=>setSelectedId(null)}><X size={19}/></button></header>
 <div className="purchase-detail">
 <div className="purchase-detail-meta"><div><small>Supplier</small><strong>{selected.supplier_name}</strong></div><div><small>Dibuat</small><strong>{when(selected.created_at)}</strong></div><div><small>Status</small><span className={'purchase-status '+statusTone[selected.status]}>{statuses[selected.status]}</span></div><div><small>Perkiraan tiba</small><strong>{selected.expected_date||'—'}</strong></div></div>
 {selected.note&&<p className="muted">Catatan: {selected.note}</p>}
 <div className="table-scroll"><table><thead><tr><th>Bahan</th><th>Jumlah</th><th>Estimasi biaya</th></tr></thead><tbody>{selected.items.map((i,n)=><tr key={n}><td>{i.name}</td><td>{i.quantity} {i.unit}</td><td>{money(i.estimated_cost)}</td></tr>)}</tbody></table></div>
 <div className="purchase-total"><span>Total estimasi pembelian</span><strong>{money(selected.total)}</strong></div>
 <div className="purchase-detail-buttons">
 <button className="secondary" disabled={busy} onClick={()=>exportFile('pdf',[selected])}><FileText size={16}/>PDF</button>
 <button className="secondary" disabled={busy} onClick={()=>exportFile('excel',[selected])}><Download size={16}/>Excel</button>
 <button className="secondary" disabled={busy} onClick={()=>exportFile('print',[selected])}><Printer size={16}/>Print</button>
 </div>
 {selected.status==='draft'&&<div className="purchase-detail-buttons"><button className="primary" disabled={busy} onClick={()=>progress(selected,'order')}><Truck size={16}/>Tandai dipesan</button><button className="secondary" disabled={busy} onClick={()=>progress(selected,'cancel')}>Batalkan draft</button></div>}
 {selected.status==='ordered'&&<div className="purchase-detail-buttons"><button className="primary" disabled={busy} onClick={()=>progress(selected,'receive')}><Package size={16}/>Terima barang & tambah stok</button><button className="secondary" disabled={busy} onClick={()=>progress(selected,'cancel')}>Batalkan pesanan</button></div>}
 {selected.status==='received'&&<div className="alert"><CheckCircle2 size={17}/>Stok bahan sudah ditambahkan pada {when(selected.received_at)}.</div>}
 </div></section></div>}
 </div>;
}
