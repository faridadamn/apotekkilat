/* Clear all local data without restoring demo/sample records. */
(function(){
  function makeEmptyDB(){
    const base = typeof seedData === 'function' ? seedData() : {};
    const current = DB || {};
    const settings = current.settings || base.settings || {
      pharmacyName: 'Apotek Baru',
      address: '',
      whatsapp: '',
      notifLowStock: true,
      notifExpiry: true,
      notifDailySummary: false
    };
    const branchName = settings.pharmacyName || 'Apotek Baru';
    const empty = Object.assign({}, base, current);

    Object.keys(empty).forEach(function(key){
      if(Array.isArray(empty[key])) empty[key] = [];
    });

    empty.products = [];
    empty.customers = [];
    empty.transactions = [];
    empty.prescriptions = [];
    empty.purchaseOrders = [];
    empty.conversations = [];
    empty.priceLists = [];
    empty.productUoms = [];
    empty.productBatches = [];
    empty.stockOpnames = [];
    empty.returns = [];

    empty.settings = settings;
    empty.branches = [{id:'b1', name: branchName, address: settings.address || '', isMain:true}];
    empty.users = [{id:'u1', name:'Owner', branchId:'b1', role:'Owner', status:'Aktif'}];
    empty.activeBranchId = 'b1';
    return empty;
  }

  function doClear(){
    DB = makeEmptyDB();
    if(typeof saveDB === 'function') saveDB();
    if(window.localStorage && typeof DB_KEY !== 'undefined') localStorage.setItem(DB_KEY, JSON.stringify(DB));
    if(window.S){
      S.cart = [];
      S.cartCustomerId = null;
      S.selectedProductId = null;
      S.selectedCustomerId = null;
      S.selectedPrescriptionId = null;
      S.activeConversationId = null;
      S.page = 'dashboard';
    }
    if(typeof render === 'function') render();
    if(typeof updateHeader === 'function') updateHeader();
    if(typeof toast === 'function') toast('Semua data sudah dikosongkan');
  }

  function localCounts(){
    const d = DB || {};
    const n = k => Array.isArray(d[k]) ? d[k].length : 0;
    return {products:n('products'), customers:n('customers'), transactions:n('transactions'), po:n('purchaseOrders')};
  }

  function clearAllData(){
    const c = localCounts();
    const html = `<div class="form">
      <p><b style="color:var(--red)">Aksi ini permanen. Tidak bisa dibatalkan.</b></p>
      <p class="muted">Data yang akan hilang: <b style="color:var(--ink)">${c.products}</b> produk, <b style="color:var(--ink)">${c.customers}</b> pelanggan, <b style="color:var(--ink)">${c.transactions}</b> transaksi, <b style="color:var(--ink)">${c.po}</b> PO.</p>
      <button type="button" class="outline" style="width:100%" data-action="export-local-backup">📥 Download Backup Dulu (disarankan)</button>
      <p class="muted" style="margin-top:14px">Kalau yakin, ketik <b style="color:var(--ink)">HAPUS</b> di bawah ini untuk mengaktifkan tombol hapus:</p>
      <input type="text" id="ak2ClearConfirmInput" placeholder="Ketik HAPUS" autocomplete="off"/>
    </div>`;
    modal('Hapus Semua Data', html, function(){
      const val = (document.querySelector('#ak2ClearConfirmInput')||{}).value || '';
      if(val.trim().toUpperCase() !== 'HAPUS'){
        if(typeof toast === 'function') toast('Ketik HAPUS dulu untuk konfirmasi', 'err');
        return false;
      }
      doClear();
    }, {saveLabel:'Hapus Permanen'});
  }

  function dangerZoneHtml(){
    return `<div id="ak2DangerZoneCard" class="card" style="margin-top:16px;border-color:#f2b4b8;background:#fffafa">
      <div class="title"><span>Zona Berbahaya</span>${typeof status === 'function' ? status('Permanen','expired') : ''}</div>
      <p class="muted">Gunakan ini hanya kalau ingin mengosongkan seluruh data lokal dan mulai dari nol. Berbeda dengan reset, fitur ini tidak memuat ulang data contoh.</p>
      <button class="danger-btn" data-action="clear-data">🗑️ Hapus Semua Data</button>
    </div>`;
  }

  function injectDeleteButton(){
    if(!window.S || S.page !== 'pengaturan') return;
    if(document.querySelector('#ak2DangerZoneCard')) return;
    const pages = document.querySelector('#pages');
    if(!pages) return;
    const settingsSection = pages.querySelector('section.page.active') || pages;
    settingsSection.insertAdjacentHTML('beforeend', dangerZoneHtml());
  }

  const oldRender = typeof render === 'function' ? render : null;
  if(oldRender){
    render = function(){
      const out = oldRender.apply(this, arguments);
      setTimeout(injectDeleteButton, 0);
      setTimeout(injectDeleteButton, 100);
      return out;
    };
  }

  document.addEventListener('click', function(e){
    const btn = e.target.closest('[data-action="clear-data"]');
    if(!btn) return;
    e.preventDefault();
    e.stopPropagation();
    clearAllData();
  }, true);

  window.ApotekKilatClearData = {clearAllData, injectDeleteButton, makeEmptyDB};
  setInterval(injectDeleteButton, 1200);
  setTimeout(injectDeleteButton, 0);
})();
