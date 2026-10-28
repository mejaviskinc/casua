# CAUSA CAFE — Aktivasi operasional

Status rilis awal: antarmuka dan integrasi sudah disiapkan. Proyek Supabase baru belum dibuat karena organisasi yang dipilih belum terhubung. Jangan gunakan untuk transaksi produksi sebelum langkah aktivasi dan uji selesai.

## 1. Proyek terpisah

Buat proyek Supabase khusus CAUSA CAFE di organisasi pilihan Anda (disarankan region Singapore). Periksa biaya paket sebelum membuat. Hubungkan organisasi itu ke konektor Supabase jika ingin aktivasi dibantu dari percakapan.

Jalankan `schema.sql` pada SQL Editor proyek BARU. SQL membuat tabel, fungsi transaksi, RLS, bucket menu-images, dan publikasi Realtime. SQL ini bukan migrasi idempoten untuk proyek lama. Jangan jalankan di proyek aplikasi lain.

## 2. Owner pertama

Supabase Dashboard → Authentication → Users → Add user. Buat email owner yang Anda kendalikan, kata sandi kuat minimal 12 karakter, dan konfirmasi email. Pada SQL Editor jalankan, setelah mengganti email dan nama:

```sql
insert into public.staff(id,name,email,role,active)
select id, 'Nama Owner', email, 'owner', true
from auth.users where lower(email)=lower('EMAIL_OWNER_ANDA');
```

Periksa hasil: `select name,email,role from public.staff;`. Hanya owner terdaftar dapat mengelola karyawan. Signup publik tidak memberikan hak operasional. Nonaktifkan signup publik di Authentication settings karena aplikasi memakai undangan owner.

## 3. Konfigurasi aplikasi

Di Pengaturan → Atur koneksi, masukkan Project URL dan publishable key. Aplikasi menguji akses tabel sebelum menyimpan. Konfigurasi melalui UI berlaku pada perangkat itu saja.

Untuk rilis semua perangkat, tetapkan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY` sebelum build Vite, lalu publish ulang. Publishable key boleh berada pada browser karena data dijaga RLS. Jangan gunakan service-role, sb_secret, database password, atau personal access token pada frontend.

Atur Authentication → URL configuration: Site URL = origin aplikasi dan redirect allowlist termasuk origin `/?activate=1` dan origin `/`. Gunakan SMTP produksi agar email undangan dan pemulihan dapat diandalkan. Jika perlu sesuaikan template email undangan agar menggunakan tautan konfirmasi bawaan Supabase.

## 4. Undangan karyawan

Source Edge Function berada di `supabase/functions/invite-staff/index.ts`. Deploy dengan Supabase CLI yang sudah terautentikasi ke proyek tujuan. Baca `supabase functions --help` untuk versi yang terpasang. Atur secret `APP_ORIGIN` ke origin aplikasi yang persis (tanpa trailing slash). Secret standar Supabase tersedia di lingkungan Edge Function. Tidak ada service-role pada frontend.

Owner mengundang karyawan dari menu Karyawan & Absensi. Peran diverifikasi dari tabel staff pada setiap panggilan. Tautan undangan membuka layar pembuatan kata sandi. Owner dapat mengubah peran dan menonaktifkan akses karyawan; peran diperiksa database pada setiap aksi sehingga tidak menunggu refresh JWT. Barista hanya mengubah status pesanan; kasir hanya mencatat pesanan dan pembayaran. Pembatalan hanya owner.

## 5. Data kedai

Tambahkan menu asli: nama, kategori, harga, deskripsi, foto, ukuran dan topping. Tidak ada produk, transaksi, stok, atau laporan contoh. Foto maksimal 5 MB (JPG/PNG/WebP).

Tambahkan bahan baku, satuan, minimum. Catat stok awal melalui tombol Masuk/keluar agar ada riwayat. Hubungkan produk dengan resep; pemakaian bahan dikurangi saat pembayaran. Produk tanpa resep tidak mengurangi stok. Ukuran memiliki stock_multiplier, berlaku pada bahan resep yang cocok. Baris resep ukuran kosong = berlaku semua ukuran; topping kosong = bahan dasar. Hindari menduplikasi resep dasar dan resep ukuran jika tidak ingin pemakaian dijumlahkan. Perubahan stok harus masuk satuan bahan yang sama.

Tambahkan alamat struk dan unggah gambar QRIS resmi kedai. Pembayaran QRIS adalah pencatatan manual setelah kasir memeriksa dana masuk, bukan payment gateway atau webhook otomatis.

## 6. QR pelanggan dan penggunaan tim

Tambahkan meja, cetak QR. Saat situs masih privat, hanya pemilik yang dapat membuka; akses situs harus diubah ke publik sebelum QR dibagikan atau perangkat karyawan digunakan. Halaman pegawai tetap dijaga Supabase Auth dan RLS. Jangan menyebarkan QR sampai database diaktifkan.

Pelanggan memesan dari `/?menu=1&table=TOKEN_MEJA`. QR memiliki token acak. Pesanan hanya berstatus pending sampai kasir memeriksa dan mengonfirmasi pembayaran. Hanya status pesanan dengan pasangan ID+token dapat dilihat pelanggan. Database membatasi pending baru per meja (10 dalam 15 menit). Untuk kedai ramai atau penyalahgunaan, tambahkan proteksi di edge/rate limit dan rotasi token meja.

Antrean barista menggunakan Supabase Realtime, ditambah pemulihan saat kembali ke tab dan penyegaran cadangan 60 detik. Status pelanggan diperiksa setiap 5 detik. Instal PWA dari browser; pencatatan memerlukan internet. Tidak ada antrean transaksi offline.

## 7. Uji sebelum buka

1. Login owner, kasir, barista pada perangkat terpisah. Pastikan masing-masing hanya memiliki haknya.
2. Tambahkan satu menu uji dan resep dengan stok yang diketahui, catat stok masuk.
3. Buat pesanan tunai, cek kembalian, struk, dan barista menerima pesanan.
4. Kirim ulang payment RPC yang sama: pendapatan dan stok tidak boleh berubah dua kali.
5. Stok kurang harus menggagalkan pembayaran tanpa transaksi separuh tersimpan.
6. Pindahkan new → preparing → ready → completed, periksa status di pelanggan.
7. Owner membatalkan, lakukan refund pelanggan, cek stok kembali dan pendapatan hilang.
8. Kirim QR pelanggan, pastikan tidak masuk barista sebelum dibayar.
9. Uji penolakan akses menggunakan sesi tanpa peran. Jalankan Supabase Security Advisors dan periksa RLS, grant, dan Realtime. Perbaiki temuan sebelum produksi.
10. Arsipkan/hapus data uji melalui prosedur administrasi yang disetujui sebelum operasional. Jangan mencampur data uji dengan penjualan asli.

## 8. Laporan dan backup

Waktu laporan menggunakan Asia/Jakarta. Pendapatan berdasarkan paid_at, status paid, tanpa cancelled. Estimasi surplus kas = penjualan dikurangi pengeluaran; bukan laba akuntansi setelah HPP, penyusutan, dan pajak. Export bulanan Excel/PDF tersedia untuk owner.

Aktifkan backup otomatis Supabase atau PITR sesuai paket dan retensi yang dipilih. Ini belum diaktifkan dari aplikasi. Simpan backup database terenkripsi di lokasi terpisah, uji pemulihan secara berkala, dan buat cadangan file Storage secara terpisah. Backup database tidak menggantikan backup objek Storage. Owner dapat mengunduh arsip JSON data operasional, tetapi arsip itu bukan backup Auth/Storage dan bukan snapshot atomik lintas tabel. Tidak ada restore otomatis satu klik pada rilis ini.

## Source dan pengecekan

React + Vite + Tailwind CSS; Supabase JS (Auth/Database/Realtime/Storage); ExcelJS, jsPDF, dan QRCode. `npm install`, `npm run test`, `npm run build`. Pin dependency dan commit lockfile. Database baru harus diuji langsung setelah tersedia; pengujian lokal tidak membuktikan konfigurasi Supabase produksi sudah benar.
