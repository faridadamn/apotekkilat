/* Menu Transaksi Penjualan: daftar, filter periode, dan detail transaksi */
(function(){
  const menuPos=NAV.findIndex(n=>n[0]==='kasir');
  if(!NAV.some(n=>n[0]==='penjualan')) NAV.splice(menuPos<0?NAV.length:menuPos+1,0,['penjualan','🧾','Transaksi Penjualan']);
  function day(v){return v?new Date(v).toISOString().slice(0,10):'';}
  function dateTime(v){return v?new Date(v).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'-';}
  function getFilter(){return S.salesFilter||(S.salesFilter={range:'Hari Ini',start:'',end:'',payment:'Semua',search:''});}
  function rangeDates(f){
    const now=new Date(); const today=day(now);
    if(f.range==='Hari Ini') return {start:today,end:today};
    if(f.range==='7 Hari Terakhir'){const d=new Date(now);d.setDate(d.getDate()-6);return {start:day(d),end:today};}
    if(f.range==='Bulan Ini'){const d=new Date(now.getFullYear(),now.getMonth(),1);return {start:day(d),end:today};}
    return {start:f.start||'',end:f.end||''};
  }
  function filtered(){
    const f=getFilter(),r=rangeDates(f);
    return [...DB.transactions].filter(t=>{
      const d=day(t.time),c=DB.customers.find(x=>x.id===t.customerId),q=(f.search||'').toLowerCase();
      if(r.start&&d<r.start)return false;if(r.end&&d>r.end)return false;
      if(f.payment!=='Semua'&&t.payment!==f.payment)return false;
      if(q&&!(t.code+' '+(c?.name||'Pelanggan Umum')+' '+t.payment).toLowerCase().includes(q))return false;
      return true;
    }).sort((a,b)=>(b.time||0)-(a.time||0));
  }
  function salesPage(){
    const f=getFilter(),list=filtered(),total=list.reduce((a,t)=>a+(Number(t.total)||0),0),tax=list.reduce((a,t)=>a+(Number(t.tax)||0),0),units=list.reduce((a,t)=>a+(t.items||[]).reduce((x,it)=>x+(Number(it.qty)||0),0),0);
    const ranges=['Hari Ini','7 Hari Terakhir','Bulan Ini','Pilih Tanggal'];
    return `<section class="page active"><div class="head"><div><h2>Transaksi Penjualan</h2><p>Monitor transaksi kasir berdasarkan hari, periode, atau filter tanggal.</p></div><button class="primary" data-action="new-transaction">＋ Transaksi Baru</button></div>
    <div class="grid4"><div class="card kpi"><div class="kicon">◈</div><div><label>Total Penjualan</label><strong>${fmt(total)}</strong><span class="muted">Sesuai filter</span></div></div><div class="card kpi"><div class="kicon">🧾</div><div><label>Jumlah Transaksi</label><strong>${list.length}</strong><span class="muted">Transaksi tercatat</span></div></div><div class="card kpi"><div class="kicon">💊</div><div><label>Produk Terjual</label><strong>${units}</strong><span class="muted">Unit produk</span></div></div><div class="card kpi"><div class="kicon">%</div><div><label>PPN Terkumpul</label><strong>${fmt(tax)}</strong><span class="muted">Dari periode</span></div></div></div>
    <div style="height:16px"></div><div class="card"><div class="tools"><input class="flex" id="salesSearch" placeholder="Cari no transaksi atau pelanggan..." value="${esc(f.search||'')}"><select id="salesRange">${ranges.map(x=>`<option ${f.range===x?'selected':''}>${x}</option>`).join('')}</select><select id="salesPayment"><option>Semua</option>${['Tunai','QRIS','Debit'].map(x=>`<option ${f.payment===x?'selected':''}>${x}</option>`).join('')}</select><input id="salesStart" type="date" value="${esc(f.start||'')}" ${f.range==='Pilih Tanggal'?'':'disabled'}><input id="salesEnd" type="date" value="${esc(f.end||'')}" ${f.range==='Pilih Tanggal'?'':'disabled'}><button class="outline" id="salesReset">Reset</button></div>
    <table><thead><tr><th>No. Transaksi</th><th>Tanggal</th><th>Pelanggan</th><th>Item</th><th>Pembayaran</th><th>Subtotal</th><th>PPN</th><th>Total</th></tr></thead><tbody>${salesRows(list)}</tbody></table></div></section>`;
  }
  function salesRows(list){return list.length?list.map(t=>{const c=DB.customers.find(x=>x.id===t.customerId),units=(t.items||[]).reduce((a,it)=>a+(Number(it.qty)||0),0);return `<tr class="clickable" data-sale-open="${t.id}"><td><b>${esc(t.code)}</b></td><td>${dateTime(t.time)}</td><td>${esc(c?.name||'Pelanggan Umum')}</td><td>${units} unit<br><small class="muted">${(t.items||[]).length} produk</small></td><td>${status(t.payment,'violet')}</td><td>${fmt(t.subtotal||0)}</td><td>${fmt(t.tax||0)}</td><td><b>${fmt(t.total||0)}</b></td></tr>`;}).join(''):'<tr><td colspan="8" class="empty">Tidak ada transaksi pada periode ini.</td></tr>';}
  function detailPage(){
    const t=DB.transactions.find(x=>x.id===S.selectedSaleId);if(!t){S.selectedSaleId=null;return salesPage();}
    const c=DB.customers.find(x=>x.id===t.customerId),items=t.items||[];
    return `<section class="page active"><div class="head"><div><button class="outline" data-sales-back>← Kembali ke Transaksi</button><h2 style="margin-top:14px">Detail Transaksi Penjualan</h2><p>${esc(t.code)} · ${dateTime(t.time)}</p></div><button class="outline" data-sale-print="${t.id}">Cetak Struk</button></div>
    <div class="card" style="padding:23px"><div style="display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap"><div><small class="muted">Pelanggan</small><h2 style="margin:4px 0">${esc(c?.name||'Pelanggan Umum')}</h2><p class="muted">${esc(c?.phone||'-')}</p></div><div><small class="muted">Metode Pembayaran</small><h2 style="margin:4px 0">${status(t.payment,'violet')}</h2></div><div><small class="muted">Total Bayar</small><h2 style="margin:4px 0;color:var(--g)">${fmt(t.total||0)}</h2></div></div></div>
    <div style="height:16px"></div><div class="two"><div class="card"><div class="title"><span>Rincian Item</span><span class="muted">${items.length} produk</span></div><table><thead><tr><th>Produk</th><th>Harga</th><th>Qty</th><th>Subtotal</th></tr></thead><tbody>${items.map(it=>{const p=DB.products.find(x=>x.id===it.productId);return `<tr><td><b>${esc(it.name||p?.name||'Produk')}</b><br><small class="muted">${esc(p?.type||'-')}</small></td><td>${fmt(it.price||0)}</td><td>${it.qty||0}</td><td><b>${fmt((Number(it.price)||0)*(Number(it.qty)||0))}</b></td></tr>`;}).join('')}</tbody><tfoot><tr><td colspan="3" style="text-align:right;padding:10px">Subtotal</td><td>${fmt(t.subtotal||0)}</td></tr><tr><td colspan="3" style="text-align:right;padding:10px">PPN</td><td>${fmt(t.tax||0)}</td></tr><tr><td colspan="3" style="text-align:right;padding:10px"><b>Total</b></td><td><b style="color:var(--g)">${fmt(t.total||0)}</b></td></tr></tfoot></table></div><div class="card"><div class="title"><span>Informasi Transaksi</span></div><p><b>Nomor Transaksi</b><br><span class="muted">${esc(t.code)}</span></p><p><b>Waktu</b><br><span class="muted">${dateTime(t.time)}</span></p><p><b>Pembayaran</b><br><span class="muted">${esc(t.payment||'-')}</span></p><p><b>Status</b><br>${status('Selesai','ok')}</p></div></div></section>`;
  }
  function printSale(id){const t=DB.transactions.find(x=>x.id===id);if(!t)return;const c=DB.customers.find(x=>x.id===t.customerId);const w=window.open('','_blank','width=420,height=700');if(!w)return toast('Izinkan pop-up untuk mencetak struk','err');w.document.write(`<html><head><title>${esc(t.code)}</title><style>body{font-family:monospace;padding:20px}hr{border:0;border-top:1px dashed #333}table{width:100%;font-size:12px}</style></head><body><h3>ApotekKilat</h3><hr>${esc(t.code)}<br>${dateTime(t.time)}<br>Pelanggan: ${esc(c?.name||'Pelanggan Umum')}<hr><table>${(t.items||[]).map(it=>`<tr><td>${esc(it.name||'Produk')} x${it.qty}</td><td style="text-align:right">${fmt((it.price||0)*(it.qty||0))}</td></tr>`).join('')}</table><hr>Subtotal: ${fmt(t.subtotal||0)}<br>PPN: ${fmt(t.tax||0)}<br><b>TOTAL: ${fmt(t.total||0)}</b><br>Bayar: ${esc(t.payment||'-')}<script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();}
  const originalRender=render;
  render=function(){if(S.page==='penjualan'){nav();document.querySelector('#pages').innerHTML=S.selectedSaleId?detailPage():salesPage();bindSales();return;}originalRender();};
  function bindSales(){
    document.querySelectorAll('[data-page]').forEach(x=>x.onclick=()=>{S.page=x.dataset.page;S.selectedSaleId=null;render();});
    document.querySelectorAll('[data-action]').forEach(x=>x.onclick=()=>action(x.dataset.action,x));
    document.querySelectorAll('[data-sales-back]').forEach(x=>x.onclick=()=>{S.selectedSaleId=null;render();});
    document.querySelectorAll('[data-sale-print]').forEach(x=>x.onclick=()=>printSale(x.dataset.salePrint));
    document.querySelectorAll('[data-sale-open]').forEach(x=>x.onclick=()=>{S.selectedSaleId=x.dataset.saleOpen;render();});
    const f=getFilter(); const ss=document.querySelector('#salesSearch');if(ss)ss.oninput=()=>{f.search=ss.value;render();};const sr=document.querySelector('#salesRange');if(sr)sr.onchange=()=>{f.range=sr.value;render();};const sp=document.querySelector('#salesPayment');if(sp)sp.onchange=()=>{f.payment=sp.value;render();};const st=document.querySelector('#salesStart');if(st)st.onchange=()=>{f.start=st.value;render();};const en=document.querySelector('#salesEnd');if(en)en.onchange=()=>{f.end=en.value;render();};const rs=document.querySelector('#salesReset');if(rs)rs.onclick=()=>{S.salesFilter={range:'Hari Ini',start:'',end:'',payment:'Semua',search:''};render();};
  }
})();
