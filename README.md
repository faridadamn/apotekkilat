# ApotekKilat

MVP antarmuka SaaS manajemen apotek berbasis web statis.

## Modul yang tersedia

- Dashboard penjualan, transaksi, stok menipis, resep masuk, dan notifikasi.
- Inventori obat dengan pencarian, status stok, batch, dan peringatan expired.
- Detail obat dan ringkasan batch.
- Kasir/POS dengan pencarian produk, keranjang, kuantitas, PPN, dan simulasi checkout.
- Resep & verifikasi untuk alur farmasi.
- Pembelian & supplier.
- Pelanggan, riwayat, poin loyalitas, dan reminder refill.
- Laporan & analitik, termasuk ekspor CSV demo.
- Cabang dan matriks hak akses.
- Chat order & FAQ dengan draft AI yang selalu perlu disetujui admin.
- Pengaturan profil apotek dan Knowledge Snapshot.

## Interaksi demo

Seluruh tombol utama pada UI sudah memiliki respons untuk kebutuhan validasi alur:

- Navigasi seluruh modul melalui sidebar.
- Pencarian inventori, produk kasir, dan pelanggan.
- Tambah obat dan pelanggan menggunakan modal form.
- Tambah produk ke keranjang, ubah kuantitas, hapus item, kosongkan keranjang, dan checkout demo.
- Buat PO, cabang, pengguna, serta batch melalui modal form.
- Verifikasi resep dan ubah status persiapan obat.
- Gunakan, edit, refresh, atau eskalasi draft AI pada modul chat.
- Simulasi kirim chat.
- Export CSV pada modul laporan.
- Toast/konfirmasi visual untuk setiap aksi demo.

## Menjalankan lokal

Karena proyek ini belum menggunakan backend atau dependency, cukup buka `index.html` di browser.

Alternatif memakai VS Code Live Server:

1. Clone repository.
2. Buka folder proyek di VS Code.
3. Jalankan **Open with Live Server** pada `index.html`.

## Catatan produk

Ini masih UI/MVP: data tersimpan sementara di browser dan belum tersambung ke database, API WhatsApp, autentikasi, atau integrasi resep.

Prinsip untuk modul Chat AI: AI hanya membuat **draft jawaban** berbasis FAQ/SOP. Admin tetap meninjau sebelum mengirim atau melakukan aksi sensitif.

## Tahap pengembangan berikutnya

1. Migrasi ke Next.js atau Laravel + React.
2. Login dan role-based access control.
3. Database PostgreSQL untuk obat, batch, transaksi, resep, dan pelanggan.
4. Barcode scanner, printer nota, dan export laporan produksi.
5. Knowledge Snapshot versioning untuk FAQ/SOP dan audit jawaban AI.
6. WhatsApp Business API dengan eskalasi admin dan audit log.
