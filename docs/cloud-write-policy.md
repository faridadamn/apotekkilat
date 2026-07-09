# Cloud Write Policy

Dokumen ini mencatat keputusan setelah audit major 2.1: mekanisme full-tenant snapshot flush dari `saveDB()` ke Supabase tidak boleh lagi digunakan untuk mode cloud.

## Masalah lama

`saveDB()` dipanggil sangat sering oleh UI. Sebelumnya, di mode cloud, fungsi ini dapat memicu `ApotekKilatSupabaseData.scheduleSave(DB)` lalu `saveRemote(db)` yang meng-upsert banyak tabel sekaligus.

Risikonya:

- Tabel yang sudah RPC-only / RLS-locked akan gagal dan menghasilkan noise `Gagal sync Supabase`.
- Tabel yang belum dikunci masih berisiko tertimpa oleh full snapshot dari browser lain.
- Tidak ada version check untuk banyak tabel.
- Perubahan kecil dapat memicu upsert massal ke seluruh tenant.

## Kebijakan sekarang

`saveDB()` tetap dipakai untuk local cache dan UI responsiveness.

Namun di mode cloud:

- `scheduleSave()` tidak lagi queue full flush.
- `flush()` tidak lagi menulis full snapshot tenant.
- `saveRemote()` menjadi legacy no-op/silent.
- Tidak ada toast sukses/gagal untuk global flush.

## Tabel/jalur yang harus RPC-only

Jalur dokumen kritis harus lewat RPC eksplisit:

| Area | Jalur tulis wajib |
|---|---|
| Checkout / transaksi | `checkout_transaction` |
| Receive PO | `receive_purchase_order` |
| Stock opname posting | `post_stock_opname` |
| Complete return | `complete_return` |
| Tenant creation | `create_pharmacy_tenant` |
| Posted journal/document | RPC/domain writer, bukan full snapshot |

## Tabel master/non-posted

Untuk master data yang masih dapat diedit langsung, gunakan writer eksplisit per entity dengan pola:

- satu record/kelompok record yang berubah saja
- RLS-aware
- validasi field minimal
- idealnya version check / optimistic concurrency

Contoh pola yang perlu diikuti:

- `optimistic-concurrency.js`
- `entity-crud.js` untuk produk/customer/PO draft, dengan catatan PO/posted document tetap harus pindah ke RPC.

## Acceptance criteria

Perubahan dianggap aman jika:

- Tidak ada `upsertOrder` full snapshot di `supabase-data.js`.
- `scheduleSave()` di mode cloud tidak menulis dataset tenant.
- `flush()` tidak melakukan upsert massal.
- Aksi kritis tetap menulis lewat RPC eksplisit.
- Tidak ada toast `Gagal sync Supabase` akibat full flush setelah aksi cloud normal.
