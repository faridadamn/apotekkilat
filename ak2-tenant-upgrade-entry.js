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
    if(window.ApotekKilatTenantOnboarding) window.ApotekKilatTenantOnboarding.openTenantUpgrade();
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
  function updateVisibility(){
    injectHeaderButtons();
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
  setInterval(updateVisibility, 1500);
  setTimeout(updateVisibility, 0);
})();
