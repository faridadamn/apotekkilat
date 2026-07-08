/* Iterasi 2 Phase B — Critical RPC wiring.
   Keeps local/demo behavior intact, but forces cloud workflows through RPCs that already exist. */
(function(){
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const previousCheckout = typeof checkout === 'function' ? checkout : null;
  const n = v => Number(v) || 0;
  const isUuid = id => UUID_RE.test(String(id || ''));
  const uuid = () => crypto.randomUUID();
  const asyncUi = () => window.ApotekKilatAsyncAction;

  function cloudReady(){
    return !!(window.ApotekKilatSupabaseData &&
      window.ApotekKilatSupabaseData.getMode &&
      window.ApotekKilatSupabaseData.getMode() === 'cloud' &&
      supabaseClient);
  }

  function activeBranchId(){
    return DB.activeBranchId || ((DB.branches || [])[0] && DB.branches[0].id) || null;
  }

  function activeActionButton(selector){
    const active = document.activeElement && document.activeElement.matches && document.activeElement.matches(selector) ? document.activeElement : null;
    return active || document.querySelector(selector);
  }

  function restrictedProduct(product){
    return ['Keras','Narkotika','Psikotropika'].includes(product && product.golongan);
  }

  function rxMatchesProduct(rx, product){
    if(!rx || !product) return false;
    const pname = String(product.name || '').trim().toLowerCase();
    return (rx.items || []).some(it => String(it.name || '').trim().toLowerCase() === pname || it.productId === product.id);
  }

  function validatePrescriptionGate(items){
    const restricted = items.map(i => DB.products.find(p => p.id === i.product_id)).filter(restrictedProduct);
    if(!restricted.length) return true;
    const rxId = S.cartPrescriptionId || S.selectedPrescriptionId || S.cartRxId || null;
    if(!rxId){ toast('Obat keras/narkotika/psikotropika wajib memakai resep terverifikasi.', 'err'); return false; }
    const rx = (DB.prescriptions || []).find(r => r.id === rxId && ['Diproses','Siap Diambil','Selesai','Terverifikasi'].includes(r.status));
    if(!rx){ toast('Resep belum terverifikasi atau tidak ditemukan.', 'err'); return false; }
    const missing = restricted.find(p => !rxMatchesProduct(rx, p));
    if(missing){ toast(`Resep terpilih tidak memuat ${missing.name}.`, 'err'); return false; }
    return rxId;
  }

  function normalizeCartItems(){
    return (S.cart || []).map(c => {
      const product = DB.products.find(p => p.id === c.id || p.id === c.productId);
      if(!product) throw new Error('Produk di keranjang tidak ditemukan.');
      const qty = n(c.baseQty || c.q || c.qty);
      if(qty <= 0) throw new Error(`Qty ${product.name} tidak valid.`);
      if(n(product.stock) < qty) throw new Error(`Stok ${product.name} tidak cukup.`);
      return {
        product_id: product.id,
        unit_code: c.unitCode || product.saleUnit || product.baseUnit || null,
        qty,
        _local_product: product
      };
    });
  }

  async function checkoutCloud(){
    if(!S.cart || !S.cart.length) return toast('Keranjang masih kosong', 'err');
    const branchId = activeBranchId();
    if(!isUuid(branchId)) return toast('Cabang aktif cloud tidak valid. Pilih/aktifkan cabang cloud dulu.', 'err');

    let items;
    try{ items = normalizeCartItems(); }
    catch(err){ return toast(err.message, 'err'); }

    const prescriptionId = validatePrescriptionGate(items);
    if(prescriptionId === false) return;

    const payload = {
      branch_id: branchId,
      customer_id: isUuid(S.cartCustomerId) ? S.cartCustomerId : null,
      payment_method: S.paymentMethod || 'Tunai',
      prescription_id: isUuid(prescriptionId) ? prescriptionId : null,
      idempotency_key: uuid(),
      items: items.map(i => ({
        product_id: i.product_id,
        unit_code: i.unit_code,
        qty: i.qty
      }))
    };

    try{
      const {data, error} = await supabaseClient.rpc('checkout_transaction', {p_payload: payload});
      if(error) throw error;
      const result = Array.isArray(data) ? data[0] : (data || {});
      const tx = {
        id: result.transaction_id || uuid(),
        code: result.code || ('TRX-'+String(Date.now()).slice(-9)),
        customerId: payload.customer_id,
        branchId,
        items: items.map(i => ({productId:i.product_id, name:i._local_product.name, qty:i.qty, unitCode:i.unit_code, price:n(i._local_product.price), costBase:n(i._local_product.cost), golongan:i._local_product.golongan})),
        subtotal: n(result.subtotal),
        tax: n(result.tax || result.vat_total),
        total: n(result.total),
        payment: payload.payment_method,
        time: Date.now(),
        status: 'Selesai',
        prescriptionId: payload.prescription_id
      };
      if(!tx.subtotal){ tx.subtotal = tx.items.reduce((a,i)=>a+n(i.price)*n(i.qty),0); }
      if(!tx.tax){ tx.tax = Math.round(tx.subtotal * .11); }
      if(!tx.total){ tx.total = tx.subtotal + tx.tax; }
      items.forEach(i => { i._local_product.stock = Math.max(0, n(i._local_product.stock) - n(i.qty)); });
      DB.transactions = DB.transactions || [];
      DB.transactions.push(tx);
      if(S.cartCustomerId){
        const cust = (DB.customers || []).find(c => c.id === S.cartCustomerId);
        if(cust) cust.points = n(cust.points) + Math.floor(tx.total / 10000);
      }
      localStorage.setItem(DB_KEY, JSON.stringify(DB));
      const custName = S.cartCustomerId ? ((DB.customers || []).find(c=>c.id===S.cartCustomerId)||{}).name : 'Pelanggan Umum';
      const receipt = `ApotekKilat\n${'-'.repeat(28)}\n${tx.code}\n${new Date(tx.time).toLocaleString('id-ID')}\nPelanggan: ${custName}\n${'-'.repeat(28)}\n` + tx.items.map(it=>`${it.name} x${it.qty}\n  ${fmt(n(it.price)*n(it.qty))}`).join('\n') + `\n${'-'.repeat(28)}\nSubtotal: ${fmt(tx.subtotal)}\nPPN 11%: ${fmt(tx.tax)}\nTOTAL: ${fmt(tx.total)}\nBayar: ${tx.payment}`;
      S.cart = [];
      S.cartCustomerId = null;
      S.cartPrescriptionId = null;
      modal('Transaksi Berhasil', `<div class="receipt">${esc(receipt)}</div>`, null, {saveLabel:'Tutup'});
      render();
      toast('Checkout cloud berhasil via RPC');
    }catch(err){
      console.error(err);
      toast(err.message || 'Checkout cloud gagal via RPC', 'err');
    }
  }

  checkout = function(){
    if(cloudReady()){
      const btn = activeActionButton('[data-action="checkout"]');
      return asyncUi() ? asyncUi().run(btn, checkoutCloud, {label:'Memproses...'}) : checkoutCloud();
    }
    return previousCheckout ? previousCheckout() : toast('Checkout tidak tersedia', 'err');
  };

  function poReceivable(po){
    return ['Dalam Pengiriman','Disetujui','Approved','Partially Received','Parsial'].includes(po && po.status);
  }

  function openReceivePOForm(po){
    const items = po.items || [];
    if(!items.length) return toast('Item PO kosong', 'err');
    modal('Terima Barang PO', `<div class="form">
      <p class="muted">Penerimaan barang cloud diproses lewat RPC receive_purchase_order.</p>
      ${items.map((it,i)=>{
        const p = DB.products.find(x=>x.id===it.productId) || {};
        return `<div class="card" style="padding:12px;margin-bottom:10px">
          <b>${esc(p.name || 'Produk')}</b><br><small class="muted">Qty PO: ${n(it.qty)} · Cost PO: ${fmt(n(it.cost))}</small>
          <input type="hidden" id="ak2rpoi${i}" value="${esc(it.id || '')}" />
          <input type="hidden" id="ak2rpp${i}" value="${esc(it.productId || '')}" />
          <label>Qty Diterima<input id="ak2rpq${i}" type="number" value="${n(it.qty)}" /></label>
          <label>Harga Aktual<input id="ak2rpc${i}" type="number" value="${n(it.cost)}" /></label>
          <label>No. Batch<input id="ak2rpb${i}" placeholder="PO-${esc(po.code || '')}-${i+1}" /></label>
          <label>Expired Date<input id="ak2rpe${i}" type="date" value="${esc(it.expired || '')}" /></label>
          <label>Lokasi<input id="ak2rpl${i}" value="Gudang Pusat" /></label>
        </div>`;
      }).join('')}
    </div>`, ()=>{
      const saveBtn = document.querySelector('#modalSave');
      const task = async ()=>{
        try{
          const payloadItems = items.map((it,i)=>({
            purchase_order_item_id: document.querySelector(`#ak2rpoi${i}`).value || null,
            product_id: document.querySelector(`#ak2rpp${i}`).value || it.productId,
            qty_received: n(document.querySelector(`#ak2rpq${i}`).value),
            actual_cost: n(document.querySelector(`#ak2rpc${i}`).value),
            batch_no: document.querySelector(`#ak2rpb${i}`).value.trim() || null,
            expired_at: document.querySelector(`#ak2rpe${i}`).value || null,
            location: document.querySelector(`#ak2rpl${i}`).value || 'Gudang Pusat'
          })).filter(x=>x.qty_received > 0);
          if(!payloadItems.length){ toast('Minimal satu item diterima', 'err'); return false; }
          const {data, error} = await supabaseClient.rpc('receive_purchase_order', {p_payload:{
            purchase_order_id: po.id,
            branch_id: activeBranchId(),
            idempotency_key: uuid(),
            items: payloadItems
          }});
          if(error) throw error;
          po.status = data && data.status ? data.status : 'Parsial';
          po.receivedAt = Date.now();
          (data && data.items ? data.items : payloadItems).forEach(row=>{
            const p = DB.products.find(x=>x.id === (row.product_id || row.productId));
            if(!p) return;
            p.stock = n(p.stock) + n(row.qty_received);
            p.cost = n(row.actual_cost) || p.cost;
            p.batches = p.batches || [];
            p.batches.push({id:row.batch_id || uuid(), batchNo:row.batch_no || row.batchNo || ('PO-'+String(Date.now()).slice(-6)), received:new Date().toISOString().slice(0,10), expired:row.expired_at || row.expiredAt || null, qty:n(row.qty_received), location:row.location||'Gudang Pusat'});
          });
          localStorage.setItem(DB_KEY, JSON.stringify(DB));
          render();
          toast('Penerimaan PO berhasil via RPC');
        }catch(err){
          console.error(err);
          toast(err.message || 'Gagal menerima PO via RPC', 'err');
          return false;
        }
      };
      return asyncUi() ? asyncUi().run(saveBtn, task, {label:'Memproses...'}) : task();
    }, {saveLabel:'Terima Barang'});
  }

  document.addEventListener('click', function(e){
    if(!cloudReady()) return;
    const btn = e.target.closest('[data-po-receive],[data-detail-receive]');
    if(!btn) return;
    if(asyncUi() && asyncUi().isBusy(btn)){ e.preventDefault(); e.stopImmediatePropagation(); return; }
    const id = btn.dataset.poReceive || btn.dataset.detailReceive;
    const po = (DB.purchaseOrders || []).find(x => x.id === id);
    if(!po || !poReceivable(po)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    openReceivePOForm(po);
  }, true);

  document.addEventListener('click', async function(e){
    if(!cloudReady()) return;
    const btn = e.target.closest('[data-so-finish]');
    if(!btn) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const task = async ()=>{
      const so = (DB.stockOpnames || []).find(x => x.id === btn.dataset.soFinish);
      if(!so) return toast('Stock opname tidak ditemukan', 'err');
      const invalid = (so.items || []).find(x => n(x.diff) !== 0 && !x.reason);
      if(invalid) return toast('Semua produk dengan selisih wajib memiliki alasan', 'err');
      try{
        const {data, error} = await supabaseClient.rpc('post_stock_opname', {p_stock_opname_id: so.id});
        if(error) throw error;
        so.status = data && data.status ? data.status : 'Posted';
        so.completedAt = Date.now();
        so.postedAt = Date.now();
        localStorage.setItem(DB_KEY, JSON.stringify(DB));
        render();
        toast('Stock opname diposting via RPC');
      }catch(err){
        console.error(err);
        toast(err.message || 'Gagal posting stock opname via RPC', 'err');
      }
    };
    return asyncUi() ? asyncUi().run(btn, task, {label:'Memproses...'}) : task();
  }, true);

  window.ApotekKilatCriticalRpcWiring = {checkoutCloud};
})();
