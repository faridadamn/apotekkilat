/* Phase P2.1 — Route cloud checkout through atomic checkout_transaction() RPC.
   P6 B3 note: if the final checkout compliance pipeline is loaded, delegate to it. */
(function(){
  const uuid = () => crypto.randomUUID();
  const n = v => Number(v) || 0;

  function cloudReady(){
    return !!(window.ApotekKilatSupabaseData &&
      window.ApotekKilatSupabaseData.getMode &&
      window.ApotekKilatSupabaseData.getMode() === 'cloud' &&
      supabaseClient);
  }

  function receiptText(receipt){
    const items = receipt.items || [];
    return `ApotekKilat\n${'-'.repeat(28)}\n${receipt.transaction_code}\n${new Date(receipt.time).toLocaleString('id-ID')}\nCabang: ${receipt.branch_name || '-'}\n${'-'.repeat(28)}\n`+
      items.map(it=>`${it.product_name} x${it.qty}\n  ${fmt(n(it.line_total))}`).join('\n')+
      `\n${'-'.repeat(28)}\nSubtotal: ${fmt(n(receipt.subtotal))}\nDiskon: ${fmt(n(receipt.discount_total))}\nPPN 11%: ${fmt(n(receipt.tax))}\nTOTAL: ${fmt(n(receipt.total))}\nBayar: ${receipt.payment_method}`;
  }

  async function checkoutCloud(){
    if(!S.cart.length) return toast('Keranjang masih kosong','err');
    const branchId = DB.activeBranchId || (DB.branches[0] && DB.branches[0].id);
    if(!branchId) return toast('Cabang aktif belum tersedia','err');

    const payload = {
      branch_id: branchId,
      customer_id: S.cartCustomerId || null,
      payment_method: S.paymentMethod || 'Tunai',
      idempotency_key: uuid(),
      prescription_id: S.selectedPrescriptionId || S.cartPrescriptionId || null,
      items: S.cart.map(c=>{
        const p = DB.products.find(x=>x.id===c.id);
        return {product_id:c.id, unit_code:c.unitCode || (p && (p.saleUnit || p.baseUnit || null)), qty:n(c.q)};
      })
    };

    const {data, error} = await supabaseClient.rpc('checkout_transaction', {p_payload: payload});
    if(error) throw error;

    const r = data || {};
    const items = (r.items || []).map(it=>({
      id: it.id,
      productId: it.product_id,
      name: it.product_name,
      unitCode: it.unit_code,
      qty: n(it.qty),
      baseQty: n(it.base_qty),
      price: n(it.price),
      costBase: n(it.cost_base),
      originalPrice: n(it.original_price),
      discountAmount: n(it.discount_amount),
      priceListId: it.price_list_id || null,
      priceListName: it.price_list_name || null,
      golongan: it.drug_class || null
    }));

    DB.transactions.unshift({
      id: r.transaction_id,
      code: r.code,
      customerId: r.customer_id || S.cartCustomerId || null,
      branchId: r.branch_id || branchId,
      subtotal: n(r.subtotal),
      discountTotal: n(r.discount_total),
      tax: n(r.tax),
      total: n(r.total),
      payment: r.payment_method || payload.payment_method,
      status: 'Selesai',
      time: Date.now(),
      prescriptionId: payload.prescription_id,
      priceListIds: r.price_list_ids || [],
      items
    });

    items.forEach(it=>{
      const p = DB.products.find(x=>x.id===it.productId);
      if(p) p.stock = Math.max(n(p.stock) - n(it.baseQty || it.qty), 0);
    });
    if(S.cartCustomerId && r.points_added){
      const c = DB.customers.find(x=>x.id===S.cartCustomerId);
      if(c) c.points += n(r.points_added);
    }

    localStorage.setItem(DB_KEY, JSON.stringify(DB));
    S.cart = [];
    S.cartCustomerId = null;
    S.cartPrescriptionId = null;
    S.selectedPrescriptionId = null;
    modal('Transaksi Berhasil', `<div class="receipt">${esc(receiptText(r.receipt || r))}</div>`, null, {saveLabel:'Tutup'});
    render();
    toast('Transaksi cloud berhasil via RPC');
  }

  document.addEventListener('click', async (e)=>{
    const btn = e.target.closest('[data-action="checkout"]');
    if(!btn || !cloudReady()) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    try{
      btn.disabled = true;
      if(window.ApotekKilatP6B3CheckoutCompliance && typeof window.ApotekKilatP6B3CheckoutCompliance.checkout === 'function'){
        await window.ApotekKilatP6B3CheckoutCompliance.checkout();
      } else {
        await checkoutCloud();
      }
    }catch(err){
      console.error(err);
      toast(err.message || 'Checkout cloud gagal','err');
    }finally{
      btn.disabled = false;
    }
  }, true);
})();