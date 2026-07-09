/* Workflow Purchase Order: print, approve, reject, duplicate */
(function(){
  function poTone(status){ return status==='Selesai'?'ok':status==='Dalam Pengiriman'?'ok':status==='Disetujui'?'ok':status==='Ditolak'?'expired':status==='Draft'?'violet':'warn'; }
  function poDate(v){ return v?new Date(v).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}):'-'; }
  function poItems(po){ return (po.items||[]).map(it=>{const p=DB.products.find(x=>x.id===it.productId);return {name:p?p.name:'Produk',qty:it.qty||0,cost:it.cost||0,total:(it.qty||0)*(it.cost||0)};}); }
  function countStatus(status){ return DB.purchaseOrders.filter(po=>po.status===status).length; }
  function cloudMode(){ return !!(window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getMode && window.ApotekKilatSupabaseData.getMode()==='cloud'); }

  purchase=function(){
    const list=[...DB.purchaseOrders].sort((a,b)=>(b.date||0)-(a.date||0));
    return `<section class="page active"><div class="head"><div><h2>Pembelian & Supplier</h2><p>Kelola purchase order, approval, penerimaan barang, dan dokumen cetak.</p></div><button class="primary" data-action="new-po">＋ Buat PO Baru</button></div>
      <div class="grid4"><div class="card kpi"><div class="kicon">▤</div><div><label>PO Draft</label><strong>${countStatus('Draft')}</strong></div></div><div class="card kpi"><div class="kicon">◴</div><div><label>Menunggu Approval</label><strong>${countStatus('Menunggu Approval')}</strong></div></div><div class="card kpi"><div class="kicon">✓</div><div><label>Disetujui / Dikirim</label><strong>${countStatus('Disetujui')+countStatus('Dalam Pengiriman')}</strong></div></div><div class="card kpi"><div class="kicon">×</div><div><label>Ditolak</label><strong>${countStatus('Ditolak')}</strong></div></div></div>
      <div style="height:16px"></div><div class="card"><div class="tools"><input class="flex" id="poSearch" placeholder="Cari no. PO, supplier, atau status..."/></div>
      <table><thead><tr><th>No. PO</th><th>Supplier</th><th>Tanggal</th><th>Item</th><th>Nilai</th><th>Status</th><th>Aksi</th></tr></thead><tbody id="poBody">${purchaseRows(list)}</tbody></table></div></section>`;
  };

  function purchaseRows(list){
    if(!list.length) return '<tr><td colspan="7" class="empty">Belum ada purchase order.</td></tr>';
    return list.map(po=>{const items=poItems(po);const actions=[];
      actions.push(`<button class="outline" data-po-print="${po.id}">Cetak</button>`);
      if(po.status==='Draft'){actions.push(`<button class="primary" data-po-submit="${po.id}">Ajukan</button>`);}
      if(po.status==='Menunggu Approval'){actions.push(`<button class="primary" data-po-approve="${po.id}">Approve</button><button class="danger-btn" data-po-reject="${po.id}">Reject</button>`);}
      if(po.status==='Disetujui'){actions.push(`<button class="outline" data-po-ship="${po.id}">Kirim</button>`);}
      if(po.status==='Dalam Pengiriman'){actions.push(`<button class="primary" data-po-receive="${po.id}">Terima Barang</button>`);}
      if(po.status==='Ditolak'){actions.push(`<button class="outline" data-po-duplicate="${po.id}">Duplicate</button>`);}
      return `<tr><td><b>${esc(po.code)}</b>${po.rejectionReason?`<br><small style="color:var(--red)">Alasan: ${esc(po.rejectionReason)}</small>`:''}</td><td>${esc(po.supplier||'-')}</td><td>${poDate(po.date)}</td><td>${items.length} produk<br><small class="muted">${items.reduce((a,x)=>a+x.qty,0)} unit</small></td><td>${fmt(po.value||0)}</td><td>${status(po.status,poTone(po.status))}</td><td><div class="tabs">${actions.join('')}</div></td></tr>`;}).join('');
  }

  function updatePO(id, statusValue){ const po=DB.purchaseOrders.find(x=>x.id===id); if(!po)return; po.status=statusValue; po.updatedAt=Date.now(); saveDB(); render(); }
  function rejectPO(id){
    const po=DB.purchaseOrders.find(x=>x.id===id); if(!po)return;
    modal('Reject Purchase Order', `<div class="form"><p><b>${esc(po.code)}</b> — ${esc(po.supplier||'-')}</p><label>Alasan Penolakan<textarea id="rejectReason" placeholder="Contoh: Anggaran belum tersedia / harga perlu dinegosiasikan"></textarea></label></div>`, ()=>{
      const reason=document.querySelector('#rejectReason').value.trim();
      if(!reason)return toast('Alasan reject wajib diisi','err'),false;
      po.status='Ditolak';po.rejectionReason=reason;po.rejectedAt=Date.now();saveDB();render();toast('PO ditolak');
    },{saveLabel:'Reject PO'});
  }
  function duplicatePO(id){
    const po=DB.purchaseOrders.find(x=>x.id===id);if(!po)return;
    const copy={id:uid('po'),code:'PO-'+String(Date.now()).slice(-8),supplierId:po.supplierId,supplier:po.supplier,note:(po.note?po.note+' | ':'')+'Duplikat dari '+po.code,items:(po.items||[]).map(x=>({...x})),value:po.value||0,status:'Draft',date:Date.now(),sourcePO:po.code};
    DB.purchaseOrders.push(copy);saveDB();render();toast('PO baru berhasil dibuat dari '+po.code);
  }
  function receivePO(id){
    if(cloudMode()) return toast('Mode cloud wajib menerima PO lewat RPC receive_purchase_order.', 'err');
    const po=DB.purchaseOrders.find(x=>x.id===id);if(!po)return;
    (po.items||[]).forEach(it=>{const p=DB.products.find(x=>x.id===it.productId);if(!p)return;const qty=Number(it.qty)||0;p.stock=(Number(p.stock)||0)+qty;p.batches=p.batches||[];p.batches.push({batchNo:'PO-'+po.code,received:new Date().toISOString().slice(0,10),expired:it.expired||p.expired,qty,location:'Gudang Pusat'});});
    po.status='Selesai';po.receivedAt=Date.now();saveDB();render();toast('Barang diterima dan stok diperbarui');
  }
  function printPO(id){
    const po=DB.purchaseOrders.find(x=>x.id===id);if(!po)return;
    const items=poItems(po);const w=window.open('','_blank','width=900,height=700');if(!w)return toast('Izinkan pop-up untuk mencetak PO','err');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(po.code)}</title><style>body{font-family:Arial,sans-serif;padding:34px;color:#18231f}h1{margin:0;color:#078651}table{border-collapse:collapse;width:100%;margin-top:24px}th,td{border:1px solid #ccd8d2;padding:10px;text-align:left}th{background:#effaf4}.right{text-align:right}.muted{color:#64748b}.box{display:flex;justify-content:space-between;gap:18px;border-bottom:2px solid #078651;padding-bottom:18px}.total{margin-top:18px;width:320px;margin-left:auto}.total p{display:flex;justify-content:space-between}@media print{button{display:none}}</style></head><body><div class="box"><div><h1>ApotekKilat</h1><p class="muted">Dokumen Purchase Order</p></div><div><b>${esc(po.code)}</b><br><span class="muted">${poDate(po.date)}</span></div></div><h3>Vendor / Supplier</h3><p><b>${esc(po.supplier||'-')}</b></p><p>Status: ${esc(po.status)}</p>${po.rejectionReason?`<p>Alasan reject: ${esc(po.rejectionReason)}</p>`:''}<table><thead><tr><th>Produk</th><th>Jumlah</th><th>Harga Modal</th><th>Subtotal</th></tr></thead><tbody>${items.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.qty}</td><td>${fmt(x.cost)}</td><td>${fmt(x.total)}</td></tr>`).join('')}</tbody></table><div class="total"><p><b>Total PO</b><b>${fmt(po.value||0)}</b></p></div><p><b>Catatan:</b> ${esc(po.note||'-')}</p><br><br><p>Disiapkan oleh: ____________________</p><p>Disetujui oleh: ____________________</p><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();
  }

  const baseRender=render;
  render=function(){baseRender();if(S.page==='pembelian')bindPurchaseWorkflow();};
  function bindPurchaseWorkflow(){
    const search=document.querySelector('#poSearch');if(search)search.oninput=()=>{const q=search.value.toLowerCase();const rows=DB.purchaseOrders.filter(po=>(po.code+po.supplier+po.status+(po.rejectionReason||'')).toLowerCase().includes(q));document.querySelector('#poBody').innerHTML=purchaseRows(rows);bindPurchaseWorkflow();};
    document.querySelectorAll('[data-po-print]').forEach(b=>b.onclick=()=>printPO(b.dataset.poPrint));
    document.querySelectorAll('[data-po-submit]').forEach(b=>b.onclick=()=>{updatePO(b.dataset.poSubmit,'Menunggu Approval');toast('PO diajukan untuk approval');});
    document.querySelectorAll('[data-po-approve]').forEach(b=>b.onclick=()=>{updatePO(b.dataset.poApprove,'Disetujui');toast('PO disetujui');});
    document.querySelectorAll('[data-po-reject]').forEach(b=>b.onclick=()=>rejectPO(b.dataset.poReject));
    document.querySelectorAll('[data-po-ship]').forEach(b=>b.onclick=()=>{updatePO(b.dataset.poShip,'Dalam Pengiriman');toast('PO masuk proses pengiriman');});
    document.querySelectorAll('[data-po-receive]').forEach(b=>b.onclick=()=>receivePO(b.dataset.poReceive));
    document.querySelectorAll('[data-po-duplicate]').forEach(b=>b.onclick=()=>duplicatePO(b.dataset.poDuplicate));
  }
})();