/* Phase P2.4 — Hook existing stock-opname UI to RPC posting path without client-side stock mutation. */
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

  document.addEventListener('click', async (e)=>{
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
        await writeStockOpname(so);
        const {data, error} = await supabaseClient.rpc('post_stock_opname', {p_stock_opname_id: so.id});
        if(error) throw error;
        so.status = data && data.status ? data.status : 'Posted';
        so.completedAt = Date.now();
        so.postedAt = Date.now();
        so.journalEntryId = data && data.journal_entry_id ? data.journal_entry_id : null;
        localOnlySave();
        render();
        toast('Stock opname diposting via RPC. Stok hanya diubah oleh server.');
      }catch(err){ console.error(err); toast(err.message || 'Gagal posting stock opname via RPC','err'); }
    }
  }, true);
})();
