/* Halaman Detail Purchase Order */
(function(){
  function tone(status){ return status==='Selesai'?'ok':status==='Dalam Pengiriman'?'ok':status==='Disetujui'?'ok':status==='Ditolak'?'expired':status==='Draft'?'violet':'warn'; }
  function dateFmt(v){ return v?new Date(v).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}):'-'; }
  function timeFmt(v){ return v?new Date(v).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'-'; }
  function supplierInfo(po){ return (DB.suppliers||[]).find(s=>s.id===po.supplierId||s.name===po.supplier); }
  function cloudMode(){ return !!(window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getMode && window.ApotekKilatSupabaseData.getMode()==='cloud'); }
  function detailPage(){
    const po=DB.purchaseOrders.find(x=>x.id===S.selectedPOId);
    if(!po){S.selectedPOId=null;return null;}
    const vendor=supplierInfo(po); const items=(po.items||[]).map(it=>{const p=DB.products.find(x=>x.id===it.productId);return {p,it};});
    const qty=items.reduce((a,x)=>a+(Number(x.it.qty)||0),0);
    const timeline=[
      {label:'PO Dibuat',value:po.date,show:true},
      {label:'Diajukan untuk Approval',value:po.submittedAt,show:po.status!=='Draft'},
      {label:'Disetujui',value:po.approvedAt,show:['Disetujui','Dalam Pengiriman','Selesai'].includes(po.status)},
      {label:'Dalam Pengiriman',value:po.shippedAt,show:['Dalam Pengiriman','Selesai'].includes(po.status)},
      {label:'Barang Diterima',value:po.receivedAt,show:po.status==='Selesai'},
      {label:'Ditolak',value:po.rejectedAt,show:po.status==='Ditolak'}
    ].filter(x=>x.show);
    const actions=[];
    actions.push(`<button class="outline" data-detail-print="${po.id}">Cetak PO</button>`);
    if(po.status==='Draft') actions.push(`<button class="primary" data-detail-submit="${po.id}">Ajukan Approval</button>`);
    if(po.status==='Menunggu Approval') actions.push(`<button class="primary" data-detail-approve="${po.id}">Approve</button><button class="danger-btn" data-detail-reject="${po.id}">Reject</button>`);
    if(po.status==='Disetujui') actions.push(`<button class="outline" data-detail-ship="${po.id}">Proses Kirim</button>`);
    if(po.status==='Dalam Pengiriman') actions.push(`<button class="primary" data-detail-receive="${po.id}">Terima Barang</button>`);
    if(po.status==='Ditolak') actions.push(`<button class="outline" data-detail-duplicate="${po.id}">Duplicate PO</button>`);
    return `<section class="page active"><div class="head"><div><button class="outline" data-po-back>← Kembali ke Pembelian</button><h2 style="margin-top:14px">Detail Purchase Order</h2><p>${esc(po.code)} · dibuat ${dateFmt(po.date)}</p></div><div class="tabs">${actions.join('')}</div></div>
      <div class="card" style="padding:23px"><div style="display:flex;justify-content:space-between;gap:20px;align-items:flex-start;flex-wrap:wrap"><div style="display:flex;gap:15px;align-items:center"><div style="width:58px;height:58px;border-radius:16px;background:#e5f8ee;color:#078651;display:grid;place-items:center;font-size:27px">▤</div><div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h2 style="margin:0">${esc(po.code)}</h2>${status(po.status,tone(po.status))}</div><p class="muted" style="margin:7px 0 0">${esc(po.supplier||'-')}</p></div></div><div><small class="muted">Nilai Purchase Order</small><h2 style="margin:4px 0 0;color:var(--g)">${fmt(po.value||0)}</h2></div></div>
      <div style="height:18px"></div><div class="grid4"><div><label class="muted">Vendor / Supplier</label><b style="display:block;margin-top:4px">${esc(po.supplier||'-')}</b></div><div><label class="muted">PIC Vendor</label><b style="display:block;margin-top:4px">${esc(vendor?.contact||'-')}</b></div><div><label class="muted">Termin Pembayaran</label><b style="display:block;margin-top:4px">${esc(vendor?.paymentTerm||'-')}</b></div><div><label class="muted">Jumlah Item</label><b style="display:block;margin-top:4px">${items.length} produk · ${qty} unit</b></div></div></div>
      <div style="height:16px"></div><div class="two"><div class="card"><div class="title"><span>Rincian Produk</span><span class="muted">${items.length} item</span></div><table><thead><tr><th>Produk</th><th>Jenis</th><th>Harga Modal</th><th>Qty</th><th>Subtotal</th></tr></thead><tbody>${items.length?items.map(({p,it})=>`<tr><td><b>${esc(p?.name||'Produk tidak ditemukan')}</b><br><small class="muted">${esc(p?.cat||'-')}</small></td><td>${esc(p?.type||'-')}</td><td>${fmt(it.cost||0)}</td><td>${it.qty||0}</td><td><b>${fmt((Number(it.qty)||0)*(Number(it.cost)||0))}</b></td></tr>`).join(''):'<tr><td colspan="5" class="empty">Tidak ada item pada PO ini.</td></tr>'}</tbody><tfoot><tr><td colspan="4" style="text-align:right;padding:14px"><b>Total PO</b></td><td style="padding:14px"><b style="font-size:17px;color:var(--g)">${fmt(po.value||0)}</b></td></tr></tfoot></table></div>
      <div class="card"><div class="title"><span>Informasi & Catatan</span></div><p><b>Catatan PO</b><br><span class="muted">${esc(po.note||'-')}</span></p>${po.sourcePO?`<p><b>Sumber Duplicate</b><br><span class="muted">${esc(po.sourcePO)}</span></p>`:''}${po.rejectionReason?`<div class="notice" style="margin-top:14px"><i>!</i><div><b>Alasan Penolakan</b><small>${esc(po.rejectionReason)}</small></div></div>`:''}<hr style="border:0;border-top:1px solid var(--line);margin:16px 0"><p><b>Kontak Vendor</b><br><span class="muted">${esc(vendor?.phone||'-')}<br>${esc(vendor?.email||'-')}</span></p></div></div>
      <div style="height:16px"></div><div class="card"><div class="title"><span>Riwayat Status</span></div><div class="timeline">${timeline.map(x=>`<div class="notice"><i>✓</i><div><b>${x.label}</b><small>${timeFmt(x.value)}</small></div></div>`).join('')}</div></div>
    </section>`;
  }

  function applyStatus(id,next){const po=DB.purchaseOrders.find(x=>x.id===id);if(!po)return;po.status=next;const now=Date.now();if(next==='Menunggu Approval')po.submittedAt=now;if(next==='Disetujui')po.approvedAt=now;if(next==='Dalam Pengiriman')po.shippedAt=now;po.updatedAt=now;saveDB();render();}
  function reject(id){const po=DB.purchaseOrders.find(x=>x.id===id);if(!po)return;modal('Reject Purchase Order',`<div class="form"><p><b>${esc(po.code)}</b> — ${esc(po.supplier||'-')}</p><label>Alasan Penolakan<textarea id="detailRejectReason" placeholder="Masukkan alasan reject"></textarea></label></div>`,()=>{const r=document.querySelector('#detailRejectReason').value.trim();if(!r)return toast('Alasan reject wajib diisi','err'),false;po.status='Ditolak';po.rejectionReason=r;po.rejectedAt=Date.now();saveDB();render();toast('PO ditolak');});}
  function duplicate(id){const po=DB.purchaseOrders.find(x=>x.id===id);if(!po)return;DB.purchaseOrders.push({id:uid('po'),code:'PO-'+String(Date.now()).slice(-8),supplierId:po.supplierId,supplier:po.supplier,note:(po.note?po.note+' | ':'')+'Duplikat dari '+po.code,items:(po.items||[]).map(x=>({...x})),value:po.value||0,status:'Draft',date:Date.now(),sourcePO:po.code});saveDB();S.selectedPOId=null;render();toast('PO baru hasil duplicate berhasil dibuat');}
  function receive(id){if(cloudMode())return toast('Mode cloud wajib menerima PO lewat RPC receive_purchase_order.','err');const po=DB.purchaseOrders.find(x=>x.id===id);if(!po)return;(po.items||[]).forEach(it=>{const p=DB.products.find(x=>x.id===it.productId);if(!p)return;const qty=Number(it.qty)||0;p.stock=(Number(p.stock)||0)+qty;p.batches=p.batches||[];p.batches.push({batchNo:'PO-'+po.code,received:new Date().toISOString().slice(0,10),expired:it.expired||p.expired,qty,location:'Gudang Pusat'});});po.status='Selesai';po.receivedAt=Date.now();saveDB();render();toast('Barang diterima dan stok diperbarui');}
  function print(id){const source=document.querySelector(`[data-po-print="${id}"]`);if(source){source.click();return;}toast('Cetak dari daftar PO bila pop-up diblokir','err');}

  const basePurchase=purchase;
  purchase=function(){return S.selectedPOId?detailPage()||basePurchase():basePurchase();};
  const baseRender=render;
  render=function(){baseRender();if(S.page==='pembelian')enhance();};
  function enhance(){
    const table=document.querySelector('#poBody');if(table){table.querySelectorAll('tr').forEach(row=>{const code=row.querySelector('td b');if(code&&!row.dataset.poOpen){const po=DB.purchaseOrders.find(x=>x.code===code.textContent.trim());if(po){row.dataset.poOpen=po.id;row.classList.add('clickable');}}});}
    document.querySelectorAll('[data-po-back]').forEach(b=>b.onclick=()=>{S.selectedPOId=null;render();});
    document.querySelectorAll('[data-detail-submit]').forEach(b=>b.onclick=()=>{applyStatus(b.dataset.detailSubmit,'Menunggu Approval');toast('PO diajukan untuk approval');});
    document.querySelectorAll('[data-detail-approve]').forEach(b=>b.onclick=()=>{applyStatus(b.dataset.detailApprove,'Disetujui');toast('PO disetujui');});
    document.querySelectorAll('[data-detail-reject]').forEach(b=>b.onclick=()=>reject(b.dataset.detailReject));
    document.querySelectorAll('[data-detail-ship]').forEach(b=>b.onclick=()=>{applyStatus(b.dataset.detailShip,'Dalam Pengiriman');toast('PO masuk proses pengiriman');});
    document.querySelectorAll('[data-detail-receive]').forEach(b=>b.onclick=()=>receive(b.dataset.detailReceive));
    document.querySelectorAll('[data-detail-duplicate]').forEach(b=>b.onclick=()=>duplicate(b.dataset.detailDuplicate));
    document.querySelectorAll('[data-detail-print]').forEach(b=>b.onclick=()=>print(b.dataset.detailPrint));
  }
  document.addEventListener('click',e=>{const row=e.target.closest('[data-po-open]');if(!row||e.target.closest('button'))return;S.selectedPOId=row.dataset.poOpen;render();},true);
})();