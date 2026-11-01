# CAUSA CAFE

Public website at https://causacaffe.com. React/Vite source is in source/. The root contains the production build deployed by GitHub Pages. Existing management application remains at /dashboard/.

To update: npm install --prefix source; npm run build --prefix source. Copy source/dist contents to the root and refresh each route index.html before committing. Supabase CMS at /admin/ requires an authorized admin account. Official menu/contact/location and admin provisioning remain pending. No service-role keys are used in frontend code.

## POS
Full operational app is deployed at /pos/. Source: pos-source/. Defaults to the cashier screen. Uses the same Supabase staff roles and database, with owner causacaffe@gmail.com activated separately. Run npm install, npm test and npm run build in pos-source, then copy dist to /pos before committing. Cash and QRIS confirmations are manual and require a signed-in active staff member.

Modal awal per menu disimpan pada tabel `product_costs` (khusus owner, RLS); bukan pada `products` yang dibaca kasir/QR publik. Form Manajemen Menu menampilkan modal per porsi dan estimasi laba kotor dasar = harga jual setelah diskon menu dikurangi modal. SQL pendukung: `pos-source/database/product_costs_upgrade.sql` (sudah diterapkan ke database Causa). HPP tambahan ukuran/topping dan overhead belum diperhitungkan.\n\n## Website admin
/dashboard/ and /admin/ serve the website CMS. Content (menu, gallery, journal, events), home/story imagery and copy, location/contact and SEO settings are persisted in causa_web_content / causa_web_settings. Access requires Supabase app_metadata.causa_web_role=admin; the CAUSA owner account has been granted this role. Sign out and in after role changes. POS remains at /pos/.
