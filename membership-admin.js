/* Phase P0 — Owner-managed pharmacy users.
   Database RLS is the source of truth. This file only exposes the safe UI flow. */
(function(){
  const ROLE_OPTIONS = ['Owner','Apoteker','Admin','Kasir'];
  const STATUS_OPTIONS = ['Aktif','Nonaktif'];
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

  function currentMembership(){
    const uid = authSession && authSession.user ? authSession.user.id : null;
    return (DB.users || []).find(u => u.userId === uid && u.status === 'Aktif') || null;
  }

  function canManageUsers(){
    const me = currentMembership();
    return !!me && me.role === 'Owner';
  }

  function isCloudMode(){
    return window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getMode && window.ApotekKilatSupabaseData.getMode() === 'cloud';
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

  function userRows(){
    const users = DB.users || [];
    const meId = authSession && authSession.user ? authSession.user.id : null;
    const owner = canManageUsers();
    if(!users.length) return '<tr><td colspan="5" class="empty">Belum ada pengguna cloud untuk apotek ini.</td></tr>';
    return users.map(u=>{
      const b = DB.branches.find(x=>x.id===u.branchId);
      const isSelf = u.userId === meId;
      const actions = owner && !isSelf
        ? `<button class="outline small-btn" data-action="edit-user" data-user-id="${u.id}">Edit</button> <button class="danger-btn" data-action="deactivate-user" data-user-id="${u.id}">${u.status === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan'}</button>`
        : `<span class="muted">${isSelf ? 'Akun Anda' : 'Owner saja'}</span>`;
      return `<tr><td><b>${esc(u.name)}</b><br><small class="muted">${esc(u.userId || 'local-demo')}</small></td><td>${esc(b?b.name:'-')}</td><td>${status(u.role,'violet')}</td><td>${status(u.status || 'Aktif', u.status === 'Nonaktif' ? 'warn' : 'ok')}</td><td>${actions}</td></tr>`;
    }).join('');
  }

  const originalBranches = branches;
  branches = function(){
    const owner = canManageUsers();
    const cloud = isCloudMode();
    const lockedNote = cloud
      ? 'Membership dikunci oleh Supabase RLS. Hanya Owner aktif yang bisa menambah, mengubah role, atau menonaktifkan user.'
      : 'Mode demo lokal. Pengaturan user tidak disimpan ke Supabase.';
    return `<section class="page active"><div class="head"><div><h2>Cabang & Hak Akses</h2><p>Kelola cabang apotek dan pengguna.</p></div><button class="primary" data-action="add-branch">＋ Tambah Cabang</button></div>
    <div class="grid4">${DB.branches.map(b=>{ const st=branchStats(b); return `<div class="card"><div class="title"><span>${esc(b.name)}</span>${b.isMain?status('Utama','ok'):''}</div><p class="muted">${esc(b.address)}</p><h3>${fmt(st.revenue)}</h3><p class="muted">${st.count} transaksi</p><button class="danger-btn" data-delete-branch="${b.id}">Hapus</button></div>`; }).join('')}</div>
    <div style="height:16px"></div>
    <div class="two">
      <div class="card"><div class="title"><span>Daftar Pengguna</span>${owner?'<button class="primary" data-action="add-user">＋ Tambah Pengguna</button>':'<span class="muted">Owner saja</span>'}</div>
      <p class="muted" style="font-size:12px;margin-top:-4px">${lockedNote}</p>
      <table><thead><tr><th>Pengguna</th><th>Cabang</th><th>Peran</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${userRows()}</tbody></table></div>
      <div class="card"><div class="title"><span>Hak Akses per Peran</span></div>
      <div class="permission"><div class="ph">Modul</div><div class="ph center">Owner</div><div class="ph center">Apoteker</div><div class="ph center">Admin</div><div class="ph center">Kasir</div>${[['Dashboard','✓','✓','✓','✓'],['Inventori','✓','✓','✓','−'],['Resep','✓','✓','−','×'],['Laporan','✓','✓','×','×'],['Pengaturan','✓','−','×','×'],['User & Role','✓','×','×','×']].flat().map((x,i)=>`<div class="${i%5?'center':''}">${x}</div>`).join('')}</div>
      <p class="muted" style="margin-top:10px;font-size:11px">Catatan: penegakan membership sekarang dilakukan oleh Supabase RLS. Delete user diganti status Nonaktif.</p></div>
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
})();
