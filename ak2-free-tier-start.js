/* Iterasi 2 Phase A — Free tier offline-first startup.
   Goal: user can start locally without Supabase login, as local Owner, with 1 pharmacy / 1 branch / 1 user. */
(function(){
  const LOCAL_USER_ID = 'local-owner';
  const LOCAL_EMAIL = 'owner@local.apotekkilat';
  let cloudLoginRequested = false;
  let onboardingShown = false;

  function isCloudMode(){
    return !!(window.ApotekKilatSupabaseData &&
      window.ApotekKilatSupabaseData.getMode &&
      window.ApotekKilatSupabaseData.getMode() === 'cloud');
  }

  function localSession(ownerName){
    return {
      access_token: 'local-free-tier',
      token_type: 'local',
      user: {id: LOCAL_USER_ID, email: LOCAL_EMAIL, app_metadata:{}, user_metadata:{full_name:ownerName || 'Owner Lokal'}}
    };
  }

  function looksLikeOriginalSeed(){
    const branchNames = (DB.branches || []).map(b => b.name).join('|');
    const userNames = (DB.users || []).map(u => u.name).join('|');
    return branchNames.includes('Apotek Sehat Pusat') ||
      branchNames.includes('Apotek Sehat Bandung') ||
      branchNames.includes('Apotek Sehat Surabaya') ||
      userNames.includes('Apt. Nadia Putri') ||
      userNames.includes('Apt. Dinda Lestari') ||
      userNames.includes('Budi Santoso');
  }

  function localOwnerName(){
    const owner = (DB.users || []).find(u => u.userId === LOCAL_USER_ID || u.role === 'Owner');
    return owner && owner.name ? owner.name : 'Owner Lokal';
  }

  function setLocalNavLabels(){
    try{
      const cabang = Array.isArray(NAV) ? NAV.find(n => n[0] === 'cabang') : null;
      if(cabang) cabang[2] = 'Profil Apotek';
    }catch(e){}
  }

  function applyLocalProfile(pharmacyName, ownerName, address, whatsapp, onboarded){
    if(!DB || typeof DB !== 'object') return;
    DB.settings = DB.settings || {};
    DB.meta = DB.meta || {};

    const cleanPharmacyName = (pharmacyName || DB.settings.pharmacyName || 'Apotek Saya').trim();
    const cleanOwnerName = (ownerName || localOwnerName() || 'Owner Lokal').trim();
    const cleanAddress = (address || DB.settings.address || 'Alamat apotek').trim();
    const cleanWhatsapp = (whatsapp || DB.settings.whatsapp || '').trim();
    const branchId = 'b-local-main';

    DB.settings.pharmacyName = cleanPharmacyName === 'Apotek Sehat' ? 'Apotek Saya' : cleanPharmacyName;
    DB.settings.address = cleanAddress === 'Jakarta Selatan' ? 'Alamat apotek' : cleanAddress;
    DB.settings.whatsapp = cleanWhatsapp === '0812-3456-7890' ? '' : cleanWhatsapp;

    DB.branches = [{
      id: branchId,
      name: DB.settings.pharmacyName,
      address: DB.settings.address,
      isMain: true
    }];
    DB.activeBranchId = branchId;
    DB.users = [{
      id: 'u-local-owner',
      userId: LOCAL_USER_ID,
      name: cleanOwnerName,
      branchId,
      role: 'Owner',
      status: 'Aktif'
    }];
    DB.meta.freeTierOfflineFirst = true;
    if(onboarded) DB.meta.freeTierOnboarded = true;
    localStorage.setItem(DB_KEY, JSON.stringify(DB));
  }

  function normalizeFreeTierData(){
    if(!DB || typeof DB !== 'object') return;
    DB.settings = DB.settings || {};
    DB.meta = DB.meta || {};

    const needsSeedCleanup = !Array.isArray(DB.branches) || DB.branches.length !== 1 || !Array.isArray(DB.users) || DB.users.length !== 1 || looksLikeOriginalSeed();
    if(needsSeedCleanup){
      const pharmacyName = (DB.meta.freeTierOnboarded && DB.settings.pharmacyName) ? DB.settings.pharmacyName : 'Apotek Saya';
      const ownerName = (DB.meta.freeTierOnboarded && localOwnerName()) ? localOwnerName() : 'Owner Lokal';
      const address = (DB.meta.freeTierOnboarded && DB.settings.address) ? DB.settings.address : 'Alamat apotek';
      const whatsapp = (DB.meta.freeTierOnboarded && DB.settings.whatsapp) ? DB.settings.whatsapp : '';
      applyLocalProfile(pharmacyName, ownerName, address, whatsapp, !!DB.meta.freeTierOnboarded);
    }else{
      const branch = DB.branches[0];
      const owner = DB.users[0];
      applyLocalProfile(DB.settings.pharmacyName || branch.name, owner.name || 'Owner Lokal', DB.settings.address || branch.address, DB.settings.whatsapp || '', !!DB.meta.freeTierOnboarded);
    }
    setLocalNavLabels();
  }

  function hideAuthForLocal(){
    const auth = document.querySelector('#authScreen');
    const app = document.querySelector('.app');
    if(auth) auth.classList.add('hidden');
    if(app) app.classList.remove('locked');
    const logout = document.querySelector('#logoutBtn');
    if(logout){
      logout.textContent = 'Mode Lokal';
      logout.title = 'Free tier berjalan tanpa akun. Data hanya tersimpan di browser/perangkat ini.';
      logout.onclick = function(){ toast('Mode lokal aktif. Data hanya tersimpan di browser/perangkat ini.'); };
    }
  }

  function renderLocalHeader(){
    if(typeof updateHeader === 'function') updateHeader();
    const ownerName = localOwnerName();
    const profile = document.querySelector('#profileName');
    if(profile) profile.textContent = ownerName;
    const branch = document.querySelector('#profileBranch');
    if(branch) branch.textContent = DB.settings && DB.settings.pharmacyName ? DB.settings.pharmacyName : 'Apotek Saya';
    const avatar = document.querySelector('#profileAvatar');
    if(avatar) avatar.textContent = ownerName.split(/\s+/).filter(Boolean).map(x=>x[0]).join('').slice(0,2).toUpperCase() || 'OL';
  }

  function showLocalOnboarding(){
    if(onboardingShown || isCloudMode() || !DB || (DB.meta && DB.meta.freeTierOnboarded) || typeof modal !== 'function') return;
    onboardingShown = true;
    modal('Setup Apotek Lokal', `<div class="form">
      <div class="notice" style="border:1px solid #f2d39a;background:#fff8e8;border-radius:12px;padding:12px;margin-bottom:4px">
        <i>!</i><div><b>Penting: data free tier hanya tersimpan di perangkat ini.</b><small>Jika cache/browser dihapus, ganti device, install ulang browser, atau localStorage terhapus, data transaksi dan master lokal bisa hilang permanen. Tidak ada backup otomatis di tier gratis. Gunakan Cloud untuk sinkronisasi dan backup.</small></div>
      </div>
      <p class="muted">Free tier dipakai untuk 1 apotek, 1 cabang, 1 owner di perangkat ini. Isi data awal agar tidak memakai contoh Jakarta/Bandung/Surabaya.</p>
      <label>Nama apotek kamu<input id="localPharmacyName" value="${esc(DB.settings && DB.settings.pharmacyName && DB.settings.pharmacyName !== 'Apotek Saya' ? DB.settings.pharmacyName : '')}" placeholder="Contoh: Apotek Farid Sehat" /></label>
      <label>Nama kamu<input id="localOwnerName" value="${esc(localOwnerName() === 'Owner Lokal' ? '' : localOwnerName())}" placeholder="Contoh: Farid Adam" /></label>
      <label>Alamat apotek<input id="localPharmacyAddress" value="${esc(DB.settings && DB.settings.address && DB.settings.address !== 'Alamat apotek' ? DB.settings.address : '')}" placeholder="Contoh: Bekasi" /></label>
      <label>Nomor WhatsApp<input id="localPharmacyWhatsapp" value="${esc(DB.settings && DB.settings.whatsapp ? DB.settings.whatsapp : '')}" placeholder="08xxxx" /></label>
      <p class="muted">Nanti multi-user, multi-cabang, sinkronisasi, dan backup otomatis dipakai saat masuk Cloud.</p>
    </div>`, ()=>{
      const pharmacyName = document.querySelector('#localPharmacyName').value.trim() || 'Apotek Saya';
      const ownerName = document.querySelector('#localOwnerName').value.trim() || 'Owner Lokal';
      const address = document.querySelector('#localPharmacyAddress').value.trim() || 'Alamat apotek';
      const whatsapp = document.querySelector('#localPharmacyWhatsapp').value.trim() || '';
      applyLocalProfile(pharmacyName, ownerName, address, whatsapp, true);
      authSession = localSession(ownerName);
      setLocalNavLabels();
      if(typeof render === 'function') render();
      renderLocalHeader();
      toast('Profil apotek lokal siap. Data tersimpan di perangkat ini.');
    }, {saveLabel:'Saya Mengerti, Mulai Pakai'});
  }

  async function startLocalFreeTier(){
    if(cloudLoginRequested || isCloudMode()) return;
    normalizeFreeTierData();
    authSession = localSession(localOwnerName());
    hideAuthForLocal();
    if(typeof render === 'function') render();
    renderLocalHeader();
    setTimeout(showLocalOnboarding, 80);
  }

  function openCloudLogin(){
    cloudLoginRequested = true;
    authSession = null;
    const app = document.querySelector('.app');
    const auth = document.querySelector('#authScreen');
    if(app) app.classList.add('locked');
    if(auth) auth.classList.remove('hidden');
    if(typeof setAuthMode === 'function') setAuthMode('login');
    const notice = document.querySelector('#authConfigNotice');
    if(notice){
      const configured = typeof isSupabaseConfigured === 'function' && isSupabaseConfigured();
      notice.textContent = configured ? 'Masuk untuk aktivasi / akses Cloud. Mode lokal tetap tersimpan di perangkat ini sampai sinkronisasi Cloud tersedia.' : 'Isi dulu Supabase URL dan publishable key di supabase-config.js untuk login Cloud.';
      notice.classList.add('show');
    }
    const subtitle = document.querySelector('#authSubtitle');
    if(subtitle) subtitle.textContent = 'Login hanya diperlukan untuk mode Cloud. Free tier lokal bisa dipakai tanpa akun, tetapi tidak memiliki backup otomatis.';
  }

  function cancelCloudLogin(){
    cloudLoginRequested = false;
    startLocalFreeTier();
  }

  const originalShowAuthGate = typeof showAuthGate === 'function' ? showAuthGate : null;
  if(originalShowAuthGate){
    showAuthGate = function(message){
      if(cloudLoginRequested) return originalShowAuthGate(message);
      if(!isCloudMode()){
        startLocalFreeTier();
        return;
      }
      return originalShowAuthGate(message);
    };
  }

  window.ApotekKilatFreeTier = {startLocalFreeTier, normalizeFreeTierData, openCloudLogin, cancelCloudLogin, applyLocalProfile};

  // Explicit auth fallback: every first-run/local/no-session path ends in productive Owner mode.
  setTimeout(startLocalFreeTier, 0);
  setTimeout(startLocalFreeTier, 600);
  setTimeout(startLocalFreeTier, 1800);
  window.addEventListener('apotekkilat:local-mode', startLocalFreeTier);
})();