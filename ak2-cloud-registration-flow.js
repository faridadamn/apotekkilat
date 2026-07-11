/* Manual cloud registration/payment flow.
   Source of truth:
   - Supabase handles auth/email verification.
   - Cloud tenant activation remains manual after payment verification.
   - WhatsApp/email automation is not implemented here; this frontend opens a prepared WhatsApp message. */
(function(){
  const SUPPORT_WA = '628159776654';
  const PRICE_TEXT = 'Rp50.000/bulan';
  const PAYMENT_INFO_TEXT = 'Nomor rekening / QRIS akan dikirim oleh support setelah pendaftaran cloud diterima.';

  function authModeValue(){
    return (typeof authMode !== 'undefined') ? authMode : 'login';
  }

  function waText(kind){
    const email = (document.querySelector('#authEmail') || {}).value || ((typeof authSession !== 'undefined' && authSession && authSession.user) ? authSession.user.email : '');
    const phone = (document.querySelector('#authWhatsapp') || {}).value || '';
    const pharmacy = (typeof DB !== 'undefined' && DB && DB.settings && DB.settings.pharmacyName) ? DB.settings.pharmacyName : '';
    if(kind === 'payment-confirm'){
      return `Halo Support ApotekKilat, saya ingin konfirmasi pembayaran cloud.%0A%0AEmail: ${encodeURIComponent(email || '-')}%0ANo WhatsApp: ${encodeURIComponent(phone || '-')}%0ANama Apotek: ${encodeURIComponent(pharmacy || '-')}%0A%0ASaya akan lampirkan bukti transfer.`;
    }
    return `Halo Support ApotekKilat, saya baru daftar cloud dan ingin mendapatkan instruksi pembayaran.%0A%0AEmail: ${encodeURIComponent(email || '-')}%0ANo WhatsApp: ${encodeURIComponent(phone || '-')}%0ANama Apotek: ${encodeURIComponent(pharmacy || '-')}%0A%0AMohon kirim info rekening/QRIS dan langkah pembayaran.`;
  }

  function openSupportWhatsApp(kind){
    window.open(`https://wa.me/${SUPPORT_WA}?text=${waText(kind)}`, '_blank', 'noopener');
  }

  function ensureWhatsappField(){
    const form = document.querySelector('#authForm');
    const pass = document.querySelector('#authPassword');
    if(!form || !pass) return;
    let wrap = document.querySelector('#authWhatsappWrap');
    const isSignup = authModeValue() === 'signup';
    if(!wrap){
      wrap = document.createElement('label');
      wrap.id = 'authWhatsappWrap';
      wrap.innerHTML = 'No. WhatsApp<input id="authWhatsapp" type="tel" autocomplete="tel" placeholder="0812..."/>';
      pass.closest('label').insertAdjacentElement('afterend', wrap);
    }
    wrap.style.display = isSignup ? '' : 'none';
    const input = document.querySelector('#authWhatsapp');
    if(input) input.required = isSignup;
  }

  function showPaymentInstruction(){
    if(typeof modal !== 'function') return;
    modal('Pendaftaran Cloud Diterima', `<div class="form">
      <p><b>Akun cloud berhasil dibuat.</b></p>
      <p class="muted">Silakan cek email untuk verifikasi Supabase. Setelah email terverifikasi, aktivasi cloud tetap menunggu pembayaran dan verifikasi manual oleh support.</p>
      <div class="card" style="box-shadow:none;background:#f6fffa;border-color:#b8ebcf">
        <div class="title"><span>Langkah Berikutnya</span>${typeof status === 'function' ? status('Manual','warn') : ''}</div>
        <p class="muted"><b style="color:var(--ink)">1.</b> Hubungi WhatsApp support untuk menerima foto/info pembayaran.</p>
        <p class="muted"><b style="color:var(--ink)">2.</b> Lakukan pembayaran paket cloud awal: <b style="color:var(--ink)">${PRICE_TEXT}</b>.</p>
        <p class="muted"><b style="color:var(--ink)">3.</b> Konfirmasi pembayaran via WhatsApp.</p>
        <p class="muted"><b style="color:var(--ink)">4.</b> Setelah diverifikasi, support akan mengirim cara backup data lokal.</p>
        <p class="muted"><b style="color:var(--ink)">5.</b> Kirim file backup ke support untuk migrasi manual.</p>
        <p class="muted"><b style="color:var(--ink)">6.</b> Admin akan registrasi pharmacy/tenant cloud dan menginformasikan saat data siap.</p>
      </div>
      <p class="muted">${PAYMENT_INFO_TEXT}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="primary" style="flex:1" data-action="cloud-payment-wa">💬 Hubungi Support</button>
        <button type="button" class="outline" style="flex:1" data-action="cloud-confirm-payment-wa">Konfirmasi Bayar</button>
      </div>
    </div>`, null, {hideSave:true});
  }

  function patchAuthSubmit(){
    const form = document.querySelector('#authForm');
    if(!form || form.dataset.ak2CloudRegistrationPatched) return;
    form.dataset.ak2CloudRegistrationPatched = '1';
    form.addEventListener('submit', async function(e){
      if(authModeValue() !== 'signup') return;
      e.preventDefault();
      e.stopPropagation();
      if(!supabaseClient) return typeof showAuthGate === 'function' && showAuthGate('Supabase belum siap. Periksa konfigurasi project.');
      const email = document.querySelector('#authEmail').value.trim();
      const password = document.querySelector('#authPassword').value;
      const whatsapp = (document.querySelector('#authWhatsapp') || {}).value || '';
      if(!email || !password || !whatsapp){
        if(typeof authNotice === 'function') authNotice('Email, password, dan No. WhatsApp wajib diisi untuk daftar cloud.');
        return;
      }
      if(typeof setAuthLoading === 'function') setAuthLoading(true);
      if(typeof authNotice === 'function') authNotice('');
      const result = await supabaseClient.auth.signUp({
        email,
        password,
        options:{data:{whatsapp, registration_flow:'manual_cloud_payment', cloud_status:'waiting_payment_instruction'}}
      });
      if(typeof setAuthLoading === 'function') setAuthLoading(false);
      if(result.error){
        if(typeof authNotice === 'function') authNotice(result.error.message);
        return;
      }
      showPaymentInstruction();
      if(typeof authNotice === 'function') authNotice('Akun dibuat. Cek email untuk verifikasi, lalu hubungi support untuk pembayaran dan aktivasi cloud.');
      if(typeof setAuthMode === 'function') setAuthMode('login');
    }, true);
  }

  function patchAuthMode(){
    if(typeof setAuthMode === 'function' && !window.__ak2OriginalSetAuthMode){
      window.__ak2OriginalSetAuthMode = setAuthMode;
      setAuthMode = function(mode){
        window.__ak2OriginalSetAuthMode(mode);
        setTimeout(ensureWhatsappField, 0);
        const sub = document.querySelector('#authSubtitle');
        if(sub && mode === 'signup'){
          sub.textContent = 'Daftar akun cloud. Aktivasi tenant dilakukan setelah pembayaran dan verifikasi manual support.';
        }
      };
    }
  }

  document.addEventListener('click', function(e){
    const payment = e.target.closest('[data-action="cloud-payment-wa"]');
    if(payment){ e.preventDefault(); openSupportWhatsApp('payment-info'); return; }
    const confirm = e.target.closest('[data-action="cloud-confirm-payment-wa"]');
    if(confirm){ e.preventDefault(); openSupportWhatsApp('payment-confirm'); return; }
  }, true);

  function boot(){
    patchAuthMode();
    ensureWhatsappField();
    patchAuthSubmit();
  }

  window.ApotekKilatCloudRegistrationFlow = {showPaymentInstruction, openSupportWhatsApp, ensureWhatsappField};
  setTimeout(boot, 0);
  setInterval(boot, 1200);
})();
