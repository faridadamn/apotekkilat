/* Phase P0 — Owner-managed pharmacy users and official role matrix.
   Database RLS is the source of truth. This file exposes the safe UI flow and basic access guards. */
(function(){
  const ROLE_OPTIONS = ['Owner','Supervisor','Apoteker','Admin Stok','Purchasing','Kasir','Viewer'];
  const STATUS_OPTIONS = ['Aktif','Nonaktif'];
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
  const LOCAL_OWNER_USER_ID = 'local-owner';
  const ROLE_MATRIX = {
    dashboard:{label:'Dashboard', read:ROLE_OPTIONS, write:ROLE_OPTIONS},
    inventori:{label:'Master produk', read:ROLE_OPTIONS, write:['Owner','Supervisor','Apoteker','Admin Stok']},
    obat:{label:'Detail produk', read:ROLE_OPTIONS, write:['Owner','Supervisor','Apoteker','Admin Stok']},
    kasir:{label:'Kasir', read:ROLE_OPTIONS, write:['Owner','Supervisor','Apoteker','Kasir']},
    resep:{label:'Verifikasi resep', read:ROLE_OPTIONS, write:['Owner','Supervisor','Apoteker']},
    pembelian:{label:'Purchase order', read:ROLE_OPTIONS, write:['Owner','Supervisor','Purchasing']},
    pelanggan:{label:'Pelanggan', read:ROLE_OPTIONS, write:['Owner','Supervisor','Apoteker','Kasir']},
    laporan:{label:'Jurnal / laporan keuangan', read:ROLE_OPTIONS, write:['Owner','Supervisor']},
    cabang:{label:'User / cabang', read:['Owner'], write:['Owner']},
    chat:{label:'Chat', read:['Owner','Supervisor','Apoteker','Kasir'], write:['Owner','Supervisor','Apoteker','Kasir']},
    pengaturan:{label:'Pengaturan', read:['Owner','Supervisor'], write:['Owner']}
  };
  const ACTION_PERMISSIONS = {
    'add-product':['Owner','Supervisor','Apoteker','Admin Stok'],
    'edit-medicine':['Owner','Supervisor','Apoteker','Admin Stok'],
    'delete-product':['Owner','Supervisor'],
    'add-batch':['Owner','Supervisor','Admin Stok'],
    'checkout':['Owner','Supervisor','Apoteker','Kasir'],
    'new-po':['Owner','Supervisor','Purchasing'],
    'add-prescription':['Owner','Supervisor','Apoteker'],
    'verify-rx':['Owner','Supervisor','Apoteker'],
    'prepare-rx':['Owner','Supervisor','Apoteker'],
    'complete-rx':['Owner','Supervisor','Apoteker'],
    'add-branch':['Owner'],
    'add-user':['Owner'],
    'edit-user':['Owner'],
    'deactivate-user':['Owner'],
    'save-settings':['Owner'],
    'reset-data':['Owner'],
    'export':['Owner','Supervisor']
  };

  function isCloudMode(){
    return window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getMode && window.ApotekKilatSupabaseData.getMode() === 'cloud';
  }

  function ensureLocalOwnerMembership(){
    if(isCloudMode()) return null;
    DB.users = Array.isArray(DB.users) ? DB.users : [];
    DB.branches = Array.isArray(DB.branches) ? DB.branches : [];
    const branchId = DB.activeBranchId || (DB.branches[0] && DB.branches[0].id) || 'b-local-main';
    if(!DB.branches.length){
      DB.branches.push({id:branchId, name:(DB.settings && DB.settings.pharmacyName) || 'Apotek Saya', address:(DB.settings && DB.settings.address) || 'Alamat apotek', isMain:true});
    }
    DB.activeBranchId = branchId;
    let owner = DB.users.find(u => u.userId === LOCAL_OWNER_USER_ID && u.status === 'Aktif');
    if(!owner){
      owner = DB.users.find(u => u.role === 'Owner' && u.status !== 'Nonaktif');
    }
    if(!owner){
      owner = {id:'u-local-owner', userId:LOCAL_OWNER_USER_ID, name:'Owner Lokal', branchId, role:'Owner', status:'Aktif'};
      DB.users = [owner];
    }else{
      Object.assign(owner, {userId:LOCAL_OWNER_USER_ID, role:'Owner', status:'Aktif', branchId:owner.branchId || branchId});
      DB.users = [owner];
    }
    try{ localStorage.setItem(DB_KEY, JSON.stringify(DB)); }catch(e){}
    return owner;
  }

  function currentMembership(){
    const uid = authSession && authSession.user ? authSession.user.id : null;
    const exact = (DB.users || []).find(u => u.userId === uid && u.status === 'Aktif');
    if(exact) return exact;
    return ensureLocalOwnerMembership();
  }

  function currentRole(){
    const me = currentMembership();
    return me ? me.role : 'Viewer';
  }

  function canManageUsers(){
    return currentRole() === 'Owner';
  }

  function hasRoleAccess(allowed){
    return Array.isArray(allowed) && allowed.includes(currentRole());
  }

  function canReadPage(page){
    const rule = ROLE_MATRIX[page];
    return !rule || hasRoleAccess(rule.read);
  }

  function canWritePage(page){
    const rule = ROLE_MATRIX[page];
    return !!rule && hasRoleAccess(rule.write);
  }

  function canRunAction(actionName){
    const allowed = ACTION_PERMISSIONS[actionName];
    return !allowed || hasRoleAccess(allowed);
  }

  function pharmacyId(){
    return window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getPharmacyId
      ? window.ApotekKilatSupabaseData.getPharmacyId()
      : null;
  }

  function roleSelect(value){
    return ROLE_OPTIONS.map(r=>`<option value="${r}" ${value===r?'selected':''}>${r}</option>`).join('');
  }

  function statusSelect(value){
    return STATUS_OPTIONS.map(s=>`<option value="${s}" ${value===s?'selected':''}>${s}</option>`).join('');
  }

  function branchSelect(value){
    return (DB.branches || []).map(b=>`<option value="${b.id}" ${value===b.id?'selected':''}>${esc(b.name)}</option>`).join('');
  }

  function accessDeniedHtml(page){
    const rule = ROLE_MATRIX[page] || {label:page};
    return `<section class="page active"><div class="card"><h2>Akses dibatasi</h2><p class="muted">Role Anda saat ini: <b>${esc(currentRole())}</b>.</p><p>Modul <b>${esc(rule.label)}</b> tidak tersedia untuk role ini.</p></div></section>`;
  }

  function permissionMatrixHtml(){
    const rows = [
      ['Dashboard','✓','✓','✓','✓','✓','✓','✓'],
      ['Master produk','✓','✓','✓','✓','-','-','Read'],
      ['Harga jual/modal','✓','✓','-','✓','-','-','Read'],
      ['Kasir','✓','✓','✓','-','-','✓','Read'],
      ['Verifikasi resep','✓','✓','✓','-','-','-','Read'],
      ['Purchase order','✓','✓','-','-','✓','-','Read'],
      ['Receipt PO','✓','✓','-','✓','✓','-','Read'],
      ['Retur draft','✓','✓','-','✓','✓','✓','Read'],
      ['Retur approval','✓','✓','-','-','-','-','Read'],
      ['Stock opname','✓','✓','-','✓','-','-','Read'],
      ['Jurnal / laporan keuangan','✓','✓','-','-','-','-','Read'],
      ['User / cabang','✓','-','-','-','-','-','-']
    ];
    return `<div class="permission"><div class="ph">Modul</div>${ROLE_OPTIONS.map(r=>`<div class="ph center">${esc(r)}</div>`).join('')}${rows.flat().map((x,i)=>`<div class="${i%8?'center':''}">${esc(x)}</div>`).join('')}</div>`;
  }

  function userRows(){
    const users = DB.users || [];
    const meId = authSession && authSession.user ? authSession.user.id : null;
    const owner = canManageUsers();
    if(!users.length) return '<tr><td colspan="5" class="empty">Belum ada pengguna untuk apotek ini.</td></tr>';
    return users.map(u=>{
      const b = DB.branches.find(x=>x.id===u.branchId);
      const isSelf = u.userId === meId || (!isCloudMode() && u.userId === LOCAL_OWNER_USER_ID);
      const actions = owner && !isSelf && isCloudMode()
        ? `<button class="outline small-btn" data-action="edit-user" data-user-id="${u.id}">Edit</button> <button class="danger-btn" data-action="deactivate-user" data-user-id="${u.id}">${u.status === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan'}</button>`
        : `<span class="muted">${isSelf ? 'Akun Anda' : (isCloudMode() ? 'Owner saja' : 'Tersedia di Cloud')}</span>`;
      return `<tr><td><b>${esc(u.name)}</b><br><small class="muted">${esc(u.userId || 'local-demo')}</small></td><td>${esc(b?b.name:'-')}</td><td>${status(u.role,'violet')}</td><td>${status(u.status || 'Aktif', u.status === 'Nonaktif' ? 'warn' : 'ok')}</td><td>${actions}</td></tr>`;
    }).join('');
  }

  nav = function(){
    document.querySelector('#nav').innerHTML = NAV.filter(n=>canReadPage(n[0])).map(n=>{
      const badge = n[0]==='chat' ? DB.conversations.filter(c=>c.messages.length && c.messages[c.messages.length-1].from==='in').length : 0;
      return `<button data-page="${n[0]}" class="${S.page===n[0]?'active':''}"><span class="ico">${n[1]}</span><span>${n[2]}</span>${badge?`<span class="pill">${badge}</span>`:''}</button>`;
    }).join('');
  };

  const originalRender = render;
  render = function(){
    if(!canReadPage(S.page)){
      const firstAllowed = NAV.find(n=>canReadPage(n[0]));
      S.page = firstAllowed ? firstAllowed[0] : 'dashboard';
    }
    originalRender();
  };

  branches = function(){
    if(!canReadPage('cabang')) return accessDeniedHtml('cabang');
    const owner = canManageUsers();
    const cloud = isCloudMode();
    const lockedNote = cloud
      ? 'Membership dikunci oleh Supabase RLS. Hanya Owner aktif yang bisa menambah, mengubah role, atau menonaktifkan user.'
      : 'Mode lokal gratis: 1 apotek, 1 cabang, 1 Owner. Multi-user dan multi-cabang tersedia di paket Cloud.';
    return `<section class="page active"><div class="head"><div><h2>${cloud ? 'Cabang & Hak Akses' : 'Profil Apotek Lokal'}</h2><p>${cloud ? 'Kelola cabang apotek dan pengguna.' : 'Free tier berjalan di perangkat ini dengan akses Owner penuh.'}</p></div>${owner && cloud?'<button class="primary" data-action="add-branch">＋ Tambah Cabang</button>':''}</div>
    <div class="grid4">${DB.branches.map(b=>{ const st=branchStats(b); return `<div class="card"><div class="title"><span>${esc(b.name)}</span>${b.isMain?status('Utama','ok'):''}</div><p class="muted">${esc(b.address)}</p><h3>${fmt(st.revenue)}</h3><p class="muted">${st.count} transaksi</p>${owner && cloud?`<button class="danger-btn" data-delete-branch="${b.id}">Hapus</button>`:''}</div>`; }).join('')}</div>
    <div style="height:16px"></div>
    <div class="two">
      <div class="card"><div class="title"><span>Daftar Pengguna</span>${owner && cloud?'<button class="primary" data-action="add-user">＋ Tambah Pengguna</button>':'<span class="muted">Cloud only</span>'}</div>
      <p class="muted" style="font-size:12px;margin-top:-4px">${lockedNote}</p>
      <table><thead><tr><th>Pengguna</th><th>Cabang</th><th>Peran</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${userRows()}</tbody></table></div>
      <div class="card"><div class="title"><span>Hak Akses per Peran</span></div>${permissionMatrixHtml()}<p class="muted" style="margin-top:10px;font-size:11px">Catatan: role resmi disimpan sebagai constraint database. UI guard ini tetap dilanjutkan dengan RLS/RPC per modul pada mode cloud.</p></div>
    </div></section>`;
  };

  settings = function(){
    if(!canReadPage('pengaturan')) return accessDeniedHtml('pengaturan');
    const s = DB.settings;
    const canWrite = canWritePage('pengaturan');
    return `<section class="page active"><div class="head"><div><h2>Pengaturan</h2><p>Konfigurasi dasar ApotekKilat.</p></div></div>
    <div class="two">
      <div class="card"><div class="title"><span>Profil Apotek</span></div>
      <div class="form">
        <label>Nama Apotek<input id="setName" value="${esc(s.pharmacyName)}" ${canWrite?'':'disabled'}/></label>
        <label>Alamat<input id="setAddress" value="${esc(s.address)}" ${canWrite?'':'disabled'}/></label>
        <label>No. WhatsApp<input id="setWa" value="${esc(s.whatsapp)}" ${canWrite?'':'disabled'}/></label>
        ${canWrite?'<button class="primary" data-action="save-settings">Simpan Perubahan</button>':'<p class="muted">Hanya Owner yang dapat mengubah pengaturan.</p>'}
      </div></div>
      <div class="card"><div class="title"><span>Notifikasi & Data</span></div>
      <label><input type="checkbox" id="notifLow" ${s.notifLowStock?'checked':''} ${canWrite?'':'disabled'}/> Stok menipis</label><br>
      <label><input type="checkbox" id="notifExp" ${s.notifExpiry?'checked':''} ${canWrite?'':'disabled'}/> Obat mendekati expired</label><br>
      <label><input type="checkbox" id="notifDaily" ${s.notifDailySummary?'checked':''} ${canWrite?'':'disabled'}/> Ringkasan penjualan harian</label>
      <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
      <p class="muted">Semua data (produk, transaksi, pelanggan, dll) tersimpan di browser ini (localStorage). Menghapus cache browser akan menghapus data.</p>
      ${canWrite?'<button class="danger-btn" data-action="reset-data">Reset ke Data Contoh</button>':''}
      </div>
    </div></section>`;
  };

  async function persistMembership(payload, existing){
    if(!isCloudMode()){
      if(existing) Object.assign(existing, {userId:payload.user_id, name:payload.full_name, branchId:payload.branch_id, role:payload.role, status:payload.status});
      else DB.users.push({id:uid('u'), userId:payload.user_id, name:payload.full_name, branchId:payload.branch_id, role:payload.role, status:payload.status});
      saveDB();
      return existing || DB.users[DB.users.length-1];
    }
    if(!supabaseClient) throw new Error('Supabase client belum siap.');
    let result;
    if(existing){
      result = await supabaseClient.from('pharmacy_users')
        .update({branch_id:payload.branch_id, full_name:payload.full_name, role:payload.role, status:payload.status})
        .eq('id', existing.id)
        .select('id, user_id, branch_id, full_name, role, status')
        .single();
    } else {
      result = await supabaseClient.from('pharmacy_users')
        .insert(payload)
        .select('id, user_id, branch_id, full_name, role, status')
        .single();
    }
    if(result.error) throw result.error;
    const row = result.data;
    const local = {id:row.id, userId:row.user_id, name:row.full_name, branchId:row.branch_id, role:row.role, status:row.status};
    if(existing) Object.assign(existing, local);
    else DB.users.push(local);
    localStorage.setItem(DB_KEY, JSON.stringify(DB));
    return local;
  }

  openUserForm = function(existing){
    if(!canManageUsers()) return toast('Hanya Owner yang bisa mengelola pengguna.','err');
    if(!isCloudMode()) return toast('Multi-user tersedia di paket Cloud. Mode lokal gratis memakai 1 Owner di perangkat ini.', 'err');
    const u = existing || {};
    modal(existing?'Edit Pengguna':'Tambah Pengguna', `<div class="form">
      <label>User ID Supabase Auth<input id="usUserId" value="${esc(u.userId||'')}" ${existing?'disabled':''} placeholder="UUID dari auth.users"/></label>
      <label>Nama<input id="usName" value="${esc(u.name||'')}" placeholder="Nama pengguna"/></label>
      <label>Cabang<select id="usBranch">${branchSelect(u.branchId)}</select></label>
      <label>Peran<select id="usRole">${roleSelect(u.role||'Kasir')}</select></label>
      <label>Status<select id="usStatus">${statusSelect(u.status||'Aktif')}</select></label>
      <p class="muted" style="font-size:12px">Akun harus sudah dibuat di Supabase Auth. Menu ini hanya membuat membership apotek, bukan membuat akun Auth baru.</p>
    </div>`, async ()=>{
      const userId = (document.querySelector('#usUserId').value || '').trim();
      const fullName = document.querySelector('#usName').value.trim();
      if(!UUID_RE.test(userId)) return toast('User ID Supabase Auth harus UUID valid.','err'), false;
      if(authSession && authSession.user && userId === authSession.user.id) return toast('Owner tidak boleh mengubah membership dirinya sendiri dari menu ini.','err'), false;
      if(!fullName) return toast('Nama wajib diisi.','err'), false;
      const pid = pharmacyId();
      if(isCloudMode() && !pid) return toast('Pharmacy ID cloud tidak ditemukan.','err'), false;
      const payload = {
        pharmacy_id: pid,
        user_id: userId,
        branch_id: document.querySelector('#usBranch').value || null,
        full_name: fullName,
        role: document.querySelector('#usRole').value,
        status: document.querySelector('#usStatus').value
      };
      try{
        await persistMembership(payload, existing);
        render();
        toast(existing ? 'Pengguna berhasil diperbarui' : 'Pengguna berhasil ditambahkan');
      }catch(err){
        console.error('Gagal simpan membership:', err);
        toast(err.message || 'Gagal menyimpan pengguna. Periksa role Owner dan RLS.', 'err');
        return false;
      }
    });
  };

  async function setUserStatus(userId, nextStatus){
    const u = (DB.users || []).find(x=>x.id===userId);
    if(!u) return toast('Pengguna tidak ditemukan.','err');
    if(!canManageUsers()) return toast('Hanya Owner yang bisa mengelola pengguna.','err');
    if(authSession && authSession.user && u.userId === authSession.user.id) return toast('Tidak bisa mengubah status akun sendiri.','err');
    try{
      await persistMembership({user_id:u.userId, branch_id:u.branchId, full_name:u.name, role:u.role, status:nextStatus}, u);
      render();
      toast(nextStatus === 'Aktif' ? 'Pengguna diaktifkan' : 'Pengguna dinonaktifkan');
    }catch(err){
      console.error('Gagal ubah status pengguna:', err);
      toast(err.message || 'Gagal mengubah status pengguna.', 'err');
    }
  }

  const originalAction = action;
  action = function(a, el){
    if(!canRunAction(a)) return toast(`Role ${currentRole()} tidak memiliki akses untuk aksi ini.`, 'err');
    if(a === 'add-user') return openUserForm();
    if(a === 'edit-user') return openUserForm((DB.users || []).find(u=>u.id===el.dataset.userId));
    if(a === 'deactivate-user'){
      const u = (DB.users || []).find(x=>x.id===el.dataset.userId);
      if(!u) return toast('Pengguna tidak ditemukan.','err');
      const next = u.status === 'Aktif' ? 'Nonaktif' : 'Aktif';
      return confirmAction(`${next === 'Aktif' ? 'Aktifkan' : 'Nonaktifkan'} pengguna ${u.name}?`, ()=>setUserStatus(u.id, next));
    }
    return originalAction(a, el);
  };

  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-page]');
    if(btn && !canReadPage(btn.dataset.page)){
      e.preventDefault();
      e.stopPropagation();
      toast(`Role ${currentRole()} tidak memiliki akses ke modul ini.`, 'err');
    }
  }, true);
})();
