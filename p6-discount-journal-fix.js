/* P6 discount journal fix — persist discount metadata, receipt lines, and COA-aware sales journal.
   Controlled accounting patch only. Does not change product, stock, prescription, PO, or cloud sync logic. */
(function(){
  const DISCOUNT_ACCOUNT = {code:'4200', name:'Diskon Penjualan', class:'Beban'};

  function n(v){ return Number(v) || 0; }
  function today(){ return new Date().toISOString().slice(0,10); }
  function productById(id){ return (DB.products || []).find(p=>p.id === id); }
  function unit(p, code){
    return p?.units?.find(u=>u.code === code) || p?.units?.find(u=>u.code === p?.baseUnit) || {code:p?.baseUnit || 'UNIT', label:p?.type || 'Unit', factorToBase:1, price:p?.price || 0, cost:p?.cost || 0};
  }
  function normalPrice(p, code){
    const u = unit(p, code);
    return n(u.basePrice ?? u.price ?? p.price);
  }
  function activePriceList(pl, customerId, date=today()){
    if(!pl || pl.status === 'Nonaktif') return false;
    if(pl.type === 'Customer Group') return !!customerId && (pl.customerIds || []).includes(customerId);
    const r = pl.dateRange || {};
    return (!r.start || date >= r.start) && (!r.end || date <= r.end);
  }
  function bestRule(productId, customerId, basePrice){
    const candidates = [];
    (DB.priceLists || []).filter(pl=>activePriceList(pl, customerId)).forEach(pl=>{
      const rule = (pl.rules || []).find(r=>r.productId === productId);
      if(!rule) return;
      const price = rule.fixedPrice != null && rule.fixedPrice !== '' ? n(rule.fixedPrice) : Math.max(0, Math.round(basePrice * (1 - (n(rule.discountPercent) / 100))));
      if(price < basePrice) candidates.push({price, pl, rule});
    });
    return candidates.sort((a,b)=>a.price-b.price)[0] || null;
  }
  function cartDiscountContext(){
    return (S.cart || []).map(line=>{
      const p = productById(line.id || line.productId);
      if(!p) return null;
      const code = line.unitCode || p.saleUnit || p.baseUnit;
      const qty = n(line.q || line.qty) || 1;
      const basePrice = normalPrice(p, code);
      const best = bestRule(p.id, S.cartCustomerId, basePrice);
      const sellPrice = best ? best.price : basePrice;
      return {productId:p.id, code, qty, basePrice, sellPrice, best, discountAmount:Math.max(0, (basePrice - sellPrice) * qty)};
    }).filter(Boolean);
  }
  function latestNewTransaction(beforeIds){
    return [...(DB.transactions || [])].reverse().find(tx=>!beforeIds.has(tx.id)) || null;
  }
  function ensureDiscountAccount(){
    DB.chartOfAccounts = DB.chartOfAccounts || [];
    if(!DB.chartOfAccounts.some(a=>a.code === DISCOUNT_ACCOUNT.code)) DB.chartOfAccounts.push({...DISCOUNT_ACCOUNT});
  }
  function applyDiscountMetadata(tx, ctx){
    if(!tx || !ctx || !ctx.some(x=>x.discountAmount > 0)) return;
    const byProduct = new Map(ctx.map(x=>[x.productId + '|' + x.code, x]));
    let discountTotal = 0;
    tx.items = (tx.items || []).map(item=>{
      const key = item.productId + '|' + (item.unitCode || byProduct.get(item.productId + '|')?.code || '');
      let meta = byProduct.get(key) || ctx.find(x=>x.productId === item.productId);
      if(!meta) return item;
      const qty = n(item.qty) || meta.qty;
      const discountAmount = Math.max(0, (meta.basePrice - meta.sellPrice) * qty);
      discountTotal += discountAmount;
      return {
        ...item,
        originalPrice: meta.basePrice,
        normalPrice: meta.basePrice,
        price: meta.sellPrice,
        discountAmount,
        discountPerUnit: Math.max(0, meta.basePrice - meta.sellPrice),
        priceListId: meta.best?.pl?.id || null,
        priceListName: meta.best?.pl?.name || null
      };
    });
    tx.discountTotal = discountTotal;
    tx.grossSubtotal = (tx.items || []).reduce((a,it)=>a+n(it.originalPrice || it.normalPrice || it.price) * n(it.qty), 0);
    tx.subtotal = (tx.items || []).reduce((a,it)=>a+n(it.price) * n(it.qty), 0);
    tx.tax = Math.round(tx.subtotal * .11);
    tx.total = tx.subtotal + tx.tax;
    tx.priceListIds = [...new Set((tx.items || []).map(it=>it.priceListId).filter(Boolean))];
    tx.priceListNames = [...new Set((tx.items || []).map(it=>it.priceListName).filter(Boolean))];
  }

  function wrapCheckout(){
    if(typeof checkout !== 'function' || checkout.__discountJournalWrapped) return;
    const oldCheckout = checkout;
    checkout = window.checkout = function(){
      const beforeIds = new Set((DB.transactions || []).map(tx=>tx.id));
      const ctx = cartDiscountContext();
      const out = oldCheckout.apply(this, arguments);
      const tx = latestNewTransaction(beforeIds);
      if(tx){
        applyDiscountMetadata(tx, ctx);
        if(typeof saveDB === 'function') saveDB();
      }
      return out;
    };
    checkout.__discountJournalWrapped = true;
  }

  function receiptPatch(){
    if(typeof modal !== 'function' || modal.__discountReceiptWrapped) return;
    const oldModal = modal;
    modal = window.modal = function(title, html, onSave, opts){
      if(/Transaksi Berhasil/i.test(title || '')){
        const tx = [...(DB.transactions || [])].sort((a,b)=>(b.time||0)-(a.time||0))[0];
        if(tx && n(tx.discountTotal) > 0){
          const receipt = `ApotekKilat\n${'-'.repeat(28)}\n${tx.code || ''}\n${new Date(tx.time).toLocaleString('id-ID')}\n${'-'.repeat(28)}\n` +
            (tx.items || []).map(it=>`${it.name} x${it.qty}\n  Normal: ${fmt((it.originalPrice || it.normalPrice || it.price) * n(it.qty))}${n(it.discountAmount) ? `\n  Diskon: -${fmt(it.discountAmount)} (${it.priceListName || 'Price List'})` : ''}\n  Net: ${fmt(n(it.price) * n(it.qty))}`).join('\n') +
            `\n${'-'.repeat(28)}\nSubtotal Normal: ${fmt(n(tx.grossSubtotal) || n(tx.subtotal) + n(tx.discountTotal))}\nDiskon: -${fmt(n(tx.discountTotal))}\nSubtotal Net: ${fmt(n(tx.subtotal))}\nPPN 11%: ${fmt(n(tx.tax))}\nTOTAL: ${fmt(n(tx.total))}\nBayar: ${tx.payment || '-'}`;
          html = `<div class="receipt">${esc(receipt)}</div>`;
        }
      }
      return oldModal.call(this, title, html, onSave, opts);
    };
    modal.__discountReceiptWrapped = true;
  }

  function hpp(items){
    return (items || []).reduce((sum,it)=>{
      const p = productById(it.productId);
      const base = n(it.baseQty ?? (n(it.qty) * n(unit(p, it.unitCode || p?.baseUnit).factorToBase || 1)));
      const baseUnit = unit(p, p?.baseUnit);
      const cost = n(it.costBase ?? baseUnit.cost ?? p?.cost);
      return sum + base * cost;
    },0);
  }
  function debit(account, amount){ return {account, debit:Math.round(n(amount)), credit:0}; }
  function credit(account, amount){ return {account, debit:0, credit:Math.round(n(amount))}; }
  function rebuildSalesJournal(tx){
    if(!tx) return;
    DB.journal = (DB.journal || []).filter(j=>!(j.sourceType === 'Sale' && j.sourceId === tx.id));
    const gross = n(tx.grossSubtotal) || (tx.items || []).reduce((a,it)=>a+n(it.originalPrice || it.normalPrice || it.price) * n(it.qty),0);
    const discount = n(tx.discountTotal);
    const net = n(tx.subtotal) || Math.max(0, gross - discount);
    const tax = n(tx.tax);
    const total = n(tx.total) || net + tax;
    const cost = hpp(tx.items);
    const cashAccount = (tx.payment === 'Kredit' || tx.payment === 'Piutang') ? '1100' : '1000';
    const entries = [
      debit(cashAccount, total),
      ...(discount ? [debit('4200', discount)] : []),
      credit('4000', gross),
      debit('5000', cost),
      credit('1200', cost)
    ];
    const d = entries.reduce((a,e)=>a+e.debit,0), c = entries.reduce((a,e)=>a+e.credit,0);
    if(d === c && entries.some(e=>e.debit || e.credit)){
      DB.journal.push({id:uid('j'), date:tx.time || Date.now(), sourceType:'Sale', sourceId:tx.id, note:`Penjualan ${tx.code || ''}${discount ? ' · diskon ' + fmt(discount) : ''}`, entries});
    }
  }
  function rebuildAllSalesJournal(){
    ensureDiscountAccount();
    (DB.transactions || []).forEach(rebuildSalesJournal);
    if(typeof saveDB === 'function') saveDB();
  }

  function enhanceSalesTransactionView(){
    if(S.page !== 'kasir') return;
    document.querySelectorAll('#cartArea,#uomCart').forEach(box=>{
      if(!box || box.querySelector('#discountMetaNotice')) return;
      const tx = [...(DB.transactions || [])].sort((a,b)=>(b.time||0)-(a.time||0))[0];
      if(!tx || !n(tx.discountTotal)) return;
      const div = document.createElement('div');
      div.id = 'discountMetaNotice';
      div.className = 'notice';
      div.style.marginTop = '12px';
      div.innerHTML = `<i>🏷</i><div><b>Diskon transaksi terakhir: ${fmt(tx.discountTotal)}</b><small>${esc((tx.priceListNames || []).join(' · ') || 'Price List')}</small></div>`;
      box.appendChild(div);
    });
  }

  ensureDiscountAccount();
  wrapCheckout();
  receiptPatch();
  rebuildAllSalesJournal();

  if(typeof render === 'function' && !render.__discountJournalWrapped){
    const oldRender = render;
    render = window.render = function(){
      const out = oldRender.apply(this, arguments);
      ensureDiscountAccount();
      enhanceSalesTransactionView();
      return out;
    };
    render.__discountJournalWrapped = true;
  }

  window.ApotekKilatDiscountJournalFix = {cartDiscountContext, applyDiscountMetadata, rebuildAllSalesJournal};
})();
