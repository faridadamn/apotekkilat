/* Phase P1.5.5 — Upgrade-only tenant onboarding.
   Public cloud activation is manual-gated until billing verification exists.
   Browser users must contact support before tenant creation. */
(function(){
  const SUPPORT_WA = '628159776654';

  function cloudHasTenant(){
    return !!(window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getPharmacyId && window.ApotekKilatSupabaseData.getPharmacyId());
  }

  function canUpgradeToCloud(){
    return !!(window.supabaseClient || supabaseClient) && !!authSession && authSession.user && !cloudHasTenant() && typeof modal === 'function';
  }

  function localSummary(){
    const db = DB || {};
    return {
      products: Array.isArray(db.products) ? db.products.length : 0,
      customers: Array.isArray(db.customers) ? db.customers.length : 0,
      transactions: Array.isArray(db.transactions) ? db.transactions.length : 0,
      purchaseOrders: Array.isArray(db.purchaseOrders) ? db.purchaseOrders.length : 0,
      priceLists: Array.isArray(db.priceLists) ? db.priceLists.length : 0
    };
  }

  function summaryText(){
    const s = localSummary();
    return `Produk: ${s.products}, Pelanggan: ${s.customers}, Transaksi: ${s.transactions}, PO: ${s.purchaseOrders}, Price list: ${s.priceLists}`;
  }

  function exportLocalBackup(){
    try{
      const payload = {
        exported_at: new Date().toISOString(),
        app: 'ApotekKilat',
        purpose: 'manual-cloud-migration-backup',
        summary: localSummary(),
        data: DB || {}
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
      a.href = url;
      a.download = `apotekkilat-local-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 1000);
      toast('Backup data lokal berhasil dibuat');
    }catch(error){
      console.error(error);
      toast('Gagal membuat backup data lokal', 'err');
    }
  }

  function importLocalBackup(){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = function(){
      const file = input.files && input.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = function(){
        try{
          const payload = JSON.parse(String(reader.result || '{}'));
          const data = payload && payload.data ? payload.data : payload;
          const summary = {
            products: Array.isArray(data.products) ? data.products.length : 0,
            customers: Array.isArray(data.customers) ? data.customers.length : 0,
            transactions: Array.isArray(data.transactions) ? data.transactions.length : 0,
            purchaseOrders: Array.isArray(data.purchaseOrders) ? data.purchaseOrders.length : 0,
            priceLists: Array.isArray(data.priceLists) ? data.priceLists.length : 0
          };
          modal('Import Backup', `<div class="form">
            <p><b>Backup berhasil dibaca.</b></p>
            <p class="muted">File ini belum langsung disinkronkan ke cloud. Untuk sementara import dipakai untuk validasi dan proses migrasi manual.</p>
            <div class="card" style="box-shadow:none;background:#f6fffa;border-color:#b8ebcf">
              <p class="muted">Produk: <b style="color:var(--ink)">${summary.products}</b></p>
              <p class="muted">Pelanggan: <b style="color:var(--ink)">${summary.customers}</b></p>
              <p class="muted">Transaksi: <b style="color:var(--ink)">${summary.transactions}</b></p>
              <p class="muted">PO: <b style="color:var(--ink)">${summary.purchaseOrders}</b></p>
              <p class="muted">Price list: <b style="color:var(--ink)">${summary.priceLists}</b></p>
            </div>
            <p class="muted">Lanjutkan aktivasi via WhatsApp dan lampirkan file backup ini agar admin bisa bantu migrasi.</p>
            <button type="button" class="primary" style="width:100%" data-action="contact-cloud-wa">💬 Aktivasi</button>
          </div>`, ()=>{ openWhatsApp('cloud'); return false; }, {saveLabel:'💬 Aktivasi'});
        }catch(error){
          console.error(error);
          toast('File backup tidak valid', 'err');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function waUrl(kind){
    const email = authSession && authSession.user ? authSession.user.email : '';
    const name = DB && DB.settings ? DB.settings.pharmacyName : '';
    const text = kind === 'improvement'
      ? `Halo, saya ingin memberi bantuan/saran improvement untuk ApotekKilat.%0A%0AEmail: ${encodeURIComponent(email || '-')}`
      : `Halo, saya ingin aktivasi Cloud ApotekKilat.%0A%0AMohon info langkah pembayaran, verifikasi membership cloud, dan migrasi data lokal saya.%0A%0AEmail akun: ${encodeURIComponent(email || '-')}%0ANama apotek: ${encodeURIComponent(name || '-')}%0ARingkasan data lokal: ${encodeURIComponent(summaryText())}%0A%0ASaya akan lampirkan file backup data lokal dari tombol Backup di aplikasi.`;
    return `https://wa.me/${SUPPORT_WA}?text=${text}`;
  }

  function openWhatsApp(kind){
    window.open(waUrl(kind), '_blank', 'noopener');
  }

  function showLocalModeNotice(){
    if(cloudHasTenant()) return;
    const tip = document.querySelector('.tip p');
    if(tip) tip.textContent = 'Mode lokal aktif. Data tersimpan di perangkat ini. Aktivasi cloud dan migrasi data diverifikasi manual via WhatsApp.';
    const label = document.querySelector('#pharmacyLabel');
    if(label && (!DB || !DB.settings || label.textContent === 'Sistem Manajemen Apotek')) label.textContent = 'Client Base — Mode Lokal';
  }

  function submitTenant(){
    toast('Aktivasi Cloud perlu verifikasi manual via WhatsApp.', 'err');
    openWhatsApp('cloud');
    return false;
  }

  function openTenantUpgrade(){
    if(!canUpgradeToCloud()){
      toast('Aktivasi cloud hanya untuk akun login yang belum punya tenant aktif.', 'err');
      return;
    }
    const email = authSession && authSession.user ? authSession.user.email : '';
    const s = localSummary();
    modal('Aktivasi Cloud', `<div class="form">
      <p><b>Aktivasi Cloud tidak dilakukan otomatis dari aplikasi.</b></p>
      <p class="muted">Untuk sementara, membership cloud dan migrasi data diverifikasi manual. Admin akan bantu aktivasi tenant cloud setelah pembayaran/verifikasi selesai.</p>
      <div class="card" style="background:#f6fffa;border-color:#b8ebcf;box-shadow:none">
        <div class="title"><span>Paket Cloud</span>${status('Verifikasi Manual','warn')}</div>
        <p class="muted">Estimasi paket awal: <b>Rp50.000/bulan</b>. Mode lokal tetap gratis dan data lokal tidak akan dihapus otomatis.</p>
        <p class="muted">Email akun login: <b style="color:var(--ink)">${esc(email || '-')}</b></p>
        <p class="muted">Data lokal terdeteksi: <b style="color:var(--ink)">${s.products}</b> produk, <b style="color:var(--ink)">${s.customers}</b> pelanggan, <b style="color:var(--ink)">${s.transactions}</b> transaksi.</p>
      </div>
      <button type="button" class="primary" style="width:100%;margin-top:10px" data-action="contact-cloud-wa">💬 Aktivasi</button>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button type="button" class="outline" style="flex:1" data-action="export-local-backup">Backup</button>
        <button type="button" class="outline" style="flex:1" data-action="import-local-backup">Import</button>
      </div>
      <p class="muted">Catatan: tombol ini tidak menjalankan RPC <code>create_pharmacy_tenant</code>. Produk dan pelanggan akan diprioritaskan untuk migrasi manual. Histori transaksi lama bisa tetap dilihat dari mode lokal sampai migrasi historis disiapkan.</p>
    </div>`, ()=>{ openWhatsApp('cloud'); return false; }, {saveLabel:'💬 Aktivasi'});
  }

  document.addEventListener('click', function(e){
    const cloud = e.target.closest('[data-action="contact-cloud-wa"]');
    if(cloud){
      e.preventDefault();
      openWhatsApp('cloud');
      return;
    }
    const backup = e.target.closest('[data-action="export-local-backup"]');
    if(backup){
      e.preventDefault();
      exportLocalBackup();
      return;
    }
    const importer = e.target.closest('[data-action="import-local-backup"]');
    if(importer){
      e.preventDefault();
      importLocalBackup();
      return;
    }
    const improvement = e.target.closest('[data-action="contact-improvement-wa"]');
    if(improvement){
      e.preventDefault();
      openWhatsApp('improvement');
    }
  }, true);

  window.ApotekKilatTenantOnboarding = {openTenantUpgrade, canUpgradeToCloud, showLocalModeNotice, openWhatsApp, submitTenant, exportLocalBackup, importLocalBackup, localSummary};
  window.addEventListener('apotekkilat:local-mode', showLocalModeNotice);
  setInterval(showLocalModeNotice, 1200);
})();
