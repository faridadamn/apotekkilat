/* Iterasi 2 — Free tier profile page.
   Local/free tier should not expose multi-branch and multi-user management UI. */
(function(){
  function isCloudMode(){
    return !!(window.ApotekKilatSupabaseData &&
      window.ApotekKilatSupabaseData.getMode &&
      window.ApotekKilatSupabaseData.getMode() === 'cloud');
  }

  function setLocalNavLabel(){
    try{
      const cabang = Array.isArray(NAV) ? NAV.find(n => n[0] === 'cabang') : null;
      if(cabang && !isCloudMode()) cabang[2] = 'Profil Apotek';
      if(cabang && isCloudMode()) cabang[2] = 'Cabang';
    }catch(e){}
  }

  function localOwner(){
    return (DB.users || []).find(u => u.userId === 'local-owner') || (DB.users || [])[0] || {name:'Owner Lokal', role:'Owner'};
  }

  const originalBranches = typeof branches === 'function' ? branches : null;
  if(originalBranches){
    branches = function(){
      if(isCloudMode()) return originalBranches();
      const s = DB.settings || {};
      const b = (DB.branches || [])[0] || {name:s.pharmacyName || 'Apotek Saya', address:s.address || 'Alamat apotek'};
      const owner = localOwner();
      return `<section class="page active">
        <div class="head">
          <div>
            <h2>Profil Apotek</h2>
            <p>Free tier lokal: 1 apotek, 1 cabang, 1 owner, tersimpan di perangkat ini.</p>
          </div>
          <button class="primary" data-action="edit-local-profile">Edit Profil Lokal</button>
        </div>
        <div class="two">
          <div class="card">
            <div class="title"><span>Data Apotek</span>${status('Lokal Gratis','ok')}</div>
            <div class="form">
              <label>Nama Apotek<input value="${esc(s.pharmacyName || b.name || 'Apotek Saya')}" disabled /></label>
              <label>Alamat<input value="${esc(s.address || b.address || 'Alamat apotek')}" disabled /></label>
              <label>WhatsApp<input value="${esc(s.whatsapp || '-')}" disabled /></label>
            </div>
          </div>
          <div class="card">
            <div class="title"><span>Owner Lokal</span>${status('Owner','violet')}</div>
            <p><b>${esc(owner.name || 'Owner Lokal')}</b></p>
            <p class="muted">Akses penuh di perangkat ini untuk checkout, tambah produk, PO, resep, laporan, dan pengaturan.</p>
            <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
            <p class="muted">Multi-user, multi-cabang, dan sinkronisasi antar perangkat tersedia saat masuk Cloud.</p>
            <button class="outline" data-action="cloud-login">Masuk Cloud</button>
          </div>
        </div>
        <div style="height:16px"></div>
        <div class="card">
          <div class="title"><span>Batasan Free Tier</span></div>
          <p class="muted">Data tersimpan di browser/localStorage perangkat ini. Backup manual tetap disarankan sebelum menghapus cache atau pindah perangkat.</p>
        </div>
      </section>`;
    };
  }

  function editLocalProfile(){
    if(isCloudMode()) return;
    const s = DB.settings || {};
    const owner = localOwner();
    modal('Edit Profil Apotek Lokal', `<div class="form">
      <label>Nama Apotek<input id="editLocalPharmacyName" value="${esc(s.pharmacyName || 'Apotek Saya')}" /></label>
      <label>Nama Owner<input id="editLocalOwnerName" value="${esc(owner.name || 'Owner Lokal')}" /></label>
      <label>Alamat Apotek<input id="editLocalPharmacyAddress" value="${esc(s.address || 'Alamat apotek')}" /></label>
      <label>WhatsApp<input id="editLocalPharmacyWhatsapp" value="${esc(s.whatsapp || '')}" /></label>
    </div>`, ()=>{
      const pharmacyName = document.querySelector('#editLocalPharmacyName').value.trim() || 'Apotek Saya';
      const ownerName = document.querySelector('#editLocalOwnerName').value.trim() || 'Owner Lokal';
      const address = document.querySelector('#editLocalPharmacyAddress').value.trim() || 'Alamat apotek';
      const whatsapp = document.querySelector('#editLocalPharmacyWhatsapp').value.trim() || '';
      if(window.ApotekKilatFreeTier && window.ApotekKilatFreeTier.applyLocalProfile){
        window.ApotekKilatFreeTier.applyLocalProfile(pharmacyName, ownerName, address, whatsapp, true);
      }else{
        DB.settings = DB.settings || {};
        DB.settings.pharmacyName = pharmacyName;
        DB.settings.address = address;
        DB.settings.whatsapp = whatsapp;
        DB.branches = [{id:'b-local-main', name:pharmacyName, address, isMain:true}];
        DB.users = [{id:'u-local-owner', userId:'local-owner', name:ownerName, branchId:'b-local-main', role:'Owner', status:'Aktif'}];
        DB.activeBranchId = 'b-local-main';
        localStorage.setItem(DB_KEY, JSON.stringify(DB));
      }
      setLocalNavLabel();
      render();
      toast('Profil lokal diperbarui');
    });
  }

  const originalAction = typeof action === 'function' ? action : null;
  if(originalAction){
    action = function(a, el){
      if(a === 'edit-local-profile') return editLocalProfile();
      return originalAction(a, el);
    };
  }

  const originalRender = typeof render === 'function' ? render : null;
  if(originalRender){
    render = function(){
      setLocalNavLabel();
      return originalRender.apply(this, arguments);
    };
  }

  setTimeout(()=>{ setLocalNavLabel(); if(typeof nav === 'function') nav(); }, 0);
})();
