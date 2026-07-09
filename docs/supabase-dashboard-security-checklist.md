# Supabase Dashboard Security Checklist

Checklist ini untuk item yang tidak bisa diselesaikan murni lewat migration SQL repository.

## 3.1 Auth Leaked Password Protection

Status audit: Security Advisor menunjukkan **Leaked Password Protection masih OFF**.

Tindakan manual di Supabase Dashboard:

1. Buka Supabase Dashboard.
2. Pilih project ApotekKilat.
3. Masuk ke **Authentication**.
4. Buka **Policies**.
5. Aktifkan **Leaked Password Protection**.
6. Simpan perubahan.
7. Jalankan ulang Security Advisor untuk verifikasi.

Catatan:

- Setting ini berada di konfigurasi Auth Supabase, bukan di tabel public schema.
- Karena itu tidak dipatch lewat migration SQL di repo ini.
- Setelah ON, password yang terdeteksi bocor akan ditolak oleh Supabase Auth sesuai kebijakan platform.

## 3.2 RLS auth.uid() per-row re-evaluation

Sudah ditangani lewat migration:

`supabase/migrations/20260709042000_minor_security_performance_advisor_fixes.sql`

Migration tersebut recreate policy berikut jika policy-nya ada:

- `pharmacy_users_owner_select`
- `pharmacy_users_owner_insert`
- `pharmacy_users_owner_update`

Perubahan utama:

```sql
(select auth.uid())
```

bukan:

```sql
auth.uid()
```

## 3.3 create_purchase_order conflict update guard

Sudah ditangani lewat migration yang sama.

Defense-in-depth ditambahkan pada path:

```sql
on conflict (id) do update ...
where purchase_orders.pharmacy_id = excluded.pharmacy_id;
```

Tujuannya agar update conflict tidak dapat menyentuh PO lintas tenant, sekalipun RLS tetap menjadi lapisan proteksi utama.
