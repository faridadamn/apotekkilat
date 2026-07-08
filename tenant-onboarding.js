/* Phase P1.5.5 — Upgrade-only tenant onboarding.
   Users without pharmacy_users membership stay in client-base/local mode.
   create_pharmacy_tenant() is only called from an explicit upgrade flow.
   No service-role key is used in the browser. */
(function(){
  let busy = false;

  function cloudHasTenant(){
    return !!(window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getPharmacyId && window.ApotekKilatSupabaseData.getPharmacyId());
  }

  function activeClient(){
    return window.supabaseClient || supabaseClient;
  }

  function canUpgradeToCloud(){
    return !!(window.supabaseClient || supabaseClient) && !!authSession && authSession.user && !cloudHasTenant() && typeof modal === 'function';
  }

  function showLocalModeNotice(){
    if(cloudHasTenant()) return;
    const tip = document.querySelector('.tip p');
    if(tip) tip.textContent = 'Mode lokal aktif. Data tersimpan di perangkat ini. Upgrade cloud hanya untuk member aktif.';
    const label = document.querySelector('#pharmacyLabel');
    if(label && (!DB || !DB.settings || label.textContent === 'Sistem Manajemen Apotek')) label.textContent = 'Client Base — Mode Lokal';
  }

  async function submitTenant(){
    if(busy) return false;
    const pharmacyName = document.querySelector('#tenantPharmacyName').value.trim();
    const ownerName = document.querySelector('#tenantOwnerName').value.trim();
    const address = document.querySelector('#tenantAddress').value.trim();
    const whatsapp = document.querySelector('#tenantWhatsapp').value.trim();
    const branchName = document.querySelector('#tenantBranchName').value.trim();
    const seedCoa = document.querySelector('#tenantSeedCoa').checked;

    if(!canUpgradeToCloud()){
      toast('Upgrade cloud hanya bisa dilakukan setelah login dan belum punya tenant aktif.', 'err');
      return false;
    }
    if(!pharmacyName || pharmacyName.length < 3){
      toast('Nama apotek minimal 3 karakter', 'err');
      return false;
    }
    if(!ownerName){
      toast('Nama owner wajib diisi', 'err');
      return false;
    }

    busy = true;
    const btn = document.querySelector('#modalSave');
    if(btn){ btn.disabled = true; btn.textContent = 'Mengaktifkan cloud...'; }

    const {error} = await activeClient().rpc('create_pharmacy_tenant', {
      p_payload: {
        pharmacy_name: pharmacyName,
        owner_name: ownerName,
        address,
        whatsapp,
        branch_name: branchName || `${pharmacyName} Pusat`,
        seed_chart_of_accounts: seedCoa
      }
    });

    busy = false;
    if(btn){ btn.disabled = false; btn.textContent = 'Aktifkan Cloud'; }

    if(error){
      console.error(error);
      toast(error.message || 'Gagal mengaktifkan tenant cloud', 'err');
      return false;
    }

    toast('Cloud tenant berhasil diaktifkan');
    closeModal();
    if(typeof showApp === 'function') await showApp();
    return true;
  }

  function openTenantUpgrade(){
    if(!canUpgradeToCloud()){
      toast('Mode cloud hanya untuk akun tanpa tenant aktif yang sudah login.', 'err');
      return;
    }
    const email = authSession && authSession.user ? authSession.user.email : '';
    modal('Upgrade ke Cloud', `<div class="form">
      <p class="muted">Mode lokal tetap gratis. Lanjutkan hanya jika membership cloud sudah aktif, misalnya paket Rp50.000/bulan.</p>
      <label>Nama Apotek<input id="tenantPharmacyName" placeholder="Contoh: Apotek Sehat Kilat" /></label>
      <label>Nama Owner<input id="tenantOwnerName" value="${esc((email || '').split('@')[0] || 'Owner')}" placeholder="Nama pemilik / penanggung jawab" /></label>
      <label>Cabang Pertama<input id="tenantBranchName" placeholder="Kosongkan untuk otomatis: Nama Apotek Pusat" /></label>
      <label>Alamat<input id="tenantAddress" placeholder="Alamat apotek" /></label>
      <label>WhatsApp<input id="tenantWhatsapp" placeholder="08xxxx" /></label>
      <label class="check"><input id="tenantSeedCoa" type="checkbox" checked /> Seed chart of accounts awal</label>
      <p class="muted">Flow ini memakai session user biasa dan RPC tervalidasi. Tidak ada service role key di browser.</p>
    </div>`, ()=>{ submitTenant(); return false; }, {saveLabel:'Aktifkan Cloud'});
  }

  window.ApotekKilatTenantOnboarding = {openTenantUpgrade, canUpgradeToCloud, showLocalModeNotice};
  window.addEventListener('apotekkilat:local-mode', showLocalModeNotice);
  setInterval(showLocalModeNotice, 1200);
})();
