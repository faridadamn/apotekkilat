/* Phase P0 — Auth hardening: strong password UX, reset password flow, and optional Owner MFA. */
(function(){
  const MIN_PASSWORD_LENGTH = 12;

  function strongPasswordError(password){
    if(!password || password.length < MIN_PASSWORD_LENGTH) return `Password minimal ${MIN_PASSWORD_LENGTH} karakter.`;
    if(!/[a-z]/.test(password)) return 'Password wajib memiliki huruf kecil.';
    if(!/[A-Z]/.test(password)) return 'Password wajib memiliki huruf besar.';
    if(!/[0-9]/.test(password)) return 'Password wajib memiliki angka.';
    if(!/[!@#$%^&*()_+\-=\[\]{};'\\:"|<>?,./`~]/.test(password)) return 'Password wajib memiliki simbol.';
    return '';
  }

  function authRedirectUrl(){
    const url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.set('auth_action', 'update_password');
    return url.toString();
  }

  function addAuthSecurityControls(){
    const form = document.querySelector('#authForm');
    const toggle = document.querySelector('#authModeToggle');
    const password = document.querySelector('#authPassword');
    if(!form || form.dataset.authSecurityReady === '1') return;
    form.dataset.authSecurityReady = '1';

    if(password){
      password.minLength = MIN_PASSWORD_LENGTH;
      password.placeholder = 'Minimal 12 karakter + huruf besar, angka, simbol';
    }

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'link-btn';
    resetBtn.id = 'authResetPassword';
    resetBtn.textContent = 'Lupa password?';
    if(toggle) toggle.insertAdjacentElement('afterend', resetBtn);

    resetBtn.onclick = async ()=>{
      if(!supabaseClient) return authNotice('Supabase belum siap. Periksa konfigurasi project.');
      const email = document.querySelector('#authEmail').value.trim();
      if(!email) return authNotice('Isi email terlebih dahulu untuk reset password.');
      resetBtn.disabled = true;
      const {error} = await supabaseClient.auth.resetPasswordForEmail(email, {redirectTo: authRedirectUrl()});
      resetBtn.disabled = false;
      if(error) return authNotice(error.message);
      authNotice('Link reset password sudah dikirim. Cek email Anda.');
    };

    form.onsubmit = async (e)=>{
      e.preventDefault();
      if(!supabaseClient) return showAuthGate('Supabase belum siap. Periksa konfigurasi project.');
      const email = document.querySelector('#authEmail').value.trim();
      const pass = document.querySelector('#authPassword').value;
      if(!email || !pass) return authNotice('Email dan password wajib diisi.');
      if(authMode === 'signup'){
        const err = strongPasswordError(pass);
        if(err) return authNotice(err);
      }
      setAuthLoading(true);
      authNotice('');
      const result = authMode === 'login'
        ? await supabaseClient.auth.signInWithPassword({email, password:pass})
        : await supabaseClient.auth.signUp({
            email,
            password:pass,
            options:{emailRedirectTo: new URL(window.location.href).origin + new URL(window.location.href).pathname}
          });
      setAuthLoading(false);
      if(result.error) return authNotice(result.error.message);
      if(authMode === 'signup' && !result.data.session){
        authNotice('Akun dibuat. Cek email untuk konfirmasi, lalu masuk kembali.');
        setAuthMode('login');
        return;
      }
      authSession = result.data.session;
      showApp();
    };
  }

  async function handleRecoverySession(){
    if(!supabaseClient) return;
    const params = new URLSearchParams(window.location.search);
    if(params.get('auth_action') !== 'update_password') return;
    const {data} = await supabaseClient.auth.getSession();
    if(!data || !data.session) return;
    authSession = data.session;
    const askPassword = ()=> modal('Buat Password Baru', `<div class="form">
      <label>Password Baru<input id="newRecoveryPassword" type="password" autocomplete="new-password" placeholder="Minimal 12 karakter + huruf besar, angka, simbol"/></label>
      <label>Ulangi Password<input id="newRecoveryPassword2" type="password" autocomplete="new-password"/></label>
      <p class="muted" style="font-size:12px">Password kuat membantu menutup risiko credential stuffing.</p>
    </div>`, async ()=>{
      const p1 = document.querySelector('#newRecoveryPassword').value;
      const p2 = document.querySelector('#newRecoveryPassword2').value;
      const err = strongPasswordError(p1);
      if(err) return toast(err, 'err'), false;
      if(p1 !== p2) return toast('Konfirmasi password tidak sama.', 'err'), false;
      const {error} = await supabaseClient.auth.updateUser({password:p1});
      if(error) return toast(error.message, 'err'), false;
      params.delete('auth_action');
      window.history.replaceState({}, document.title, window.location.pathname);
      toast('Password berhasil diperbarui.');
      showApp();
    }, {saveLabel:'Simpan Password'});
    setTimeout(askPassword, 250);
  }

  function currentMembership(){
    const uid = authSession && authSession.user ? authSession.user.id : null;
    return (DB.users || []).find(u => u.userId === uid && u.status === 'Aktif') || null;
  }

  function currentRole(){
    const me = currentMembership();
    return me ? me.role : 'Viewer';
  }

  async function renderMfaSummary(){
    const box = document.querySelector('#mfaStatusBox');
    if(!box || !supabaseClient || !supabaseClient.auth.mfa) return;
    const {data, error} = await supabaseClient.auth.mfa.listFactors();
    if(error) { box.textContent = error.message; return; }
    const verified = (data && data.totp || []).filter(f=>f.status === 'verified');
    box.innerHTML = verified.length
      ? `<b>${verified.length} TOTP aktif</b><br><span class="muted">MFA sudah terpasang untuk akun ini.</span>`
      : '<b>Belum aktif</b><br><span class="muted">Owner disarankan mengaktifkan TOTP MFA.</span>';
  }

  async function startMfaEnroll(){
    if(!supabaseClient || !supabaseClient.auth.mfa) return toast('MFA tidak tersedia di Supabase JS saat ini.', 'err');
    const {data, error} = await supabaseClient.auth.mfa.enroll({factorType:'totp'});
    if(error) return toast(error.message, 'err');
    const qr = data && data.totp ? data.totp.qr_code : '';
    const factorId = data.id;
    modal('Aktifkan MFA TOTP', `<div class="form">
      <p class="muted">Scan QR dengan Google Authenticator, Authy, 1Password, atau password manager lain, lalu masukkan kode 6 digit.</p>
      ${qr ? `<div style="text-align:center"><img alt="MFA QR" src="${qr}" style="max-width:220px;width:100%"></div>` : ''}
      <label>Kode 6 digit<input id="mfaCode" inputmode="numeric" maxlength="6" placeholder="123456"/></label>
    </div>`, async ()=>{
      const code = document.querySelector('#mfaCode').value.trim();
      if(!/^\d{6}$/.test(code)) return toast('Kode MFA harus 6 digit.', 'err'), false;
      const challenge = await supabaseClient.auth.mfa.challenge({factorId});
      if(challenge.error) return toast(challenge.error.message, 'err'), false;
      const verify = await supabaseClient.auth.mfa.verify({factorId, challengeId:challenge.data.id, code});
      if(verify.error) return toast(verify.error.message, 'err'), false;
      toast('MFA berhasil diaktifkan.');
      renderMfaSummary();
    }, {saveLabel:'Verifikasi MFA'});
  }

  const previousSettings = settings;
  settings = function(){
    const html = previousSettings();
    if(currentRole() !== 'Owner') return html;
    return html.replace('</div></section>', `
      <div style="height:16px"></div>
      <div class="card"><div class="title"><span>Keamanan Owner</span></div>
        <p class="muted">MFA TOTP bersifat opsional pada Phase 0, tetapi sangat disarankan untuk akun Owner.</p>
        <div id="mfaStatusBox" class="notice"><i>□</i><div><b>Memuat status MFA...</b></div></div>
        <button class="primary" data-action="setup-mfa">Aktifkan / Tambah MFA</button>
      </div>
    </div></section>`);
  };

  const previousAction = action;
  action = function(a, el){
    if(a === 'setup-mfa') return startMfaEnroll();
    return previousAction(a, el);
  };

  const previousRender = render;
  render = function(){
    previousRender();
    if(S.page === 'pengaturan') renderMfaSummary();
  };

  const previousInitAuth = initAuth;
  initAuth = async function(){
    await previousInitAuth();
    addAuthSecurityControls();
    await handleRecoverySession();
  };

  if(document.readyState !== 'loading'){
    addAuthSecurityControls();
    handleRecoverySession();
  } else {
    document.addEventListener('DOMContentLoaded', ()=>{ addAuthSecurityControls(); handleRecoverySession(); });
  }
})();
