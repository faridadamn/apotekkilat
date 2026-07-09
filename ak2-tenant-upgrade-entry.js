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
  function openWhatsApp(kind){
    if(window.ApotekKilatTenantOnboarding && window.ApotekKilatTenantOnboarding.openWhatsApp){
      window.ApotekKilatTenantOnboarding.openWhatsApp(kind || 'cloud');
      return;
    }
    const text = kind === 'improvement'
      ? 'Halo, saya ingin memberi bantuan/saran improvement untuk ApotekKilat.'
      : 'Halo, saya ingin aktivasi Cloud ApotekKilat. Mohon info langkah pembayaran dan verifikasi membership cloud.';
    window.open('https://wa.me/628159776654?text='+encodeURIComponent(text), '_blank', 'noopener');
  }
  function openUpgrade(){
    if(isLocalFreeSession()){
      openWhatsApp('cloud');
      return;
    }
    if(window.ApotekKilatTenantOnboarding && window.ApotekKilatTenantOnboarding.openTenantUpgrade){
      window.ApotekKilatTenantOnboarding.openTenantUpgrade();
      return;
    }
    openWhatsApp('cloud');
  }
  function cloudHasTenant(){
    return !!(window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getPharmacyId && window.ApotekKilatSupabaseData.getPharmacyId());
  }
  function injectHeaderButtons(){
    const top = document.querySelector('.top');
    if(!top) return;
    const logout = document.querySelector('#logoutBtn');

    if(!document.querySelector('#ak2SupportBtn')){
      const supportBtn = document.createElement('button');
      supportBtn.id = 'ak2SupportBtn';
      supportBtn.className = 'outline small-btn';
      supportBtn.type = 'button';
      supportBtn.textContent = 'Bantuan & Saran';
      supportBtn.onclick = ()=>openWhatsApp('improvement');
      top.insertBefore(supportBtn, logout || null);
    }

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
    if(!pages) return;
    const firstCard = pages.querySelector('.card');
    const can = canUpgrade();
    const local = isLocalFreeSession();
    const hasTenant = cloudHasTenant();

    if(!document.querySelector('#ak2SupportCard')){
      const supportHtml = `<div id="ak2SupportCard" class="card" style="margin-bottom:16px;border-color:#d8e3e5;background:#fbfefd">
        <div class="title"><span>Bantuan dan Saran Improvement</span></div>
        <p class="muted">Butuh bantuan, aktivasi manual, atau ingin kasih masukan fitur? Hubungi admin via WhatsApp.</p>
        <button class="outline" data-action="contact-improvement-wa">Bantuan dan Saran Improvement</button>
      </div>`;
      if(firstCard) firstCard.insertAdjacentHTML('beforebegin', supportHtml);
      else pages.insertAdjacentHTML('afterbegin', supportHtml);
    }

    if(document.querySelector('#ak2TenantActivationCard')) return;

    let html = '';
    if(can){
      html = `<div id="ak2TenantActivationCard" class="card" style="margin-bottom:16px;border-color:#b8ebcf;background:#f6fffa">
        <div class="title"><span>Aktivasi Cloud Tenant</span>${status('Verifikasi Manual','warn')}</div>
        <p><b>Akun ini sudah login, tetapi belum punya tenant apotek.</b></p>
        <p class="muted">Aktivasi cloud tidak self-service. Hubungi WhatsApp admin untuk pembayaran/verifikasi membership, lalu tenant cloud akan diaktifkan manual.</p>
        <button class="primary" data-action="activate-cloud">Hubungi WhatsApp untuk Aktivasi Cloud</button>
      </div>`;
    }else if(local){
      html = `<div id="ak2TenantActivationCard" class="card" style="margin-bottom:16px">
        <div class="title"><span>Cloud Tenant</span>${status('Verifikasi Manual','warn')}</div>
        <p class="muted">Mode lokal tetap gratis. Untuk aktivasi cloud, hubungi admin via WhatsApp agar pembayaran dan membership diverifikasi manual.</p>
        <button class="primary" data-action="activate-cloud">Hubungi WhatsApp untuk Aktivasi Cloud</button>
        <button class="outline" data-action="cloud-login" style="margin-left:8px">Masuk Cloud</button>
      </div>`;
    }else if(hasTenant){
      html = `<div id="ak2TenantActivationCard" class="card" style="margin-bottom:16px;border-color:#b8ebcf;background:#f6fffa">
        <div class="title"><span>Cloud Tenant</span>${status('Aktif','ok')}</div>
        <p class="muted">Akun ini sudah terhubung ke tenant apotek cloud.</p>
      </div>`;
    }
    if(!html) return;
    const supportCard = document.querySelector('#ak2SupportCard');
    if(supportCard) supportCard.insertAdjacentHTML('afterend', html);
    else if(firstCard) firstCard.insertAdjacentHTML('beforebegin', html);
    else pages.insertAdjacentHTML('afterbegin', html);
  }
  function updateVisibility(){
    injectHeaderButtons();
    injectSettingsEntry();
    const loginBtn = document.querySelector('#ak2CloudLoginBtn');
    const upgradeBtn = document.querySelector('#ak2CloudUpgradeBtn');
    const supportBtn = document.querySelector('#ak2SupportBtn');
    if(loginBtn) loginBtn.style.display = isLocalFreeSession() ? '' : 'none';
    if(upgradeBtn) upgradeBtn.style.display = cloudHasTenant() ? 'none' : '';
    if(supportBtn) supportBtn.style.display = '';
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
      return;
    }
    const support = e.target.closest('[data-action="contact-improvement-wa"]');
    if(support){
      e.preventDefault();
      openWhatsApp('improvement');
    }
  }, true);
  window.ApotekKilatTenantUpgradeEntry = {isLocalFreeSession, canUpgrade, openUpgrade, openWhatsApp, injectSettingsEntry, updateVisibility};
  window.addEventListener('apotekkilat:tenant-updated', updateVisibility);
  setInterval(updateVisibility, 1500);
  setTimeout(updateVisibility, 0);
})();
