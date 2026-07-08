/* Phase P2.3 — Route cloud return workflow through submit_return / approve_return / complete_return RPCs. */
(function(){
  const n = v => Number(v) || 0;
  const INSPECTIONS = [
    ['layak_jual','Layak jual'],
    ['karantina','Karantina'],
    ['rusak','Rusak'],
    ['expired','Expired'],
    ['tukar_barang','Tukar barang']
  ];

  function cloudReady(){
    return !!(window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getMode && window.ApotekKilatSupabaseData.getMode() === 'cloud' && supabaseClient);
  }
  function pharmacyId(){ return window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getPharmacyId ? window.ApotekKilatSupabaseData.getPharmacyId() : null; }
  function listFor(type){ return type === 'purchase' ? DB.purchaseReturns : DB.salesReturns; }
  function findReturn(type,id){ return (listFor(type)||[]).find(x=>x.id===id); }

  function payloadItems(type, r){
    return (r.items||[]).map((it,idx)=>({
      id: it.id || null,
      product_id: it.productId,
      qty: n(it.qty || it.baseQty || it.displayQty),
      base_qty: n(it.baseQty || it.qty),
      display_qty: n(it.displayQty || it.qty),
      unit_code: it.unitCode || null,
      unit_label: it.unitLabel || null,
      price: type === 'sales' ? n(it.price) : null,
      cost: type === 'purchase' ? n(it.cost) : null,
      reason: it.reason || null,
      inspection_result: type === 'sales' ? (it.inspectionResult || it.inspection_result || document.querySelector(`#retInspect${idx}`)?.value || null) : null,
      inspection_note: type === 'sales' ? (it.inspectionNote || it.inspection_note || document.querySelector(`#retInspectNote${idx}`)?.value || null) : null
    }));
  }

  async function submitReturn(type, r, submit){
    const pid = pharmacyId();
    if(!pid) throw new Error('Tenant cloud belum aktif');
    const payload = {
      return_kind: type,
      pharmacy_id: pid,
      id: r.id,
      code: r.code,
      submit: submit !== false,
      transaction_id: type === 'sales' ? r.transactionId || null : null,
      customer_id: type === 'sales' ? r.customerId || null : null,
      refund_method: type === 'sales' ? r.refundMethod || null : null,
      purchase_order_id: type === 'purchase' ? r.poId || null : null,
      supplier_id: type === 'purchase' ? r.supplierId || null : null,
      note: r.note || null,
      items: payloadItems(type, r)
    };
    const {data,error} = await supabaseClient.rpc('submit_return', {p_payload: payload});
    if(error) throw error;
    r.status = data.status || (submit === false ? 'Draft' : 'Menunggu Approval');
    r.value = n(data.value || r.value);
    if(r.status === 'Menunggu Approval') r.submittedAt = Date.now();
    localStorage.setItem(DB_KEY, JSON.stringify(DB));
    render();
    toast(r.status === 'Draft' ? 'Draft retur tersimpan via RPC' : 'Retur diajukan via RPC');
  }

  function openSalesInspectionBeforeSubmit(type, r){
    modal('Inspeksi Barang Retur', `<div class="form">
      <p class="muted">Retur penjualan wajib punya hasil inspeksi per item sebelum diajukan.</p>
      ${(r.items||[]).map((it,idx)=>{
        const p = DB.products.find(x=>x.id===it.productId) || {};
        return `<div class="card" style="padding:12px;margin-bottom:10px">
          <b>${esc(p.name || 'Produk')}</b><br><small class="muted">Qty: ${n(it.displayQty || it.qty)}</small>
          <label>Hasil Inspeksi<select id="retInspect${idx}">${INSPECTIONS.map(([v,l])=>`<option value="${v}" ${(it.inspectionResult||it.inspection_result)===v?'selected':''}>${l}</option>`).join('')}</select></label>
          <label>Catatan Inspeksi<input id="retInspectNote${idx}" value="${esc(it.inspectionNote || it.inspection_note || '')}" placeholder="Opsional" /></label>
        </div>`;
      }).join('')}
    </div>`, async ()=>{
      try{
        (r.items||[]).forEach((it,idx)=>{ it.inspectionResult = document.querySelector(`#retInspect${idx}`).value; it.inspectionNote = document.querySelector(`#retInspectNote${idx}`).value || ''; });
        await submitReturn(type, r, true);
      }catch(err){ console.error(err); toast(err.message || 'Gagal submit retur via RPC', 'err'); return false; }
    }, {saveLabel:'Ajukan Approval'});
  }

  async function approveReturn(type, r, decision){
    const payload = {return_kind:type, id:r.id, decision};
    if(decision === 'reject'){
      const reason = prompt('Alasan penolakan retur?');
      if(!reason) return;
      payload.rejection_reason = reason;
      r.rejectionReason = reason;
    }
    const {data,error} = await supabaseClient.rpc('approve_return', {p_payload: payload});
    if(error) throw error;
    r.status = data.status;
    if(decision === 'approve') r.approvedAt = Date.now(); else r.rejectedAt = Date.now();
    localStorage.setItem(DB_KEY, JSON.stringify(DB));
    render();
    toast(decision === 'approve' ? 'Retur disetujui via RPC' : 'Retur ditolak via RPC');
  }

  async function completeReturn(type, r){
    const {error} = await supabaseClient.rpc('complete_return', {p_return_kind:type, p_return_id:r.id});
    if(error) throw error;
    if(type === 'sales'){
      (r.items||[]).forEach(it=>{
        const inspection = it.inspectionResult || it.inspection_result;
        if(inspection !== 'layak_jual') return;
        const p = DB.products.find(x=>x.id===it.productId);
        if(p) p.stock = n(p.stock) + n(it.qty || it.baseQty);
      });
    }else{
      (r.items||[]).forEach(it=>{ const p = DB.products.find(x=>x.id===it.productId); if(p) p.stock = Math.max(n(p.stock) - n(it.qty || it.baseQty), 0); });
    }
    r.status = 'Selesai'; r.completedAt = Date.now();
    localStorage.setItem(DB_KEY, JSON.stringify(DB));
    render();
    toast('Retur selesai via RPC');
  }

  document.addEventListener('click', async (e)=>{
    if(!cloudReady()) return;
    const submitBtn = e.target.closest('[data-r-submit]');
    const approveBtn = e.target.closest('[data-r-approve]');
    const rejectBtn = e.target.closest('[data-r-reject]');
    const completeBtn = e.target.closest('[data-r-complete]');
    const target = submitBtn || approveBtn || rejectBtn || completeBtn;
    if(!target) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const dataset = submitBtn ? submitBtn.dataset.rSubmit : approveBtn ? approveBtn.dataset.rApprove : rejectBtn ? rejectBtn.dataset.rReject : completeBtn.dataset.rComplete;
    const [type,id] = dataset.split('|');
    const r = findReturn(type,id);
    if(!r) return toast('Retur tidak ditemukan', 'err');
    try{
      if(submitBtn){
        if(type === 'sales') return openSalesInspectionBeforeSubmit(type, r);
        return await submitReturn(type, r, true);
      }
      if(approveBtn) return await approveReturn(type, r, 'approve');
      if(rejectBtn) return await approveReturn(type, r, 'reject');
      if(completeBtn) return await completeReturn(type, r);
    }catch(err){
      console.error(err);
      toast(err.message || 'Workflow retur RPC gagal', 'err');
    }
  }, true);
})();
