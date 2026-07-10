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

  /* Aksi ini permanen dan tidak bisa dibatalkan — sengaja dibuat lebih
     sulit diklik tidak sengaja daripada konfirmasi biasa: harus ketik
     "HAPUS" dulu sebelum tombol aktif, dan backup diarahkan dulu. */
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
        return false; // modal tetap terbuka
      }
      doClear();
    }, {saveLabel:'Hapus Permanen'});
  }

  function injectDeleteButton(){
    if(!window.S || S.page !== 'pengaturan') return;
    const reset = document.querySelector('[data-action="reset-data"]');
    if(!reset || document.querySelector('[data-action="clear-data"]')) return;
    // Sengaja dijauhkan secara visual dari "Reset ke Data Contoh" (baris baru +
    // pemisah) supaya tidak mudah salah klik antara dua aksi yang efeknya beda jauh.
    reset.insertAdjacentHTML('afterend', '<div style="margin-top:14px;padding-top:14px;border-top:1px dashed var(--line)"><p class="muted" style="margin-bottom:8px">Zona berbahaya — mengosongkan seluruh data lokal secara permanen:</p><button class="danger-btn" data-action="clear-data">🗑️ Hapus Semua Data</button></div>');
  }

  const oldRender = typeof render === 'function' ? render : null;
  if(oldRender){
    render = function(){
      const out = oldRender.apply(this, arguments);
      setTimeout(injectDeleteButton, 0);
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
