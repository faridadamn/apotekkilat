/* Phase P2.2 — Route cloud PO receipt through receive_purchase_order() RPC. */
(function(){
  const uuid = () => crypto.randomUUID();
  const n = v => Number(v) || 0;

  function cloudReady(){
    return !!(window.ApotekKilatSupabaseData &&
      window.ApotekKilatSupabaseData.getMode &&
      window.ApotekKilatSupabaseData.getMode() === 'cloud' &&
      supabaseClient);
  }

  function activeBranchId(){
    return DB.activeBranchId || (DB.branches[0] && DB.branches[0].id) || null;
  }

  function receivableStatus(po){
    return ['Dalam Pengiriman','Disetujui','Approved','Partially Received','Parsial'].includes(po && po.status);
  }

  function openReceivePOForm(po){
    const items = po.items || [];
    if(!items.length) return toast('Item PO kosong', 'err');
    modal('Terima Barang PO', `<div class="form">
      <p class="muted">Input penerimaan barang. Mendukung penerimaan sebagian. Harga aktual dan batch akan dicatat server.</p>
      ${items.map((it,i)=>{
        const p = DB.products.find(x=>x.id===it.productId) || {};
        return `<div class="card" style="padding:12px;margin-bottom:10px">
          <b>${esc(p.name || 'Produk')}</b><br><small class="muted">Qty PO: ${n(it.qty)} · Cost PO: ${fmt(n(it.cost))}</small>
          <input type="hidden" id="rpoi${i}" value="${esc(it.id || '')}" />
          <input type="hidden" id="rpp${i}" value="${esc(it.productId || '')}" />
          <label>Qty Diterima<input id="rpq${i}" type="number" value="${n(it.qty)}" /></label>
          <label>Harga Aktual<input id="rpc${i}" type="number" value="${n(it.cost)}" /></label>
          <label>No. Batch<input id="rpb${i}" placeholder="PO-${esc(po.code || '')}-${i+1}" /></label>
          <label>Expired Date<input id="rpe${i}" type="date" value="${esc(it.expired || '')}" /></label>
          <label>Lokasi<input id="rpl${i}" value="Gudang Pusat" /></label>
        </div>`;
      }).join('')}
    </div>`, async ()=>{
      try{
        const payloadItems = items.map((it,i)=>({
          purchase_order_item_id: document.querySelector(`#rpoi${i}`).value || null,
          product_id: document.querySelector(`#rpp${i}`).value || it.productId,
          qty_received: n(document.querySelector(`#rpq${i}`).value),
          actual_cost: n(document.querySelector(`#rpc${i}`).value),
          batch_no: document.querySelector(`#rpb${i}`).value.trim() || null,
          expired_at: document.querySelector(`#rpe${i}`).value || null,
          location: document.querySelector(`#rpl${i}`).value || 'Gudang Pusat'
        })).filter(x=>x.qty_received > 0);
        if(!payloadItems.length){ toast('Minimal satu item diterima', 'err'); return false; }

        const {data, error} = await supabaseClient.rpc('receive_purchase_order', {p_payload:{
          purchase_order_id: po.id,
          branch_id: activeBranchId(),
          idempotency_key: uuid(),
          items: payloadItems
        }});
        if(error) throw error;

        po.status = data.status || 'Parsial';
        po.receivedAt = Date.now();
        (data.items || []).forEach(row=>{
          const p = DB.products.find(x=>x.id===row.product_id);
          if(!p) return;
          p.stock = n(p.stock) + n(row.qty_received);
          p.cost = n(row.actual_cost) || p.cost;
          p.batches = p.batches || [];
          p.batches.push({id:row.batch_id,batchNo:row.batch_no,received:new Date().toISOString().slice(0,10),expired:row.expired_at,qty:n(row.qty_received),location:row.location||'Gudang Pusat'});
        });
        DB.payables = DB.payables || [];
        DB.payables.unshift({id:data.accounts_payable_id,poId:po.id,supplierId:po.supplierId,amount:n(data.received_value),adjustedAmount:n(data.received_value),paidAmount:0,dueDate:'',status:'Open',createdAt:Date.now(),payments:[]});
        localStorage.setItem(DB_KEY, JSON.stringify(DB));
        render();
        toast('Penerimaan PO berhasil via RPC');
      }catch(err){
        console.error(err);
        toast(err.message || 'Gagal menerima PO via RPC', 'err');
        return false;
      }
    }, {saveLabel:'Terima Barang'});
  }

  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-po-advance]');
    if(!btn || !cloudReady()) return;
    const po = DB.purchaseOrders.find(x=>x.id===btn.dataset.poAdvance);
    if(!po || !receivableStatus(po)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    openReceivePOForm(po);
  }, true);
})();
