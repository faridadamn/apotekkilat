/* P6 B1 — Fix product and PO cloud sync gaps caused by multi-uom private handlers + disabled global snapshot sync.
   Scope: Products/UOM/Batches and new Purchase Orders only. Does not change checkout/compliance behavior. */
(function(){
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
  const uuid = () => crypto.randomUUID();
  const isUuid = id => UUID_RE.test(String(id || ''));
  const clone = v => JSON.parse(JSON.stringify(v || null));
  const n = v => Number(v) || 0;
  const cloudReady = () => !!(window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getMode && window.ApotekKilatSupabaseData.getMode() === 'cloud' && window.supabaseClient);
  const setSyncStatus = status => window.dispatchEvent(new CustomEvent('apotekkilat:sync-status', {detail:{status}}));

  const seenProducts = new Map();
  const seenPOs = new Set();
  let savingCloud = false;

  function ensureProductCloudIds(product){
    if(!product) return;
    if(!isUuid(product.id)) product.id = uuid();
    if(Array.isArray(product.units)) product.units.forEach(u=>{ if(u && !isUuid(u.id)) u.id = uuid(); });
    if(Array.isArray(product.batches)) product.batches.forEach(b=>{ if(b && !isUuid(b.id)) b.id = uuid(); });
  }

  function ensurePOCloudIds(po){
    if(!po) return;
    if(!isUuid(po.id)) po.id = uuid();
    if(Array.isArray(po.items)) po.items.forEach(i=>{ if(i && !isUuid(i.id)) i.id = uuid(); });
  }

  function productSignature(product){
    return JSON.stringify({
      id: product && product.id,
      name: product && product.name,
      cat: product && product.cat,
      type: product && product.type,
      price: n(product && product.price),
      cost: n(product && product.cost),
      stock: n(product && product.stock),
      reorder: n(product && product.reorder),
      expired: product && product.expired,
      supplierId: product && product.supplierId,
      supplier: product && product.supplier,
      baseUnit: product && product.baseUnit,
      purchaseUnit: product && product.purchaseUnit,
      saleUnit: product && product.saleUnit,
      units: (product && product.units || []).map(u=>({id:u.id,code:u.code,label:u.label,factorToBase:n(u.factorToBase),price:n(u.price),cost:n(u.cost),basePrice:u.basePrice==null?null:n(u.basePrice),isBase:!!u.isBase})),
      batches: (product && product.batches || []).map(b=>({id:b.id,batchNo:b.batchNo,received:b.received,expired:b.expired,qty:n(b.qty),location:b.location}))
    });
  }

  function refreshBaseline(){
    seenProducts.clear();
    (window.DB && DB.products || []).forEach(p=>seenProducts.set(p.id, {signature:productSignature(p), version:Number(p.version || 1)}));
    seenPOs.clear();
    (window.DB && DB.purchaseOrders || []).forEach(po=>seenPOs.add(po.id));
  }

  async function syncProduct(product, previous){
    ensureProductCloudIds(product);
    const api = window.ApotekKilatOptimisticConcurrency;
    const legacy = window.ApotekKilatEntityCrud;
    if(!previous){
      if(api && api.insertProductFromOutbox) return api.insertProductFromOutbox(product);
      if(legacy && legacy.writeProduct) return legacy.writeProduct(product, false);
    }
    const expectedVersion = previous && previous.version ? previous.version : Number(product.version || 1);
    if(api && api.updateProductFromOutbox) return api.updateProductFromOutbox(product, expectedVersion);
    if(legacy && legacy.writeProduct) return legacy.writeProduct(product, true);
  }

  async function syncPO(po){
    ensurePOCloudIds(po);
    if(window.ApotekKilatEntityCrud && window.ApotekKilatEntityCrud.createPurchaseOrder){
      return window.ApotekKilatEntityCrud.createPurchaseOrder(po);
    }
    throw new Error('Cloud PO handler belum tersedia');
  }

  async function syncDetectedChanges(changes){
    if(!cloudReady() || savingCloud || !changes.length) return;
    savingCloud = true;
    setSyncStatus('saving');
    try{
      for(const change of changes){
        if(change.type === 'product') await syncProduct(change.product, change.previous);
        if(change.type === 'po') await syncPO(change.po);
      }
      changes.forEach(change=>{
        if(change.type === 'product') seenProducts.set(change.product.id, {signature:productSignature(change.product), version:Number(change.product.version || (change.previous && change.previous.version) || 1)});
        if(change.type === 'po') seenPOs.add(change.po.id);
      });
      setSyncStatus('synced');
      if(typeof toast === 'function') toast('Data obat/PO tersinkron ke Supabase');
    }catch(err){
      console.error('P6 B1 cloud sync gagal:', err);
      setSyncStatus('error');
      if(typeof toast === 'function') toast(err.message || 'Gagal sync obat/PO ke Supabase', 'err');
    }finally{
      savingCloud = false;
    }
  }

  function detectProductAndPOChanges(){
    const changes = [];
    if(!window.DB) return changes;

    (DB.products || []).forEach(product=>{
      const oldId = product.id;
      const previous = seenProducts.get(oldId);
      if(cloudReady()) ensureProductCloudIds(product);
      const signature = productSignature(product);
      const previousAfterIdNormalize = previous || seenProducts.get(product.id);
      if(!previousAfterIdNormalize){
        changes.push({type:'product', product, previous:null});
      }else if(previousAfterIdNormalize.signature !== signature){
        changes.push({type:'product', product, previous:previousAfterIdNormalize});
      }
    });

    (DB.purchaseOrders || []).forEach(po=>{
      const oldId = po.id;
      if(cloudReady()) ensurePOCloudIds(po);
      if(!seenPOs.has(oldId) && !seenPOs.has(po.id)) changes.push({type:'po', po});
    });

    return changes;
  }

  const oldSaveDB = window.saveDB || saveDB;
  if(typeof oldSaveDB === 'function'){
    window.saveDB = saveDB = function(){
      const changes = detectProductAndPOChanges();
      const result = oldSaveDB.apply(this, arguments);
      if(changes.length) syncDetectedChanges(changes);
      return result;
    };
  }

  const multi = window.ApotekKilatMultiUomBridge || {};
  const oldAction = window.action || action;
  window.action = action = function(a, el){
    if(a === 'add-product' && typeof multi.openProductForm === 'function') return multi.openProductForm();
    if(a === 'edit-medicine' && typeof multi.openProductForm === 'function') return multi.openProductForm(DB.products.find(p=>p.id===S.selectedProductId));
    if(a === 'new-po' && typeof multi.openPOForm === 'function') return multi.openPOForm();
    return oldAction ? oldAction(a, el) : undefined;
  };

  refreshBaseline();
  window.ApotekKilatP6B1CloudSyncFix = {refreshBaseline, detectProductAndPOChanges};
})();
