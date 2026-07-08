/* Iterasi 2 — reusable async action guard.
   Prevents double-click / double-submit on critical async Supabase/RPC actions. */
(function(){
  const pending = new WeakSet();

  function setBusy(btn, label){
    if(!btn || pending.has(btn)) return false;
    pending.add(btn);
    btn.dataset.ak2OriginalText = btn.textContent || '';
    btn.dataset.ak2OriginalHtml = btn.innerHTML || '';
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.classList.add('ak2-busy');
    btn.innerHTML = `<span class="ak2-spinner" aria-hidden="true"></span>${label || 'Memproses...'}`;
    return true;
  }

  function clearBusy(btn){
    if(!btn) return;
    pending.delete(btn);
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.classList.remove('ak2-busy');
    if(btn.dataset.ak2OriginalHtml != null){
      btn.innerHTML = btn.dataset.ak2OriginalHtml;
      delete btn.dataset.ak2OriginalHtml;
    }else if(btn.dataset.ak2OriginalText != null){
      btn.textContent = btn.dataset.ak2OriginalText;
    }
    delete btn.dataset.ak2OriginalText;
  }

  function isBusy(btn){
    return !!(btn && pending.has(btn));
  }

  async function run(btn, task, opts){
    const options = opts || {};
    if(btn && pending.has(btn)) return false;
    const locked = btn ? setBusy(btn, options.label || 'Memproses...') : false;
    try{
      return await task();
    }finally{
      if(locked && (!options.keepDisabled || !document.body.contains(btn))) clearBusy(btn);
      else if(locked && !options.keepDisabled) clearBusy(btn);
    }
  }

  function guardClick(btn, label){
    if(!btn) return false;
    if(pending.has(btn)) return false;
    return setBusy(btn, label || 'Memproses...');
  }

  function release(btn){ clearBusy(btn); }

  window.ApotekKilatAsyncAction = {run, guardClick, release, isBusy};
})();
