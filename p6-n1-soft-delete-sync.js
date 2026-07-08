/* P6 N1 — Soft-delete sync guard.
   Problem: local UI deletion removed rows from DB arrays, but cloud rows stayed alive and could resurrect on another device.
   Strategy:
   1. Track missing IDs after saveDB() and mark cloud rows deleted_at/deleted_by.
   2. After cloud load, fetch deleted_at tombstones and remove them from local DB arrays.
   3. Never hard-delete through Supabase.
   Requires migration 202607080034_p6_n1_soft_delete_foundation.sql for deleted_at/deleted_by columns.
*/
(function(){
  const collections = [
    {key:'products', table:'products'},
    {key:'customers', table:'customers'},
    {key:'suppliers', table:'suppliers'},
    {key:'branches', table:'branches'},
    {key:'purchaseOrders', table:'purchase_orders'},
    {key:'priceLists', table:'price_lists'},
    {key:'conversations', table:'conversations'}
  ];
  const isUuid = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id||''));
  const cloudReady = () => !!(window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getMode && window.ApotekKilatSupabaseData.getMode() === 'cloud' && typeof supabaseClient !== 'undefined' && supabaseClient);
  const pharmacyId = () => window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getPharmacyId ? window.ApotekKilatSupabaseData.getPharmacyId() : null;
  const userId = () => authSession && authSession.user ? authSession.user.id : null;

  let baseline = new Map();
  let syncing = false;

  function idsFor(key){ return new Set(((window.DB && DB[key]) || []).map(x=>x && x.id).filter(Boolean)); }
  function refreshBaseline(){
    baseline = new Map();
    collections.forEach(c=>baseline.set(c.key, idsFor(c.key)));
  }
  function collectDeletedIds(){
    const out = [];
    collections.forEach(c=>{
      const before = baseline.get(c.key) || new Set();
      const now = idsFor(c.key);
      before.forEach(id=>{ if(!now.has(id) && isUuid(id)) out.push({table:c.table, key:c.key, id}); });
    });
    return out;
  }
  async function markDeleted(rows){
    if(!cloudReady() || !rows.length || syncing) return;
    syncing = true;
    const deletedAt = new Date().toISOString();
    try{
      for(const row of rows){
        const {error} = await supabaseClient
          .from(row.table)
          .update({deleted_at:deletedAt, deleted_by:userId()})
          .eq('id', row.id);
        if(error) throw error;
      }
      if(typeof toast === 'function') toast('Data yang dihapus ditandai soft-delete di Supabase');
    }catch(err){
      console.error('P6 N1 soft-delete gagal:', err);
      if(typeof toast === 'function') toast('Soft-delete Supabase gagal. Pastikan migration deleted_at sudah diterapkan.', 'err');
      const pid = pharmacyId();
      if(pid && cloudReady()){
        try{
          await supabaseClient.rpc('log_sync_failure', {p_payload:{pharmacy_id:pid, entity_type:'p6_n1_soft_delete', operation:'soft_delete', error_message:String(err.message || err), payload:{rows}}});
        }catch(logErr){ console.warn('Gagal log soft-delete failure:', logErr); }
      }
    }finally{
      syncing = false;
    }
  }
  function removeLocalByTombstones(tombstones){
    let changed = false;
    collections.forEach(c=>{
      const ids = tombstones[c.table] || new Set();
      if(!ids.size || !Array.isArray(DB[c.key])) return;
      const before = DB[c.key].length;
      DB[c.key] = DB[c.key].filter(x=>!ids.has(x.id));
      if(DB[c.key].length !== before) changed = true;
    });
    return changed;
  }
  async function fetchTombstones(){
    if(!cloudReady()) return {};
    const pid = pharmacyId();
    const result = {};
    for(const c of collections){
      try{
        let q = supabaseClient.from(c.table).select('id,deleted_at').not('deleted_at','is',null);
        if(pid) q = q.eq('pharmacy_id', pid);
        const {data, error} = await q;
        if(error) throw error;
        result[c.table] = new Set((data||[]).map(x=>x.id));
      }catch(err){
        // If migration has not been applied yet, do not break app load.
        console.warn(`P6 N1 tombstone fetch skipped for ${c.table}:`, err.message || err);
        result[c.table] = new Set();
      }
    }
    return result;
  }
  async function applyCloudTombstoneFilter(){
    if(!window.DB || !cloudReady()) return;
    const tombstones = await fetchTombstones();
    if(removeLocalByTombstones(tombstones)){
      localStorage.setItem(DB_KEY, JSON.stringify(DB));
      if(typeof render === 'function') render();
    }
    refreshBaseline();
  }

  const oldSaveDB = typeof saveDB === 'function' ? saveDB : null;
  if(oldSaveDB){
    window.saveDB = saveDB = function(){
      const deleted = collectDeletedIds();
      const out = oldSaveDB.apply(this, arguments);
      if(deleted.length) setTimeout(()=>markDeleted(deleted), 0);
      setTimeout(refreshBaseline, 0);
      return out;
    };
  }

  if(typeof showApp === 'function'){
    const oldShowApp = showApp;
    window.showApp = showApp = async function(){
      const out = await oldShowApp.apply(this, arguments);
      await applyCloudTombstoneFilter();
      return out;
    };
  }

  refreshBaseline();
  window.ApotekKilatP6N1SoftDeleteSync = {refreshBaseline, collectDeletedIds, markDeleted, applyCloudTombstoneFilter};
})();
