/* Phase P1.5.5 — Upgrade-only tenant onboarding.
   Public cloud activation is manual-gated until billing verification exists.
   Browser users must contact support before tenant creation. */
(function(){
  const SUPPORT_WA = '628159776654';

  function getLocalDb(){
    return (typeof DB !== 'undefined' && DB) ? DB : {};
  }

  function activeClient(){
    return window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
  }

  function currentSession(){
    return (typeof authSession !== 'undefined' && authSession) ? authSession : null;
  }

  function cloudHasTenant(){
    return !!(window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getPharmacyId && window.ApotekKilatSupabaseData.getPharmacyId());
  }

  function canUpgradeToCloud(){
    const session = currentSession();
    return !!activeClient() && !!session && session.user && !cloudHasTenant() && typeof modal === 'function';
  }

  function localSummary(db){
    const source = db || getLocalDb();
    return {
      products: Array.isArray(source.products) ? source.products.length : 0,
      customers: Array.isArray(source.customers) ? source.customers.length : 0,
      transactions: Array.isArray(source.transactions) ? source.transactions.length : 0,
      purchaseOrders: Array.isArray(source.purchaseOrders) ? source.purchaseOrders.length : 0,
      priceLists: Array.isArray(source.priceLists) ? source.priceLists.length : 0
    };
  }

  function summaryText(db){
    const s = localSummary(db);
    return `Produk: ${s.products}, Pelanggan: ${s.customers}, Transaksi: ${s.transactions}, PO: ${s.purchaseOrders}, Price list: ${s.priceLists}`;
  }

  function resetUiState(){
    if(window.S){
      S.cart = [];
      S.cartCustomerId = null;
      S.selectedProductId = null;
      S.selectedCustomerId = null;
      S.selectedPrescriptionId = null;
      S.selectedPOId = null;
      S.activeConversationId = null;
      S.page = 'dashboard';
    }
  }

  function normalizeImportedDb(raw){
    if(!raw || typeof raw !== 'object') throw new Error('Backup kosong atau tidak valid');
    const data = raw.data && typeof raw.data === 'object' ? raw.data : raw;
    if(!data || typeof data !== 'object') throw new Error('Data backup tidak valid');

    const base = typeof seedData === 'function' ? seedData() : {};
    const next = Object.assign({}, base, data);
    const arrayKeys = [
      'products','customers','transactions','prescriptions','purchaseOrders','conversations',
      'priceLists','productUoms','productBatches','stockOpnames','returns','branches','users'
    ];
    arrayKeys.forEach(key=>{
      if(!Array.isArray(next[key])) next[key] = [];
    });
    if(!next.settings || typeof next.settings !== 'object'){
      next.settings = base.settings || {pharmacyName:'Apotek Baru',address:'',whatsapp:'',notifLowStock:true,notifExpiry:true,notifDailySummary:false};
    }
    if(!next.branches.length){
      next.branches = [{id:'b1', name:next.settings.pharmacyName || 'Apotek Baru', address:next.settings.address || '', isMain:true}];
    }
    if(!next.users.length){
      next.users = [{id:'u1', name:'Owner', branchId:next.branches[0].id || 'b1', role:'Owner', status:'Aktif'}];
    }
    if(!next.activeBranchId) next.activeBranchId = next.branches[0] && next.branches[0].id;
    return next;
  }

  function applyImportedDb(next){
    DB = next;
    if(typeof saveDB === 'function') saveDB();
    if(window.localStorage && typeof DB_KEY !== 'undefined') localStorage.setItem(DB_KEY, JSON.stringify(DB));
    resetUiState();
    if(typeof render === 'function') render();
    if(typeof updateHeader === 'function') updateHeader();
    if(typeof toast === 'function') toast('Backup berhasil di-import ke mode lokal');
    window.dispatchEvent(new CustomEvent('apotekkilat:local-imported', {detail:{summary:localSummary(DB)}}));
  }

  function exportLocalBackup(){
    try{
      const payload = {
        exported_at: new Date().toISOString(),
        app: 'ApotekKilat',
        purpose: 'manual-cloud-migration-backup',
        summary: localSummary(),
        data: getLocalDb()
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
      a.href = url;
      a.download = `apotekkilat-local-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 1000);
      toast('Backup data lokal berhasil dibuat');
    }catch(error){
      console.error(error);
      toast('Gagal membuat backup data lokal', 'err');
    }
  }

  function importLocalBackup(){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = function(){
      const file = input.files && input.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = function(){
        try{
          const payload = JSON.parse(String(reader.result || '{}'));
          const next = normalizeImportedDb(payload);
          const summary = localSummary(next);
          const before = localSummary();
          modal('Import Backup Lokal', `<div class="form">
            <p><b>Backup berhasil dibaca.</b></p>
            <p class="muted">Data aktif di mode lokal akan diganti dengan isi file backup ini. Proses ini tidak menghubungi cloud dan tidak mengaktifkan paket cloud.</p>
            <div class="card" style="box-shadow:none;background:#f6fffa;border-color:#b8ebcf">
              <p class="muted">Produk: <b style="color:var(--ink)">${summary.products}</b></p>
              <p class="muted">Pelanggan: <b style="color:var(--ink)">${summary.customers}</b></p>
              <p class="muted">Transaksi: <b style="color:var(--ink)">${summary.transactions}</b></p>
              <p class="muted">PO: <b style="color:var(--ink)">${summary.purchaseOrders}</b></p>
              <p class="muted">Price list: <b style="color:var(--ink)">${summary.priceLists}</b></p>
            </div>
            <p class="muted">Data lokal saat ini sebelum import: ${before.products} produk, ${before.customers} pelanggan, ${before.transactions} transaksi.</p>
            <p class="muted">Setelah import berhasil, kamu tetap bisa lanjut memakai mode lokal. Cloud hanya opsional untuk sinkronisasi, multi-device, dan backup online.</p>
          </div>`, function(){
            applyImportedDb(next);
            setTimeout(()=>{
              modal('Import Berhasil', `<div class="form">
                <p><b>Data lokal berhasil dipulihkan dari backup.</b></p>
                <p class="muted">Ringkasan data sekarang: ${summaryText(DB)}.</p>
                <div class="card" style="box-shadow:none;background:#fbfefd;border-color:#d8e3e5">
                  <p class="muted"><b style="color:var(--ink)">Opsional:</b> Pakai Cloud kalau ingin data bisa dibuka dari beberapa perangkat, lebih aman dari kehilangan cache browser, dan dibantu migrasi oleh support.</p>
                  <button type="button" class="outline" data-action="contact-cloud-wa">💬 Tanya Cloud</button>
                </div>
              </div>`, null, {hideSave:true});
            }, 0);
          }, {saveLabel:'Import Sekarang'});
        }catch(error){
          console.error(error);
          toast('File backup tidak valid', 'err');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function waUrl(kind){
    const session = currentSession();
    const email = session && session.user ? session.user.email : '';
    const db = getLocalDb();
    const name = db && db.settings ? db.settings.pharmacyName : '';
    const text = kind === 'improvement'
      ? `Halo, saya ingin memberi bantuan/saran improvement untuk ApotekKilat.%0A%0AEmail: ${encodeURIComponent(email || '-')}`
      : `Halo, saya ingin bertanya tentang Cloud ApotekKilat.%0A%0AMohon info langkah aktivasi, pembayaran, dan migrasi data lokal.%0A%0AEmail akun: ${encodeURIComponent(email || '-')}%0ANama apotek: ${encodeURIComponent(name || '-')}%0ARingkasan data lokal: ${encodeURIComponent(summaryText())}`;
    return `https://wa.me/${SUPPORT_WA}?text=${text}`;
  }

  function openWhatsApp(kind){
    window.open(waUrl(kind), '_blank', 'noopener');
  }

  function showLocalModeNotice(){
    if(cloudHasTenant()) return;
    const tip = document.querySelector('.tip p');
    if(tip) tip.textContent = 'Mode lokal aktif. Data tersimpan di perangkat ini. Aktivasi cloud dan migrasi data diverifikasi manual via WhatsApp.';
    const label = document.querySelector('#pharmacyLabel');
    const db = getLocalDb();
    if(label && (!db.settings || label.textContent === 'Sistem Manajemen Apotek')) label.textContent = 'Client Base — Mode Lokal';
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
    const session = currentSession();
    const email = session && session.user ? session.user.email : '';
    const s = localSummary();
    modal('Aktivasi Cloud', `<div class="form">
      <p><b>Aktivasi Cloud tidak dilakukan otomatis dari aplikasi.</b></p>
      <p class="muted">Untuk sementara, membership cloud dan migrasi data diverifikasi manual. Admin akan bantu aktivasi tenant cloud setelah pembayaran/verifikasi selesai.</p>
      <div class="card" style="background:#f6fffa;border-color:#b8ebcf;box-shadow:none">
        <div class="title"><span>Paket Cloud</span>${status('Verifikasi Manual','warn')}</div>
        <p class="muted">Estimasi paket awal: <b>Rp50.000/bulan</b>. Mode lokal tetap gratis dan data lokal tidak akan dihapus otomatis.</p>
        <p class="muted">Email akun login: <b style="color:var(--ink)">${esc(email || '-')}</b></p>
        <p class="muted">Data lokal terdeteksi: <b style="color:var(--ink)">${s.products}</b> produk, <b style="color:var(--ink)">${s.customers}</b> pelanggan, <b style="color:var(--ink)">${s.transactions}</b> transaksi.</p>
      </div>
      <p class="muted" style="margin-top:12px;font-weight:800;color:var(--ink)">Langkah 1 — Siapkan file backup dulu</p>
      <div style="display:flex;gap:8px">
        <button type="button" class="outline" style="flex:1" data-action="export-local-backup">📥 Backup</button>
        <button type="button" class="outline" style="flex:1" data-action="import-local-backup">Import Lokal</button>
      </div>
      <p class="muted" style="margin-top:14px;font-weight:800;color:var(--ink)">Langkah 2 — Hubungi admin kalau ingin pakai cloud</p>
      <button type="button" class="primary" style="width:100%" data-action="contact-cloud-wa">💬 Tanya Cloud</button>
      <p class="muted" style="margin-top:10px">Catatan: tombol ini tidak menjalankan RPC <code>create_pharmacy_tenant</code>. Produk dan pelanggan akan diprioritaskan untuk migrasi manual. Histori transaksi lama bisa tetap dilihat dari mode lokal sampai migrasi historis disiapkan.</p>
    </div>`, null, {hideSave:true});
  }

  document.addEventListener('click', function(e){
    const cloud = e.target.closest('[data-action="contact-cloud-wa"]');
    if(cloud){
      e.preventDefault();
      openWhatsApp('cloud');
      return;
    }
    const backup = e.target.closest('[data-action="export-local-backup"]');
    if(backup){
      e.preventDefault();
      exportLocalBackup();
      return;
    }
    const importer = e.target.closest('[data-action="import-local-backup"]');
    if(importer){
      e.preventDefault();
      importLocalBackup();
      return;
    }
    const improvement = e.target.closest('[data-action="contact-improvement-wa"]');
    if(improvement){
      e.preventDefault();
      openWhatsApp('improvement');
    }
  }, true);

  window.ApotekKilatTenantOnboarding = {openTenantUpgrade, canUpgradeToCloud, showLocalModeNotice, openWhatsApp, submitTenant, exportLocalBackup, importLocalBackup, localSummary};
  window.addEventListener('apotekkilat:local-mode', showLocalModeNotice);
  setInterval(showLocalModeNotice, 1200);
})();
