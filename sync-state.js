/* Phase P1.4.4 — Global sync state + local outbox.
   Outbox is only for non-critical master-data changes. Checkout and stock posting remain RPC-only. */
(function(){
  const OUTBOX_KEY = 'apotekkilat_sync_outbox_v1';
  const NON_CRITICAL = new Set(['product.insert','product.update','customer.insert','customer.update','batch.insert']);
  const CRITICAL_BLOCKED = new Set(['checkout.transaction','stock_opname.post','return.complete']);

  function readOutbox(){
    try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); }
    catch(e){ return []; }
  }
  function writeOutbox(items){ localStorage.setItem(OUTBOX_KEY, JSON.stringify(items)); updateSyncIndicator(); }
  function pendingOutbox(){ return readOutbox().filter(x=>['queued','failed'].includes(x.status)); }
  function cloudReady(){ return !!(window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getMode && window.ApotekKilatSupabaseData.getMode() === 'cloud' && supabaseClient); }
  function pharmacyId(){ return window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getPharmacyId ? window.ApotekKilatSupabaseData.getPharmacyId() : null; }
  function uuid(){ return crypto.randomUUID(); }

  function labelFor(status){
    const hasPending = pendingOutbox().length > 0;
    if(!navigator.onLine) return {symbol:'○', text: hasPending ? `Offline — ${hasPending} perubahan diantrikan` : 'Offline — perubahan diantrikan', tone:'offline'};
    if(status === 'saving' || status === 'queued' || status === 'processing') return {symbol:'◌', text:'Menyimpan perubahan...', tone:'saving'};
    if(status === 'error' || status === 'failed') return {symbol:'!', text:'Gagal sinkron — data lokal belum masuk cloud', tone:'error'};
    if(hasPending) return {symbol:'○', text:`${hasPending} perubahan diantrikan`, tone:'offline'};
    return {symbol:'●', text:'Tersinkron', tone:'synced'};
  }

  function ensureIndicator(){
    let el = document.querySelector('#syncIndicator');
    if(el) return el;
    const header = document.querySelector('.top');
    if(!header) return null;
    el = document.createElement('div');
    el.id = 'syncIndicator';
    el.className = 'sync-indicator synced';
    el.title = 'Status sinkronisasi';
    header.insertBefore(el, document.querySelector('#todayDate'));
    return el;
  }

  function updateSyncIndicator(status){
    const el = ensureIndicator();
    if(!el) return;
    const current = status || (window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getSyncStatus ? window.ApotekKilatSupabaseData.getSyncStatus() : 'synced');
    const info = labelFor(current);
    el.className = `sync-indicator ${info.tone}`;
    el.textContent = `${info.symbol} ${info.text}`;
  }

  function setSyncStatus(status){
    window.dispatchEvent(new CustomEvent('apotekkilat:sync-status', {detail:{status}}));
    updateSyncIndicator(status);
  }

  function enqueue(action_type, payload, error){
    if(CRITICAL_BLOCKED.has(action_type)) throw new Error('Aksi kritis tidak boleh diantrikan offline. Sambungkan internet lalu ulangi.');
    if(!NON_CRITICAL.has(action_type)) throw new Error('Action type tidak diizinkan masuk outbox lokal.');
    const items = readOutbox();
    const item = {
      id: uuid(),
      action_type,
      payload,
      created_at: new Date().toISOString(),
      retry_count: 0,
      last_error: error ? String(error.message || error) : null,
      status: 'queued'
    };
    items.push(item);
    writeOutbox(items);
    setSyncStatus(navigator.onLine ? 'queued' : 'offline');
    return item;
  }

  async function applyItem(item){
    if(!cloudReady()) throw new Error('Cloud mode belum siap.');
    if(!navigator.onLine) throw new Error('Offline.');
    const api = window.ApotekKilatOptimisticConcurrency;
    if(!api) throw new Error('Optimistic concurrency module belum siap.');
    if(item.action_type === 'product.insert') return api.insertProductFromOutbox(item.payload.product);
    if(item.action_type === 'product.update') return api.updateProductFromOutbox(item.payload.product, item.payload.expectedVersion);
    if(item.action_type === 'customer.insert') return api.insertCustomerFromOutbox(item.payload.customer);
    if(item.action_type === 'customer.update') return api.updateCustomerFromOutbox(item.payload.customer, item.payload.expectedVersion);
    if(item.action_type === 'batch.insert') return api.insertBatchFromOutbox(item.payload.product, item.payload.batch);
    throw new Error('Unsupported outbox action: '+item.action_type);
  }

  async function processOutbox(){
    if(!cloudReady() || !navigator.onLine) { updateSyncIndicator('offline'); return; }
    let items = readOutbox();
    const queued = items.filter(x=>['queued','failed'].includes(x.status));
    if(!queued.length){ updateSyncIndicator('synced'); return; }
    setSyncStatus('processing');

    for(const item of queued){
      items = readOutbox();
      const idx = items.findIndex(x=>x.id === item.id);
      if(idx < 0) continue;
      items[idx].status = 'processing';
      writeOutbox(items);
      try{
        await applyItem(items[idx]);
        items = readOutbox();
        const okIdx = items.findIndex(x=>x.id === item.id);
        if(okIdx >= 0){ items[okIdx].status = 'done'; items[okIdx].last_error = null; }
        writeOutbox(items);
      }catch(err){
        items = readOutbox();
        const errIdx = items.findIndex(x=>x.id === item.id);
        if(errIdx >= 0){
          items[errIdx].status = 'failed';
          items[errIdx].retry_count = (items[errIdx].retry_count || 0) + 1;
          items[errIdx].last_error = err.message || String(err);
        }
        writeOutbox(items);
        console.error('Outbox sync failed:', err);
        setSyncStatus('failed');
        return;
      }
    }
    writeOutbox(readOutbox().filter(x=>x.status !== 'done'));
    setSyncStatus('synced');
  }

  window.addEventListener('apotekkilat:sync-status', e=>updateSyncIndicator(e.detail && e.detail.status));
  window.addEventListener('online', ()=>processOutbox());
  window.addEventListener('offline', ()=>updateSyncIndicator('offline'));
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) processOutbox(); });
  setInterval(()=>{ if(cloudReady() && navigator.onLine && pendingOutbox().length) processOutbox(); }, 15000);

  window.ApotekKilatSyncOutbox = {enqueue, process:processOutbox, list:readOutbox, pending:pendingOutbox, setStatus:setSyncStatus, update:updateSyncIndicator};

  if(document.readyState !== 'loading') updateSyncIndicator();
  else document.addEventListener('DOMContentLoaded', ()=>updateSyncIndicator());
})();
