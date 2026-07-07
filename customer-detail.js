/* Halaman Detail Pelanggan dan Riwayat Transaksi */
(function(){
  function customerById(id){ return (DB.customers||[]).find(c=>c.id===id); }
  function txsOf(customerId){ return [...(DB.transactions||[])].filter(t=>t.customerId===customerId).sort((a,b)=>(b.time||0)-(a.time||0)); }
  function d(v){ return v?new Date(v).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}):'-'; }
  function dt(v){ return v?new Date(v).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'-'; }
  function initials(name){ return String(name||'?').split(' ').filter(Boolean).map(x=>x[0]).slice(0,2).join('').toUpperCase(); }
  function customerDetail(){
    const c=customerById(S.selectedCustomerId); if(!c){S.selectedCustomerId=null;return null;}
    const txs=txsOf(c.id); const total=txs.reduce((a,t)=>a+(Number(t.total)||0),0); const avg=txs.length?total/txs.length:0; const latest=txs[0];
    const productQty={}; txs.forEach(t=>(t.items||[]).forEach(it=>{productQty[it.productId]=(productQty[it.productId]||0)+(Number(it.qty)||0);}));
    const favorites=Object.entries(productQty).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([id,qty])=>({p:DB.products.find(x=>x.id===id),qty}));
    return `<section class="page active"><div class="head"><div><button class="outline" data-customer-back>← Kembali ke Pelanggan</button><h2 style="margin-top:14px">Detail Pelanggan</h2><p>Profil pelanggan, ringkasan pembelian, dan riwayat transaksi.</p></div></div>
      <div class="card" style="padding:23px"><div style="display:flex;justify-content:space-between;gap:20px;align-items:flex-start;flex-wrap:wrap"><div style="display:flex;gap:15px;align-items:center"><div style="width:60px;height:60px;border-radius:18px;background:#e5f8ee;color:#078651;display:grid;place-items:center;font-size:21px;font-weight:900">${esc(initials(c.name))}</div><div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h2 style="margin:0">${esc(c.name)}</h2>${status(c.status||'Aktif',(c.status||'Aktif')==='Aktif'||(c.status||'')==='Pelanggan Setia'?'ok':'warn')}</div><p class="muted" style="margin:7px 0 0">Pelanggan sejak tercatat di ApotekKilat</p></div></div><div><small class="muted">Poin Loyalitas</small><h2 style="margin:4px 0 0;color:var(--g)">${Number(c.points)||0} poin</h2></div></div>
      <div style="height:18px"></div><div class="grid4"><div><label class="muted">Nomor Telepon</label><b style="display:block;margin-top:4px">${esc(c.phone||'-')}</b></div><div><label class="muted">Status Pelanggan</label><b style="display:block;margin-top:4px">${esc(c.status||'Aktif')}</b></div><div><label class="muted">Transaksi Terakhir</label><b style="display:block;margin-top:4px">${latest?d(latest.time):'-'}</b></div><div><label class="muted">Metode Terakhir</label><b style="display:block;margin-top:4px">${esc(latest?.payment||'-')}</b></div></div></div>
      <div style="height:16px"></div><div class="grid4"><div class="card kpi"><div class="kicon">◈</div><div><label>Total Belanja</label><strong>${fmt(total)}</strong><span class="muted">Akumulasi transaksi</span></div></div><div class="card kpi"><div class="kicon">🧾</div><div><label>Jumlah Transaksi</label><strong>${txs.length}</strong><span class="muted">Transaksi tercatat</span></div></div><div class="card kpi"><div class="kicon">◌</div><div><label>Rata-rata Belanja</label><strong>${fmt(avg)}</strong><span class="muted">Per transaksi</span></div></div><div class="card kpi"><div class="kicon">★</div><div><label>Poin Loyalitas</label><strong>${Number(c.points)||0}</strong><span class="muted">Poin saat ini</span></div></div></div>
      <div style="height:16px"></div><div class="two"><div class="card"><div class="title"><span>Riwayat Transaksi</span><span class="muted">${txs.length} transaksi</span></div><table><thead><tr><th>No. Transaksi</th><th>Tanggal</th><th>Item</th><th>Pembayaran</th><th>Total</th></tr></thead><tbody>${txs.length?txs.map(t=>{const units=(t.items||[]).reduce((a,it)=>a+(Number(it.qty)||0),0);const names=(t.items||[]).slice(0,2).map(it=>{const p=DB.products.find(x=>x.id===it.productId);return esc(p?.name||'Produk');}).join(', ');return `<tr><td><b>${esc(t.code||'-')}</b></td><td>${dt(t.time)}</td><td>${units} unit<br><small class="muted">${names||'-'}${(t.items||[]).length>2?' ...':''}</small></td><td>${esc(t.payment||'-')}</td><td><b>${fmt(t.total||0)}</b></td></tr>`;}).join(''):'<tr><td colspan="5" class="empty">Belum ada transaksi untuk pelanggan ini.</td></tr>'}</tbody></table></div>
      <div class="card"><div class="title"><span>Produk Favorit</span></div>${favorites.length?favorites.map(x=>`<div class="notice"><i>💊</i><div><b>${esc(x.p?.name||'Produk')}</b><small>${x.qty} unit dibeli</small></div></div>`).join(''):'<p class="empty">Belum ada data produk favorit.</p>'}<hr style="border:0;border-top:1px solid var(--line);margin:16px 0"><p><b>Catatan</b><br><span class="muted">Data riwayat akan bertambah otomatis setiap transaksi POS dilakukan menggunakan pelanggan ini.</span></p></div></div>
    </section>`;
  }

  const baseCustomers=customers;
  customers=function(){ return S.selectedCustomerId?customerDetail()||baseCustomers():baseCustomers(); };
  const baseRender=render;
  render=function(){baseRender();if(S.page==='pelanggan')enhanceCustomer();};
  function enhanceCustomer(){
    document.querySelectorAll('[data-customer-back]').forEach(b=>b.onclick=()=>{S.selectedCustomerId=null;render();});
    const body=document.querySelector('#customerBody'); if(!body)return;
    body.querySelectorAll('tr').forEach(row=>{
      if(row.dataset.customerOpen)return;
      const first=row.querySelector('td b'); if(!first)return;
      const name=first.textContent.trim(); const c=(DB.customers||[]).find(x=>x.name===name); if(!c)return;
      row.dataset.customerOpen=c.id; row.classList.add('clickable');
    });
  }
  document.addEventListener('click',e=>{const row=e.target.closest('[data-customer-open]');if(!row||e.target.closest('button,a,input,select,textarea'))return;S.selectedCustomerId=row.dataset.customerOpen;render();},true);
})();
