/* P6 prescription match fix — restricted drugs require a verified prescription containing matching medicine items.
   UI/compliance guard only. Does not change stock, price, sync, or RPC logic. */
(function(){
  const RESTRICTED = ['Keras','Narkotika','Psikotropika'];
  const VERIFIED = ['Diproses','Siap Diambil','Selesai'];

  function normalizeName(value){
    return String(value || '')
      .toLowerCase()
      .replace(/\b(tablet|tab|kaplet|kapsul|capsule|sirup|syrup|mg|mcg|gram|gr|ml|strip|box|botol)\b/g,' ')
      .replace(/[^a-z0-9]+/g,' ')
      .trim()
      .replace(/\s+/g,' ');
  }

  function productForCart(cartLine){
    return (DB.products || []).find(p=>p.id === cartLine.id || p.id === cartLine.productId);
  }

  function controlledCart(){
    return (S.cart || []).map(line=>({line, product:productForCart(line)})).filter(x=>x.product && RESTRICTED.includes(x.product.golongan));
  }

  function rxItems(rx){
    return Array.isArray(rx && rx.items) ? rx.items : [];
  }

  function itemMatchesProduct(item, product){
    const itemProductId = item.productId || item.id;
    if(itemProductId && itemProductId === product.id) return true;
    const a = normalizeName(item.name || item.productName || item.obat || item.medicineName);
    const b = normalizeName(product.name);
    if(!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
  }

  function rxMatchesProduct(rx, product){
    return rxItems(rx).some(item=>itemMatchesProduct(item, product));
  }

  function rxMatchesAllControlled(rx, controlled){
    return controlled.every(entry=>rxMatchesProduct(rx, entry.product));
  }

  function eligiblePrescriptions(controlled){
    return (DB.prescriptions || [])
      .filter(rx=>VERIFIED.includes(rx.status))
      .filter(rx=>rxMatchesAllControlled(rx, controlled));
  }

  function controlledNames(controlled){
    return controlled.map(x=>x.product.name).join(', ');
  }

  function selectedEligibleRx(controlled){
    const id = S.cartPrescriptionId;
    if(!id) return null;
    const rx = (DB.prescriptions || []).find(r=>r.id === id);
    if(!rx || !VERIFIED.includes(rx.status)) return null;
    return rxMatchesAllControlled(rx, controlled) ? rx : null;
  }

  function selectRxModal(controlled, options){
    const list = eligiblePrescriptions(controlled);
    if(!list.length){
      return modal('Resep Tidak Sesuai', `<div class="form"><p>Keranjang memuat obat wajib resep:</p><p><b>${esc(controlledNames(controlled))}</b></p><p class="muted">Belum ada resep terverifikasi yang memuat obat tersebut. Buat/verifikasi resep dengan nama obat yang sama terlebih dahulu.</p></div>`, null, {saveLabel:'Tutup'});
    }
    return modal('Resep Terverifikasi Wajib', `<div class="form"><p>Keranjang memuat obat wajib resep:</p><p><b>${esc(controlledNames(controlled))}</b></p><label>Pilih resep yang memuat obat tersebut<select id="checkoutRx"><option value="">Pilih resep sesuai obat</option>${list.map(rx=>`<option value="${rx.id}">${esc(rx.patient)} · ${esc(rx.doctor || '-')} · ${esc(rx.status)}</option>`).join('')}</select></label></div>`, ()=>{
      const id = document.querySelector('#checkoutRx')?.value || '';
      if(!id) return toast('Pilih resep yang sesuai dengan obat', 'err'), false;
      S.cartPrescriptionId = id;
      if(options && typeof options.retry === 'function') return options.retry();
    }, {saveLabel:'Lanjutkan Transaksi'});
  }

  function attachPrescriptionMetadata(result, rx){
    const latest = [...(DB.transactions || [])].sort((a,b)=>(b.time||0)-(a.time||0))[0];
    if(latest && rx){
      latest.prescriptionId = rx.id;
      latest.items = (latest.items || []).map(item=>{
        const p = (DB.products || []).find(x=>x.id === item.productId);
        return {...item, golongan:item.golongan || (p && p.golongan) || 'Bebas'};
      });
      if(typeof saveDB === 'function') saveDB();
    }
    return result;
  }

  function wrapCheckout(fnName){
    const original = window[fnName];
    if(typeof original !== 'function' || original.__rxMatchWrapped) return;
    const wrapped = function(){
      const controlled = controlledCart();
      if(!controlled.length){
        S.cartPrescriptionId = null;
        return original.apply(this, arguments);
      }
      const rx = selectedEligibleRx(controlled);
      if(!rx) return selectRxModal(controlled, {retry:()=>wrapped.apply(this, arguments)});
      return attachPrescriptionMetadata(original.apply(this, arguments), rx);
    };
    wrapped.__rxMatchWrapped = true;
    window[fnName] = wrapped;
    try{ eval(fnName + ' = window[fnName]'); }catch(_e){}
  }

  function refreshPrescriptionPicker(){
    if(S.page !== 'kasir') return;
    const controlled = controlledCart();
    const old = document.querySelector('#rxForSale');
    if(old) old.remove();
    if(!controlled.length) return;
    const cart = document.querySelector('#uomCart') || document.querySelector('#cartArea');
    if(!cart) return;
    const list = eligiblePrescriptions(controlled);
    const box = document.createElement('div');
    box.className = 'notice';
    box.id = 'rxForSale';
    box.style.marginTop = '12px';
    box.innerHTML = `<i>!</i><div style="width:100%"><b>Resep sesuai obat wajib</b><small>Keranjang memuat: ${esc(controlledNames(controlled))}</small><select id="rxSaleSelect" style="margin-top:8px;width:100%"><option value="">Pilih resep yang memuat obat ini</option>${list.map(rx=>`<option value="${rx.id}" ${rx.id === S.cartPrescriptionId ? 'selected' : ''}>${esc(rx.patient)} · ${esc(rx.doctor || '-')} · ${esc(rx.status)}</option>`).join('')}</select>${!list.length?'<small class="muted">Belum ada resep terverifikasi yang cocok.</small>':''}</div>`;
    cart.appendChild(box);
    const select = box.querySelector('#rxSaleSelect');
    select.onchange = ()=>{ S.cartPrescriptionId = select.value || null; };
  }

  function patchRender(){
    if(typeof render !== 'function' || render.__rxMatchRenderWrapped) return;
    const oldRender = render;
    render = window.render = function(){
      const out = oldRender.apply(this, arguments);
      refreshPrescriptionPicker();
      return out;
    };
    render.__rxMatchRenderWrapped = true;
  }

  wrapCheckout('checkout');
  patchRender();
  document.addEventListener('click', e=>{
    const b = e.target.closest('[data-uom-checkout]');
    if(!b) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    checkout();
  }, true);

  window.ApotekKilatPrescriptionMatchFix = {eligiblePrescriptions, controlledCart, rxMatchesAllControlled, normalizeName};
})();

/* P6 discount journal fix — persist discount metadata, receipt lines, and COA-aware sales journal.
   Bundled here because this file is already loaded by index.html. */
(function(){
  const DISCOUNT_ACCOUNT={code:'4200',name:'Diskon Penjualan',class:'Beban'};
  const n=v=>Number(v)||0;
  const today=()=>new Date().toISOString().slice(0,10);
  const productById=id=>(DB.products||[]).find(p=>p.id===id);
  function ensureDiscountAccount(){DB.chartOfAccounts=DB.chartOfAccounts||[];if(!DB.chartOfAccounts.some(a=>a.code===DISCOUNT_ACCOUNT.code))DB.chartOfAccounts.push({...DISCOUNT_ACCOUNT});}
  function unit(p,code){return p?.units?.find(u=>u.code===code)||p?.units?.find(u=>u.code===p?.baseUnit)||{code:p?.baseUnit||'UNIT',label:p?.type||'Unit',factorToBase:1,price:p?.price||0,cost:p?.cost||0};}
  function normalPrice(p,code){const u=unit(p,code);return n(u.basePrice??u.price??p.price);}
  function activePL(pl,customerId,date=today()){if(!pl||pl.status==='Nonaktif')return false;if(pl.type==='Customer Group')return !!customerId&&(pl.customerIds||[]).includes(customerId);const r=pl.dateRange||{};return(!r.start||date>=r.start)&&(!r.end||date<=r.end);}
  function bestRule(productId,customerId,basePrice){const c=[];(DB.priceLists||[]).filter(pl=>activePL(pl,customerId)).forEach(pl=>{const r=(pl.rules||[]).find(x=>x.productId===productId);if(!r)return;const price=r.fixedPrice!=null&&r.fixedPrice!==''?n(r.fixedPrice):Math.max(0,Math.round(basePrice*(1-n(r.discountPercent)/100)));if(price<basePrice)c.push({price,pl,rule:r});});return c.sort((a,b)=>a.price-b.price)[0]||null;}
  function cartCtx(){return(S.cart||[]).map(line=>{const p=productById(line.id||line.productId);if(!p)return null;const code=line.unitCode||p.saleUnit||p.baseUnit,qty=n(line.q||line.qty)||1,basePrice=normalPrice(p,code),best=bestRule(p.id,S.cartCustomerId,basePrice),sellPrice=best?best.price:basePrice;return{productId:p.id,code,qty,basePrice,sellPrice,best,discountAmount:Math.max(0,(basePrice-sellPrice)*qty)};}).filter(Boolean);}
  function latestNew(before){return[...(DB.transactions||[])].reverse().find(tx=>!before.has(tx.id));}
  function applyMeta(tx,ctx){if(!tx||!ctx||!ctx.some(x=>x.discountAmount>0))return;let disc=0;tx.items=(tx.items||[]).map(it=>{const meta=ctx.find(x=>x.productId===it.productId&&(!it.unitCode||x.code===it.unitCode))||ctx.find(x=>x.productId===it.productId);if(!meta)return it;const qty=n(it.qty)||meta.qty,discountAmount=Math.max(0,(meta.basePrice-meta.sellPrice)*qty);disc+=discountAmount;return{...it,originalPrice:meta.basePrice,normalPrice:meta.basePrice,price:meta.sellPrice,discountAmount,discountPerUnit:Math.max(0,meta.basePrice-meta.sellPrice),priceListId:meta.best?.pl?.id||null,priceListName:meta.best?.pl?.name||null};});tx.discountTotal=disc;tx.grossSubtotal=(tx.items||[]).reduce((a,it)=>a+n(it.originalPrice||it.normalPrice||it.price)*n(it.qty),0);tx.subtotal=(tx.items||[]).reduce((a,it)=>a+n(it.price)*n(it.qty),0);tx.tax=Math.round(tx.subtotal*.11);tx.total=tx.subtotal+tx.tax;tx.priceListIds=[...new Set((tx.items||[]).map(it=>it.priceListId).filter(Boolean))];tx.priceListNames=[...new Set((tx.items||[]).map(it=>it.priceListName).filter(Boolean))];}
  function baseCost(it){const p=productById(it.productId),b=unit(p,p?.baseUnit);return n(it.costBase??b.cost??p?.cost);}
  function hpp(items){return(items||[]).reduce((a,it)=>{const p=productById(it.productId),u=unit(p,it.unitCode||p?.baseUnit),base=n(it.baseQty??(n(it.qty)*n(u.factorToBase||1)));return a+base*baseCost(it);},0);}
  const debit=(account,amount)=>({account,debit:Math.round(n(amount)),credit:0});
  const credit=(account,amount)=>({account,debit:0,credit:Math.round(n(amount))});
  function rebuildSaleJournal(tx){if(!tx)return;DB.journal=(DB.journal||[]).filter(j=>!(j.sourceType==='Sale'&&j.sourceId===tx.id));const gross=n(tx.grossSubtotal)||(tx.items||[]).reduce((a,it)=>a+n(it.originalPrice||it.normalPrice||it.price)*n(it.qty),0),disc=n(tx.discountTotal),net=n(tx.subtotal)||Math.max(0,gross-disc),tax=n(tx.tax),total=n(tx.total)||net+tax,cost=hpp(tx.items),cash=(tx.payment==='Kredit'||tx.payment==='Piutang')?'1100':'1000';const entries=[debit(cash,total),...(disc?[debit('4200',disc)]:[]),credit('4000',gross),debit('5000',cost),credit('1200',cost)];const d=entries.reduce((a,e)=>a+e.debit,0),c=entries.reduce((a,e)=>a+e.credit,0);if(d===c)DB.journal.push({id:uid('j'),date:tx.time||Date.now(),sourceType:'Sale',sourceId:tx.id,note:`Penjualan ${tx.code||''}${disc?' · diskon '+fmt(disc):''}`,entries});}
  function rebuildAll(){ensureDiscountAccount();(DB.transactions||[]).forEach(rebuildSaleJournal);if(typeof saveDB==='function')saveDB();}
  function wrapCheckout(){if(typeof checkout!=='function'||checkout.__discountWrapped)return;const old=checkout;checkout=window.checkout=function(){const before=new Set((DB.transactions||[]).map(tx=>tx.id)),ctx=cartCtx(),out=old.apply(this,arguments),tx=latestNew(before);if(tx){applyMeta(tx,ctx);rebuildSaleJournal(tx);if(typeof saveDB==='function')saveDB();}return out;};checkout.__discountWrapped=true;}
  function wrapModal(){if(typeof modal!=='function'||modal.__discountReceiptWrapped)return;const old=modal;modal=window.modal=function(title,html,onSave,opts){if(/Transaksi Berhasil/i.test(title||'')){const tx=[...(DB.transactions||[])].sort((a,b)=>(b.time||0)-(a.time||0))[0];if(tx&&n(tx.discountTotal)>0){const receipt=`ApotekKilat\n${'-'.repeat(28)}\n${tx.code||''}\n${new Date(tx.time).toLocaleString('id-ID')}\n${'-'.repeat(28)}\n`+(tx.items||[]).map(it=>`${it.name} x${it.qty}\n  Normal: ${fmt(n(it.originalPrice||it.normalPrice||it.price)*n(it.qty))}${n(it.discountAmount)?`\n  Diskon: -${fmt(it.discountAmount)} (${it.priceListName||'Price List'})`:''}\n  Net: ${fmt(n(it.price)*n(it.qty))}`).join('\n')+`\n${'-'.repeat(28)}\nSubtotal Normal: ${fmt(n(tx.grossSubtotal)||n(tx.subtotal)+n(tx.discountTotal))}\nDiskon: -${fmt(n(tx.discountTotal))}\nSubtotal Net: ${fmt(n(tx.subtotal))}\nPPN 11%: ${fmt(n(tx.tax))}\nTOTAL: ${fmt(n(tx.total))}\nBayar: ${tx.payment||'-'}`;html=`<div class="receipt">${esc(receipt)}</div>`;}}return old.call(this,title,html,onSave,opts);};modal.__discountReceiptWrapped=true;}
  function enhance(){ensureDiscountAccount();}
  ensureDiscountAccount();wrapModal();wrapCheckout();rebuildAll();
  if(typeof render==='function'&&!render.__discountJournalWrapped){const old=render;render=window.render=function(){const out=old.apply(this,arguments);enhance();return out;};render.__discountJournalWrapped=true;}
  window.ApotekKilatDiscountJournalFix={cartCtx,applyMeta,rebuildAll};
})();
