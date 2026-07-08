/* P6 local edit product fix — ensure Edit Obat form persists name/UOM/golongan locally.
   UI-form persistence guard only. Does not change checkout, sync, RPC, or stock movement logic. */
(function(){
  function isEditProductModal(){
    const title = document.querySelector('#modalTitle')?.textContent || '';
    return /Edit Obat/i.test(title) && !!document.querySelector('#uName');
  }

  function readUnitsSnapshot(){
    return Array.from(document.querySelectorAll('[data-uom-row]')).map((row, idx)=>{
      const code = row.querySelector('.u-code')?.value || '';
      const label = row.querySelector('.u-label')?.value || '';
      return {
        code: String(code).trim().toUpperCase().replace(/[^A-Z0-9]/g,'') || ('U' + idx),
        label: String(label).trim() || 'Unit',
        factorToBase: Math.max(1, Number(row.querySelector('.u-factor')?.value) || 1),
        price: Number(row.querySelector('.u-price')?.value) || 0,
        cost: Number(row.querySelector('.u-cost')?.value) || 0
      };
    });
  }

  function snapshotEditForm(){
    if(!isEditProductModal()) return null;
    const units = readUnitsSnapshot();
    const name = document.querySelector('#uName')?.value.trim() || '';
    if(!name || !units.length || units[0].factorToBase !== 1) return null;
    if(new Set(units.map(u=>u.code)).size !== units.length) return null;
    const supplierId = document.querySelector('#uSupplier')?.value || '';
    const supplier = (DB.suppliers || []).find(s=>s.id === supplierId);
    const base = units[0];
    return {
      productId: S && S.selectedProductId,
      name,
      cat: document.querySelector('#uCat')?.value || 'Lainnya',
      golongan: document.querySelector('#drugGolongan')?.value || null,
      type: base.label,
      units,
      baseUnit: base.code,
      purchaseUnit: document.querySelector('#uPurchase')?.value || base.code,
      saleUnit: document.querySelector('#uSale')?.value || base.code,
      price: base.price,
      cost: base.cost,
      reorder: Number(document.querySelector('#uReorder')?.value) || 20,
      expired: document.querySelector('#uExpired')?.value || new Date(Date.now()+365*86400000).toISOString().slice(0,10),
      supplierId: supplierId,
      supplier: supplier?.name || ''
    };
  }

  function applySnapshot(snap){
    if(!snap || !window.DB || !Array.isArray(DB.products)) return;
    const product = DB.products.find(p=>p.id === snap.productId) || DB.products.find(p=>p.name === snap.name);
    if(!product) return;
    const payload = {...snap};
    delete payload.productId;
    if(!payload.golongan) delete payload.golongan;
    Object.assign(product, payload);
    if(typeof saveDB === 'function') saveDB();
    if(typeof render === 'function') render();
  }

  document.addEventListener('click', function(e){
    const btn = e.target.closest('#modalSave');
    if(!btn || !isEditProductModal()) return;
    const snap = snapshotEditForm();
    if(!snap) return;
    setTimeout(()=>applySnapshot(snap), 0);
  }, true);

  window.ApotekKilatLocalEditProductFix = {snapshotEditForm, applySnapshot};
})();
