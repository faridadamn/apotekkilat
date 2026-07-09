/* Phase P2.2 — Route cloud PO receipt through receive_purchase_order() RPC. */
(function(){
  const uuid = () => crypto.randomUUID();
  const n = v => Number(v) || 0;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const isUuid = id => UUID_RE.test(String(id || ''));

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

  function friendlyReceiveError(err){
    const msg = String((err && err.message) || err || 'Gagal menerima PO via RPC');
    if(/branch/i.test(msg)) return 'Cabang aktif cloud tidak valid. Pilih cabang cloud dulu.';
    if(/purchase_order|po/i.test(msg)) return 'Purchase order tidak valid atau statusnya belum bisa diterima.';
    if(/qty|quantity|jumlah/i.test(msg)) return 'Qty diterima tidak valid atau melebihi sisa PO.';
    if(/stock|movement/i.test(msg)) return 'Penerimaan gagal saat mencatat stok. Refresh data lalu coba lagi.';
    return msg;
  }

  function openReceivePOForm(po){
    const items = po.items || [];
    if(!items.length) return toast('Item PO kosong', 'err');
    const branchId = activeBranchId();
    if(cloudReady() && !isUuid(branchId)) return toast('Cabang aktif cloud tidak valid. Pilih cabang cloud dulu.', 'err');

    modal('Terima Barang PO', `<div class="form">
      <p class="muted">Penerimaan barang cloud diproses lewat RPC receive_purchase_order. Mendukung penerimaan sebagian, harga aktual, dan batch server-side.</p>
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
      const saveBtn = document.querySelector('#modalSave');
      const task = async ()=>{
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

          const idempotencyKey = uuid();
          const {data, error} = await supabaseClient.rpc('receive_purchase_order', {p_payload:{
            purchase_order_id: po.id,
            branch_id: branchId,
            idempotency_key: idempotencyKey,
            items: payloadItems
          }});
          if(error) throw error;

          const result = Array.isArray(data) ? (data[0] || {}) : (data || {});
          po.status = result.status || 'Parsial';
          po.receivedAt = Date.now();
          po.idempotencyKey = idempotencyKey;
          (result.items || payloadItems).forEach(row=>{
            const p = DB.products.find(x=>x.id === (row.product_id || row.productId));
            if(!p) return;
            p.stock = n(p.stock) + n(row.qty_received);
            p.cost = n(row.actual_cost) || p.cost;
            p.batches = p.batches || [];
            p.batches.push({id:row.batch_id || uuid(), batchNo:row.batch_no || row.batchNo || ('PO-'+String(Date.now()).slice(-6)), received:new Date().toISOString().slice(0,10), expired:row.expired_at || row.expiredAt || null, qty:n(row.qty_received), location:row.location||'Gudang Pusat'});
          });
          if(result.accounts_payable_id){
            DB.payables = DB.payables || [];
            if(!DB.payables.some(x=>x.id===result.accounts_payable_id)){
              DB.payables.unshift({id:result.accounts_payable_id,poId:po.id,supplierId:po.supplierId,amount:n(result.received_value),adjustedAmount:n(result.received_value),paidAmount:0,dueDate:'',status:'Open',createdAt:Date.now(),payments:[]});
            }
          }
          localStorage.setItem(DB_KEY, JSON.stringify(DB));
          render();
          toast('Penerimaan PO berhasil via RPC');
        }catch(err){
          console.error(err);
          toast(friendlyReceiveError(err), 'err');
          return false;
        }
      };
      return window.ApotekKilatAsyncAction ? window.ApotekKilatAsyncAction.run(saveBtn, task, {label:'Memproses...'}) : task();
    }, {saveLabel:'Terima Barang'});
  }

  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-po-advance],[data-po-receive],[data-detail-receive]');
    if(!btn || !cloudReady()) return;
    const id = btn.dataset.poAdvance || btn.dataset.poReceive || btn.dataset.detailReceive;
    const po = DB.purchaseOrders.find(x=>x.id===id);
    if(!po || !receivableStatus(po)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    openReceivePOForm(po);
  }, true);

  window.ApotekKilatReceivePO = {openReceivePOForm, cloudReady};
})();