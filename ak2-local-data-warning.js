/* Free/local mode data retention warning.
   Makes localStorage limitation visible in the UI, not only in comments/settings. */
(function(){
  function isCloudMode(){
    return !!(window.ApotekKilatSupabaseData &&
      window.ApotekKilatSupabaseData.getMode &&
      window.ApotekKilatSupabaseData.getMode() === 'cloud');
  }

  function isLocalFreeMode(){
    return !!(DB && DB.meta && DB.meta.freeTierOfflineFirst && !isCloudMode());
  }

  function bannerHtml(){
    return `<div class="ak2-local-data-warning">
      <div><b>Data lokal: hanya tersimpan di perangkat/browser ini.</b><br><span>Jika cache/browser dihapus, ganti device, install ulang browser, atau localStorage terhapus, data bisa hilang permanen. Tier gratis tidak memiliki backup otomatis.</span></div>
      <button class="outline" data-action="cloud-login">Gunakan Cloud untuk Backup</button>
    </div>`;
  }

  function injectBanner(){
    if(!isLocalFreeMode()) return;
    const pages = document.querySelector('#pages');
    if(!pages || pages.querySelector('.ak2-local-data-warning')) return;
    pages.insertAdjacentHTML('afterbegin', bannerHtml());
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
      injectBanner();
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

  setTimeout(()=>{ injectBanner(); injectSettingsWarning(); }, 120);
})();
