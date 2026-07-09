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

  function waUrl(kind){
    const email = authSession && authSession.user ? authSession.user.email : '';
    const name = DB && DB.settings ? DB.settings.pharmacyName : '';
    const text = kind === 'improvement'
      ? `Halo, saya ingin memberi bantuan/saran improvement untuk ApotekKilat.%0A%0AEmail: ${encodeURIComponent(email || '-')}`
      : `Halo, saya ingin aktivasi Cloud ApotekKilat.%0A%0AMohon info langkah pembayaran, verifikasi membership cloud, dan migrasi data lokal saya.%0A%0AEmail akun: ${encodeURIComponent(email || '-')}%0ANama apotek: ${encodeURIComponent(name || '-')}%0ARingkasan data lokal: ${encodeURIComponent(summaryText())}%0A%0ASaya akan lampirkan file backup data lokal dari tombol Download Backup Data Lokal di aplikasi.`;
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
      <button type="button" class="primary" style="width:100%;margin-top:10px" data-action="contact-cloud-wa">Hubungi WhatsApp untuk Aktivasi + Migrasi</button>
      <button type="button" class="outline" style="width:100%;margin-top:8px" data-action="export-local-backup">Download Backup Data Lokal</button>
      <p class="muted">Catatan: tombol ini tidak menjalankan RPC <code>create_pharmacy_tenant</code>. Produk dan pelanggan akan diprioritaskan untuk migrasi manual. Histori transaksi lama bisa tetap dilihat dari mode lokal sampai migrasi historis disiapkan.</p>
    </div>`, ()=>{ openWhatsApp('cloud'); return false; }, {saveLabel:'Hubungi WhatsApp'});
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
    const improvement = e.target.closest('[data-action="contact-improvement-wa"]');
    if(improvement){
      e.preventDefault();
      openWhatsApp('improvement');
    }
  }, true);

  window.ApotekKilatTenantOnboarding = {openTenantUpgrade, canUpgradeToCloud, showLocalModeNotice, openWhatsApp, submitTenant, exportLocalBackup, localSummary};
  window.addEventListener('apotekkilat:local-mode', showLocalModeNotice);
  setInterval(showLocalModeNotice, 1200);
})();
