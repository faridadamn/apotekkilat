/* Iterasi 2 Phase B — settings-only support and tenant onboarding entry points. */
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
    const text = 'Halo, saya ingin menghubungi support ApotekKilat untuk aktivasi, bantuan, atau saran improvement.';
    window.open('https://wa.me/628159776654?text='+encodeURIComponent(text), '_blank', 'noopener');
  }
  function exportBackup(){
    if(window.ApotekKilatTenantOnboarding && window.ApotekKilatTenantOnboarding.exportLocalBackup){
      window.ApotekKilatTenantOnboarding.exportLocalBackup();
      return;
    }
    toast('Fitur backup belum siap.', 'err');
  }
  function importBackup(){
    if(window.ApotekKilatTenantOnboarding && window.ApotekKilatTenantOnboarding.importLocalBackup){
      window.ApotekKilatTenantOnboarding.importLocalBackup();
      return;
    }
    toast('Fitur import belum siap.', 'err');
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
  function removeHeaderButtons(){
    ['#ak2SupportBtn','#ak2CloudLoginBtn','#ak2CloudUpgradeBtn'].forEach(sel=>{
      const el = document.querySelector(sel);
      if(el) el.remove();
    });
  }
  function backupImportButtons(){
    return `<div style="display:flex;gap:8px;margin-top:8px">
      <button class="outline" data-action="export-local-backup" style="flex:1">Backup</button>
      <button class="outline" data-action="import-local-backup" style="flex:1">Import</button>
    </div>`;
  }
  function injectSettingsEntry(){
    if(S.page !== 'pengaturan') return;
    const pages = document.querySelector('#pages');
    if(!pages) return;
    const firstCard = pages.querySelector('.card');
    const hasTenant = cloudHasTenant();

    if(!document.querySelector('#ak2SupportCard')){
      const supportHtml = `<div id="ak2SupportCard" class="card" style="margin-bottom:16px;border-color:#b8ebcf;background:#f6fffa">
        <div class="title"><span>Support ApotekKilat</span>${status('WhatsApp','ok')}</div>
        <p class="muted">Untuk aktivasi, bantuan, dan saran improvement, silakan menghubungi WhatsApp support representatif.</p>
        <button class="primary" data-action="contact-support-wa">💬 Hubungi</button>
      </div>`;
      if(firstCard) firstCard.insertAdjacentHTML('beforebegin', supportHtml);
      else pages.insertAdjacentHTML('afterbegin', supportHtml);
    }

    if(document.querySelector('#ak2TenantActivationCard')) return;

    let html = '';
    if(hasTenant){
      html = `<div id="ak2TenantActivationCard" class="card" style="margin-bottom:16px;border-color:#b8ebcf;background:#f6fffa">
        <div class="title"><span>Cloud Tenant</span>${status('Aktif','ok')}</div>
        <p class="muted">Akun ini sudah terhubung ke tenant apotek cloud.</p>
        ${backupImportButtons()}
      </div>`;
    }else{
      html = `<div id="ak2TenantActivationCard" class="card" style="margin-bottom:16px">
        <div class="title"><span>Cloud & Data Lokal</span>${status('Verifikasi Manual','warn')}</div>
        <p class="muted">Mode lokal tetap gratis. Data lokal tidak otomatis hilang. Gunakan Backup sebelum aktivasi/migrasi, dan Import untuk membaca ulang file backup.</p>
        ${backupImportButtons()}
      </div>`;
    }
    if(!html) return;
    const supportCard = document.querySelector('#ak2SupportCard');
    if(supportCard) supportCard.insertAdjacentHTML('afterend', html);
    else if(firstCard) firstCard.insertAdjacentHTML('beforebegin', html);
    else pages.insertAdjacentHTML('afterbegin', html);
  }
  function updateVisibility(){
    removeHeaderButtons();
    injectSettingsEntry();
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
    const contact = e.target.closest('[data-action="contact-support-wa"]');
    if(contact){
      e.preventDefault();
      openWhatsApp('cloud');
      return;
    }
    const upgrade = e.target.closest('[data-action="activate-cloud"]');
    if(upgrade){
      e.preventDefault();
      openUpgrade();
      return;
    }
    const backup = e.target.closest('[data-action="export-local-backup"]');
    if(backup){
      e.preventDefault();
      exportBackup();
      return;
    }
    const importer = e.target.closest('[data-action="import-local-backup"]');
    if(importer){
      e.preventDefault();
      importBackup();
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
  window.ApotekKilatTenantUpgradeEntry = {isLocalFreeSession, canUpgrade, openUpgrade, openWhatsApp, exportBackup, importBackup, removeHeaderButtons, injectSettingsEntry, updateVisibility};
  window.addEventListener('apotekkilat:tenant-updated', updateVisibility);
  setInterval(updateVisibility, 1500);
  setTimeout(updateVisibility, 0);
})();
