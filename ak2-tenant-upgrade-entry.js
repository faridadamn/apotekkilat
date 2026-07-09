/* Iterasi 2 Phase B — visible login and tenant onboarding entry points. */
(function(){
  function isLocalFreeSession(){
    return !!(authSession && authSession.user && authSession.user.id === 'local-owner');
  }
  function canUpgrade(){
    return !isLocalFreeSession() && !!(window.ApotekKilatTenantOnboarding && window.ApotekKilatTenantOnboarding.canUpgradeToCloud && window.ApotekKilatTenantOnboarding.canUpgradeToCloud());
  }
  function openCloudLogin(){
    if(window.ApotekKilatFreeTier && window.ApotekKilatFreeTier.openCloudLogin) window.ApotekKilatFreeTier.openCloudLogin();
    else toast('Login Cloud belum siap.', 'err');
  }
  function openUpgrade(){
    if(isLocalFreeSession()){
      openCloudLogin();
      return;
    }
    if(window.ApotekKilatTenantOnboarding && window.ApotekKilatTenantOnboarding.openTenantUpgrade){
      window.ApotekKilatTenantOnboarding.openTenantUpgrade();
      return;
    }
    toast('Aktivasi Cloud belum siap.', 'err');
  }
  function cloudHasTenant(){
    return !!(window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getPharmacyId && window.ApotekKilatSupabaseData.getPharmacyId());
  }
  function injectHeaderButtons(){
    const top = document.querySelector('.top');
    if(!top) return;
    const logout = document.querySelector('#logoutBtn');

    if(!document.querySelector('#ak2CloudLoginBtn')){
      const loginBtn = document.createElement('button');
      loginBtn.id = 'ak2CloudLoginBtn';
      loginBtn.className = 'outline small-btn';
      loginBtn.type = 'button';
      loginBtn.textContent = 'Masuk Cloud';
      loginBtn.onclick = openCloudLogin;
      top.insertBefore(loginBtn, logout || null);
    }

    if(!document.querySelector('#ak2CloudUpgradeBtn')){
      const upgradeBtn = document.createElement('button');
      upgradeBtn.id = 'ak2CloudUpgradeBtn';
      upgradeBtn.className = 'outline small-btn';
      upgradeBtn.type = 'button';
      upgradeBtn.textContent = 'Aktifkan Cloud';
      upgradeBtn.onclick = openUpgrade;
      top.insertBefore(upgradeBtn, logout || null);
    }
  }
  function injectSettingsEntry(){
    if(S.page !== 'pengaturan') return;
    const pages = document.querySelector('#pages');
    if(!pages || document.querySelector('#ak2TenantActivationCard')) return;
    const firstCard = pages.querySelector('.card');
    const can = canUpgrade();
    const local = isLocalFreeSession();
    const hasTenant = cloudHasTenant();
    let html = '';
    if(can){
      html = `<div id="ak2TenantActivationCard" class="card" style="margin-bottom:16px;border-color:#b8ebcf;background:#f6fffa">
        <div class="title"><span>Aktivasi Cloud Tenant</span>${status('Siap Diaktifkan','ok')}</div>
        <p><b>Akun ini sudah login, tetapi belum punya tenant apotek.</b></p>
        <p class="muted">Klik tombol di bawah untuk menjalankan RPC <code>create_pharmacy_tenant</code>. Setelah berhasil, aplikasi akan memuat ulang data cloud dan header berubah ke nama apotek cloud.</p>
        <button class="primary" data-action="activate-cloud">Aktifkan Cloud / Daftarkan Apotek</button>
      </div>`;
    }else if(local){
      html = `<div id="ak2TenantActivationCard" class="card" style="margin-bottom:16px">
        <div class="title"><span>Cloud Tenant</span>${status('Login Diperlukan','warn')}</div>
        <p class="muted">Untuk aktivasi cloud, masuk dulu memakai akun Supabase. Setelah login dan belum punya tenant, tombol Daftarkan Apotek akan muncul di halaman ini.</p>
        <button class="outline" data-action="cloud-login">Masuk Cloud</button>
      </div>`;
    }else if(hasTenant){
      html = `<div id="ak2TenantActivationCard" class="card" style="margin-bottom:16px;border-color:#b8ebcf;background:#f6fffa">
        <div class="title"><span>Cloud Tenant</span>${status('Aktif','ok')}</div>
        <p class="muted">Akun ini sudah terhubung ke tenant apotek cloud.</p>
      </div>`;
    }
    if(!html) return;
    if(firstCard) firstCard.insertAdjacentHTML('beforebegin', html);
    else pages.insertAdjacentHTML('afterbegin', html);
  }
  function updateVisibility(){
    injectHeaderButtons();
    injectSettingsEntry();
    const loginBtn = document.querySelector('#ak2CloudLoginBtn');
    const upgradeBtn = document.querySelector('#ak2CloudUpgradeBtn');
    if(loginBtn) loginBtn.style.display = isLocalFreeSession() ? '' : 'none';
    if(upgradeBtn) upgradeBtn.style.display = canUpgrade() ? '' : 'none';
  }
  const oldRender = typeof render === 'function' ? render : null;
  if(oldRender){
    render = function(){
      const out = oldRender.apply(this, arguments);
      setTimeout(updateVisibility, 0);
      return out;
    };
  }
  document.addEventListener('click', function(e){
    const upgrade = e.target.closest('[data-action="activate-cloud"]');
    if(upgrade){
      e.preventDefault();
      openUpgrade();
      return;
    }
    const login = e.target.closest('[data-action="cloud-login"]');
    if(login){
      e.preventDefault();
      openCloudLogin();
    }
  }, true);
  window.addEventListener('apotekkilat:tenant-updated', updateVisibility);
  setInterval(updateVisibility, 1500);
  setTimeout(updateVisibility, 0);
})();