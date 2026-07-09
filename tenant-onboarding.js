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

  function waUrl(kind){
    const email = authSession && authSession.user ? authSession.user.email : '';
    const name = DB && DB.settings ? DB.settings.pharmacyName : '';
    const text = kind === 'improvement'
      ? `Halo, saya ingin memberi bantuan/saran improvement untuk ApotekKilat.%0A%0AEmail: ${encodeURIComponent(email || '-')}`
      : `Halo, saya ingin aktivasi Cloud ApotekKilat.%0A%0AMohon info langkah pembayaran dan verifikasi membership cloud.%0A%0AEmail akun: ${encodeURIComponent(email || '-')}%0ANama apotek: ${encodeURIComponent(name || '-')}`;
    return `https://wa.me/${SUPPORT_WA}?text=${text}`;
  }

  function openWhatsApp(kind){
    window.open(waUrl(kind), '_blank', 'noopener');
  }

  function showLocalModeNotice(){
    if(cloudHasTenant()) return;
    const tip = document.querySelector('.tip p');
    if(tip) tip.textContent = 'Mode lokal aktif. Data tersimpan di perangkat ini. Aktivasi cloud diverifikasi manual via WhatsApp.';
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
    modal('Aktivasi Cloud', `<div class="form">
      <p><b>Aktivasi Cloud tidak dilakukan otomatis dari aplikasi.</b></p>
      <p class="muted">Untuk sementara, membership cloud diverifikasi manual terlebih dahulu. Klik tombol di bawah untuk menghubungi WhatsApp admin, lalu admin akan bantu aktivasi setelah pembayaran/verifikasi selesai.</p>
      <div class="card" style="background:#f6fffa;border-color:#b8ebcf;box-shadow:none">
        <div class="title"><span>Paket Cloud</span>${status('Verifikasi Manual','warn')}</div>
        <p class="muted">Estimasi paket awal: <b>Rp50.000/bulan</b>. Mode lokal tetap gratis dan bisa dipakai tanpa aktivasi cloud.</p>
        <p class="muted">Email akun login: <b style="color:var(--ink)">${esc(email || '-')}</b></p>
      </div>
      <button type="button" class="primary" style="width:100%;margin-top:10px" data-action="contact-cloud-wa">Hubungi WhatsApp untuk Aktivasi Cloud</button>
      <p class="muted">Catatan: tombol ini tidak menjalankan RPC <code>create_pharmacy_tenant</code>. Tenant cloud akan dibuat manual setelah membership tervalidasi.</p>
    </div>`, ()=>{ openWhatsApp('cloud'); return false; }, {saveLabel:'Hubungi WhatsApp'});
  }

  document.addEventListener('click', function(e){
    const cloud = e.target.closest('[data-action="contact-cloud-wa"]');
    if(cloud){
      e.preventDefault();
      openWhatsApp('cloud');
      return;
    }
    const improvement = e.target.closest('[data-action="contact-improvement-wa"]');
    if(improvement){
      e.preventDefault();
      openWhatsApp('improvement');
    }
  }, true);

  window.ApotekKilatTenantOnboarding = {openTenantUpgrade, canUpgradeToCloud, showLocalModeNotice, openWhatsApp, submitTenant};
  window.addEventListener('apotekkilat:local-mode', showLocalModeNotice);
  setInterval(showLocalModeNotice, 1200);
})();
