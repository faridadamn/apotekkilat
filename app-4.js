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
