/* Ledger Entries untuk Detail Obat */
(function(){
  function dateText(v){return v?new Date(v).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'-';}
  function dayValue(v){return v?new Date(v).toISOString().slice(0,10):'';}
  function escVal(v){return esc(String(v==null?'':v));}
  function ledgerFor(product){
    const entries=[];
    (product.batches||[]).forEach((b,i)=>{
      entries.push({id:'batch-'+i+'-'+b.batchNo,date:b.received?new Date(b.received).getTime():0,type:'Saldo Awal / Batch',direction:'in',qty:Number(b.qty)||0,ref:b.batchNo||'-',note:`Batch masuk · ${b.location||'Gudang Pusat'}`,source:'batch'});
    });
    (DB.purchaseOrders||[]).filter(po=>po.status==='Selesai').forEach(po=>{
      (po.items||[]).filter(it=>it.productId===product.id).forEach((it,i)=>entries.push({id:'po-'+po.id+'-'+i,date:po.receivedAt||po.date||0,type:'Pembelian',direction:'in',qty:Number(it.qty)||0,ref:po.code||'PO',note:`Penerimaan dari ${po.supplier||'-'}`,source:'po'}));
    });
    (DB.transactions||[]).forEach(tx=>{
      (tx.items||[]).filter(it=>it.productId===product.id).forEach((it,i)=>entries.push({id:'tx-'+tx.id+'-'+i,date:tx.time||0,type:'Penjualan',direction:'out',qty:Number(it.qty)||0,ref:tx.code||'TRX',note:`Penjualan${tx.payment?' · '+tx.payment:''}`,source:'sale'}));
    });
    return entries.sort((a,b)=>(a.date||0)-(b.date||0));
  }
  function filtered(entries){
    const f=S.medicineLedgerFilter||{};
    return entries.filter(e=>{
      const ds=dayValue(e.date);
      if(f.type&&f.type!=='Semua'&&e.type!==f.type)return false;
      if(f.start&&ds&&ds<f.start)return false;
      if(f.end&&ds&&ds>f.end)return false;
      if(f.search&&!(e.ref+' '+e.note+' '+e.type).toLowerCase().includes(f.search.toLowerCase()))return false;
      return true;
    });
  }
  function renderLedger(){
    const p=DB.products.find(x=>x.id===S.selectedProductId);if(!p)return;
    const all=ledgerFor(p);const list=filtered(all);let running=0;
    const rows=list.map(e=>{running+=e.direction==='in'?e.qty:-e.qty;return `<tr><td>${dateText(e.date)}</td><td>${status(e.type,e.direction==='in'?'ok':'warn')}</td><td><b>${escVal(e.ref)}</b><br><small class="muted">${escVal(e.note)}</small></td><td style="color:var(--g);font-weight:800">${e.direction==='in'?'+':''}${e.direction==='in'?e.qty:0}</td><td style="color:var(--red);font-weight:800">${e.direction==='out'?'-'+e.qty:0}</td><td><b>${running}</b></td></tr>`;}).join('');
    const el=document.querySelector('#medicineLedger');if(!el)return;
    el.innerHTML=`<div class="card"><div class="title"><span>Ledger Entries</span><span class="muted">${list.length} dari ${all.length} mutasi</span></div><p class="muted" style="margin-top:0">Riwayat pergerakan stok obat dari batch awal, penerimaan PO, dan transaksi penjualan.</p><div class="tools"><input id="ledgerSearch" class="flex" placeholder="Cari nomor PO, transaksi, atau keterangan..." value="${escVal((S.medicineLedgerFilter||{}).search||'')}"><select id="ledgerType"><option>Semua</option>${['Saldo Awal / Batch','Pembelian','Penjualan'].map(x=>`<option ${((S.medicineLedgerFilter||{}).type||'Semua')===x?'selected':''}>${x}</option>`).join('')}</select><input id="ledgerStart" type="date" value="${escVal((S.medicineLedgerFilter||{}).start||'')}"><input id="ledgerEnd" type="date" value="${escVal((S.medicineLedgerFilter||{}).end||'')}"><button class="outline" id="ledgerReset">Reset</button></div><div style="overflow:auto"><table><thead><tr><th>Tanggal</th><th>Tipe</th><th>Referensi / Keterangan</th><th>Masuk</th><th>Keluar</th><th>Saldo Berjalan</th></tr></thead><tbody>${rows||'<tr><td colspan="6" class="empty">Tidak ada ledger sesuai filter.</td></tr>'}</tbody></table></div></div>`;
    bindLedger();
  }
  function bindLedger(){
    const ensure=()=>S.medicineLedgerFilter||(S.medicineLedgerFilter={type:'Semua',start:'',end:'',search:''});
    const search=document.querySelector('#ledgerSearch');if(search)search.oninput=()=>{ensure().search=search.value;renderLedger();};
    const type=document.querySelector('#ledgerType');if(type)type.onchange=()=>{ensure().type=type.value;renderLedger();};
    const start=document.querySelector('#ledgerStart');if(start)start.onchange=()=>{ensure().start=start.value;renderLedger();};
    const end=document.querySelector('#ledgerEnd');if(end)end.onchange=()=>{ensure().end=end.value;renderLedger();};
    const reset=document.querySelector('#ledgerReset');if(reset)reset.onclick=()=>{S.medicineLedgerFilter={type:'Semua',start:'',end:'',search:''};renderLedger();};
  }
  function enhance(){
    if(S.page!=='obat')return;
    const page=document.querySelector('#pages .page');if(!page)return;
    let holder=document.querySelector('#medicineLedger');
    if(!holder){holder=document.createElement('div');holder.id='medicineLedger';holder.style.marginTop='16px';page.appendChild(holder);}
    renderLedger();
  }
  const baseRender=render;
  render=function(){baseRender();enhance();};
})();
