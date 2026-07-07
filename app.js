/* ApotekKilat — logic penuh, data disimpan di localStorage browser (client-side, single user/single device).
   Tidak ada backend/server: cocok untuk 1 apotek / 1 komputer kasir. Untuk multi-cabang & multi-user
   real-time perlu backend+database terpisah (lihat catatan di README). */

const DB_KEY = 'apotekkilat_db_v1';

/* ---------------- Seed / Default Data ---------------- */
function seedData(){
  const today = new Date();
  const iso = (d)=> d.toISOString().slice(0,10);
  const addDays = (n)=> { const d=new Date(today); d.setDate(d.getDate()+n); return iso(d); };
  return {
    products:[
      {id:'p1',name:'Paracetamol 500mg',type:'Tablet',cat:'Analgesik',price:2000,cost:1200,stock:120,reorder:30,batch:'BJF250501',expired:addDays(260),supplier:'Hexpharm Jaya',batches:[{batchNo:'BJF250501',received:addDays(-40),expired:addDays(260),qty:120,location:'Gudang Pusat'}]},
      {id:'p2',name:'Amoxicillin 500mg',type:'Kapsul',cat:'Antibiotik',price:4500,cost:2800,stock:85,reorder:30,batch:'AMX250402',expired:addDays(300),supplier:'Hexpharm Jaya',batches:[{batchNo:'AMX250402',received:addDays(-30),expired:addDays(300),qty:85,location:'Gudang Pusat'}]},
      {id:'p3',name:'CTM 4mg',type:'Tablet',cat:'Antihistamin',price:1500,cost:800,stock:10,reorder:20,batch:'CTM250315',expired:addDays(-5),supplier:'Kimia Farma Trading',batches:[{batchNo:'CTM250315',received:addDays(-90),expired:addDays(-5),qty:10,location:'Gudang Pusat'}]},
      {id:'p4',name:'Loratadine 10mg',type:'Tablet',cat:'Antihistamin',price:5000,cost:3000,stock:45,reorder:20,batch:'LOR250323',expired:addDays(18),supplier:'Dexa Medica',batches:[{batchNo:'LOR250323',received:addDays(-60),expired:addDays(18),qty:45,location:'Gudang Pusat'}]},
      {id:'p5',name:'Ibuprofen 400mg',type:'Tablet',cat:'Analgesik',price:3500,cost:2100,stock:70,reorder:25,batch:'IBU250331',expired:addDays(400),supplier:'Kalbe Farma',batches:[{batchNo:'IBU250331',received:addDays(-50),expired:addDays(400),qty:70,location:'Gudang Pusat'}]},
      {id:'p6',name:'Vitamin C 500mg',type:'Tablet Hisap',cat:'Suplemen',price:2500,cost:1400,stock:90,reorder:25,batch:'VC250401',expired:addDays(25),supplier:'Kalbe Farma',batches:[{batchNo:'VC250401',received:addDays(-45),expired:addDays(25),qty:90,location:'Gudang Pusat'}]},
      {id:'p7',name:'Bodrex Extra',type:'Tablet',cat:'Analgesik',price:6000,cost:3800,stock:30,reorder:20,batch:'BDX250310',expired:addDays(500),supplier:'Bernofarm',batches:[{batchNo:'BDX250310',received:addDays(-70),expired:addDays(500),qty:30,location:'Gudang Pusat'}]},
      {id:'p8',name:'Tolak Angin Cair',type:'Dus @12 sachet',cat:'Herbal',price:15000,cost:9500,stock:25,reorder:15,batch:'TAC250410',expired:addDays(450),supplier:'Kimia Farma Trading',batches:[{batchNo:'TAC250410',received:addDays(-20),expired:addDays(450),qty:25,location:'Gudang Pusat'}]}
    ],
    customers:[
      {id:'c1',name:'Siti Nur Aisyah',phone:'0812 3456 7890',points:1250,status:'Pelanggan Setia'},
      {id:'c2',name:'Budi Santoso',phone:'0813 2468 1357',points:980,status:'Aktif'},
      {id:'c3',name:'Andi Wijaya',phone:'0812 8765 4321',points:750,status:'Aktif'},
      {id:'c4',name:'Rina Marlina',phone:'0813 1122 3344',points:620,status:'Aktif'}
    ],
    transactions:[],
    prescriptions:[
      {id:'rx1',patient:'Rina Sari',gender:'Perempuan',age:29,phone:'0812-3456-7890',doctor:'dr. Budi Santoso',time:Date.now()-12*60000,status:'Menunggu Verifikasi',items:[{name:'Amoxicillin 500mg',qty:10,sig:'S 3 dd 1 cap'},{name:'Paracetamol 500mg',qty:10,sig:'S 3 dd 1 tab bila perlu'},{name:'CTM 4mg',qty:10,sig:'S 3 dd 1 tab'}],note:''},
      {id:'rx2',patient:'Andi Wijaya',gender:'Laki-laki',age:34,phone:'0812-8765-4321',doctor:'dr. Budi Santoso',time:Date.now()-28*60000,status:'Menunggu Verifikasi',items:[{name:'Ibuprofen 400mg',qty:10,sig:'S 2 dd 1 tab'}],note:''},
      {id:'rx3',patient:'Siti Aisyah',gender:'Perempuan',age:32,phone:'0812-1111-2222',doctor:'dr. Dinda Lestari',time:Date.now()-45*60000,status:'Diproses',items:[{name:'Loratadine 10mg',qty:10,sig:'S 1 dd 1 tab'}],note:''}
    ],
    purchaseOrders:[],
    branches:[
      {id:'b1',name:'Apotek Sehat Pusat',address:'Jakarta Selatan',isMain:true},
      {id:'b2',name:'Apotek Sehat Bandung',address:'Bandung, Jawa Barat',isMain:false},
      {id:'b3',name:'Apotek Sehat Surabaya',address:'Surabaya, Jawa Timur',isMain:false}
    ],
    users:[
      {id:'u1',name:'Apt. Nadia Putri',branchId:'b1',role:'Owner',status:'Aktif'},
      {id:'u2',name:'Apt. Dinda Lestari',branchId:'b2',role:'Apoteker',status:'Aktif'},
      {id:'u3',name:'Budi Santoso',branchId:'b3',role:'Kasir',status:'Aktif'}
    ],
    conversations:[
      {id:'k1',name:'Rina Kartika',phone:'+62 812-3456-7890',status:'Aktif',tone:'ok',messages:[
        {from:'in',text:'Halo, selamat pagi. Pesanan obat saya kapan dikirim ya?',time:Date.now()-3600000},
        {from:'out',text:'Selamat pagi, Kak Rina. Boleh saya minta nomor pesanan atau nama penerima agar saya cek untuk Anda?',time:Date.now()-3500000},
        {from:'in',text:'Nomor pesanan saya TRX-250526-0248 atas nama Rina Kartika.',time:Date.now()-3400000},
        {from:'out',text:'Terima kasih, Kak. Mohon ditunggu sebentar ya, saya cek terlebih dahulu.',time:Date.now()-3300000}
      ]},
      {id:'k2',name:'Budi Santoso',phone:'0813 2468 1357',status:'Menunggu',tone:'warn',messages:[
        {from:'in',text:'Apakah Amoxicillin 500mg ada?',time:Date.now()-7200000}
      ]}
    ],
    settings:{pharmacyName:'Apotek Sehat',address:'Jakarta Selatan',whatsapp:'0812-3456-7890',notifLowStock:true,notifExpiry:true,notifDailySummary:false},
    activeBranchId:'b1'
  };
}

let DB = null;
function loadDB(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(raw) DB = JSON.parse(raw);
    else { DB = seedData(); saveDB(); }
  }catch(e){ DB = seedData(); saveDB(); }
}
function saveDB(){
  try{ localStorage.setItem(DB_KEY, JSON.stringify(DB)); }
  catch(e){ toast('Gagal menyimpan data (storage penuh?)','err'); }
}
function resetDB(){ DB = seedData(); saveDB(); }

/* ---------------- Helpers ---------------- */
const uid = (p)=> (p?p+'-':'')+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const fmt = n => 'Rp '+Math.round(n||0).toLocaleString('id-ID');
const dateFmt = iso => { if(!iso) return '-'; const d=new Date(iso); return d.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}); };
const timeFmt = ts => new Date(ts).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
const daysUntil = iso => Math.ceil((new Date(iso) - new Date())/86400000);
const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status = (x,t)=>`<span class="status ${t}">${esc(x)}</span>`;

function toast(t, kind){
  const e = document.querySelector('#toast');
  e.textContent = t;
  e.className = 'toast show'+(kind==='err'?' err':'');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>e.classList.remove('show'), 2800);
}

function computeStatus(p){
  const d = daysUntil(p.expired);
  if(d < 0) return {status:'Expired', tone:'expired'};
  if(d <= 30) return {status:'Expired Dekat', tone:'expired'};
  if(p.stock < (p.reorder||20)) return {status:'Stok Menipis', tone:'warn'};
  return {status:'Aman', tone:'ok'};
}

function modal(title, contentHtml, onSave, opts){
  opts = opts || {};
  document.querySelector('#modalTitle').textContent = title;
  document.querySelector('#modalContent').innerHTML = contentHtml;
  const wrap = document.querySelector('#modalWrap');
  wrap.classList.add('show');
  const saveBtn = document.querySelector('#modalSave');
  saveBtn.style.display = opts.hideSave ? 'none' : '';
  saveBtn.textContent = opts.saveLabel || 'Simpan';
  saveBtn.onclick = ()=>{ if(onSave){ const keep = onSave(); if(keep===false) return; } wrap.classList.remove('show'); };
}
function closeModal(){ document.querySelector('#modalWrap').classList.remove('show'); }

function confirmAction(message, onYes){
  modal('Konfirmasi', `<p>${esc(message)}</p>`, onYes, {saveLabel:'Ya, lanjutkan'});
}

/* ---------------- App State (UI-only, not persisted) ---------------- */
const S = {
  page:'dashboard',
  cart:[],
  cartCustomerId:null,
  selectedProductId:null,
  selectedPrescriptionId:null,
  selectedPOId:null,
  selectedCustomerId:null,
  selectedBranchId:null,
  activeConversationId:null,
  inventoryFilter:'all',
  posCategory:'Semua'
};

const NAV = [
  ['dashboard','⌂','Dashboard'],['inventori','▦','Inventori'],['obat','✚','Detail Obat'],
  ['kasir','▣','Kasir'],['resep','▤','Resep'],['pembelian','🛒','Pembelian'],
  ['pelanggan','♙','Pelanggan'],['laporan','▥','Laporan'],['cabang','⌘','Cabang'],
  ['chat','◌','Chat'],['pengaturan','⚙','Pengaturan']
];

function nav(){
  document.querySelector('#nav').innerHTML = NAV.map(n=>{
    const badge = n[0]==='chat' ? DB.conversations.filter(c=>c.messages.length && c.messages[c.messages.length-1].from==='in').length : 0;
    return `<button data-page="${n[0]}" class="${S.page===n[0]?'active':''}"><span class="ico">${n[1]}</span><span>${n[2]}</span>${badge?`<span class="pill">${badge}</span>`:''}</button>`;
  }).join('');
}

/* ---------------- KPI / Chart (computed from real transactions) ---------------- */
function todayKey(){ return new Date().toISOString().slice(0,10); }
function txDateKey(tx){ return new Date(tx.time).toISOString().slice(0,10); }

function kpis(){
  const tKey = todayKey();
  const todaysTx = DB.transactions.filter(t=>txDateKey(t)===tKey);
  const salesToday = todaysTx.reduce((a,t)=>a+t.total,0);
  const yestKey = new Date(Date.now()-86400000).toISOString().slice(0,10);
  const salesYesterday = DB.transactions.filter(t=>txDateKey(t)===yestKey).reduce((a,t)=>a+t.total,0);
  const growth = salesYesterday>0 ? (((salesToday-salesYesterday)/salesYesterday)*100).toFixed(1) : (salesToday>0?'100.0':'0.0');
  const lowStock = DB.products.filter(p=>computeStatus(p).status==='Stok Menipis').length;
  const nearExpiry = DB.products.filter(p=>{const d=daysUntil(p.expired); return d>=0 && d<=30;}).length;
  const pendingRx = DB.prescriptions.filter(r=>r.status==='Menunggu Verifikasi').length;
  const cards = [
    ['▣','Penjualan Hari Ini',fmt(salesToday), (growth>=0?'↑ ':'↓ ')+Math.abs(growth)+'% dari kemarin', true],
    ['🛒','Transaksi',String(todaysTx.length), 'Transaksi hari ini', true],
    ['◈','Stok Menipis',String(lowStock),'Perlu perhatian', false],
    ['◴','Mendekati Expired',String(nearExpiry),'Dalam 30 hari', false],
    ['▤','Resep Masuk',String(pendingRx),'Menunggu verifikasi', true]
  ];
  return `<div class="grid5">${cards.map(x=>`<div class="card kpi"><div class="kicon">${x[0]}</div><div><label>${esc(x[1])}</label><strong>${esc(x[2])}</strong><span class="${x[4]?'up':'muted'}">${esc(x[3])}</span></div></div>`).join('')}</div>`;
}

function chart(){
  const days = [...Array(7)].map((_,i)=>{ const d=new Date(); d.setDate(d.getDate()-(6-i)); return d.toISOString().slice(0,10); });
  const totals = days.map(k=>DB.transactions.filter(t=>txDateKey(t)===k).reduce((a,t)=>a+t.total,0));
  const max = Math.max(...totals, 1);
  const W=700,H=240,pad=20;
  const pts = totals.map((v,i)=>{ const x=pad+i*((W-2*pad)/(days.length-1)); const y=H-30-(v/max)*(H-70); return [x,y]; });
  const line = pts.map((p,i)=>(i===0?'M':'L')+p[0]+' '+p[1]).join(' ');
  const area = line+` L${pts[pts.length-1][0]} ${H-20} L${pts[0][0]} ${H-20} Z`;
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#10a968" stop-opacity=".32"/><stop offset="1" stop-color="#10a968" stop-opacity=".01"/></linearGradient></defs><g stroke="#e7efeb"><line x1="0" y1="45" x2="${W}" y2="45"/><line x1="0" y1="95" x2="${W}" y2="95"/><line x1="0" y1="145" x2="${W}" y2="145"/><line x1="0" y1="195" x2="${W}" y2="195"/></g><path d="${area}" fill="url(#fill)"/><path d="${line}" fill="none" stroke="#0ca968" stroke-width="4" stroke-linecap="round"/></svg></div>`;
}

/* ---------------- Dashboard ---------------- */
function dashboard(){
  const lastTx = [...DB.transactions].sort((a,b)=>b.time-a.time).slice(0,4);
  const lowStockItems = DB.products.filter(p=>p.stock < (p.reorder||20));
  const catTotals = {};
  DB.transactions.forEach(t=>t.items.forEach(it=>{
    const p = DB.products.find(x=>x.id===it.productId);
    const cat = p ? p.cat : 'Lainnya';
    catTotals[cat] = (catTotals[cat]||0) + it.price*it.qty;
  }));
  const totalCat = Object.values(catTotals).reduce((a,b)=>a+b,0) || 1;
  const catEntries = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).slice(0,4);
  const colors = ['var(--g)','var(--blue)','var(--orange)','var(--purple)'];
  let acc = 0;
  const gradientParts = catEntries.map((e,i)=>{ const pct=(e[1]/totalCat*100); const start=acc; acc+=pct; return `${colors[i]} ${start.toFixed(1)}% ${acc.toFixed(1)}%`; });
  const donutBg = catEntries.length ? `conic-gradient(${gradientParts.join(',')})` : '#eef2f0';

  return `<section class="page active"><div class="head"><div><h2>Dashboard Utama</h2><p>Pantau performa apotek Anda secara real-time.</p></div><button class="primary" data-action="new-transaction">＋ Transaksi Baru</button></div>
  ${kpis()}
  <div style="height:16px"></div>
  <div class="grid3">
    <div class="card"><div class="title"><span>Grafik Penjualan (7 hari)</span></div>${chart()}</div>
    <div class="card"><div class="title"><span>Penjualan Kategori</span></div>
      <div style="display:flex;align-items:center;gap:14px"><div class="donut" style="background:${donutBg}"></div>
      <div class="muted" style="font-size:12px;line-height:2">${catEntries.length?catEntries.map((e,i)=>`<span style="color:${colors[i]}">● ${esc(e[0])} ${(e[1]/totalCat*100).toFixed(0)}%</span>`).join('<br>'):'Belum ada transaksi'}</div></div>
      <hr style="border:0;border-top:1px solid var(--line);margin:17px 0"><b>Total ${fmt(totalCat===1&&!catEntries.length?0:totalCat)}</b>
    </div>
    <div class="card"><div class="title"><span>Notifikasi</span></div>
      ${[
        ...(lowStockItems.length?[['◈',`${lowStockItems.length} obat stok menipis`,'Perlu restock']]:[]),
        ...(DB.products.some(p=>{const d=daysUntil(p.expired);return d>=0&&d<=30;})?[['◴','Ada obat mendekati expired','Dalam 30 hari']]:[]),
        ...(DB.prescriptions.filter(r=>r.status==='Menunggu Verifikasi').length?[['▤',`${DB.prescriptions.filter(r=>r.status==='Menunggu Verifikasi').length} resep perlu verifikasi','Segera diproses`]]:[])
      ].map(n=>`<div class="notice"><i>${n[0]}</i><div><b>${esc(n[1])}</b><small>${esc(n[2])}</small></div></div>`).join('') || '<p class="muted">Tidak ada notifikasi baru.</p>'}
    </div>
  </div>
  <div style="height:16px"></div>
  <div class="two">
    <div class="card"><div class="title"><span>Transaksi Terakhir</span><a data-page="kasir">Lihat semua</a></div>
      <table><thead><tr><th>No. Transaksi</th><th>Pelanggan</th><th>Waktu</th><th>Total</th><th>Status</th></tr></thead>
      <tbody>${lastTx.length?lastTx.map(t=>{const c=DB.customers.find(x=>x.id===t.customerId);return `<tr><td>${esc(t.code)}</td><td>${c?esc(c.name):'Pelanggan Umum'}</td><td>${timeFmt(t.time)}</td><td>${fmt(t.total)}</td><td>${status('Selesai','ok')}</td></tr>`}).join(''):'<tr><td colspan="5" class="empty">Belum ada transaksi. Buat transaksi pertama di Kasir.</td></tr>'}</tbody></table>
    </div>
    <div class="card"><div class="title"><span>Stok Menipis</span><a data-page="inventori">Kelola</a></div>
      ${lowStockItems.length?lowStockItems.map(x=>`<div class="notice"><i>💊</i><div><b>${esc(x.name)}</b><small>${x.stock} tersisa · minimum ${x.reorder||20}</small></div></div>`).join(''):'<p class="muted">Semua stok aman.</p>'}
    </div>
  </div></section>`;
}

/* ---------------- Inventory ---------------- */
function inventoryRows(list){
  if(!list.length) return `<tr><td colspan="8" class="empty">Tidak ada obat ditemukan.</td></tr>`;
  return list.map(x=>{ const st=computeStatus(x); return `<tr class="clickable" data-product="${x.id}"><td><b>${esc(x.name)}</b><br><small class="muted">${esc(x.supplier||'-')}</small></td><td>${esc(x.cat)}</td><td>${esc(x.batch)}</td><td style="font-weight:900;color:${x.stock<(x.reorder||20)?'#df4851':'#07945a'}">${x.stock}</td><td>Strip</td><td>${fmt(x.price)}</td><td>${dateFmt(x.expired)}</td><td>${status(st.status,st.tone)}</td></tr>`; }).join('');
}

function inventory(){
  let list = DB.products;
  if(S.inventoryFilter==='low') list = list.filter(p=>computeStatus(p).status==='Stok Menipis');
  if(S.inventoryFilter==='expired') list = list.filter(p=>{const d=daysUntil(p.expired); return d<=30;});
  const lowList = DB.products.filter(p=>p.stock<(p.reorder||20)).slice(0,3);
  const expList = DB.products.filter(p=>{const d=daysUntil(p.expired);return d>=0&&d<=45;}).slice(0,3);
  return `<section class="page active"><div class="head"><div><h2>Inventori Obat</h2><p>Kelola stok, batch, dan obat mendekati expired.</p></div><button class="primary" data-action="add-product">＋ Tambah Obat</button></div>
  ${kpis()}
  <div style="height:16px"></div>
  <div class="split">
    <div class="card">
      <div class="tools">
        <input class="flex" id="inventorySearch" placeholder="Cari nama obat, batch, atau kategori..."/>
        <button class="chip ${S.inventoryFilter==='all'?'active':''}" data-filter="all">Semua</button>
        <button class="chip ${S.inventoryFilter==='low'?'active':''}" data-filter="low">Stok Menipis</button>
        <button class="chip ${S.inventoryFilter==='expired'?'active':''}" data-filter="expired">Expired</button>
      </div>
      <table><thead><tr><th>Nama Obat</th><th>Kategori</th><th>Batch</th><th>Stok</th><th>Satuan</th><th>Harga Jual</th><th>Expired</th><th>Status</th></tr></thead><tbody id="inventoryBody">${inventoryRows(list)}</tbody></table>
    </div>
    <aside class="card side-list">
      <div class="title"><span>Peringatan Inventori</span></div>
      <b>Stok Menipis</b>${lowList.length?lowList.map(x=>`<p>${esc(x.name)} — ${x.stock} strip</p>`).join(''):'<p class="muted">Tidak ada.</p>'}
      <b>Mendekati Expired</b>${expList.length?expList.map(x=>`<p>${esc(x.name)} — ${dateFmt(x.expired)}</p>`).join(''):'<p class="muted">Tidak ada.</p>'}
      <button class="outline" style="margin-top:12px" data-page="pembelian">Buat Purchase Order</button>
    </aside>
  </div></section>`;
}

function medicine(){
  const p = DB.products.find(x=>x.id===S.selectedProductId) || DB.products[0];
  if(!p) return `<section class="page active"><div class="empty">Belum ada obat. Tambahkan dari Inventori.</div></section>`;
  S.selectedProductId = p.id;
  const st = computeStatus(p);
  const totalStock = (p.batches||[]).reduce((a,b)=>a+b.qty,0) || p.stock;
  return `<section class="page active"><div class="head"><div><h2>Detail Obat & Batch</h2><p>Data stok berdasarkan batch dan lokasi gudang.</p></div><div><button class="primary" data-action="edit-medicine">Edit Obat</button> <button class="danger-btn" data-action="delete-product">Hapus</button></div></div>
  <div class="card" style="display:flex;gap:22px;align-items:center;margin-bottom:16px"><div style="font-size:68px">💊</div><div>${status(p.cat,'ok')}<h2 style="margin:8px 0">${esc(p.name)}</h2><p class="muted">${esc(p.type)} · Supplier: ${esc(p.supplier||'-')} · ${status(st.status,st.tone)}</p></div></div>
  <div class="split">
    <div class="card">
      <div class="title"><span>Daftar Batch</span><button class="primary" data-action="add-batch">＋ Tambah Batch</button></div>
      <table><thead><tr><th>No. Batch</th><th>Tanggal Masuk</th><th>Expired</th><th>Stok</th><th>Lokasi</th></tr></thead>
      <tbody>${(p.batches&&p.batches.length)?p.batches.map(b=>`<tr><td>${esc(b.batchNo)}</td><td>${dateFmt(b.received)}</td><td>${dateFmt(b.expired)}</td><td>${b.qty}</td><td>${esc(b.location||'Gudang Pusat')}</td></tr>`).join(''):'<tr><td colspan="5" class="empty">Belum ada data batch.</td></tr>'}</tbody></table>
    </div>
    <aside class="card">
      <div class="title"><span>Ringkasan Stok</span></div>
      <p class="muted">Total Stok Tersedia</p><h2 style="font-size:34px;color:var(--g)">${totalStock} <small class="muted" style="font-size:13px">unit</small></h2>
      <hr style="border:0;border-top:1px solid var(--line)">
      <p class="muted">Reorder Point</p><b>${p.reorder||20} unit</b>
      <p>${p.stock<(p.reorder||20)?status('⚠ Perlu Pemesanan','warn'):status('Stok Cukup','ok')}</p>
      <p class="muted">Harga Jual</p><b>${fmt(p.price)}</b>
      <p class="muted">Harga Modal</p><b>${fmt(p.cost||0)}</b>
      <button class="outline" data-page="pembelian">Buat PO</button>
    </aside>
  </div></section>`;
}

/* ---------------- Cashier / POS ---------------- */
function products(list){
  if(!list.length) return `<div class="empty">Tidak ada produk ditemukan.</div>`;
  return list.map(x=>`<div class="product"><div style="font-size:28px">💊</div><h4>${esc(x.name)}</h4><p>${esc(x.type)} · Stok: ${x.stock}</p><strong>${fmt(x.price)}</strong><button class="outline" style="margin-top:12px;width:100%" data-add="${x.id}" ${x.stock<1?'disabled':''}>＋ Tambah</button></div>`).join('');
}

function cart(){
  if(!S.cart.length) return `<div class="empty">Belum ada produk dipilih.</div>`;
  const sub = S.cart.reduce((a,c)=>{ const p=DB.products.find(x=>x.id===c.id); return a + (p?p.price*c.q:0); },0);
  const tax = Math.round(sub*.11);
  const cust = DB.customers.find(c=>c.id===S.cartCustomerId);
  return `<div>${S.cart.map(c=>{ const p=DB.products.find(x=>x.id===c.id); if(!p) return ''; return `<div class="cartline"><span style="font-size:20px">💊</span><div class="grow"><b>${esc(p.name)}</b><br><small class="muted">${esc(p.type)} · ${fmt(p.price)}</small></div><div class="qty"><button data-qty="${p.id}|-1">−</button> ${c.q} <button data-qty="${p.id}|1" ${c.q>=p.stock?'disabled':''}>＋</button></div><button style="background:none;color:var(--red)" data-remove="${p.id}">×</button></div>`; }).join('')}
  ${cust?`<p class="muted">Pelanggan: <b style="color:var(--ink)">${esc(cust.name)}</b></p>`:''}
  <div class="total"><span>Subtotal</span><b>${fmt(sub)}</b></div>
  <div class="total"><span>PPN 11%</span><b>${fmt(tax)}</b></div>
  <div class="total big"><span>Total</span><span>${fmt(sub+tax)}</span></div>
  <p class="muted">Metode Pembayaran</p>
  <div class="tabs">${['Tunai','QRIS','Debit'].map((m,i)=>`<button class="chip ${(S.paymentMethod||'Tunai')===m?'active':''}" data-pay="${m}">${m}</button>`).join('')}</div>
  <button class="primary" style="width:100%;margin-top:16px" data-action="checkout">Proses Transaksi</button></div>`;
}

function cashier(){
  const cats = ['Semua', ...new Set(DB.products.map(p=>p.cat))];
  let list = DB.products;
  if(S.posCategory && S.posCategory!=='Semua') list = list.filter(p=>p.cat===S.posCategory);
  return `<section class="page active"><div class="head"><div><h2>Kasir / Penjualan</h2><p>Cari dan tambahkan produk ke keranjang.</p></div><button class="outline" data-action="customer-select">Pilih Pelanggan</button></div>
  <div class="pos">
    <div>
      <div class="card"><div class="tools"><input class="flex" id="posSearch" placeholder="Cari obat atau nama produk..."/></div>
      <div class="tabs">${cats.map(c=>`<button class="chip ${S.posCategory===c||(!S.posCategory&&c==='Semua')?'active':''}" data-pos-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div></div>
      <h3>Produk</h3><div class="product-grid" id="posGrid">${products(list)}</div>
    </div>
    <aside class="card"><div class="title"><span>Keranjang (<span id="cartCount">${S.cart.reduce((a,x)=>a+x.q,0)}</span>)</span><a data-action="clear-cart">Bersihkan</a></div><div id="cartArea">${cart()}</div></aside>
  </div></section>`;
}

/* ---------------- Prescriptions ---------------- */
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
  const s = DB.settings;
  return `<section class="page active"><div class="head"><div><h2>Pengaturan</h2><p>Konfigurasi dasar ApotekKilat.</p></div></div>
  <div class="two">
    <div class="card"><div class="title"><span>Profil Apotek</span></div>
    <div class="form">
      <label>Nama Apotek<input id="setName" value="${esc(s.pharmacyName)}"/></label>
      <label>Alamat<input id="setAddress" value="${esc(s.address)}"/></label>
      <label>No. WhatsApp<input id="setWa" value="${esc(s.whatsapp)}"/></label>
      <button class="primary" data-action="save-settings">Simpan Perubahan</button>
    </div></div>
    <div class="card"><div class="title"><span>Notifikasi & Data</span></div>
    <label><input type="checkbox" id="notifLow" ${s.notifLowStock?'checked':''}/> Stok menipis</label><br>
    <label><input type="checkbox" id="notifExp" ${s.notifExpiry?'checked':''}/> Obat mendekati expired</label><br>
    <label><input type="checkbox" id="notifDaily" ${s.notifDailySummary?'checked':''}/> Ringkasan penjualan harian</label>
    <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
    <p class="muted">Semua data (produk, transaksi, pelanggan, dll) tersimpan di browser ini (localStorage). Menghapus cache browser akan menghapus data.</p>
    <button class="danger-btn" data-action="reset-data">Reset ke Data Contoh</button>
    </div>
  </div></section>`;
}

/* ---------------- Bind / Render ---------------- */
function render(){
  nav();
  const pages = {dashboard, inventori:inventory, obat:medicine, kasir:cashier, resep:prescription, pembelian:purchase, pelanggan:customers, laporan:report, cabang:branches, chat, pengaturan:settings};
  document.querySelector('#pages').innerHTML = pages[S.page]();
  bind();
}

function bind(){
  document.querySelectorAll('[data-page]').forEach(x=>x.onclick=()=>{ S.page=x.dataset.page; render(); window.scrollTo({top:0,behavior:'smooth'}); });

  document.querySelectorAll('[data-add]').forEach(x=>x.onclick=()=>{
    const id=x.dataset.add, p=DB.products.find(y=>y.id===id);
    if(!p || p.stock<1) return toast('Stok habis','err');
    const c=S.cart.find(y=>y.id===id);
    if(c){ if(c.q>=p.stock) return toast('Stok tidak cukup','err'); c.q++; }
    else S.cart.push({id,q:1});
    render(); toast('Produk ditambahkan ke keranjang');
  });
  document.querySelectorAll('[data-qty]').forEach(x=>x.onclick=()=>{
    const [id,d]=x.dataset.qty.split('|'); const dn=Number(d);
    const c=S.cart.find(y=>y.id===id); if(!c) return;
    const p=DB.products.find(y=>y.id===id);
    if(dn>0 && p && c.q>=p.stock) return toast('Stok tidak cukup','err');
    c.q+=dn; if(c.q<1) S.cart=S.cart.filter(y=>y.id!==id);
    render();
  });
  document.querySelectorAll('[data-remove]').forEach(x=>x.onclick=()=>{ S.cart=S.cart.filter(y=>y.id!==x.dataset.remove); render(); });
  document.querySelectorAll('[data-pos-cat]').forEach(x=>x.onclick=()=>{ S.posCategory=x.dataset.posCat; render(); });
  document.querySelectorAll('[data-pay]').forEach(x=>x.onclick=()=>{ S.paymentMethod=x.dataset.pay; render(); });
  document.querySelectorAll('[data-filter]').forEach(x=>x.onclick=()=>{ S.inventoryFilter=x.dataset.filter; render(); });

  const inv=document.querySelector('#inventorySearch');
  if(inv) inv.oninput=()=>{ const q=inv.value.toLowerCase(); document.querySelector('#inventoryBody').innerHTML=inventoryRows(DB.products.filter(p=>(p.name+p.batch+p.cat).toLowerCase().includes(q))); bindProductRows(); };
  const ps=document.querySelector('#posSearch');
  if(ps) ps.oninput=()=>{ const q=ps.value.toLowerCase(); document.querySelector('#posGrid').innerHTML=products(DB.products.filter(p=>p.name.toLowerCase().includes(q))); bind(); };
  const cs=document.querySelector('#customerSearch');
  if(cs) cs.oninput=()=>{ const q=cs.value.toLowerCase(); document.querySelector('#customerBody').innerHTML=customerRows(DB.customers.filter(x=>(x.name+x.phone).toLowerCase().includes(q))); bindCustomerRows(); };
  const poS=document.querySelector('#poSearch');
  if(poS) poS.oninput=()=>{ const q=poS.value.toLowerCase(); document.querySelector('#poBody').innerHTML=[...DB.purchaseOrders].filter(p=>(p.code+p.supplier).toLowerCase().includes(q)).map(x=>`<tr><td>${esc(x.code)}</td><td>${esc(x.supplier)}</td><td>${dateFmt(new Date(x.date).toISOString().slice(0,10))}</td><td>${fmt(x.value)}</td><td>${status(x.status,'ok')}</td><td></td></tr>`).join('')||'<tr><td colspan="6" class="empty">Tidak ditemukan.</td></tr>'; };

  const gs=document.querySelector('#globalSearch');
  if(gs) gs.onkeydown=e=>{ if(e.key==='Enter'){ const q=e.target.value.toLowerCase(); const p=DB.products.find(x=>x.name.toLowerCase().includes(q)); if(p){ S.page='inventori'; S.inventoryFilter='all'; render(); toast('Menampilkan hasil untuk '+p.name);} else toast('Tidak ada hasil untuk "'+e.target.value+'"','err'); } };

  bindProductRows();
  bindCustomerRows();
  document.querySelectorAll('[data-select-rx]').forEach(x=>x.onclick=()=>{ S.selectedPrescriptionId=x.dataset.selectRx; render(); });
  document.querySelectorAll('[data-po-advance]').forEach(x=>x.onclick=()=>advancePO(x.dataset.poAdvance));
  document.querySelectorAll('[data-delete-branch]').forEach(x=>x.onclick=()=>{ confirmAction('Hapus cabang ini?', ()=>{ DB.branches=DB.branches.filter(b=>b.id!==x.dataset.deleteBranch); saveDB(); render(); toast('Cabang dihapus'); }); });
  document.querySelectorAll('[data-delete-user]').forEach(x=>x.onclick=()=>{ confirmAction('Hapus pengguna ini?', ()=>{ DB.users=DB.users.filter(u=>u.id!==x.dataset.deleteUser); saveDB(); render(); toast('Pengguna dihapus'); }); });
  document.querySelectorAll('[data-select-chat]').forEach(x=>x.onclick=()=>{ S.activeConversationId=x.dataset.selectChat; render(); });

  document.querySelectorAll('[data-action]').forEach(x=>x.onclick=()=>action(x.dataset.action, x));
}

function bindProductRows(){
  document.querySelectorAll('[data-product]').forEach(x=>x.onclick=()=>{ S.selectedProductId=x.dataset.product; S.page='obat'; render(); });
}
function bindCustomerRows(){
  document.querySelectorAll('[data-select-cust]').forEach(x=>x.onclick=()=>{ S.selectedCustomerId=x.dataset.selectCust; render(); });
}

/* ---------------- Purchase Order flow ---------------- */
function advancePO(id){
  const po = DB.purchaseOrders.find(p=>p.id===id); if(!po) return;
  if(po.status==='Draft'){ po.status='Menunggu Approval'; toast('PO diajukan untuk approval'); }
  else if(po.status==='Menunggu Approval'){ po.status='Dalam Pengiriman'; toast('PO disetujui, menunggu pengiriman'); }
  else if(po.status==='Dalam Pengiriman'){
    po.status='Selesai';
    (po.items||[]).forEach(it=>{
      const p = DB.products.find(x=>x.id===it.productId);
      if(p){ p.stock += it.qty; p.batches = p.batches||[]; p.batches.push({batchNo:'PO-'+po.code, received:new Date().toISOString().slice(0,10), expired:it.expired||p.expired, qty:it.qty, location:'Gudang Pusat'}); }
    });
    toast('Barang diterima, stok diperbarui');
  }
  saveDB(); render();
}

/* ---------------- Main action handler ---------------- */
function action(a, el){
  if(a==='add-product') return openProductForm();
  if(a==='edit-medicine') return openProductForm(DB.products.find(p=>p.id===S.selectedProductId));
  if(a==='delete-product'){
    return confirmAction('Hapus obat ini beserta seluruh riwayat batch-nya?', ()=>{
      DB.products = DB.products.filter(p=>p.id!==S.selectedProductId);
      saveDB(); S.page='inventori'; render(); toast('Obat dihapus');
    });
  }
  if(a==='add-batch') return openBatchForm();

  if(a==='new-transaction'){ S.page='kasir'; return render(); }
  if(a==='clear-cart'){ S.cart=[]; S.cartCustomerId=null; render(); toast('Keranjang dibersihkan'); return; }
  if(a==='customer-select') return openCustomerPicker();
  if(a==='checkout') return checkout();

  if(a==='new-po') return openPOForm();

  if(a==='add-customer') return openCustomerForm();
  if(a==='edit-customer') return openCustomerForm(DB.customers.find(c=>c.id===S.selectedCustomerId));
  if(a==='delete-customer'){
    return confirmAction('Hapus pelanggan ini?', ()=>{
      DB.customers = DB.customers.filter(c=>c.id!==S.selectedCustomerId);
      saveDB(); S.selectedCustomerId=null; render(); toast('Pelanggan dihapus');
    });
  }

  if(a==='add-prescription') return openPrescriptionForm();
  if(a==='verify-rx') return updateRxStatus('Diproses');
  if(a==='prepare-rx') return updateRxStatus('Siap Diambil');
  if(a==='complete-rx') return updateRxStatus('Selesai');

  if(a==='add-branch') return openBranchForm();
  if(a==='add-user') return openUserForm();

  if(a==='send-chat') return sendChat();

  if(a==='save-settings') return saveSettings();
  if(a==='reset-data'){
    return confirmAction('Ini akan menghapus SEMUA data (transaksi, pelanggan, dll) dan mengembalikan ke data contoh. Lanjutkan?', ()=>{
      resetDB(); S.page='dashboard'; render(); updateHeader(); toast('Data direset ke data contoh');
    });
  }
  if(a==='export') return exportCSV();
  if(a==='close-modal'){ closeModal(); return; }
}

/* ---------------- Forms ---------------- */
function openProductForm(existing){
  const p = existing || {};
  modal(existing?'Edit Obat':'Tambah Obat', `<div class="form">
    <label>Nama Obat<input id="fName" value="${esc(p.name||'')}" placeholder="Contoh: Cetirizine 10mg"/></label>
    <label>Kategori<select id="fCat">${['Antihistamin','Analgesik','Antibiotik','Suplemen','Herbal'].map(c=>`<option ${p.cat===c?'selected':''}>${c}</option>`).join('')}</select></label>
    <label>Jenis<input id="fType" value="${esc(p.type||'Tablet')}" placeholder="Tablet / Kapsul / Sirup"/></label>
    <label>Harga Jual<input id="fPrice" type="number" value="${p.price||''}" placeholder="5000"/></label>
    <label>Harga Modal<input id="fCost" type="number" value="${p.cost||''}" placeholder="3000"/></label>
    <label>Stok Awal<input id="fStock" type="number" value="${p.stock!=null?p.stock:''}" placeholder="20" ${existing?'disabled':''}/></label>
    <label>Titik Reorder (batas stok menipis)<input id="fReorder" type="number" value="${p.reorder||20}"/></label>
    <label>Tanggal Expired<input id="fExpired" type="date" value="${p.expired||''}"/></label>
    <label>Supplier<input id="fSupplier" value="${esc(p.supplier||'')}"/></label>
  </div>`, ()=>{
    const name=document.querySelector('#fName').value.trim();
    const price=Number(document.querySelector('#fPrice').value);
    if(!name) return toast('Nama obat wajib diisi','err'), false;
    if(!price || price<=0) return toast('Harga jual harus lebih dari 0','err'), false;
    const expired=document.querySelector('#fExpired').value || new Date(Date.now()+365*86400000).toISOString().slice(0,10);
    if(existing){
      Object.assign(existing,{name,cat:document.querySelector('#fCat').value,type:document.querySelector('#fType').value||'Tablet',price,cost:Number(document.querySelector('#fCost').value)||0,reorder:Number(document.querySelector('#fReorder').value)||20,expired,supplier:document.querySelector('#fSupplier').value});
    } else {
      const stock=Number(document.querySelector('#fStock').value)||0;
      const batchNo='NEW-'+String(Date.now()).slice(-5);
      DB.products.push({id:uid('p'),name,type:document.querySelector('#fType').value||'Tablet',cat:document.querySelector('#fCat').value,price,cost:Number(document.querySelector('#fCost').value)||0,stock,reorder:Number(document.querySelector('#fReorder').value)||20,batch:batchNo,expired,supplier:document.querySelector('#fSupplier').value,batches:[{batchNo,received:new Date().toISOString().slice(0,10),expired,qty:stock,location:'Gudang Pusat'}]});
    }
    saveDB(); render(); toast(existing?'Obat berhasil diperbarui':'Obat baru berhasil ditambahkan');
  });
}

function openBatchForm(){
  const p = DB.products.find(x=>x.id===S.selectedProductId); if(!p) return;
  modal('Tambah Batch', `<div class="form">
    <label>No. Batch<input id="bNo" placeholder="BCH-${Date.now().toString().slice(-6)}"/></label>
    <label>Jumlah<input id="bQty" type="number" placeholder="50"/></label>
    <label>Tanggal Expired<input id="bExp" type="date"/></label>
    <label>Lokasi<input id="bLoc" value="Gudang Pusat"/></label>
  </div>`, ()=>{
    const qty=Number(document.querySelector('#bQty').value);
    if(!qty || qty<=0) return toast('Jumlah harus lebih dari 0','err'), false;
    const batchNo=document.querySelector('#bNo').value.trim()||('BCH-'+String(Date.now()).slice(-6));
    const expired=document.querySelector('#bExp').value || p.expired;
    p.batches = p.batches||[];
    p.batches.push({batchNo,received:new Date().toISOString().slice(0,10),expired,qty,location:document.querySelector('#bLoc').value||'Gudang Pusat'});
    p.stock += qty;
    saveDB(); render(); toast('Batch baru ditambahkan, stok diperbarui');
  });
}

function openCustomerPicker(){
  modal('Pilih Pelanggan', `<div class="form">
    <label>Pelanggan<select id="pickCust"><option value="">Pelanggan Umum (tanpa data)</option>${DB.customers.map(c=>`<option value="${c.id}" ${S.cartCustomerId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>
  </div>`, ()=>{ S.cartCustomerId=document.querySelector('#pickCust').value||null; render(); toast('Pelanggan dipilih'); });
}

function checkout(){
  if(!S.cart.length) return toast('Keranjang masih kosong','err');
  for(const c of S.cart){
    const p = DB.products.find(x=>x.id===c.id);
    if(!p || p.stock < c.q) return toast(`Stok ${p?p.name:'produk'} tidak cukup`,'err');
  }
  const sub = S.cart.reduce((a,c)=>{ const p=DB.products.find(x=>x.id===c.id); return a+p.price*c.q; },0);
  const tax = Math.round(sub*.11);
  const items = S.cart.map(c=>{ const p=DB.products.find(x=>x.id===c.id); p.stock -= c.q; return {productId:p.id,name:p.name,price:p.price,qty:c.q}; });
  const branchId = DB.activeBranchId || (DB.branches[0] && DB.branches[0].id);
  const tx = {id:uid('t'), code:'TRX-'+String(Date.now()).slice(-9), customerId:S.cartCustomerId, branchId, items, subtotal:sub, tax, total:sub+tax, payment:S.paymentMethod||'Tunai', time:Date.now()};
  DB.transactions.push(tx);
  if(S.cartCustomerId){
    const cust = DB.customers.find(c=>c.id===S.cartCustomerId);
    if(cust) cust.points += Math.floor(tx.total/10000);
  }
  saveDB();
  const custName = S.cartCustomerId ? (DB.customers.find(c=>c.id===S.cartCustomerId)||{}).name : 'Pelanggan Umum';
  const receipt = `ApotekKilat\n${'-'.repeat(28)}\n${tx.code}\n${new Date(tx.time).toLocaleString('id-ID')}\nPelanggan: ${custName}\n${'-'.repeat(28)}\n`+items.map(it=>`${it.name} x${it.qty}\n  ${fmt(it.price*it.qty)}`).join('\n')+`\n${'-'.repeat(28)}\nSubtotal: ${fmt(sub)}\nPPN 11%: ${fmt(tax)}\nTOTAL: ${fmt(tx.total)}\nBayar: ${tx.payment}`;
  S.cart = []; S.cartCustomerId = null;
  modal('Transaksi Berhasil', `<div class="receipt">${esc(receipt)}</div>`, null, {saveLabel:'Tutup'});
  render(); toast('Transaksi berhasil dibuat');
}

function openPOForm(){
  modal('Buat Purchase Order', `<div class="form">
    <label>Supplier<input id="poSupplier" placeholder="Nama supplier"/></label>
    <label>Obat<select id="poProduct">${DB.products.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
    <label>Jumlah<input id="poQty" type="number" placeholder="100"/></label>
    <label>Harga Modal per Unit<input id="poCost" type="number" placeholder="3000"/></label>
    <label>Catatan<input id="poNote" placeholder="Kebutuhan restock minggu ini"/></label>
  </div>`, ()=>{
    const supplier = document.querySelector('#poSupplier').value.trim();
    const qty = Number(document.querySelector('#poQty').value);
    const cost = Number(document.querySelector('#poCost').value)||0;
    if(!supplier) return toast('Nama supplier wajib diisi','err'), false;
    if(!qty || qty<=0) return toast('Jumlah harus lebih dari 0','err'), false;
    const productId = document.querySelector('#poProduct').value;
    const po = {id:uid('po'), code:'PO-'+String(Date.now()).slice(-8), supplier, note:document.querySelector('#poNote').value, items:[{productId,qty,cost,expired:DB.products.find(p=>p.id===productId).expired}], value:qty*cost, status:'Draft', date:Date.now()};
    DB.purchaseOrders.push(po);
    saveDB(); render(); toast('PO draft berhasil dibuat');
  });
}

function openCustomerForm(existing){
  const c = existing || {};
  modal(existing?'Edit Pelanggan':'Tambah Pelanggan', `<div class="form">
    <label>Nama<input id="cName" value="${esc(c.name||'')}" placeholder="Nama pelanggan"/></label>
    <label>Nomor WhatsApp<input id="cPhone" value="${esc(c.phone||'')}" placeholder="0812..."/></label>
  </div>`, ()=>{
    const name = document.querySelector('#cName').value.trim();
    if(!name) return toast('Nama wajib diisi','err'), false;
    if(existing){ existing.name=name; existing.phone=document.querySelector('#cPhone').value||existing.phone; }
    else DB.customers.unshift({id:uid('c'), name, phone:document.querySelector('#cPhone').value||'-', points:0, status:'Aktif'});
    saveDB(); render(); toast(existing?'Pelanggan diperbarui':'Pelanggan berhasil ditambahkan');
  });
}

function openPrescriptionForm(){
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
