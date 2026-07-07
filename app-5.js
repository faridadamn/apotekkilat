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
