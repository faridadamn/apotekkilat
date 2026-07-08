/* P6 local product form fix — ensure UOM and golongan persist locally.
   UI-form persistence guard only. Does not change checkout, sync, RPC, or stock movement logic. */
(function(){
  const GOLONGAN = ['Bebas','Bebas Terbatas','Keras','Narkotika','Psikotropika'];

  function isProductModal(){
    const title = document.querySelector('#modalTitle')?.textContent || '';
    return /(Tambah Obat|Edit Obat)/i.test(title) && !!document.querySelector('#uName');
  }

  function isEditProductModal(){
    const title = document.querySelector('#modalTitle')?.textContent || '';
    return /Edit Obat/i.test(title) && !!document.querySelector('#uName');
  }

  function selectedProduct(){
    return DB.products.find(p=>p.id === (S && S.selectedProductId));
  }

  function ensureGolonganField(){
    if(!isProductModal() || document.querySelector('#drugGolongan')) return;
    const form = document.querySelector('#modalContent .form');
    if(!form) return;
    const current = selectedProduct()?.golongan || 'Bebas';
    const label = document.createElement('label');
    label.setAttribute('data-local-golongan-field','1');
    label.innerHTML = `Golongan Obat<select id="drugGolongan" required>${GOLONGAN.map(g=>`<option value="${g}" ${g === current ? 'selected' : ''}>${g}</option>`).join('')}</select>`;
    const cat = form.querySelector('#uCat')?.closest('label');
    if(cat && cat.nextSibling) form.insertBefore(label, cat.nextSibling);
    else form.appendChild(label);
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

  function rowHtml(unit, idx){
    const readonly = idx === 0 ? 'readonly' : '';
    const disabled = idx === 0 ? 'disabled' : '';
    return `<div class="uom-row" data-uom-row="${idx}" style="display:grid;grid-template-columns:1fr 1.3fr 1fr 1.2fr 1.2fr auto;gap:8px;align-items:end;margin-bottom:8px"><label>Kode<input class="u-code" value="${esc(unit.code || '')}" placeholder="STRIP" ${readonly}/></label><label>Nama Satuan<input class="u-label" value="${esc(unit.label || '')}" placeholder="Strip"/></label><label>Faktor<input class="u-factor" type="number" min="1" value="${unit.factorToBase || 1}" ${readonly}/></label><label>Harga Jual<input class="u-price" type="number" min="0" value="${unit.price || 0}"/></label><label>Harga Modal<input class="u-cost" type="number" min="0" value="${unit.cost || 0}"/></label><button type="button" class="danger-btn" data-uom-remove="${idx}" ${disabled}>×</button></div>`;
  }

  function redrawUnitRows(units){
    const wrap = document.querySelector('#uomRows');
    if(!wrap) return;
    wrap.innerHTML = units.map(rowHtml).join('');
    refreshUnitSelects(units);
    ensureGolonganField();
  }

  function refreshUnitSelects(units){
    ['#uPurchase', '#uSale'].forEach(sel=>{
      const select = document.querySelector(sel);
      if(!select) return;
      const current = select.value || units[0]?.code || '';
      select.innerHTML = units.map(u=>`<option value="${esc(u.code)}" ${u.code === current ? 'selected' : ''}>${esc(u.label)}</option>`).join('');
      if(!units.some(u=>u.code === current) && units[0]) select.value = units[0].code;
    });
  }

  function addUnitRow(){
    if(!isProductModal()) return false;
    const units = readUnitsSnapshot();
    units.push({code:'', label:'', factorToBase:1, price:0, cost:0});
    redrawUnitRows(units);
    const rows = document.querySelectorAll('[data-uom-row]');
    const last = rows[rows.length - 1];
    last?.querySelector('.u-code')?.focus();
    return true;
  }

  function removeUnitRow(index){
    if(!isProductModal() || index <= 0) return false;
    const units = readUnitsSnapshot();
    if(units.length <= 1) return false;
    units.splice(index, 1);
    redrawUnitRows(units);
    return true;
  }

  function snapshotProductForm(){
    if(!isProductModal()) return null;
    ensureGolonganField();
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
      golongan: document.querySelector('#drugGolongan')?.value || 'Bebas',
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

  function applySnapshot(snap, beforeIds){
    if(!snap || !window.DB || !Array.isArray(DB.products)) return;
    let product = DB.products.find(p=>p.id === snap.productId);
    if(!product && beforeIds) product = DB.products.find(p=>!beforeIds.has(p.id) && p.name === snap.name);
    if(!product) product = DB.products.find(p=>p.name === snap.name);
    if(!product) return;
    const payload = {...snap};
    delete payload.productId;
    Object.assign(product, payload);
    if(typeof saveDB === 'function') saveDB();
    if(typeof render === 'function') render();
  }

  const observer = new MutationObserver(()=>ensureGolonganField());
  observer.observe(document.body,{childList:true,subtree:true});

  document.addEventListener('click', function(e){
    const addBtn = e.target.closest('#uomAdd');
    if(addBtn && isProductModal()){
      ensureGolonganField();
      const before = document.querySelectorAll('[data-uom-row]').length;
      setTimeout(()=>{
        const after = document.querySelectorAll('[data-uom-row]').length;
        if(after <= before) addUnitRow();
      }, 0);
      return;
    }

    const removeBtn = e.target.closest('[data-uom-remove]');
    if(removeBtn && isProductModal()){
      const index = Number(removeBtn.dataset.uomRemove);
      setTimeout(()=>{
        if(document.querySelector(`[data-uom-row="${index}"]`)) removeUnitRow(index);
      }, 0);
      return;
    }

    const btn = e.target.closest('#modalSave');
    if(!btn || !isProductModal()) return;
    ensureGolonganField();
    const beforeIds = new Set((DB.products || []).map(p=>p.id));
    const snap = snapshotProductForm();
    if(!snap) return;
    setTimeout(()=>applySnapshot(snap, beforeIds), 0);
  }, true);

  window.ApotekKilatLocalEditProductFix = {snapshotProductForm, snapshotEditForm:snapshotProductForm, applySnapshot, addUnitRow, removeUnitRow, ensureGolonganField};
})();
