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
