/* Iterasi 2 Phase B — visible tenant onboarding entry point. */
(function(){
  function canUpgrade(){
    return !!(window.ApotekKilatTenantOnboarding && window.ApotekKilatTenantOnboarding.canUpgradeToCloud && window.ApotekKilatTenantOnboarding.canUpgradeToCloud());
  }
  function openUpgrade(){
    if(window.ApotekKilatTenantOnboarding) window.ApotekKilatTenantOnboarding.openTenantUpgrade();
  }
  function injectHeaderButton(){
    const top = document.querySelector('.top');
    if(!top || document.querySelector('#ak2CloudUpgradeBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'ak2CloudUpgradeBtn';
    btn.className = 'outline small-btn';
    btn.type = 'button';
    btn.textContent = 'Aktifkan Cloud';
    btn.onclick = openUpgrade;
    const logout = document.querySelector('#logoutBtn');
    top.insertBefore(btn, logout || null);
  }
  function updateVisibility(){
    injectHeaderButton();
    const btn = document.querySelector('#ak2CloudUpgradeBtn');
    if(btn) btn.style.display = canUpgrade() ? '' : 'none';
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
    const btn = e.target.closest('[data-action="activate-cloud"]');
    if(!btn) return;
    e.preventDefault();
    openUpgrade();
  }, true);
  setInterval(updateVisibility, 1500);
  setTimeout(updateVisibility, 0);
})();
