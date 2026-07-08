/* Phase P1.5.5 — Safe first tenant onboarding.
   Uses the logged-in user's Supabase session and create_pharmacy_tenant() RPC.
   No service-role key is used in the browser. */
(function(){
  let shown = false;
  let busy = false;

  function cloudHasTenant(){
    return !!(window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getPharmacyId && window.ApotekKilatSupabaseData.getPharmacyId());
  }

  function canOfferOnboarding(){
    return !!(window.supabaseClient || supabaseClient) && !!authSession && authSession.user && !cloudHasTenant() && typeof modal === 'function';
  }

  function activeClient(){
    return window.supabaseClient || supabaseClient;
  }

  async function submitTenant(){
    if(busy) return false;
    const pharmacyName = document.querySelector('#tenantPharmacyName').value.trim();
    const ownerName = document.querySelector('#tenantOwnerName').value.trim();
    const address = document.querySelector('#tenantAddress').value.trim();
    const whatsapp = document.querySelector('#tenantWhatsapp').value.trim();
    const branchName = document.querySelector('#tenantBranchName').value.trim();
    const seedCoa = document.querySelector('#tenantSeedCoa').checked;

    if(!pharmacyName || pharmacyName.length < 3){
      toast('Nama apotek minimal 3 karakter', 'err');
      return false;
    }
    if(!ownerName){
      toast('Nama owner wajib diisi', 'err');
      return false;
    }

    busy = true;
    const btn = document.querySelector('#modalSave');
    if(btn){ btn.disabled = true; btn.textContent = 'Membuat tenant...'; }

    const {error} = await activeClient().rpc('create_pharmacy_tenant', {
      p_payload: {
        pharmacy_name: pharmacyName,
        owner_name: ownerName,
        address,
        whatsapp,
        branch_name: branchName || `${pharmacyName} Pusat`,
        seed_chart_of_accounts: seedCoa
      }
    });

    busy = false;
    if(btn){ btn.disabled = false; btn.textContent = 'Buat Tenant'; }

    if(error){
      console.error(error);
      toast(error.message || 'Gagal membuat tenant apotek', 'err');
      return false;
    }

    toast('Tenant apotek berhasil dibuat');
    closeModal();
    if(typeof showApp === 'function') await showApp();
    return true;
  }

  function openTenantOnboarding(){
    if(shown || !canOfferOnboarding()) return;
    shown = true;
    const email = authSession && authSession.user ? authSession.user.email : '';
    modal('Buat Tenant Apotek', `<div class="form">
      <p class="muted">Akun ini belum punya membership apotek. Buat tenant pertama untuk menjadi Owner.</p>
      <label>Nama Apotek<input id="tenantPharmacyName" placeholder="Contoh: Apotek Sehat Kilat" /></label>
      <label>Nama Owner<input id="tenantOwnerName" value="${esc((email || '').split('@')[0] || 'Owner')}" placeholder="Nama pemilik / penanggung jawab" /></label>
      <label>Cabang Pertama<input id="tenantBranchName" placeholder="Kosongkan untuk otomatis: Nama Apotek Pusat" /></label>
      <label>Alamat<input id="tenantAddress" placeholder="Alamat apotek" /></label>
      <label>WhatsApp<input id="tenantWhatsapp" placeholder="08xxxx" /></label>
      <label class="check"><input id="tenantSeedCoa" type="checkbox" checked /> Seed chart of accounts awal</label>
      <p class="muted">Flow ini memakai session user biasa dan RPC tervalidasi. Tidak ada service role key di browser.</p>
    </div>`, submitTenant, {saveLabel:'Buat Tenant'});
  }

  window.addEventListener('apotekkilat:tenant-required', openTenantOnboarding);
  const timer = setInterval(()=>{
    if(cloudHasTenant()) return clearInterval(timer);
    if(canOfferOnboarding()) openTenantOnboarding();
  }, 800);
})();
