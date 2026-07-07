  modal('Resep Baru', `<div class="form">
    <label>Nama Pasien<input id="rxPatient" placeholder="Nama pasien"/></label>
    <label>Jenis Kelamin<select id="rxGender"><option>Perempuan</option><option>Laki-laki</option></select></label>
    <label>Usia<input id="rxAge" type="number" placeholder="30"/></label>
    <label>No. HP<input id="rxPhone" placeholder="0812..."/></label>
    <label>Dokter<input id="rxDoctor" placeholder="dr. ..."/></label>
    <label>Obat & Aturan Pakai (satu baris per obat, format: Nama|Jumlah|Aturan)<textarea id="rxItems" style="height:90px" placeholder="Amoxicillin 500mg|10|S 3 dd 1 cap"></textarea></label>
  </div>`, ()=>{
    const patient=document.querySelector('#rxPatient').value.trim();
    if(!patient) return toast('Nama pasien wajib diisi','err'), false;
    const items = document.querySelector('#rxItems').value.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{ const [name,qty,sig]=l.split('|'); return {name:(name||'Obat').trim(), qty:Number(qty)||1, sig:(sig||'').trim()||'Sesuai anjuran'}; });
    DB.prescriptions.push({id:uid('rx'), patient, gender:document.querySelector('#rxGender').value, age:Number(document.querySelector('#rxAge').value)||0, phone:document.querySelector('#rxPhone').value||'-', doctor:document.querySelector('#rxDoctor').value||'-', time:Date.now(), status:'Menunggu Verifikasi', items: items.length?items:[{name:'Obat',qty:1,sig:'Sesuai anjuran'}], note:''});
    saveDB(); render(); toast('Resep baru ditambahkan');
  });
}

function updateRxStatus(newStatus){
  const r = DB.prescriptions.find(x=>x.id===S.selectedPrescriptionId); if(!r) return;
  const noteEl = document.querySelector('#rxNote');
  if(noteEl) r.note = noteEl.value;
  r.status = newStatus;
  saveDB(); render(); toast('Status resep diubah menjadi: '+newStatus);
}

function openBranchForm(){
  modal('Tambah Cabang', `<div class="form">
    <label>Nama Cabang<input id="brName" placeholder="Apotek Sehat ..."/></label>
    <label>Alamat<input id="brAddress" placeholder="Kota, Provinsi"/></label>
  </div>`, ()=>{
    const name=document.querySelector('#brName').value.trim();
    if(!name) return toast('Nama cabang wajib diisi','err'), false;
    DB.branches.push({id:uid('b'), name, address:document.querySelector('#brAddress').value||'-', isMain:false});
    saveDB(); render(); toast('Cabang berhasil ditambahkan');
  });
}
function openUserForm(){
  modal('Tambah Pengguna', `<div class="form">
    <label>Nama<input id="usName" placeholder="Nama pengguna"/></label>
    <label>Cabang<select id="usBranch">${DB.branches.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></label>
    <label>Peran<select id="usRole">${['Owner','Apoteker','Admin','Kasir'].map(r=>`<option>${r}</option>`).join('')}</select></label>
  </div>`, ()=>{
    const name=document.querySelector('#usName').value.trim();
    if(!name) return toast('Nama wajib diisi','err'), false;
    DB.users.push({id:uid('u'), name, branchId:document.querySelector('#usBranch').value, role:document.querySelector('#usRole').value, status:'Aktif'});
    saveDB(); render(); toast('Pengguna berhasil ditambahkan');
  });
}

function sendChat(){
  const conv = DB.conversations.find(c=>c.id===S.activeConversationId); if(!conv) return;
  const inp = document.querySelector('#chatInput');
  if(!inp.value.trim()) return toast('Tulis pesan terlebih dahulu','err');
  conv.messages.push({from:'out', text:inp.value, time:Date.now()});
  conv.status='Aktif'; conv.tone='ok';
  saveDB(); render(); toast('Pesan dikirim (tersimpan lokal)');
}

function saveSettings(){
  DB.settings.pharmacyName = document.querySelector('#setName').value || DB.settings.pharmacyName;
  DB.settings.address = document.querySelector('#setAddress').value || DB.settings.address;
  DB.settings.whatsapp = document.querySelector('#setWa').value || DB.settings.whatsapp;
  DB.settings.notifLowStock = document.querySelector('#notifLow').checked;
  DB.settings.notifExpiry = document.querySelector('#notifExp').checked;
  DB.settings.notifDailySummary = document.querySelector('#notifDaily').checked;
  saveDB(); updateHeader(); toast('Pengaturan tersimpan');
}

function exportCSV(){
  const rows = [['Tanggal','No Transaksi','Pelanggan','Subtotal','PPN','Total','Metode Bayar']];
  DB.transactions.forEach(t=>{
    const c = DB.customers.find(x=>x.id===t.customerId);
    rows.push([new Date(t.time).toLocaleString('id-ID'), t.code, c?c.name:'Pelanggan Umum', t.subtotal, t.tax, t.total, t.payment]);
  });
  const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='laporan-apotekkilat.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('Laporan CSV diunduh');
}

/* ---------------- Init ---------------- */
function updateHeader(){
  const b = document.querySelector('#pharmacyLabel');
  if(b) b.textContent = DB.settings.pharmacyName;
  const br = document.querySelector('#profileBranch');
  if(br) br.textContent = DB.settings.pharmacyName;
}
loadDB();
render();
updateHeader();
