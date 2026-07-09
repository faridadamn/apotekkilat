/* ak2-mobile-cart-bar.js
   Iterasi 3 — Sticky checkout bar khusus mobile untuk halaman Kasir.
   Bar ini hanya memicu tombol checkout asli, bukan membuat logic checkout baru. */
(function(){
  function isMobile(){ return window.innerWidth <= 720; }
  function isKasirPage(){ return typeof S !== 'undefined' && S.page === 'kasir'; }
  function setVisibleState(visible){ document.body.classList.toggle('ak2-cartbar-visible', !!visible); }

  function ensureBar(){
    let bar = document.querySelector('.ak2-cartbar');
    if(!bar){
      bar = document.createElement('div');
      bar.className = 'ak2-cartbar';
      bar.innerHTML = `
        <div class="ak2-cartbar-info">
          <div class="ak2-cartbar-count">Keranjang <b id="ak2CartCount">0</b></div>
          <div class="ak2-cartbar-total" id="ak2CartTotal">Rp0</div>
        </div>
        <button type="button" id="ak2CartBarBtn">Bayar</button>
      `;
      document.body.appendChild(bar);
      bar.querySelector('#ak2CartBarBtn').addEventListener('click', function(){
        const realBtn = document.querySelector('[data-uom-checkout],[data-action="checkout"]');
        if(realBtn){ realBtn.click(); return; }
        if(typeof checkout === 'function') checkout();
      });
    }
    return bar;
  }

  function fmtIDR(n){
    try{ return 'Rp' + Math.round(Number(n)||0).toLocaleString('id-ID'); }
    catch(e){ return 'Rp' + (Math.round(Number(n)||0)); }
  }

  function cartTotals(){
    if(typeof S === 'undefined' || !Array.isArray(S.cart) || !S.cart.length) return {count:0, total:0};
    let count = 0, sub = 0;
    S.cart.forEach(function(c){
      const p = (typeof DB !== 'undefined' ? (DB.products || []).find(x=>x.id===c.id) : null);
      const qty = Number(c.q || c.qty || 1) || 1;
      count += qty;
      if(p && typeof U !== 'undefined' && U.price){
        sub += U.price(p, c.unitCode || p.saleUnit) * qty;
      }else if(p){
        sub += (Number(p.price)||0) * qty;
      }
    });
    const tax = Math.round(sub * .11);
    return {count, total: sub + tax};
  }

  function update(){
    if(!isMobile() || !isKasirPage()){
      const bar = document.querySelector('.ak2-cartbar');
      if(bar) bar.classList.remove('show');
      setVisibleState(false);
      return;
    }
    const {count, total} = cartTotals();
    const bar = ensureBar();
    if(count > 0){
      document.querySelector('#ak2CartCount').textContent = count;
      document.querySelector('#ak2CartTotal').textContent = fmtIDR(total);
      bar.classList.add('show');
      setVisibleState(true);
    }else{
      bar.classList.remove('show');
      setVisibleState(false);
    }
  }

  const oldRender = typeof render === 'function' ? render : null;
  if(oldRender){
    render = function(){
      const out = oldRender.apply(this, arguments);
      setTimeout(update, 0);
      return out;
    };
  }
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  setTimeout(update, 0);
})();
