/* Phase P1.4.2 — Hook existing return and stock-opname UI to RPC posting paths. */
(function(){
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const uuid = () => crypto.randomUUID();
  const isUuid = id => UUID_RE.test(String(id || ''));
  const n = v => Number(v) || 0;
  const ts = v => v ? new Date(v).toISOString() : new Date().toISOString();

  function cloudReady(){
    return !!(window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getMode && window.ApotekKilatSupabaseData.getMode() === 'cloud' && supabaseClient);
  }
  function pharmacyId(){ return window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getPharmacyId ? window.ApotekKilatSupabaseData.getPharmacyId() : null; }
  function localOnlySave(){ localStorage.setItem(DB_KEY, JSON.stringify(DB)); }
  async function ensureRpc(){ if(!window.ApotekKilatEntityCrud) throw new Error('Entity CRUD module belum siap.'); }

  function syncStockOpnameInputs(so){
    if(!so || so.status !== 'Draft') return;
    document.querySelectorAll('[data-so-row]').forEach(row=>{
      const i = Number(row.dataset.soRow);
      const it = so.items[i];
      if(!it) return;
      const physical = Math.max(0, Number(row.querySelector('.so-physical')?.value)||0);
      it.physicalQty = physical;
      it.diff = physical - Number(it.systemQty||0);
      const reason = row.querySelector('.so-reason');
      if(reason) it.reason = reason.value;
    });
  }

  async function writeStockOpname(so){
    if(!cloudReady()) return;
    const pid = pharmacyId();
    if(!isUuid(so.id)) so.id = uuid();
    const header = {
      id: so.id,
      pharmacy_id: pid,
      code: so.code,
      category: so.category || null,
      note: so.note || null,
      status: so.status || 'Draft',
      counted_at: ts(so.date)
    };
    const h = await supabaseClient.from('stock_opnames').upsert(header, {onConflict:'id'});
    if(h.error) throw h.error;
    const items = (so.items||[]).map(it=>({
      id: isUuid(it.id) ? it.id : (it.id = uuid()),
      pharmacy_id: pid,
      stock_opname_id: so.id,
      product_id: it.productId || null,
      system_qty: n(it.systemQty),
      physical_qty: n(it.physicalQty),
      diff_qty: n(it.diff),
      reason: it.reason || null
    }));
    if(items.length){
      const r = await supabaseClient.from('stock_opname_items').upsert(items, {onConflict:'id'});
      if(r.error) throw r.error;
    }
  }

  async function writeReturn(type, r){
    if(!cloudReady()) return;
    const pid = pharmacyId();
    if(!isUuid(r.id)) r.id = uuid();
    if(type === 'sales'){
      const header = {
        id:r.id, pharmacy_id:pid, transaction_id:r.transactionId||null, customer_id:r.customerId||null,
        code:r.code, value:n(r.value), status:r.status||'Disetujui', returned_at:ts(r.date), refund_method:r.refundMethod||null,
        note:r.note||null, rejection_reason:r.rejectionReason||null, submitted_at:r.submittedAt?ts(r.submittedAt):null,
        approved_at:r.approvedAt?ts(r.approvedAt):new Date().toISOString(), rejected_at:r.rejectedAt?ts(r.rejectedAt):null, completed_at:null
      };
      const h = await supabaseClient.from('sales_returns').upsert(header, {onConflict:'id'});
      if(h.error) throw h.error;
      const items = (r.items||[]).map(it=>({
        id:isUuid(it.id)?it.id:(it.id=uuid()), pharmacy_id:pid, sales_return_id:r.id, product_id:it.productId||null,
        qty:n(it.qty), base_qty:it.baseQty==null?null:n(it.baseQty), display_qty:it.displayQty==null?null:n(it.displayQty),
        unit_code:it.unitCode||null, unit_label:it.unitLabel||null, price:n(it.price), reason:it.reason||null
      }));
      if(items.length){ const x = await supabaseClient.from('sales_return_items').upsert(items, {onConflict:'id'}); if(x.error) throw x.error; }
    } else {
      const header = {
        id:r.id, pharmacy_id:pid, purchase_order_id:r.poId||null, supplier_id:r.supplierId||null,
        code:r.code, value:n(r.value), status:r.status||'Disetujui', returned_at:ts(r.date), note:r.note||null,
        rejection_reason:r.rejectionReason||null, submitted_at:r.submittedAt?ts(r.submittedAt):null,
        approved_at:r.approvedAt?ts(r.approvedAt):new Date().toISOString(), rejected_at:r.rejectedAt?ts(r.rejectedAt):null, completed_at:null
      };
      const h = await supabaseClient.from('purchase_returns').upsert(header, {onConflict:'id'});
      if(h.error) throw h.error;
      const items = (r.items||[]).map(it=>({
        id:isUuid(it.id)?it.id:(it.id=uuid()), pharmacy_id:pid, purchase_return_id:r.id, product_id:it.productId||null,
        qty:n(it.qty), base_qty:it.baseQty==null?null:n(it.baseQty), display_qty:it.displayQty==null?null:n(it.displayQty),
        unit_code:it.unitCode||null, unit_label:it.unitLabel||null, cost:n(it.cost), reason:it.reason||null
      }));
      if(items.length){ const x = await supabaseClient.from('purchase_return_items').upsert(items, {onConflict:'id'}); if(x.error) throw x.error; }
    }
  }

  document.addEventListener('click', async (e)=>{
    const completeBtn = e.target.closest('[data-r-complete]');
    if(completeBtn && cloudReady()){
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      const [type,id] = completeBtn.dataset.rComplete.split('|');
      const list = type === 'purchase' ? DB.purchaseReturns : DB.salesReturns;
      const r = list.find(x=>x.id===id);
      if(!r) return toast('Retur tidak ditemukan','err');
      try{
        await ensureRpc();
        await writeReturn(type, r);
        await window.ApotekKilatEntityCrud.completeReturn(type, id);
        (r.items||[]).forEach(it=>{ const p=DB.products.find(x=>x.id===it.productId); if(!p)return; p.stock = type==='sales' ? n(p.stock)+n(it.qty) : Math.max(n(p.stock)-n(it.qty),0); });
        r.status='Selesai'; r.completedAt=Date.now(); localOnlySave(); render(); toast('Retur selesai dan diposting via RPC');
      }catch(err){ console.error(err); toast(err.message || 'Gagal menyelesaikan retur via RPC','err'); }
      return;
    }

    const soBtn = e.target.closest('[data-so-finish]');
    if(soBtn && cloudReady()){
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      const id = soBtn.dataset.soFinish;
      const so = (DB.stockOpnames||[]).find(x=>x.id===id);
      if(!so) return toast('Stock opname tidak ditemukan','err');
      syncStockOpnameInputs(so);
      const invalid = (so.items||[]).find(x=>Number(x.diff)!==0 && !x.reason);
      if(invalid) return toast('Semua produk dengan selisih wajib memiliki alasan','err');
      try{
        await ensureRpc();
        await writeStockOpname(so);
        await window.ApotekKilatEntityCrud.postStockOpname(so.id);
        (so.items||[]).forEach(it=>{ const p=DB.products.find(x=>x.id===it.productId); if(p) p.stock = n(it.physicalQty); });
        so.status='Selesai'; so.completedAt=Date.now(); localOnlySave(); render(); toast('Stock opname selesai dan diposting via RPC');
      }catch(err){ console.error(err); toast(err.message || 'Gagal posting stock opname via RPC','err'); }
    }
  }, true);
})();
