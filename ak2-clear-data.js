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

  function clearAllData(){
    const run = function(){
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
    };

    if(typeof confirmAction === 'function'){
      return confirmAction('Hapus semua data dan mulai dari kosong? Data contoh tidak akan dimuat ulang. Profil apotek tetap disimpan.', run);
    }
    if(window.confirm && window.confirm('Hapus semua data dan mulai dari kosong?')) run();
  }

  function injectDeleteButton(){
    if(!window.S || S.page !== 'pengaturan') return;
    const reset = document.querySelector('[data-action="reset-data"]');
    if(!reset || document.querySelector('[data-action="clear-data"]')) return;
    reset.insertAdjacentHTML('afterend', ' <button class="danger-btn" data-action="clear-data">Hapus</button>');
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
