/* Iterasi 2 Phase A — Free tier offline-first startup.
   Goal: user can start locally without Supabase login, as local Owner, with 1 pharmacy / 1 branch / 1 user. */
(function(){
  const LOCAL_USER_ID = 'local-owner';
  const LOCAL_EMAIL = 'owner@local.apotekkilat';

  function isCloudMode(){
    return !!(window.ApotekKilatSupabaseData &&
      window.ApotekKilatSupabaseData.getMode &&
      window.ApotekKilatSupabaseData.getMode() === 'cloud');
  }

  function localSession(){
    return {
      access_token: 'local-free-tier',
      token_type: 'local',
      user: {id: LOCAL_USER_ID, email: LOCAL_EMAIL, app_metadata:{}, user_metadata:{full_name:'Owner Lokal'}}
    };
  }

  function isLocalSession(){
    return !!(authSession && authSession.user && authSession.user.id === LOCAL_USER_ID);
  }

  function looksLikeOriginalSeed(){
    const branchNames = (DB.branches || []).map(b => b.name).join('|');
    const userNames = (DB.users || []).map(u => u.name).join('|');
    return branchNames.includes('Apotek Sehat Bandung') ||
      branchNames.includes('Apotek Sehat Surabaya') ||
      userNames.includes('Apt. Dinda Lestari') ||
      userNames.includes('Budi Santoso');
  }

  function normalizeFreeTierData(){
    if(!DB || typeof DB !== 'object') return;
    DB.settings = DB.settings || {};
    DB.meta = DB.meta || {};

    const branchId = DB.activeBranchId || ((DB.branches || [])[0] && DB.branches[0].id) || 'b-local-main';
    const pharmacyName = DB.settings.pharmacyName || 'Apotek Saya';
    const address = DB.settings.address || 'Alamat apotek';

    if(!Array.isArray(DB.branches) || !DB.branches.length || looksLikeOriginalSeed()){
      DB.branches = [{id: branchId, name: pharmacyName, address, isMain: true}];
    }else{
      DB.branches = [Object.assign({}, DB.branches[0], {id: branchId, isMain: true})];
      DB.branches[0].name = DB.branches[0].name || pharmacyName;
      DB.branches[0].address = DB.branches[0].address || address;
    }

    DB.activeBranchId = branchId;
    DB.users = [{
      id: 'u-local-owner',
      userId: LOCAL_USER_ID,
      name: 'Owner Lokal',
      branchId,
      role: 'Owner',
      status: 'Aktif'
    }];
    DB.settings.pharmacyName = pharmacyName === 'Apotek Sehat' ? 'Apotek Saya' : pharmacyName;
    DB.settings.address = address === 'Jakarta Selatan' ? 'Alamat apotek' : address;
    DB.meta.freeTierOfflineFirst = true;
    localStorage.setItem(DB_KEY, JSON.stringify(DB));
  }

  function hideAuthForLocal(){
    const auth = document.querySelector('#authScreen');
    const app = document.querySelector('.app');
    if(auth) auth.classList.add('hidden');
    if(app) app.classList.remove('locked');
    const logout = document.querySelector('#logoutBtn');
    if(logout){
      logout.textContent = 'Mode Lokal';
      logout.title = 'Free tier berjalan tanpa akun. Login dipakai saat upgrade ke Cloud.';
      logout.onclick = function(){ toast('Mode lokal aktif. Data tersimpan di perangkat ini.'); };
    }
  }

  async function startLocalFreeTier(){
    if(isCloudMode()) return;
    normalizeFreeTierData();
    authSession = localSession();
    hideAuthForLocal();
    if(typeof render === 'function') render();
    if(typeof updateHeader === 'function') updateHeader();
    const profile = document.querySelector('#profileName');
    if(profile) profile.textContent = 'Owner Lokal';
    const branch = document.querySelector('#profileBranch');
    if(branch) branch.textContent = DB.settings && DB.settings.pharmacyName ? DB.settings.pharmacyName : 'Apotek Saya';
    const avatar = document.querySelector('#profileAvatar');
    if(avatar) avatar.textContent = 'OL';
  }

  const originalShowAuthGate = typeof showAuthGate === 'function' ? showAuthGate : null;
  if(originalShowAuthGate){
    showAuthGate = function(message){
      if(!isCloudMode()){
        startLocalFreeTier();
        return;
      }
      return originalShowAuthGate(message);
    };
  }

  window.ApotekKilatFreeTier = {startLocalFreeTier, normalizeFreeTierData};

  // Explicit auth fallback: every first-run/local/no-session path ends in productive Owner mode.
  setTimeout(startLocalFreeTier, 0);
  setTimeout(startLocalFreeTier, 600);
  setTimeout(startLocalFreeTier, 1800);
  window.addEventListener('apotekkilat:local-mode', startLocalFreeTier);
})();
