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
