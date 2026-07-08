/* P6 B3 — Final checkout compliance pipeline.
   Restores prescription validation, price-list pricing, and multi-UOM base quantity before cloud RPC.
   Loaded last so it wins over earlier global checkout overrides.
   P6 P1: also uses diff-by-id transaction targeting to avoid metadata attaching to DB.transactions[0]. */
(function(){
  const uuid = () => crypto.randomUUID();
  const n = v => Number(v) || 0;
  const today = () => new Date().toISOString().slice(0,10);
  const cloudReady = () => !!(window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getMode && window.ApotekKilatSupabaseData.getMode() === 'cloud' && typeof supabaseClient !== 'undefined' && supabaseClient);
  const restrictedClasses = ['Keras','Narkotika','Psikotropika'];
  const verifiedStatuses = ['Diproses','Siap Diambil','Selesai'];

  function unit(product, code){
    const units = product && Array.isArray(product.units) ? product.units : [];
    return units.find(u=>u.code === code) || units.find(u=>u.code === product?.saleUnit) || units.find(u=>u.code === product?.baseUnit) || {code:product?.baseUnit || 'UNIT', label:product?.type || 'Unit', factorToBase:1, price:product?.price || 0, cost:product?.cost || 0};
  }
  function normalPrice(product, code){
    const u = unit(product, code);
    return n(u.basePrice == null ? (u.price == null ? product.price : u.price) : u.basePrice);
  }
  function isPriceListActive(pl, customerId, date){
    if(!pl || pl.status === 'Nonaktif') return false;
    if(pl.type === 'Customer Group') return !!customerId && (pl.customerIds || []).includes(customerId);
    const range = pl.dateRange || {};
    return (!range.start || date >= range.start) && (!range.end || date <= range.end);
  }
  function bestPriceRule(productId, customerId, basePrice){
    const date = today();
    const candidates = [];
    (DB.priceLists || []).filter(pl=>isPriceListActive(pl, customerId, date)).forEach(pl=>{
      const rule = (pl.rules || []).find(r=>r.productId === productId);
      if(!rule) return;
      const price = rule.fixedPrice != null && rule.fixedPrice !== '' ? n(rule.fixedPrice) : Math.max(0, Math.round(basePrice * (1 - n(rule.discountPercent) / 100)));
      if(price < basePrice) candidates.push({price, pl, rule});
    });
    return candidates.sort((a,b)=>a.price-b.price)[0] || null;
  }
  function verifiedPrescriptions(){ return (DB.prescriptions || []).filter(r=>verifiedStatuses.includes(r.status)); }
  function selectedPrescription(){
    const id = S.cartPrescriptionId || S.selectedPrescriptionId || null;
    return id ? (DB.prescriptions || []).find(r=>r.id === id) : null;
  }
  function cartControlledItems(){
    return (S.cart || []).filter(c=>{
      const p = DB.products.find(x=>x.id === c.id);
      return p && restrictedClasses.includes(p.golongan || p.drug_class || 'Bebas');
    });
  }
  function ensurePrescriptionOrPrompt(){
    const controlled = cartControlledItems();
    if(!controlled.length){ S.cartPrescriptionId = null; S.selectedPrescriptionId = null; return true; }
    const rx = selectedPrescription();
    if(rx && verifiedStatuses.includes(rx.status)){ S.cartPrescriptionId = rx.id; S.selectedPrescriptionId = rx.id; return true; }
    const list = verifiedPrescriptions();
    if(!list.length){ toast('Tidak ada resep terverifikasi. Verifikasi resep terlebih dahulu.','err'); return false; }
    modal('Resep Terverifikasi Wajib', `<div class="form"><p>Keranjang memuat obat golongan <b>${[...new Set(controlled.map(c=>(DB.products.find(p=>p.id===c.id)||{}).golongan || 'Restricted'))].join(', ')}</b>.</p><label>Pilih Resep Terverifikasi<select id="checkoutRx"><option value="">Pilih resep</option>${list.map(r=>`<option value="${r.id}">${esc(r.patient || r.patientName || '-')} · ${esc(r.doctor || '-')} · ${esc(r.status)}</option>`).join('')}</select></label></div>`, ()=>{const id=document.querySelector('#checkoutRx').value;if(!id)return toast('Pilih resep terverifikasi','err'),false;S.cartPrescriptionId=id;S.selectedPrescriptionId=id;return checkout();},{saveLabel:'Lanjutkan Transaksi'});
    return false;
  }
  function buildCheckoutModel(){
    if(!S.cart.length) throw new Error('Keranjang masih kosong');
    const items = [];
    for(const cart of S.cart){
      const product = DB.products.find(x=>x.id === cart.id);
      if(!product) throw new Error('Produk tidak ditemukan');
      const u = unit(product, cart.unitCode || product.saleUnit || product.baseUnit);
      const qty = n(cart.q) || 1;
      const baseQty = qty * (n(u.factorToBase) || 1);
      if(n(product.stock) < baseQty) throw new Error(`Stok ${product.name} tidak cukup`);
      const originalPrice = normalPrice(product, u.code);
      const best = bestPriceRule(product.id, S.cartCustomerId, originalPrice);
      const price = best ? best.price : originalPrice;
      const discountAmount = Math.max(0, originalPrice - price) * qty;
      items.push({
        id:uuid(), productId:product.id, product_id:product.id,
        name:product.name, product_name:product.name,
        unitCode:u.code, unit_code:u.code, unitLabel:u.label,
        qty, baseQty, base_qty:baseQty, baseUnit:product.baseUnit,
        price, originalPrice, original_price:originalPrice,
        discountAmount, discount_amount:discountAmount,
        priceListId:best ? best.pl.id : null,
        price_list_id:best ? best.pl.id : null,
        priceListName:best ? best.pl.name : null,
        price_list_name:best ? best.pl.name : null,
        costBase:n(u.cost == null ? product.cost : u.cost),
        cost_base:n(u.cost == null ? product.cost : u.cost),
        golongan:product.golongan || product.drug_class || 'Bebas',
        drug_class:product.golongan || product.drug_class || 'Bebas'
      });
    }
    const subtotal = items.reduce((a,it)=>a + it.price * it.qty, 0);
    const discountTotal = items.reduce((a,it)=>a + it.discountAmount, 0);
    const tax = Math.round(subtotal * 0.11);
    const total = subtotal + tax;
    return {items, subtotal, discountTotal, tax, total, priceListIds:[...new Set(items.map(i=>i.priceListId).filter(Boolean))]};
  }
  function receiptText(tx){
    const customer = tx.customerId ? (DB.customers.find(c=>c.id===tx.customerId)||{}).name : 'Pelanggan Umum';
    return `ApotekKilat\n${'-'.repeat(28)}\n${tx.code}\n${new Date(tx.time).toLocaleString('id-ID')}\nPelanggan: ${customer}\n${'-'.repeat(28)}\n`+
      tx.items.map(it=>`${it.name} x${it.qty} ${it.unitLabel || it.unitCode || ''}\n  ${fmt(it.price*it.qty)}${it.discountAmount?` · Diskon ${fmt(it.discountAmount)}`:''}`).join('\n')+
      `\n${'-'.repeat(28)}\nSubtotal: ${fmt(tx.subtotal)}\nDiskon: ${fmt(tx.discountTotal || 0)}\nPPN 11%: ${fmt(tx.tax)}\nTOTAL: ${fmt(tx.total)}\nBayar: ${tx.payment}`;
  }
  function attachComplianceMetadata(tx, model){
    if(!tx || !model) return;
    tx.prescriptionId = tx.prescriptionId || S.cartPrescriptionId || S.selectedPrescriptionId || null;
    tx.priceListIds = model.priceListIds || tx.priceListIds || [];
    tx.discountTotal = model.discountTotal || tx.discountTotal || 0;
    tx.items = (tx.items || []).map((it, idx)=>{
      const src = model.items[idx] || {};
      return {...it,
        golongan:it.golongan || src.golongan,
        originalPrice:it.originalPrice == null ? src.originalPrice : it.originalPrice,
        discountAmount:it.discountAmount == null ? src.discountAmount : it.discountAmount,
        priceListId:it.priceListId || src.priceListId || null,
        priceListName:it.priceListName || src.priceListName || null
      };
    });
  }
  async function checkoutCloud(model){
    const branchId = DB.activeBranchId || (DB.branches[0] && DB.branches[0].id);
    if(!branchId) throw new Error('Cabang aktif belum tersedia');
    const payload = {
      branch_id: branchId,
      customer_id: S.cartCustomerId || null,
      payment_method: S.paymentMethod || 'Tunai',
      idempotency_key: uuid(),
      prescription_id: (S.cartPrescriptionId || S.selectedPrescriptionId || null),
      items: model.items.map(i=>({product_id:i.productId, unit_code:i.unitCode, qty:i.qty}))
    };
    const {data, error} = await supabaseClient.rpc('checkout_transaction', {p_payload: payload});
    if(error) throw error;
    const r = data || {};
    const returnedItems = (r.items || model.items).map((it, idx)=>{
      const fallback = model.items[idx] || {};
      return {id:it.id || fallback.id || uuid(), productId:it.product_id || fallback.productId, name:it.product_name || fallback.name, unitCode:it.unit_code || fallback.unitCode, unitLabel:fallback.unitLabel, qty:n(it.qty || fallback.qty), baseQty:n(it.base_qty || fallback.baseQty), price:n(it.price == null ? fallback.price : it.price), originalPrice:n(it.original_price == null ? fallback.originalPrice : it.original_price), discountAmount:n(it.discount_amount == null ? fallback.discountAmount : it.discount_amount), priceListId:it.price_list_id || fallback.priceListId || null, priceListName:it.price_list_name || fallback.priceListName || null, costBase:n(it.cost_base == null ? fallback.costBase : it.cost_base), golongan:it.drug_class || fallback.golongan};
    });
    const tx = {id:r.transaction_id, code:r.code, customerId:r.customer_id || S.cartCustomerId || null, branchId:r.branch_id || branchId, items:returnedItems, subtotal:n(r.subtotal), discountTotal:n(r.discount_total || model.discountTotal), tax:n(r.tax), total:n(r.total), payment:r.payment_method || payload.payment_method, status:'Selesai', time:Date.now(), prescriptionId:payload.prescription_id, priceListIds:r.price_list_ids || model.priceListIds};
    attachComplianceMetadata(tx, model);
    DB.transactions.unshift(tx);
    returnedItems.forEach(it=>{ const p=DB.products.find(x=>x.id===it.productId); if(p) p.stock=Math.max(n(p.stock)-n(it.baseQty||it.qty),0); });
    if(S.cartCustomerId && r.points_added){ const c=DB.customers.find(x=>x.id===S.cartCustomerId); if(c) c.points += n(r.points_added); }
    localStorage.setItem(DB_KEY, JSON.stringify(DB));
    return tx;
  }
  function checkoutLocal(model){
    const branchId = DB.activeBranchId || (DB.branches[0] && DB.branches[0].id);
    const oldIds = new Set(DB.transactions.map(t=>t.id));
    model.items.forEach(it=>{ const p=DB.products.find(x=>x.id===it.productId); if(p) p.stock -= it.baseQty; });
    const tx = {id:uid('t'), code:'TRX-'+String(Date.now()).slice(-9), customerId:S.cartCustomerId, branchId, items:model.items, subtotal:model.subtotal, discountTotal:model.discountTotal, tax:model.tax, total:model.total, payment:S.paymentMethod||'Tunai', status:'Selesai', time:Date.now(), prescriptionId:S.cartPrescriptionId||S.selectedPrescriptionId||null, priceListIds:model.priceListIds};
    DB.transactions.push(tx);
    const created = DB.transactions.find(t=>!oldIds.has(t.id));
    attachComplianceMetadata(created || tx, model);
    if(S.cartCustomerId){ const c=DB.customers.find(x=>x.id===S.cartCustomerId); if(c) c.points += Math.floor(tx.total/10000); }
    saveDB();
    return created || tx;
  }

  const previousCheckout = typeof checkout === 'function' ? checkout : null;
  window.checkout = checkout = async function(){
    if(!ensurePrescriptionOrPrompt()) return false;
    let model;
    try{ model = buildCheckoutModel(); }
    catch(err){ toast(err.message || 'Checkout tidak valid','err'); return false; }
    try{
      const tx = cloudReady() ? await checkoutCloud(model) : checkoutLocal(model);
      attachComplianceMetadata(tx, model);
      S.cart = []; S.cartCustomerId = null; S.cartPrescriptionId = null; S.selectedPrescriptionId = null;
      modal('Transaksi Berhasil', `<div class="receipt">${esc(receiptText(tx))}</div>`, null, {saveLabel:'Tutup'});
      render(); toast(cloudReady()?'Transaksi cloud berhasil via RPC':'Transaksi berhasil dibuat');
      return tx;
    }catch(err){
      console.error(err);
      toast(err.message || 'Checkout gagal','err');
      return false;
    }
  };

  window.ApotekKilatP6B3CheckoutCompliance = {checkout:()=>checkout(), previousCheckout, attachComplianceMetadata};
})();
