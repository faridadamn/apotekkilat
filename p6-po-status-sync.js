/* P6 — Purchase Order status sync.
   Covers status-only workflow changes outside receive_purchase_order RPC:
   Draft -> Menunggu Approval -> Disetujui/Ditolak -> Dalam Pengiriman.
   Does not mutate stock or accounting. */
(function(){
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}[0-9a-f]-[0-9a-f]{12}$/i;
  const isUuid = id => UUID_RE.test(String(id || ''));
  const cloudReady = () => !!(window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getMode && window.ApotekKilatSupabaseData.getMode() === 'cloud' && typeof supabaseClient !== 'undefined' && supabaseClient);
  const pharmacyId = () => window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getPharmacyId ? window.ApotekKilatSupabaseData.getPharmacyId() : null;
  const userId = () => typeof authSession !== 'undefined' && authSession && authSession.user ? authSession.user.id : null;

  const baseline = new Map();
  let syncing = false;

  function iso(v){ return v ? new Date(v).toISOString() : null; }
  function signature(po){
    return JSON.stringify({
      status: po.status || 'Draft',
      rejectionReason: po.rejectionReason || null,
      submittedAt: po.submittedAt || null,
      approvedAt: po.approvedAt || null,
      shippedAt: po.shippedAt || null,
      rejectedAt: po.rejectedAt || null,
      receivedAt: po.receivedAt || null,
      updatedAt: po.updatedAt || null
    });
  }
  function refreshBaseline(){
    baseline.clear();
    (window.DB && DB.purchaseOrders || []).forEach(po=>{ if(po && po.id) baseline.set(po.id, signature(po)); });
  }
  function changedPOs(){
    const out = [];
    (window.DB && DB.purchaseOrders || []).forEach(po=>{
      if(!po || !isUuid(po.id)) return;
      const sig = signature(po);
      if(baseline.get(po.id) && baseline.get(po.id) !== sig) out.push(po);
    });
    return out;
  }
  function patchFor(po){
    const now = new Date().toISOString();
    const patch = {
      status: po.status || 'Draft',
      rejection_reason: po.rejectionReason || null,
      submitted_at: po.submittedAt ? iso(po.submittedAt) : null,
      approved_at: po.approvedAt ? iso(po.approvedAt) : null,
      shipped_at: po.shippedAt ? iso(po.shippedAt) : null,
      rejected_at: po.rejectedAt ? iso(po.rejectedAt) : null,
      received_at: po.receivedAt ? iso(po.receivedAt) : null,
      updated_at: now
    };
    if(userId()) patch.updated_by = userId();
    if(po.status === 'Menunggu Approval' && !po.submittedAt) patch.submitted_at = now;
    if(po.status === 'Disetujui' && !po.approvedAt) patch.approved_at = now;
    if(po.status === 'Dalam Pengiriman' && !po.shippedAt) patch.shipped_at = now;
    if(po.status === 'Ditolak' && !po.rejectedAt) patch.rejected_at = now;
    return patch;
  }
  async function syncPOStatus(rows){
    if(!cloudReady() || syncing || !rows.length) return;
    syncing = true;
    try{
      for(const po of rows){
        let query = supabaseClient.from('purchase_orders').update(patchFor(po)).eq('id', po.id);
        const pid = pharmacyId();
        if(pid) query = query.eq('pharmacy_id', pid);
        const {error} = await query;
        if(error) throw error;
      }
      rows.forEach(po=>baseline.set(po.id, signature(po)));
      if(typeof toast === 'function') toast('Status PO tersinkron ke Supabase');
    }catch(err){
      console.error('P6 PO status sync gagal:', err);
      if(typeof toast === 'function') toast(err.message || 'Status PO gagal sync ke Supabase', 'err');
      const pid = pharmacyId();
      if(pid && cloudReady()){
        try{
          await supabaseClient.rpc('log_sync_failure', {p_payload:{pharmacy_id:pid, entity_type:'purchase_order', operation:'status_sync', error_message:String(err.message || err), payload:{ids:rows.map(x=>x.id)}}});
        }catch(logErr){ console.warn('Gagal log PO status sync failure:', logErr); }
      }
    }finally{
      syncing = false;
    }
  }

  const oldSaveDB = typeof saveDB === 'function' ? saveDB : null;
  if(oldSaveDB){
    window.saveDB = saveDB = function(){
      const out = oldSaveDB.apply(this, arguments);
      const rows = changedPOs();
      if(rows.length) setTimeout(()=>syncPOStatus(rows), 0);
      setTimeout(refreshBaseline, 0);
      return out;
    };
  }

  if(typeof showApp === 'function'){
    const oldShowApp = showApp;
    window.showApp = showApp = async function(){
      const out = await oldShowApp.apply(this, arguments);
      refreshBaseline();
      return out;
    };
  }

  refreshBaseline();
  window.ApotekKilatP6POStatusSync = {refreshBaseline, changedPOs, syncPOStatus};
})();
