import React,{useState} from 'react';
import {Plus,Wallet,Download,FileText,Check,Trash2,Pencil,X,CalendarDays} from 'lucide-react';
import {db,rpc} from './api.js';
import {money,todayKey} from './domain.mjs';
import {exportPayrollExcel,exportPayslipPDF} from './payrollExports.js';
import './payroll.css';

const thisMonth=()=>todayKey().slice(0,7);
const positiveNumber=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0&&Number(value)<=1_000_000_000;
function Popup({title,close,children}){
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><section className="modal payroll-modal" role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button type="button" className="icon-btn" onClick={close} aria-label="Tutup"><X size={18}/></button></header>{children}</section></div>;
}
function NumberField({label,name,value=0}){
 return <label className="field"><span>{label}</span><input type="number" name={name} defaultValue={value} min="0" max="1000000000" step="1" required inputMode="numeric"/></label>;
}
function payrollTotal(p){return Number(p.base_salary||0)+Number(p.allowance||0)+Number(p.bonus||0)-Number(p.deduction||0)}
export default function Payroll({data,role,connected,user,run,load,requireAuth,busy}){
 const [period,setPeriod]=useState(thisMonth());
 const [setting,setSetting]=useState(null);
 const [editor,setEditor]=useState(null);
 const [paying,setPaying]=useState(null);
 const [removing,setRemoving]=useState(null);
 const staff=(data.staff||[]).filter(s=>s.role!=='owner'&&!s.deleted_at);
 const settings=new Map((data.payroll_settings||[]).map(r=>[r.staff_id,r]));
 const rows=(data.payrolls||[]).filter(p=>p.period.slice(0,7)===period).sort((a,b)=>a.staff_name.localeCompare(b.staff_name,'id'));
 const unrecorded=staff.filter(s=>s.active&&!rows.some(p=>p.staff_id===s.id));
 const paid=rows.filter(p=>p.status==='paid');
 const sumPaid=paid.reduce((sum,p)=>sum+Number(p.net_pay||0),0);
 const sumDraft=rows.filter(p=>p.status==='draft').reduce((sum,p)=>sum+Number(p.net_pay||0),0);
 const attendances=(data.attendance||[]).filter(a=>a.work_date?.startsWith(period));
 const attendanceCount=id=>new Set(attendances.filter(a=>a.staff_id===id).map(a=>a.work_date)).size;
 if(role!=='owner')return <section className="panel">Penggajian hanya dapat diakses oleh Owner.</section>;
 const openDraft=s=>setEditor({staff_id:s.id,staff_name:s.name,period:period+'-01',base_salary:Number(settings.get(s.id)?.base_salary||0),allowance:0,bonus:0,deduction:0,note:'',status:'draft'});
 const saveSetting=async e=>{
  e.preventDefault();if(!requireAuth(true))return;
  const f=new FormData(e.currentTarget),amount=Number(f.get('salary'));
  if(!positiveNumber(amount))return;
  const result=await run(async()=>{
   const {error}=await db.from('payroll_settings').upsert({staff_id:setting.id,base_salary:amount,updated_at:new Date().toISOString()},{onConflict:'staff_id'});
   if(error)throw error;await load();setSetting(null);
  },'Gaji pokok bulanan berhasil diperbarui.');
  return result;
 };
 const saveDraft=async e=>{
  e.preventDefault();if(!requireAuth(true))return;
  const f=new FormData(e.currentTarget);
  const amounts=Object.fromEntries(['base_salary','allowance','bonus','deduction'].map(k=>[k,Number(f.get(k))]));
  if(!Object.values(amounts).every(positiveNumber)||amounts.deduction>amounts.base_salary+amounts.allowance+amounts.bonus)return;
  const payload={...amounts,note:String(f.get('note')||'').trim().slice(0,500)};
  await run(async()=>{
   const result=editor.id
    ?await db.from('payrolls').update({...payload,updated_at:new Date().toISOString()}).eq('id',editor.id).eq('status','draft').select('id').single()
    :await db.from('payrolls').insert({...payload,staff_id:editor.staff_id,staff_name:editor.staff_name,period:editor.period,created_by:user.id}).select('id').single();
   if(result.error)throw result.error;await load();setEditor(null);
  },'Draft gaji berhasil disimpan.');
 };
 const markPaid=async e=>{
  e.preventDefault();if(!requireAuth(true))return;
  const f=new FormData(e.currentTarget);
  await run(async()=>{
   await rpc('mark_payroll_paid',{payroll_id:paying.id,method:String(f.get('method')),payment_date:String(f.get('date'))});
   await load();setPaying(null);
  },'Pembayaran gaji dikonfirmasi dan masuk laporan keuangan.');
 };
 return <div className="payroll-page">
  <div className="toolbar"><label className="payroll-period"><CalendarDays size={16}/><span>Periode gaji</span><input type="month" value={period} onChange={e=>setPeriod(e.target.value)} aria-label="Periode penggajian"/></label>
   <div className="toolbar-right"><button className="secondary" disabled={!connected||busy||!rows.length} onClick={()=>run(()=>exportPayrollExcel(rows,period),'Rekap penggajian diunduh.')}><Download size={16}/>Rekap Excel</button></div>
  </div>
  <div className="payroll-summary">
   <section className="stat-card"><span>Sudah dibayarkan</span><strong>{money(sumPaid)}</strong><small>{paid.length} karyawan · periode {period}</small></section>
   <section className="stat-card"><span>Menunggu pembayaran</span><strong>{money(sumDraft)}</strong><small>{rows.length-paid.length} draft gaji</small></section>
   <section className="stat-card"><span>Belum dibuat</span><strong>{unrecorded.length}</strong><small>Karyawan aktif tanpa slip periode ini</small></section>
  </div>
  <div className="payroll-explainer">Gaji dihitung per bulan dari gaji pokok + tunjangan + bonus − potongan. Absensi ditampilkan sebagai referensi, bukan potongan otomatis. Hanya gaji berstatus <strong>Dibayar</strong> yang masuk pengeluaran pada tanggal pembayaran. Pembayaran dicatat secara manual.</div>
  <section className="panel">
   <div className="panel-heading"><div><h2>Pengaturan gaji karyawan</h2><p>Atur gaji pokok masing-masing karyawan. Perubahan tidak mengubah slip yang sudah dibuat.</p></div><span className="badge neutral">{staff.length} karyawan</span></div>
   {staff.length?<div className="table-scroll"><table><thead><tr><th>Karyawan</th><th>Posisi</th><th>Gaji pokok/bulan</th><th>Hadir bulan ini</th><th>Tindakan</th></tr></thead><tbody>
    {staff.map(s=><tr key={s.id}><td><strong>{s.name}</strong><small>{s.active?'Aktif':'Nonaktif'}</small></td><td>{s.role==='cashier'?'Kasir':'Barista / Dapur'}</td><td><strong>{money(settings.get(s.id)?.base_salary||0)}</strong></td><td>{attendanceCount(s.id)} hari</td><td><button className="secondary small" onClick={()=>{if(requireAuth(true))setSetting(s)}}><Pencil size={14}/>Atur gaji</button></td></tr>)}
   </tbody></table></div>:<div className="payroll-empty">Belum ada karyawan. Tambahkan akun melalui menu Karyawan & Absensi terlebih dahulu.</div>}
  </section>
  <section className="panel">
   <div className="panel-heading"><div><h2>Daftar penggajian · {period}</h2><p>Siapkan draft, cek jumlah bersih, lalu konfirmasi saat benar-benar dibayar.</p></div></div>
   {unrecorded.length>0&&<div className="payroll-create-row"><span>Slip baru:</span>{unrecorded.map(s=><button key={s.id} className="secondary small" disabled={busy||!connected} onClick={()=>{if(requireAuth(true))openDraft(s)}}><Plus size={14}/>{s.name}</button>)}</div>}
   {rows.length?<div className="table-scroll"><table><thead><tr><th>Karyawan / periode</th><th>Gaji pokok</th><th>Tunjangan + bonus</th><th>Potongan</th><th>Gaji bersih</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
    {rows.map(p=><tr key={p.id}><td><strong>{p.staff_name}</strong><small>{p.period.slice(0,7)}{p.status==='paid'?' · '+p.paid_on:''}</small></td><td>{money(p.base_salary)}</td><td>{money(Number(p.allowance)+Number(p.bonus))}</td><td>{money(p.deduction)}</td><td><strong>{money(p.net_pay)}</strong></td><td><span className={'badge '+(p.status==='paid'?'green':'amber')}>{p.status==='paid'?'Dibayar':'Draft'}</span></td><td><div className="row-actions payroll-actions">
     {p.status==='draft'?<><button className="secondary small" disabled={busy} onClick={()=>setEditor(p)}><Pencil size={14}/>Edit</button><button className="primary small" disabled={busy} onClick={()=>setPaying(p)}><Check size={14}/>Bayar</button><button className="danger small" disabled={busy} aria-label={'Hapus draft '+p.staff_name} onClick={()=>setRemoving(p)}><Trash2 size={14}/></button></>
       :<button className="secondary small" disabled={busy} onClick={()=>run(()=>exportPayslipPDF(p),'Slip gaji diunduh.')}><FileText size={14}/>Slip PDF</button>}
    </div></td></tr>)}
   </tbody></table></div>:<div className="payroll-empty">Belum ada penggajian untuk {period}. Buat draft melalui tombol nama karyawan di atas.</div>}
  </section>
  {setting&&<Popup title={'Atur gaji pokok · '+setting.name} close={()=>setSetting(null)}><form onSubmit={saveSetting}><NumberField label="Gaji pokok bulanan (Rp)" name="salary" value={settings.get(setting.id)?.base_salary||0}/><p className="muted small-text">Nominal ini digunakan sebagai angka awal saat membuat draft penggajian baru.</p><button className="primary full" disabled={busy}>Simpan gaji pokok</button></form></Popup>}
  {editor&&<Popup title={(editor.id?'Edit':'Buat')+' draft gaji · '+editor.staff_name} close={()=>setEditor(null)}><form onSubmit={saveDraft} key={editor.id||editor.staff_id}><p className="muted small-text">Periode {editor.period.slice(0,7)}. Pembayaran belum dicatat sampai Anda menekan tombol Bayar.</p>
   <div className="two-col"><NumberField label="Gaji pokok (Rp)" name="base_salary" value={editor.base_salary}/><NumberField label="Tunjangan (Rp)" name="allowance" value={editor.allowance}/><NumberField label="Bonus (Rp)" name="bonus" value={editor.bonus}/><NumberField label="Potongan (Rp)" name="deduction" value={editor.deduction}/></div>
   <label className="field"><span>Catatan (opsional)</span><textarea name="note" defaultValue={editor.note} maxLength={500} rows={3} placeholder="Catatan periode gaji"/></label>
   <button className="primary full" disabled={busy}><Check size={16}/>Simpan draft</button>
  </form></Popup>}
  {paying&&<Popup title={'Konfirmasi pembayaran · '+paying.staff_name} close={()=>setPaying(null)}><form onSubmit={markPaid}>
   <p className="payroll-confirm-total">Gaji bersih <strong>{money(paying.net_pay)}</strong></p><p className="muted small-text">Konfirmasi hanya setelah uang dibayar. Slip yang sudah dibayarkan dikunci agar riwayat tetap konsisten.</p>
   <label className="field"><span>Metode pembayaran</span><select name="method" required defaultValue="transfer"><option value="transfer">Transfer bank</option><option value="cash">Tunai</option></select></label>
   <label className="field"><span>Tanggal pembayaran</span><input type="date" name="date" defaultValue={todayKey()} required/></label>
   <button className="primary full" disabled={busy}><Wallet size={16}/>Konfirmasi sudah dibayar</button>
  </form></Popup>}
  {removing&&<Popup title="Hapus draft gaji" close={()=>setRemoving(null)}><p>Hapus draft milik <strong>{removing.staff_name}</strong> untuk periode {removing.period.slice(0,7)}? Slip yang sudah dibayar tidak dapat dihapus.</p><div className="row-actions"><button className="secondary" onClick={()=>setRemoving(null)}>Batal</button><button className="danger" disabled={busy} onClick={()=>run(async()=>{if(!requireAuth(true))throw Error('Akses Owner diperlukan');const {data:removed,error}=await db.from('payrolls').delete().eq('id',removing.id).eq('status','draft').select('id').single();if(error)throw error;if(!removed)throw Error('Draft tidak ditemukan');await load();setRemoving(null)},'Draft berhasil dihapus.')}>Hapus draft</button></div></Popup>}
 </div>;
}
