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
