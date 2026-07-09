/* Phase P1.4.2 — Route UI writes to per-entity CRUD/RPC targets.
   Local state remains responsive; cloud mode writes the changed entity/workflow directly. */
(function(){
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const previousCheckout = typeof checkout === 'function' ? checkout : null;
  const uuid = () => crypto.randomUUID();
  const isUuid = id => UUID_RE.test(String(id || ''));
  const n = v => Number(v) || 0;
  const ts = v => v ? new Date(v).toISOString() : new Date().toISOString();

  function cloudReady(){
    return !!(window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getMode && window.ApotekKilatSupabaseData.getMode() === 'cloud' && supabaseClient);
  }
  function pharmacyId(){ return window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getPharmacyId ? window.ApotekKilatSupabaseData.getPharmacyId() : null; }
  function cloudId(prefix){ return cloudReady() ? uuid() : uid(prefix); }
  function localOnlySave(){ localStorage.setItem(DB_KEY, JSON.stringify(DB)); }
  function activeBranchId(){ return DB.activeBranchId || ((DB.branches || [])[0] && DB.branches[0].id) || null; }

  async function writeProduct(product, existing){
    if(!cloudReady()) return;
    const pid = pharmacyId();
    const productPayload = {
      id: product.id,
      pharmacy_id: pid,
      supplier_id: isUuid(product.supplierId) ? product.supplierId : null,
      name: product.name,
      type: product.type || null,
      category: product.cat || null,
      price: n(product.price),
      cost: n(product.cost),
      stock: n(product.stock),
      reorder_point: n(product.reorder) || 20,
      base_unit: product.baseUnit || 'UNIT',
      purchase_unit: product.purchaseUnit || product.baseUnit || null,
      sale_unit: product.saleUnit || product.baseUnit || null,
      default_batch_no: product.batch || null,
      default_expired_at: product.expired || null,
      drug_class: product.golongan || 'Bebas'
    };
    const res = existing
      ? await supabaseClient.from('products').update(productPayload).eq('id', product.id)
      : await supabaseClient.from('products').insert(productPayload);
    if(res.error) throw res.error;

    const uoms = product.units && product.units.length ? product.units : [{id:uuid(),code:product.baseUnit||'UNIT',label:product.baseUnit||'Unit',factorToBase:1,price:product.price,cost:product.cost,isBase:true}];
    const uomRows = uoms.map((u,i)=>({
      id: isUuid(u.id) ? u.id : (u.id = uuid()), pharmacy_id: pid, product_id: product.id,
      code: u.code || product.baseUnit || 'UNIT', label: u.label || u.code || 'Unit', factor_to_base: n(u.factorToBase)||1,
      price: u.price==null ? null : n(u.price), cost: u.cost==null ? null : n(u.cost), base_price: u.basePrice==null ? null : n(u.basePrice),
      is_base: !!u.isBase || i===0, sort_order: i
    }));
    const uom = await supabaseClient.from('product_uoms').upsert(uomRows, {onConflict:'id'});
    if(uom.error) throw uom.error;

    if(!existing && product.batches && product.batches.length){
      const batchRows = product.batches.map(b=>({
        id: isUuid(b.id) ? b.id : (b.id = uuid()), pharmacy_id: pid, product_id: product.id,
        batch_no: b.batchNo || product.batch || ('BATCH-'+Date.now()), received_at: b.received || new Date().toISOString().slice(0,10),
        expired_at: b.expired || product.expired || null, qty: n(b.qty), location: b.location || 'Gudang Pusat'
      }));
      const batch = await supabaseClient.from('product_batches').insert(batchRows);
      if(batch.error) throw batch.error;
    }
  }

  async function writeBatch(product, batch){
    if(!cloudReady()) return;
    const pid = pharmacyId();
    if(!isUuid(batch.id)) batch.id = uuid();
    const insert = await supabaseClient.from('product_batches').insert({
      id: batch.id,
      pharmacy_id: pid,
      product_id: product.id,
      batch_no: batch.batchNo,
      received_at: batch.received,
      expired_at: batch.expired || null,
      qty: n(batch.qty),
      location: batch.location || 'Gudang Pusat'
    });
    if(insert.error) throw insert.error;
    const upd = await supabaseClient.from('products').update({stock:n(product.stock), updated_at:new Date().toISOString()}).eq('id', product.id);
    if(upd.error) throw upd.error;
  }

  async function writeCustomer(customer, existing){
    if(!cloudReady()) return;
    const payload = {
      id: customer.id,
      pharmacy_id: pharmacyId(),
      name: customer.name,
      phone: customer.phone || null,
      points: n(customer.points),
      status: customer.status || 'Aktif',
      payment_term: customer.paymentTerm || null
    };
    const res = existing
      ? await supabaseClient.from('customers').update(payload).eq('id', customer.id)
      : await supabaseClient.from('customers').insert(payload);
    if(res.error) throw res.error;
  }

  async function rpcCreatePO(po){
    if(!cloudReady()) return;
    const payload = {
      id: po.id,
      pharmacy_id: pharmacyId(),
      supplier_id: po.supplierId || null,
      supplier_name: po.supplier || null,
      code: po.code,
      note: po.note || null,
      status: po.status || 'Draft',
      ordered_at: ts(po.date),
      items: (po.items||[]).map(i=>({
        id: isUuid(i.id) ? i.id : (i.id = uuid()),
        product_id: i.productId || null,
        qty: n(i.qty),
        display_qty: i.displayQty==null ? n(i.qty) : n(i.displayQty),
        unit_code: i.unitCode || null,
        unit_label: i.unitLabel || null,
        cost: n(i.cost),
        expired_at: i.expired || null
      }))
    };
    const {error} = await supabaseClient.rpc('create_purchase_order', {p_payload: payload});
    if(error) throw error;
  }

  function normalizeCheckoutItems(){
    return (S.cart || []).map(c=>{
      const p = DB.products.find(x=>x.id===c.id || x.id===c.productId);
      if(!p) throw new Error('Produk di keranjang tidak ditemukan.');
      const qty = n(c.q || c.qty || c.baseQty);
      if(qty <= 0) throw new Error(`Qty ${p.name} tidak valid.`);
      return {
        product_id: p.id,
        unit_code: c.unitCode || p.saleUnit || p.baseUnit || null,
        qty,
        _local_product: p
      };
    });
  }

  function requirePrescriptionForRestricted(items){
    const restricted = items.map(i=>i._local_product).filter(p=>['Keras','Narkotika','Psikotropika'].includes(p && p.golongan));
    if(!restricted.length) return true;
    const rxId = S.cartPrescriptionId || S.selectedPrescriptionId || S.cartRxId || null;
    if(!rxId){ toast('Obat keras/narkotika/psikotropika wajib memakai resep terverifikasi.', 'err'); return false; }
    const rx = (DB.prescriptions || []).find(r=>r.id===rxId && ['Diproses','Siap Diambil','Selesai','Terverifikasi'].includes(r.status));
    if(!rx){ toast('Resep belum terverifikasi atau tidak ditemukan.', 'err'); return false; }
    const missing = restricted.find(p=>!(rx.items || []).some(it=>it.productId===p.id || String(it.name||'').trim().toLowerCase()===String(p.name||'').trim().toLowerCase()));
    if(missing){ toast(`Resep terpilih tidak memuat ${missing.name}.`, 'err'); return false; }
    return rxId;
  }

  async function rpcCheckout(payload){
    if(!cloudReady()) return null;
    const {data, error} = await supabaseClient.rpc('checkout_transaction', {p_payload: payload});
    if(error) throw error;
    return Array.isArray(data) ? (data[0] || {}) : (data || {});
  }

  function friendlyCheckoutError(err){
    const msg = String((err && err.message) || err || 'Checkout gagal di Supabase');
    if(/branch_id is required|branch/i.test(msg)) return 'Cabang aktif cloud tidak valid. Pilih cabang cloud dulu.';
    if(/idempotency_key/i.test(msg)) return 'Checkout gagal karena kunci transaksi tidak valid. Coba ulang transaksi.';
    if(/prescription|resep/i.test(msg)) return 'Resep belum valid untuk obat yang dipilih.';
    if(/stock|stok/i.test(msg)) return 'Stok tidak cukup atau sudah berubah di server. Refresh data lalu coba lagi.';
    return msg;
  }

  async function rpcCompleteReturn(kind, id){
    if(!cloudReady()) return;
    const {error} = await supabaseClient.rpc('complete_return', {p_return_kind: kind, p_return_id: id});
    if(error) throw error;
  }

  async function rpcPostStockOpname(id){
    if(!cloudReady()) return;
    const {error} = await supabaseClient.rpc('post_stock_opname', {p_stock_opname_id: id});
    if(error) throw error;
  }

  openProductForm = function(existing){
    const p = existing || {};
    modal(existing?'Edit Obat':'Tambah Obat', `<div class="form">
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
      try{ await writeProduct(product, !!existing); localOnlySave(); render(); toast(existing?'Obat berhasil diperbarui':'Obat baru berhasil ditambahkan'); }
      catch(err){ console.error(err); toast(err.message || 'Gagal menyimpan obat ke Supabase', 'err'); return false; }
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
      const batch = {id:cloudId('pb'), batchNo:document.querySelector('#bNo').value.trim()||('BCH-'+String(Date.now()).slice(-6)), received:new Date().toISOString().slice(0,10), expired:document.querySelector('#bExp').value || p.expired, qty, location:document.querySelector('#bLoc').value||'Gudang Pusat'};
      p.batches = p.batches||[];
      p.batches.push(batch);
      p.stock += qty;
      try{ await writeBatch(p, batch); localOnlySave(); render(); toast('Batch baru ditambahkan, stok diperbarui'); }
      catch(err){ console.error(err); toast(err.message || 'Gagal menyimpan batch ke Supabase', 'err'); return false; }
    });
  };

  openCustomerForm = function(existing){
    const c = existing || {};
    modal(existing?'Edit Pelanggan':'Tambah Pelanggan', `<div class="form">
      <label>Nama<input id="cName" value="${esc(c.name||'')}" placeholder="Nama pelanggan"/></label>
      <label>Nomor WhatsApp<input id="cPhone" value="${esc(c.phone||'')}" placeholder="0812..."/></label>
    </div>`, async ()=>{
      const name = document.querySelector('#cName').value.trim();
      if(!name) return toast('Nama wajib diisi','err'), false;
      let customer;
      if(existing){ existing.name=name; existing.phone=document.querySelector('#cPhone').value||existing.phone; customer = existing; }
      else { customer = {id:cloudId('c'), name, phone:document.querySelector('#cPhone').value||'-', points:0, status:'Aktif'}; DB.customers.unshift(customer); }
      try{ await writeCustomer(customer, !!existing); localOnlySave(); render(); toast(existing?'Pelanggan diperbarui':'Pelanggan berhasil ditambahkan'); }
      catch(err){ console.error(err); toast(err.message || 'Gagal menyimpan pelanggan ke Supabase', 'err'); return false; }
    });
  };

  checkout = async function(){
    if(!cloudReady()) return previousCheckout ? previousCheckout() : toast('Checkout tidak tersedia', 'err');
    if(!S.cart || !S.cart.length) return toast('Keranjang masih kosong','err');
    const branchId = activeBranchId();
    if(!isUuid(branchId)) return toast('Cabang aktif cloud tidak valid. Pilih cabang cloud dulu.', 'err');
    let items;
    try{ items = normalizeCheckoutItems(); }
    catch(err){ return toast(err.message, 'err'); }
    const prescriptionId = requirePrescriptionForRestricted(items);
    if(prescriptionId === false) return;
    const idempotencyKey = uuid();
    const payload = {
      branch_id: branchId,
      customer_id: isUuid(S.cartCustomerId) ? S.cartCustomerId : null,
      payment_method: S.paymentMethod || 'Tunai',
      prescription_id: isUuid(prescriptionId) ? prescriptionId : null,
      idempotency_key: idempotencyKey,
      items: items.map(i=>({product_id:i.product_id, unit_code:i.unit_code, qty:i.qty}))
    };
    let result;
    try{ result = await rpcCheckout(payload); }
    catch(err){ console.error(err); return toast(friendlyCheckoutError(err), 'err'); }

    const responseItems = Array.isArray(result.items) ? result.items : items.map(i=>({product_id:i.product_id, unit_code:i.unit_code, qty:i.qty}));
    const txItems = responseItems.map(row=>{
      const p = DB.products.find(x=>x.id === (row.product_id || row.productId));
      const qty = n(row.qty);
      const baseQty = n(row.base_qty || row.baseQty || qty);
      if(p) p.stock = Math.max(0, n(p.stock) - baseQty);
      return {
        id: row.id || uuid(), productId: row.product_id || row.productId, name: row.product_name || row.name || (p && p.name) || 'Produk',
        unitCode: row.unit_code || row.unitCode || (p && p.saleUnit) || null, qty, baseQty,
        price: n(row.price), costBase: row.cost_base==null ? null : n(row.cost_base), originalPrice: row.original_price==null ? undefined : n(row.original_price),
        discountAmount: n(row.discount_amount), priceListId: row.price_list_id || null, priceListName: row.price_list_name || null,
        golongan: row.drug_class || (p && p.golongan) || null
      };
    });
    const tx = {
      id: result.transaction_id || result.id || uuid(), code: result.code || ('TRX-'+String(Date.now()).slice(-9)),
      customerId: payload.customer_id, branchId, items: txItems,
      subtotal: n(result.subtotal), tax: n(result.tax || result.vat_total), total: n(result.total),
      payment: payload.payment_method, time: Date.now(), status: result.status || 'Selesai', prescriptionId: payload.prescription_id,
      idempotencyKey
    };
    DB.transactions.push(tx);
    if(S.cartCustomerId){ const cust = DB.customers.find(c=>c.id===S.cartCustomerId); if(cust) cust.points += Math.floor(tx.total/10000); }
    localOnlySave();
    const custName = S.cartCustomerId ? (DB.customers.find(c=>c.id===S.cartCustomerId)||{}).name : 'Pelanggan Umum';
    const receipt = `ApotekKilat\n${'-'.repeat(28)}\n${tx.code}\n${new Date(tx.time).toLocaleString('id-ID')}\nPelanggan: ${custName}\n${'-'.repeat(28)}\n`+tx.items.map(it=>`${it.name} x${it.qty}\n  ${fmt(n(it.price)*n(it.qty))}`).join('\n')+`\n${'-'.repeat(28)}\nSubtotal: ${fmt(tx.subtotal)}\nPPN 11%: ${fmt(tx.tax)}\nTOTAL: ${fmt(tx.total)}\nBayar: ${tx.payment}`;
    S.cart = []; S.cartCustomerId = null; S.cartPrescriptionId = null;
    modal('Transaksi Berhasil', `<div class="receipt">${esc(receipt)}</div>`, null, {saveLabel:'Tutup'});
    render(); toast('Transaksi berhasil dibuat via RPC');
  };

  openPOForm = function(){
    modal('Buat Purchase Order', `<div class="form">
      <label>Supplier<input id="poSupplier" placeholder="Nama supplier"/></label>
      <label>Obat<select id="poProduct">${DB.products.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
      <label>Jumlah<input id="poQty" type="number" placeholder="100"/></label>
      <label>Harga Modal per Unit<input id="poCost" type="number" placeholder="3000"/></label>
      <label>Catatan<input id="poNote" placeholder="Kebutuhan restock minggu ini"/></label>
    </div>`, async ()=>{
      const supplier = document.querySelector('#poSupplier').value.trim();
      const qty = Number(document.querySelector('#poQty').value);
      const cost = Number(document.querySelector('#poCost').value)||0;
      if(!supplier) return toast('Nama supplier wajib diisi','err'), false;
      if(!qty || qty<=0) return toast('Jumlah harus lebih dari 0','err'), false;
      const productId = document.querySelector('#poProduct').value;
      const product = DB.products.find(p=>p.id===productId);
      const po = {id:cloudId('po'), code:'PO-'+String(Date.now()).slice(-8), supplier, note:document.querySelector('#poNote').value, items:[{id:cloudId('poi'),productId,qty,cost,expired:product && product.expired}], value:qty*cost, status:'Draft', date:Date.now()};
      try{ await rpcCreatePO(po); DB.purchaseOrders.push(po); localOnlySave(); render(); toast('PO draft berhasil dibuat'); }
      catch(err){ console.error(err); toast(err.message || 'Gagal membuat PO di Supabase', 'err'); return false; }
    });
  };

  window.ApotekKilatEntityCrud = {
    writeProduct, writeBatch, writeCustomer,
    createPurchaseOrder: rpcCreatePO,
    checkoutTransaction: rpcCheckout,
    completeReturn: rpcCompleteReturn,
    postStockOpname: rpcPostStockOpname
  };
})();