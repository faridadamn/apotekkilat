/* Phase P1.4.3/4.4 — Optimistic concurrency + local outbox for non-critical master-data edits. */
(function(){
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const uuid = () => crypto.randomUUID();
  const isUuid = id => UUID_RE.test(String(id || ''));
  const n = v => Number(v) || 0;
  const CONFLICT_MESSAGE = 'Data telah diubah user lain. Muat ulang sebelum menyimpan.';

  function cloudReady(){
    return !!(window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getMode && window.ApotekKilatSupabaseData.getMode() === 'cloud' && supabaseClient);
  }
  function pharmacyId(){ return window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getPharmacyId ? window.ApotekKilatSupabaseData.getPharmacyId() : null; }
  function cloudId(prefix){ return cloudReady() ? uuid() : uid(prefix); }
  function localOnlySave(){ localStorage.setItem(DB_KEY, JSON.stringify(DB)); }
  function bumpLocalVersion(row, returned){ if(row && returned && returned.version) row.version = returned.version; }
  function isConflict(err){ return err && String(err.message || err).includes(CONFLICT_MESSAGE); }
  function canQueue(err){ return !isConflict(err) && window.ApotekKilatSyncOutbox && (!navigator.onLine || err); }

  async function refreshVersions(){
    if(!cloudReady()) return;
    const [products, customers] = await Promise.all([
      supabaseClient.from('products').select('id,version,updated_at,updated_by'),
      supabaseClient.from('customers').select('id,version,updated_at,updated_by')
    ]);
    if(!products.error && Array.isArray(products.data)){
      products.data.forEach(r=>{ const p=DB.products.find(x=>x.id===r.id); if(p) Object.assign(p,{version:r.version,updatedAt:r.updated_at,updatedBy:r.updated_by}); });
    }
    if(!customers.error && Array.isArray(customers.data)){
      customers.data.forEach(r=>{ const c=DB.customers.find(x=>x.id===r.id); if(c) Object.assign(c,{version:r.version,updatedAt:r.updated_at,updatedBy:r.updated_by}); });
    }
    localOnlySave();
  }

  async function insertProduct(product){
    const pid = pharmacyId();
    const payload = {
      id: product.id, pharmacy_id: pid, supplier_id: isUuid(product.supplierId) ? product.supplierId : null,
      name: product.name, type: product.type || null, category: product.cat || null,
      price: n(product.price), cost: n(product.cost), stock: n(product.stock), reorder_point: n(product.reorder) || 20,
      base_unit: product.baseUnit || 'UNIT', purchase_unit: product.purchaseUnit || product.baseUnit || null, sale_unit: product.saleUnit || product.baseUnit || null,
      default_batch_no: product.batch || null, default_expired_at: product.expired || null, drug_class: product.golongan || 'Bebas'
    };
    const {data, error} = await supabaseClient.from('products').insert(payload).select('version,updated_at,updated_by').single();
    if(error) throw error;
    bumpLocalVersion(product, data);

    const uoms = product.units && product.units.length ? product.units : [{id:uuid(),code:product.baseUnit||'UNIT',label:product.baseUnit||'Unit',factorToBase:1,price:product.price,cost:product.cost,isBase:true}];
    const uomRows = uoms.map((u,i)=>({
      id: isUuid(u.id) ? u.id : (u.id = uuid()), pharmacy_id: pid, product_id: product.id,
      code: u.code || product.baseUnit || 'UNIT', label: u.label || u.code || 'Unit', factor_to_base: n(u.factorToBase)||1,
      price: u.price==null ? null : n(u.price), cost: u.cost==null ? null : n(u.cost), base_price: u.basePrice==null ? null : n(u.basePrice),
      is_base: !!u.isBase || i===0, sort_order: i
    }));
    const uom = await supabaseClient.from('product_uoms').upsert(uomRows, {onConflict:'id'});
    if(uom.error) throw uom.error;

    if(product.batches && product.batches.length){
      const batchRows = product.batches.map(b=>({
        id: isUuid(b.id) ? b.id : (b.id = uuid()), pharmacy_id: pid, product_id: product.id,
        batch_no: b.batchNo || product.batch || ('BATCH-'+Date.now()), received_at: b.received || new Date().toISOString().slice(0,10),
        expired_at: b.expired || product.expired || null, qty: n(b.qty), location: b.location || 'Gudang Pusat'
      }));
      const batch = await supabaseClient.from('product_batches').insert(batchRows);
      if(batch.error) throw batch.error;
    }
  }

  async function updateProductWithVersion(product, expectedVersion){
    const payload = {
      supplier_id: isUuid(product.supplierId) ? product.supplierId : null,
      name: product.name, type: product.type || null, category: product.cat || null,
      price: n(product.price), cost: n(product.cost), stock: n(product.stock), reorder_point: n(product.reorder) || 20,
      base_unit: product.baseUnit || 'UNIT', purchase_unit: product.purchaseUnit || product.baseUnit || null, sale_unit: product.saleUnit || product.baseUnit || null,
      default_batch_no: product.batch || null, default_expired_at: product.expired || null, drug_class: product.golongan || 'Bebas'
    };
    const {data, error} = await supabaseClient.from('products')
      .update(payload)
      .eq('id', product.id)
      .eq('version', expectedVersion)
      .select('version,updated_at,updated_by');
    if(error) throw error;
    if(!data || data.length === 0) throw new Error(CONFLICT_MESSAGE);
    bumpLocalVersion(product, data[0]);
  }

  async function insertBatch(product, batch){
    const insert = await supabaseClient.from('product_batches').insert({
      id: batch.id, pharmacy_id: pharmacyId(), product_id: product.id,
      batch_no: batch.batchNo, received_at: batch.received, expired_at: batch.expired || null,
      qty: n(batch.qty), location: batch.location || 'Gudang Pusat'
    });
    if(insert.error) throw insert.error;
    const upd = await supabaseClient.from('products').update({stock:n(product.stock)}).eq('id', product.id);
    if(upd.error) throw upd.error;
  }

  async function insertCustomer(customer){
    const {data,error} = await supabaseClient.from('customers').insert({
      id: customer.id, pharmacy_id: pharmacyId(), name: customer.name, phone: customer.phone || null,
      points: n(customer.points), status: customer.status || 'Aktif', payment_term: customer.paymentTerm || null
    }).select('version,updated_at,updated_by').single();
    if(error) throw error;
    bumpLocalVersion(customer, data);
  }

  async function updateCustomerWithVersion(customer, expectedVersion){
    const {data,error} = await supabaseClient.from('customers')
      .update({name:customer.name, phone:customer.phone || null, points:n(customer.points), status:customer.status || 'Aktif', payment_term:customer.paymentTerm || null})
      .eq('id', customer.id)
      .eq('version', expectedVersion)
      .select('version,updated_at,updated_by');
    if(error) throw error;
    if(!data || data.length === 0) throw new Error(CONFLICT_MESSAGE);
    bumpLocalVersion(customer, data[0]);
  }

  async function saveOrQueue(actionType, payload, fn){
    try{
      if(cloudReady() && navigator.onLine) await fn();
      else throw new Error('Offline');
      if(window.ApotekKilatSyncOutbox) window.ApotekKilatSyncOutbox.setStatus('synced');
      return 'synced';
    }catch(err){
      if(isConflict(err)) throw err;
      if(canQueue(err)){
        window.ApotekKilatSyncOutbox.enqueue(actionType, payload, err);
        return 'queued';
      }
      throw err;
    }
  }

  openProductForm = function(existing){
    const p = existing || {};
    const expectedVersion = existing ? Number(existing.version || 1) : null;
    const snapshot = existing ? JSON.parse(JSON.stringify(existing)) : null;
    modal(existing?'Edit Obat':'Tambah Obat', `<div class="form">
      ${existing?`<p class="muted">Version saat dibaca: ${expectedVersion}</p>`:''}
      <label>Nama Obat<input id="fName" value="${esc(p.name||'')}" placeholder="Contoh: Cetirizine 10mg"/></label>
      <label>Kategori<select id="fCat">${['Antihistamin','Analgesik','Antibiotik','Suplemen','Herbal'].map(c=>`<option ${p.cat===c?'selected':''}>${c}</option>`).join('')}</select></label>
      <label>Jenis<input id="fType" value="${esc(p.type||'Tablet')}" placeholder="Tablet / Kapsul / Sirup"/></label>
      <label>Harga Jual<input id="fPrice" type="number" value="${p.price||''}" placeholder="5000"/></label>
      <label>Harga Modal<input id="fCost" type="number" value="${p.cost||''}" placeholder="3000"/></label>
      <label>Stok Awal<input id="fStock" type="number" value="${p.stock!=null?p.stock:''}" placeholder="20" ${existing?'disabled':''}/></label>
      <label>Titik Reorder<input id="fReorder" type="number" value="${p.reorder||20}"/></label>
      <label>Tanggal Expired<input id="fExpired" type="date" value="${p.expired||''}"/></label>
      <label>Supplier<input id="fSupplier" value="${esc(p.supplier||'')}"/></label>
    </div>`, async ()=>{
      const name=document.querySelector('#fName').value.trim();
      const price=Number(document.querySelector('#fPrice').value);
      if(!name) return toast('Nama obat wajib diisi','err'), false;
      if(!price || price<=0) return toast('Harga jual harus lebih dari 0','err'), false;
      const expired=document.querySelector('#fExpired').value || new Date(Date.now()+365*86400000).toISOString().slice(0,10);
      let product;
      if(existing){
        Object.assign(existing,{name,cat:document.querySelector('#fCat').value,type:document.querySelector('#fType').value||'Tablet',price,cost:Number(document.querySelector('#fCost').value)||0,reorder:Number(document.querySelector('#fReorder').value)||20,expired,supplier:document.querySelector('#fSupplier').value});
        product = existing;
      } else {
        const stock=Number(document.querySelector('#fStock').value)||0;
        const batchNo='NEW-'+String(Date.now()).slice(-5);
        product = {id:cloudId('p'),name,type:document.querySelector('#fType').value||'Tablet',cat:document.querySelector('#fCat').value,price,cost:Number(document.querySelector('#fCost').value)||0,stock,reorder:Number(document.querySelector('#fReorder').value)||20,batch:batchNo,expired,supplier:document.querySelector('#fSupplier').value,baseUnit:'UNIT',purchaseUnit:'UNIT',saleUnit:'UNIT',units:[{id:cloudId('uom'),code:'UNIT',label:'Unit',factorToBase:1,price,cost:Number(document.querySelector('#fCost').value)||0,isBase:true}],batches:[{id:cloudId('pb'),batchNo,received:new Date().toISOString().slice(0,10),expired,qty:stock,location:'Gudang Pusat'}]};
        DB.products.push(product);
      }
      try{
        const state = await saveOrQueue(existing?'product.update':'product.insert', {product:JSON.parse(JSON.stringify(product)), expectedVersion}, ()=> existing ? updateProductWithVersion(product, expectedVersion) : insertProduct(product));
        localOnlySave(); render(); toast(state==='queued'?'Obat tersimpan lokal dan diantrikan':'Obat berhasil disimpan');
      }catch(err){
        if(snapshot) Object.assign(existing, snapshot);
        else DB.products = DB.products.filter(x=>x.id!==product.id);
        console.error(err); toast(err.message || 'Gagal menyimpan obat ke Supabase', 'err'); return false;
      }
    });
  };

  openBatchForm = function(){
    const p = DB.products.find(x=>x.id===S.selectedProductId); if(!p) return;
    modal('Tambah Batch', `<div class="form">
      <label>No. Batch<input id="bNo" placeholder="BCH-${Date.now().toString().slice(-6)}"/></label>
      <label>Jumlah<input id="bQty" type="number" placeholder="50"/></label>
      <label>Tanggal Expired<input id="bExp" type="date"/></label>
      <label>Lokasi<input id="bLoc" value="Gudang Pusat"/></label>
    </div>`, async ()=>{
      const qty=Number(document.querySelector('#bQty').value);
      if(!qty || qty<=0) return toast('Jumlah harus lebih dari 0','err'), false;
      const oldStock = n(p.stock);
      const batch = {id:cloudId('pb'), batchNo:document.querySelector('#bNo').value.trim()||('BCH-'+String(Date.now()).slice(-6)), received:new Date().toISOString().slice(0,10), expired:document.querySelector('#bExp').value || p.expired, qty, location:document.querySelector('#bLoc').value||'Gudang Pusat'};
      p.batches = p.batches||[]; p.batches.push(batch); p.stock = oldStock + qty;
      try{
        const state = await saveOrQueue('batch.insert', {product:JSON.parse(JSON.stringify(p)), batch:JSON.parse(JSON.stringify(batch))}, ()=>insertBatch(p,batch));
        localOnlySave(); render(); toast(state==='queued'?'Batch tersimpan lokal dan diantrikan':'Batch baru ditambahkan, stok diperbarui');
      }catch(err){ p.stock = oldStock; p.batches = p.batches.filter(x=>x.id!==batch.id); console.error(err); toast(err.message || 'Gagal menyimpan batch', 'err'); return false; }
    });
  };

  openCustomerForm = function(existing){
    const c = existing || {};
    const expectedVersion = existing ? Number(existing.version || 1) : null;
    const snapshot = existing ? JSON.parse(JSON.stringify(existing)) : null;
    modal(existing?'Edit Pelanggan':'Tambah Pelanggan', `<div class="form">
      ${existing?`<p class="muted">Version saat dibaca: ${expectedVersion}</p>`:''}
      <label>Nama<input id="cName" value="${esc(c.name||'')}" placeholder="Nama pelanggan"/></label>
      <label>Nomor WhatsApp<input id="cPhone" value="${esc(c.phone||'')}" placeholder="0812..."/></label>
    </div>`, async ()=>{
      const name = document.querySelector('#cName').value.trim();
      if(!name) return toast('Nama wajib diisi','err'), false;
      let customer;
      if(existing){ existing.name=name; existing.phone=document.querySelector('#cPhone').value||existing.phone; customer = existing; }
      else { customer = {id:cloudId('c'), name, phone:document.querySelector('#cPhone').value||'-', points:0, status:'Aktif'}; DB.customers.unshift(customer); }
      try{
        const state = await saveOrQueue(existing?'customer.update':'customer.insert', {customer:JSON.parse(JSON.stringify(customer)), expectedVersion}, ()=> existing ? updateCustomerWithVersion(customer, expectedVersion) : insertCustomer(customer));
        localOnlySave(); render(); toast(state==='queued'?'Pelanggan tersimpan lokal dan diantrikan':(existing?'Pelanggan diperbarui':'Pelanggan berhasil ditambahkan'));
      }catch(err){
        if(snapshot) Object.assign(existing, snapshot);
        else DB.customers = DB.customers.filter(x=>x.id!==customer.id);
        console.error(err); toast(err.message || 'Gagal menyimpan pelanggan ke Supabase', 'err'); return false;
      }
    });
  };

  if(window.ApotekKilatSupabaseData){
    const originalSchedule = window.ApotekKilatSupabaseData.scheduleSave;
    window.ApotekKilatSupabaseData.scheduleSave = function(db){
      localStorage.setItem(DB_KEY, JSON.stringify(db));
      if(cloudReady()){
        if(window.ApotekKilatSyncOutbox) window.ApotekKilatSyncOutbox.update('synced');
        return;
      }
      return originalSchedule ? originalSchedule(db) : undefined;
    };
  }

  const oldShowApp = showApp;
  showApp = async function(){
    await oldShowApp();
    await refreshVersions();
    if(window.ApotekKilatSyncOutbox) window.ApotekKilatSyncOutbox.process();
  };

  window.ApotekKilatOptimisticConcurrency = {
    refreshVersions,
    insertProductFromOutbox: insertProduct,
    updateProductFromOutbox: updateProductWithVersion,
    insertBatchFromOutbox: insertBatch,
    insertCustomerFromOutbox: insertCustomer,
    updateCustomerFromOutbox: updateCustomerWithVersion
  };
})();
