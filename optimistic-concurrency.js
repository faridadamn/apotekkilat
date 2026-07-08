/* Phase P1.4.3 — Optimistic concurrency guard.
   Prevents legacy broad snapshot flush in cloud mode and uses version-aware updates for key master data. */
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

  openProductForm = function(existing){
    const p = existing || {};
    const expectedVersion = existing ? Number(existing.version || 1) : null;
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
        if(cloudReady()) existing ? await updateProductWithVersion(product, expectedVersion) : await insertProduct(product);
        localOnlySave(); render(); toast(existing?'Obat berhasil diperbarui':'Obat baru berhasil ditambahkan');
      }catch(err){ console.error(err); toast(err.message || 'Gagal menyimpan obat ke Supabase', 'err'); return false; }
    });
  };

  openCustomerForm = function(existing){
    const c = existing || {};
    const expectedVersion = existing ? Number(existing.version || 1) : null;
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
        if(cloudReady()) existing ? await updateCustomerWithVersion(customer, expectedVersion) : await insertCustomer(customer);
        localOnlySave(); render(); toast(existing?'Pelanggan diperbarui':'Pelanggan berhasil ditambahkan');
      }catch(err){ console.error(err); toast(err.message || 'Gagal menyimpan pelanggan ke Supabase', 'err'); return false; }
    });
  };

  if(window.ApotekKilatSupabaseData){
    const originalSchedule = window.ApotekKilatSupabaseData.scheduleSave;
    window.ApotekKilatSupabaseData.scheduleSave = function(db){
      localStorage.setItem(DB_KEY, JSON.stringify(db));
      if(cloudReady()){
        window.dispatchEvent(new CustomEvent('apotekkilat:sync-status', {detail:{status:'local-only'}}));
        return;
      }
      return originalSchedule ? originalSchedule(db) : undefined;
    };
  }

  const oldShowApp = showApp;
  showApp = async function(){
    await oldShowApp();
    await refreshVersions();
  };

  window.ApotekKilatOptimisticConcurrency = {refreshVersions};
})();
