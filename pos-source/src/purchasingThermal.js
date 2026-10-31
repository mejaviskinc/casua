const statuses = {draft:'Draft',ordered:'Dipesan',received:'Diterima',cancelled:'Dibatalkan'};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money = value => 'Rp ' + new Intl.NumberFormat('id-ID', {maximumFractionDigits:0}).format(Number(value) || 0);
const dateTime = value => {
 const date = new Date(value || Date.now());
 return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString('id-ID', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'});
};
const purchaseNumber = po => 'PC-' + String(po.number ?? 'DRAFT').padStart(4, '0');

export function buildPurchasingThermalHTML(orders, paperWidth = 80) {
 const data = (Array.isArray(orders) ? orders : [orders]).filter(Boolean);
 if (!data.length) throw new Error('Belum ada daftar pembelian yang bisa dicetak.');
 const width = Number(paperWidth) === 58 ? 58 : 80;
 const receipts = data.map(po => {
  const items = Array.isArray(po.items) ? po.items : [];
  const rows = items.map(item => '<div class="item">' +
   '<div class="item-name">' + escapeHtml(item.name) + '</div>' +
   '<div class="item-detail"><span>' + escapeHtml(item.quantity) + ' ' + escapeHtml(item.unit) + '</span><strong>' + escapeHtml(money(item.estimated_cost)) + '</strong></div>' +
   '</div>').join('');
  return '<section class="receipt">' +
   '<div class="brand">CAUSA CAFE</div>' +
   '<div class="subtitle">DAFTAR PEMBELIAN BAHAN</div>' +
   '<div class="dash"></div>' +
   '<div class="meta"><span>No. Pembelian</span><strong>' + escapeHtml(purchaseNumber(po)) + '</strong></div>' +
   '<div class="meta"><span>Tanggal</span><span>' + escapeHtml(dateTime(po.created_at)) + '</span></div>' +
   '<div class="meta"><span>Status</span><strong>' + escapeHtml(statuses[po.status] || po.status || '—') + '</strong></div>' +
   '<div class="meta"><span>Supplier</span><strong>' + escapeHtml(po.supplier_name || '—') + '</strong></div>' +
   (po.expected_date ? '<div class="meta"><span>Estimasi datang</span><span>' + escapeHtml(po.expected_date) + '</span></div>' : '') +
   '<div class="dash"></div>' +
   '<div class="section-label">BAHAN / QTY / ESTIMASI</div>' +
   (items.length ? rows : '<div class="empty">Tidak ada rincian bahan</div>') +
   '<div class="dash"></div>' +
   '<div class="grand-total"><span>TOTAL ESTIMASI</span><strong>' + escapeHtml(money(po.total)) + '</strong></div>' +
   (po.note ? '<div class="note"><strong>Catatan:</strong> ' + escapeHtml(po.note) + '</div>' : '') +
   '<div class="dash"></div><div class="footer">Dicetak ' + escapeHtml(dateTime()) + '<div>Dokumen purchasing • bukan bukti pembayaran</div></div>' +
   '</section>';
 }).join('');
 const title = data.length === 1 ? purchaseNumber(data[0]) : 'Laporan Purchasing';
 return '<!doctype html><html lang="id"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>' + escapeHtml('CAUSA CAFE - ' + title) + '</title>' +
  '<style id="page-size">@page{margin:0}</style><style>' +
  '*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111;background:#eef1f5}' +
  '.actions{max-width:420px;margin:14px auto;text-align:center;font:14px Arial,sans-serif;color:#29384d}' +
  '.actions button{padding:10px 22px;border:0;border-radius:8px;background:#084da8;color:white;font-weight:700;cursor:pointer}' +
  '.actions p{font-size:12px;line-height:1.5;margin:8px 12px}' +
  '.paper{width:' + width + 'mm;padding:3mm 3mm 5mm;margin:auto;background:#fff;font-size:' + (width === 58 ? '10' : '11') + 'px;line-height:1.35;overflow-wrap:anywhere}' +
  '.receipt+.receipt{border-top:2px dashed #222;margin-top:5mm;padding-top:5mm}' +
  '.brand{font-size:' + (width === 58 ? '15' : '18') + 'px;font-weight:800;letter-spacing:.7px;text-align:center}' +
  '.subtitle{text-align:center;font-weight:700;font-size:10px;margin:3px 0 7px}' +
  '.dash{border-top:1px dashed #222;margin:7px 0}.meta{display:flex;justify-content:space-between;gap:8px;margin:3px 0}' +
  '.meta>span:first-child{flex:0 0 35%}.meta>:last-child{text-align:right;min-width:0}' +
  '.section-label{font-size:10px;text-align:center;font-weight:700;margin:8px 0}' +
  '.item{padding:5px 0;border-bottom:1px dotted #bbb;break-inside:avoid}' +
  '.item-name{font-weight:600}.item-detail{display:flex;justify-content:space-between;gap:6px;margin-top:2px}' +
  '.item-detail strong{white-space:nowrap}.grand-total{display:flex;align-items:center;justify-content:space-between;gap:5px;font-size:12px;font-weight:800}' +
  '.grand-total strong{text-align:right}.note{margin:10px 0;white-space:pre-wrap}.empty{text-align:center}' +
  '.footer{text-align:center;font-size:9px;margin-top:10px}.footer div{margin-top:4px}' +
  '@media screen{.paper{box-shadow:0 4px 20px #0002;margin-bottom:30px}}' +
  '@media print{html,body{background:#fff!important;width:' + width + 'mm!important;margin:0!important;padding:0!important}' +
  '.actions{display:none!important}.paper{width:' + width + 'mm!important;margin:0!important;padding:3mm 3mm 5mm!important;box-shadow:none!important}' +
  '.receipt{break-inside:avoid-page}}' +
  '</style></head><body><div class="actions"><button type="button" onclick="window.print()">Cetak nota thermal</button>' +
  '<p>Gunakan printer thermal ' + width + ' mm, skala 100%, margin tanpa tepi dan nonaktifkan header/footer pada dialog print.</p></div>' +
  '<main class="paper" id="paper">' + receipts + '</main>' +
  '<script>(function(){function prepare(){var el=document.getElementById("paper");' +
  'var height=Math.max(100,Math.ceil(el.getBoundingClientRect().height*25.4/96)+8);' +
  'document.getElementById("page-size").textContent="@page{size:' + width + 'mm "+height+"mm;margin:0}";' +
  'setTimeout(function(){window.focus();window.print()},200)}' +
  'if(document.readyState==="complete")prepare();else window.addEventListener("load",prepare,{once:true})})();</' + 'script>' +
  '</body></html>';
}

export function printPurchasingThermal(orders, paperWidth = 80) {
 const markup = buildPurchasingThermalHTML(orders, paperWidth);
 const win = window.open('', '_blank');
 if (!win) throw new Error('Browser memblokir jendela cetak. Izinkan pop-up untuk situs CAUSA CAFE lalu coba lagi.');
 win.document.open();
 win.document.write(markup);
 win.document.close();
 return true;
}
