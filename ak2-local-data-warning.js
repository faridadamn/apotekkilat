/* Free/local mode data retention warning.
   Keep the disclaimer visible in Settings only so it does not interrupt daily workflows. */
(function(){
  function isCloudMode(){
    return !!(window.ApotekKilatSupabaseData &&
      window.ApotekKilatSupabaseData.getMode &&
      window.ApotekKilatSupabaseData.getMode() === 'cloud');
  }

  function isLocalFreeMode(){
    return !!(DB && DB.meta && DB.meta.freeTierOfflineFirst && !isCloudMode());
  }

  function injectSettingsWarning(){
    if(!isLocalFreeMode() || S.page !== 'pengaturan') return;
    const settingsCard = document.querySelector('#pages .card');
    if(!settingsCard || document.querySelector('#ak2LocalDataSettingsWarning')) return;
    settingsCard.insertAdjacentHTML('beforebegin', `<div id="ak2LocalDataSettingsWarning" class="card ak2-local-data-card">
      <div class="title"><span>Risiko Penyimpanan Lokal</span>${status('Wajib Dipahami','warn')}</div>
      <p><b>Tidak ada backup otomatis di tier gratis.</b></p>
      <p class="muted">Semua transaksi, master produk, pelanggan, price list, resep, PO, retur, dan laporan tersimpan di localStorage browser ini. Menghapus cache/browser, mengganti device, atau install ulang browser dapat menghapus data permanen.</p>
      <p class="muted">Gunakan Cloud jika butuh sinkronisasi, multi-device, dan backup.</p>
      <button class="outline" data-action="cloud-login">Masuk Cloud</button>
    </div><div style="height:16px"></div>`);
  }

  const originalRender = typeof render === 'function' ? render : null;
  if(originalRender){
    render = function(){
      const out = originalRender.apply(this, arguments);
      injectSettingsWarning();
      return out;
    };
  }

  const originalAction = typeof action === 'function' ? action : null;
  if(originalAction){
    action = function(a, el){
      if(a === 'cloud-login' && window.ApotekKilatFreeTier && window.ApotekKilatFreeTier.openCloudLogin){
        return window.ApotekKilatFreeTier.openCloudLogin();
      }
      return originalAction(a, el);
    };
  }

  setTimeout(()=>{ injectSettingsWarning(); }, 120);
})();
