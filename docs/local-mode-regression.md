# Local Mode Regression Matrix

Dokumen ini mendefinisikan regression test khusus **mode lokal murni** untuk memastikan ApotekKilat tetap benar ketika `isSupabaseConfigured()` bernilai `false`.

## Tujuan

Mode lokal/free tier harus tetap produktif tanpa Supabase, tanpa login, tanpa RPC, dan tanpa data cloud. Semua data tersimpan di browser melalui `localStorage`.

## Cara menjalankan

1. Checkout branch yang ingin dites.
2. Buka `local-mode-regression.html` di browser.
3. Klik **Jalankan Test**.
4. Expected result: `PASS — semua regression local mode lolos.`

> Catatan: test ini sengaja tidak memakai npm/playwright agar bisa dijalankan langsung dari file HTML di repo.

## Kondisi wajib sebelum test

- `window.APOTEKKILAT_SUPABASE_CONFIG.url` kosong.
- `window.APOTEKKILAT_SUPABASE_CONFIG.publishableKey` kosong.
- `isSupabaseConfigured()` harus `false`.
- `ApotekKilatSupabaseData.getMode()` tidak boleh bernilai `cloud`.
- Aplikasi harus masuk free/local mode tanpa login.

## Regression coverage

| Area | Ekspektasi lokal | Alasan |
|---|---|---|
| Auth / startup | App terbuka tanpa Supabase login | Free tier tidak boleh hard-block user lokal |
| Seed profile | 1 apotek, 1 cabang, 1 Owner | Mencegah ekspektasi multi-cabang gratis |
| Render halaman | Dashboard, inventori, kasir, pembelian, pelanggan, price list, laporan golongan, retur, profil apotek, follow-up bisa render | Smoke test lintas modul |
| Multi-UOM | Checkout 1 BOX dengan faktor 10 memotong 10 base unit | Stok internal harus tetap base-unit meski offline |
| Transaksi lokal | Transaksi tersimpan di `DB.transactions` dan `localStorage` | Tidak boleh bergantung RPC |
| Price list | Price list customer/promo aktif muncul di kasir lokal | Diskon harus tetap bekerja tanpa cloud |
| Golongan obat | Obat Keras/Narkotika/Psikotropika tertahan tanpa resep | Validasi compliance tetap berjalan offline |
| Resep terverifikasi | Checkout obat restricted bisa lanjut jika resep valid | Flow resep lokal tidak boleh rusak |
| Multi-cabang free tier | Menu lokal diframe sebagai Profil Apotek, bukan manajemen cabang | Multi-cabang adalah value cloud/paid tier |
| Follow-up | Menu follow-up tidak mengklaim integrasi WhatsApp | Menghindari ekspektasi fitur palsu |

## Acceptance criteria

Mode lokal dianggap aman jika:

- Tidak ada layar login Supabase yang memblokir user.
- Tidak ada cabang/user dummy Jakarta/Bandung/Surabaya setelah normalisasi local free tier.
- Semua halaman inti render tanpa exception JavaScript.
- Checkout lokal membuat transaksi dan memotong stok tanpa RPC.
- Multi-UOM menyimpan `unitCode` dan `baseQty` di item transaksi.
- Price list aktif memengaruhi tampilan kasir lokal.
- Obat restricted tidak bisa checkout tanpa resep terverifikasi.
- Profil Apotek lokal tidak menampilkan tombol tambah cabang/user.

## Wajib dijalankan sebelum merge

Jalankan test ini sebelum merge setiap perubahan yang menyentuh:

- `app.js`
- `multi-uom.js`
- `price-lists.js`
- `drug-classification.js`
- `membership-admin.js`
- `ak2-free-tier-start.js`
- `ak2-local-profile-page.js`
- `supabase-data.js`
- file workflow cloud/RPC yang fallback ke local mode
