function prescriptionList(){
  return [...DB.prescriptions].sort((a,b)=>b.time-a.time);
}
function prescriptionToneFor(status_){ return status_==='Menunggu Verifikasi'?'warn':status_==='Diproses'?'violet':status_==='Siap Diambil'?'ok':'ok'; }

function prescription(){
  const list = prescriptionList();
  const r = list.find(x=>x.id===S.selectedPrescriptionId) || list[0];
  S.selectedPrescriptionId = r ? r.id : null;
  const counts = {
    'Menunggu Verifikasi': DB.prescriptions.filter(x=>x.status==='Menunggu Verifikasi').length,
    'Diproses': DB.prescriptions.filter(x=>x.status==='Diproses').length,
    'Siap Diambil': DB.prescriptions.filter(x=>x.status==='Siap Diambil').length,
    'Selesai': DB.prescriptions.filter(x=>x.status==='Selesai').length
  };
  return `<section class="page active"><div class="head"><div><h2>Resep & Verifikasi</h2><p>Kelola resep masuk, verifikasi, dan siapkan obat untuk pasien.</p></div><button class="primary" data-action="add-prescription">＋ Resep Baru</button></div>
  <div class="grid4">${[['◴','Menunggu Verifikasi',counts['Menunggu Verifikasi']],['▤','Diproses',counts['Diproses']],['✓','Siap Diambil',counts['Siap Diambil']],['✓','Selesai',counts['Selesai']]].map(x=>`<div class="card kpi"><div class="kicon">${x[0]}</div><div><label>${x[1]}</label><strong>${x[2]}</strong></div></div>`).join('')}</div>
  <div style="height:16px"></div>
  <div class="chatgrid">
    <div class="card"><div class="title"><span>Daftar Resep Masuk</span></div>
      ${list.length?list.map(x=>`<div class="conversation ${S.selectedPrescriptionId===x.id?'active':''}" data-select-rx="${x.id}"><b>${esc(x.patient)}</b><br><small class="muted">${timeFmt(x.time)} · ${esc(x.doctor)}</small><p>${status(x.status,prescriptionToneFor(x.status))}</p></div>`).join(''):'<p class="empty">Belum ada resep.</p>'}
    </div>
    <div class="card">
      <div class="title"><span>Preview Resep</span></div>
      ${r?`<div style="background:#fffdfb;border:1px solid #edf0ed;border-radius:12px;padding:38px 48px;min-height:400px;font-family:Georgia,serif;color:#202020">
      <div style="display:flex;justify-content:space-between"><div><b style="font-size:18px">${esc(r.doctor)}</b></div></div>
      <hr style="border:0;border-top:1px solid #222;margin:24px 0"><div style="font-size:42px">℞</div>
      <p style="font-size:18px;line-height:2">${r.items.map((it,i)=>`${i+1}. ${esc(it.name)} &nbsp; No. ${it.qty}<br><i>${esc(it.sig)}</i>`).join('<br>')}</p>
      </div>`:`<div class="empty">Belum ada resep dipilih.</div>`}
    </div>
    <aside class="card side-right">
      ${r?`<div class="title"><span>Detail Resep & Pasien</span></div><h3>${esc(r.patient)}</h3><p class="muted">${esc(r.gender)}, ${r.age} tahun<br>${esc(r.phone)}</p>
      <b>Obat yang Diminta</b><p class="muted">${r.items.map(it=>`${esc(it.name)} · No. ${it.qty}`).join('<br>')}</p>
      <textarea id="rxNote" placeholder="Catatan apoteker (opsional)" style="width:100%;height:75px;border:1px solid var(--line);border-radius:8px;padding:10px">${esc(r.note||'')}</textarea>
      <button class="primary" style="width:100%;margin-top:12px" data-action="verify-rx" ${r.status!=='Menunggu Verifikasi'?'disabled':''}>✓ Verifikasi</button>
      <button class="outline" style="width:100%;margin-top:8px" data-action="prepare-rx" ${r.status!=='Diproses'?'disabled':''}>Siapkan Obat</button>
      <button class="outline" style="width:100%;margin-top:8px" data-action="complete-rx" ${r.status!=='Siap Diambil'?'disabled':''}>Selesai / Diambil</button>`:''}
    </aside>
  </div></section>`;
}

/* ---------------- Purchase Orders ---------------- */
function purchase(){
  const list = [...DB.purchaseOrders].sort((a,b)=>b.date-a.date);
  const counts = {
    draft: DB.purchaseOrders.filter(p=>p.status==='Draft').length,
    approval: DB.purchaseOrders.filter(p=>p.status==='Menunggu Approval').length,
    shipping: DB.purchaseOrders.filter(p=>p.status==='Dalam Pengiriman').length,
    done: DB.purchaseOrders.filter(p=>p.status==='Selesai').length
  };
  return `<section class="page active"><div class="head"><div><h2>Pembelian & Supplier</h2><p>Kelola purchase order dan pantau status pengiriman.</p></div><button class="primary" data-action="new-po">＋ Buat PO Baru</button></div>
  <div class="grid4">${[['▤','PO Draft',counts.draft],['◴','Menunggu Approval',counts.approval],['▣','Dalam Pengiriman',counts.shipping],['✓','Selesai',counts.done]].map(x=>`<div class="card kpi"><div class="kicon">${x[0]}</div><div><label>${x[1]}</label><strong>${x[2]}</strong></div></div>`).join('')}</div>
  <div style="height:16px"></div>
  <div class="card">
    <div class="tools"><input class="flex" id="poSearch" placeholder="Cari No. PO atau supplier..."/></div>
    <table><thead><tr><th>No. PO</th><th>Supplier</th><th>Tanggal</th><th>Nilai</th><th>Status</th><th></th></tr></thead>
    <tbody id="poBody">${list.length?list.map(x=>`<tr><td>${esc(x.code)}</td><td>${esc(x.supplier)}</td><td>${dateFmt(new Date(x.date).toISOString().slice(0,10))}</td><td>${fmt(x.value)}</td><td>${status(x.status, x.status==='Selesai'?'ok':x.status==='Dalam Pengiriman'?'ok':x.status==='Draft'?'violet':'warn')}</td><td>${x.status!=='Selesai'?`<button class="outline" data-po-advance="${x.id}">${x.status==='Draft'?'Ajukan':x.status==='Menunggu Approval'?'Setujui':'Terima Barang'}</button>`:''}</td></tr>`).join(''):'<tr><td colspan="6" class="empty">Belum ada purchase order.</td></tr>'}</tbody></table>
  </div></section>`;
}

/* ---------------- Customers ---------------- */
function customerStats(c){
  const txs = DB.transactions.filter(t=>t.customerId===c.id);
  const total = txs.reduce((a,t)=>a+t.total,0);
  return {count:txs.length, total};
}
function customerRows(list){
  if(!list.length) return '<tr><td colspan="5" class="empty">Belum ada pelanggan.</td></tr>';
  return list.map(x=>{ const st=customerStats(x); return `<tr class="clickable" data-select-cust="${x.id}"><td><b>${esc(x.name)}</b></td><td>${esc(x.phone)}</td><td>${st.count}</td><td>${x.points}</td><td>${status(x.status,'ok')}</td></tr>`; }).join('');
}
function customers(){
  const sel = DB.customers.find(c=>c.id===S.selectedCustomerId) || DB.customers[0];
  const st = sel ? customerStats(sel) : {count:0,total:0};
  return `<section class="page active"><div class="head"><div><h2>Pelanggan & Riwayat</h2><p>Kelola pelanggan dan poin loyalitas.</p></div><button class="primary" data-action="add-customer">＋ Pelanggan Baru</button></div>
  <div class="split">
    <div class="card"><div class="tools"><input class="flex" id="customerSearch" placeholder="Cari pelanggan..."/></div>
    <table><thead><tr><th>Pelanggan</th><th>Kontak</th><th>Total Transaksi</th><th>Poin</th><th>Status</th></tr></thead><tbody id="customerBody">${customerRows(DB.customers)}</tbody></table></div>
    <aside class="card">
      ${sel?`<div class="title"><span>Profil ${esc(sel.name)}</span><a data-action="edit-customer">Edit</a></div>
      <div style="width:52px;height:52px;border-radius:50%;background:#e5f8ee;color:#078651;display:grid;place-items:center;font-weight:900;font-size:19px">${esc(sel.name.split(' ').map(w=>w[0]).slice(0,2).join(''))}</div>
      <div class="card kpi" style="padding:12px;margin-top:10px"><div class="kicon">◈</div><div><label>Total Belanja</label><strong>${fmt(st.total)}</strong></div></div>
      <p><b>Jumlah Transaksi</b><br><span class="muted">${st.count} transaksi</span></p>
      <p><b>Poin Loyalitas</b></p><div class="progress"><span style="width:${Math.min(100,sel.points/2000*100)}%"></span></div><small class="muted">${sel.points} poin</small>
      <button class="danger-btn" style="width:100%;margin-top:14px" data-action="delete-customer">Hapus Pelanggan</button>`:'<p class="empty">Belum ada pelanggan.</p>'}
    </aside>
  </div></section>`;
}

/* ---------------- Reports (computed) ---------------- */
function report(){
  const now = Date.now();
  const periods = [0,1,2].map(i=>{
    const end = now - i*7*86400000;
    const start = end - 7*86400000;
    const txs = DB.transactions.filter(t=>t.time>start && t.time<=end);
    const sales = txs.reduce((a,t)=>a+t.total,0);
    const margin = txs.reduce((a,t)=>a+t.items.reduce((s,it)=>{ const p=DB.products.find(x=>x.id===it.productId); return s+((it.price-(p?p.cost:0))*it.qty); },0),0);
    return {label:`${new Date(start).toLocaleDateString('id-ID',{day:'2-digit',month:'short'})} – ${new Date(end).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})}`, sales, margin, count:txs.length};
  });
  const prodSales = {};
  DB.transactions.forEach(t=>t.items.forEach(it=>{ prodSales[it.productId]=(prodSales[it.productId]||0)+it.qty; }));
  const topProducts = Object.entries(prodSales).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([id,qty])=>({p:DB.products.find(x=>x.id===id), qty}));
  const totalMargin = periods[0].margin;
  return `<section class="page active"><div class="head"><div><h2>Laporan & Analitik</h2><p>Pantau performa apotek dengan data transaksi aktual.</p></div><button class="primary" data-action="export">⇩ Export Laporan CSV</button></div>
  ${kpis()}
  <div style="height:16px"></div>
  <div class="grid3">
    <div class="card"><div class="title"><span>Penjualan 7 Hari Terakhir</span></div>${chart()}</div>
    <div class="card"><div class="title"><span>Produk Terlaris</span></div>${topProducts.length?topProducts.map(x=>`<div class="notice"><i>💊</i><div><b>${esc(x.p?x.p.name:'?')}</b><small>${x.qty} terjual</small></div></div>`).join(''):'<p class="muted">Belum ada penjualan.</p>'}</div>
    <div class="card"><div class="title"><span>Margin Minggu Ini</span></div><div class="center"><h2 style="color:var(--g)">${fmt(totalMargin)}</h2><p class="muted">Total Margin Kotor</p></div></div>
  </div>
  <div style="height:16px"></div>
  <div class="card"><div class="title"><span>Ringkasan Laporan per Periode</span></div>
  <table><thead><tr><th>Periode</th><th>Penjualan</th><th>Margin</th><th>Transaksi</th></tr></thead>
  <tbody>${periods.map(p=>`<tr><td>${p.label}</td><td>${fmt(p.sales)}</td><td>${fmt(p.margin)}</td><td>${p.count}</td></tr>`).join('')}</tbody></table>
  </div></section>`;
}

/* ---------------- Branches & Users ---------------- */
function branchStats(b){
  const txs = DB.transactions.filter(t=>t.branchId===b.id);
  return {revenue: txs.reduce((a,t)=>a+t.total,0), count: txs.length};
}
function branches(){
  return `<section class="page active"><div class="head"><div><h2>Cabang & Hak Akses</h2><p>Kelola cabang apotek dan pengguna.</p></div><button class="primary" data-action="add-branch">＋ Tambah Cabang</button></div>
  <div class="grid4">${DB.branches.map(b=>{ const st=branchStats(b); return `<div class="card"><div class="title"><span>${esc(b.name)}</span>${b.isMain?status('Utama','ok'):''}</div><p class="muted">${esc(b.address)}</p><h3>${fmt(st.revenue)}</h3><p class="muted">${st.count} transaksi</p><button class="danger-btn" data-delete-branch="${b.id}">Hapus</button></div>`; }).join('')}</div>
  <div style="height:16px"></div>
  <div class="two">
    <div class="card"><div class="title"><span>Daftar Pengguna</span><button class="primary" data-action="add-user">＋ Tambah Pengguna</button></div>
    <table><thead><tr><th>Pengguna</th><th>Cabang</th><th>Peran</th><th></th></tr></thead>
    <tbody>${DB.users.length?DB.users.map(u=>{ const b=DB.branches.find(x=>x.id===u.branchId); return `<tr><td>${esc(u.name)}</td><td>${esc(b?b.name:'-')}</td><td>${status(u.role,'violet')}</td><td><button class="danger-btn" data-delete-user="${u.id}">Hapus</button></td></tr>`; }).join(''):'<tr><td colspan="4" class="empty">Belum ada pengguna.</td></tr>'}</tbody></table></div>
    <div class="card"><div class="title"><span>Hak Akses per Peran</span></div>
    <div class="permission"><div class="ph">Modul</div><div class="ph center">Owner</div><div class="ph center">Apoteker</div><div class="ph center">Admin</div><div class="ph center">Kasir</div>${[['Dashboard','✓','✓','✓','✓'],['Inventori','✓','✓','✓','−'],['Resep','✓','✓','−','×'],['Laporan','✓','✓','×','×'],['Pengaturan','✓','✓','×','×']].flat().map((x,i)=>`<div class="${i%5?'center':''}">${x}</div>`).join('')}</div>
    <p class="muted" style="margin-top:10px;font-size:11px">Catatan: hak akses ini bersifat referensi. Karena aplikasi berjalan client-side tanpa login server, penegakan akses sesungguhnya perlu backend terpisah.</p></div>
  </div></section>`;
}

/* ---------------- Chat ---------------- */
function chat(){
  const list = DB.conversations;
  const conv = list.find(c=>c.id===S.activeConversationId) || list[0];
  S.activeConversationId = conv ? conv.id : null;
  return `<section class="page active"><div class="head"><div><h2>Chat Order & FAQ Apotek</h2><p>Kelola percakapan dengan pelanggan.</p></div>${status('● Mode Lokal','ok')}</div>
  <div class="chatgrid">
    <div class="card"><div class="tools"><input class="flex" id="chatSearch" placeholder="Cari percakapan..."/></div>
    ${list.length?list.map(x=>`<div class="conversation ${S.activeConversationId===x.id?'active':''}" data-select-chat="${x.id}"><b>${esc(x.name)}</b><br><small>${esc(x.messages.length?x.messages[x.messages.length-1].text:'(belum ada pesan)')}</small><span style="float:right">${status(x.status,x.tone)}</span></div>`).join(''):'<p class="empty">Belum ada percakapan.</p>'}
    </div>
    <div class="card">
      ${conv?`<div class="title"><span>${esc(conv.name)} ${status(conv.status,conv.tone)}</span></div>
      <div id="messages">${conv.messages.map(m=>`<div class="bubble ${m.from==='out'?'out':''}">${esc(m.text)}</div>`).join('')}</div>
      <div class="tools" style="margin-top:16px"><input class="flex" id="chatInput" placeholder="Tulis pesan..."/><button class="primary" data-action="send-chat">➤</button></div>`:'<div class="empty">Pilih percakapan.</div>'}
    </div>
    <aside class="side-right card">
      ${conv?`<div class="title"><span>Informasi Kontak</span></div><h3>${esc(conv.name)}</h3><p class="muted">No. WhatsApp<br><b style="color:var(--ink)">${esc(conv.phone)}</b></p>
      <p class="muted" style="font-size:11px;margin-top:12px">Catatan: mode ini menyimpan riwayat percakapan secara lokal di browser. Untuk kirim/terima WhatsApp asli, perlu integrasi WhatsApp Business API di backend.</p>`:''}
    </aside>
  </div></section>`;
}

/* ---------------- Settings ---------------- */
function settings(){
