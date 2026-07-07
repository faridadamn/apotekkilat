/* Modul Master Vendor / Supplier untuk ApotekKilat */
(function(){
  const supplierSeed = [
    {id:'s1',name:'Hexpharm Jaya',contact:'Dewi Lestari',phone:'021-555-1001',email:'sales@hexpharm.local',address:'Jakarta Barat',paymentTerm:'30 hari',status:'Aktif'},
    {id:'s2',name:'Kimia Farma Trading',contact:'Rizky Pratama',phone:'021-555-1002',email:'order@kft.local',address:'Jakarta Pusat',paymentTerm:'14 hari',status:'Aktif'},
    {id:'s3',name:'Dexa Medica',contact:'Nadia Amalia',phone:'021-555-1003',email:'supply@dexa.local',address:'Bekasi',paymentTerm:'30 hari',status:'Aktif'},
    {id:'s4',name:'Kalbe Farma',contact:'Hendra Wijaya',phone:'021-555-1004',email:'distributor@kalbe.local',address:'Jakarta Timur',paymentTerm:'45 hari',status:'Aktif'},
    {id:'s5',name:'Bernofarm',contact:'Bima Saputra',phone:'031-555-1005',email:'sales@bernofarm.local',address:'Surabaya',paymentTerm:'30 hari',status:'Aktif'}
  ];

  function ensureSuppliers(){
    if(!Array.isArray(DB.suppliers) || !DB.suppliers.length) DB.suppliers = supplierSeed.map(x=>({...x}));
    DB.products.forEach(p=>{
      let s = DB.suppliers.find(x=>x.id===p.supplierId) || DB.suppliers.find(x=>x.name===p.supplier);
      if(!s && p.supplier){
        s={id:uid('s'),name:p.supplier,contact:'',phone:'',email:'',address:'',paymentTerm:'30 hari',status:'Aktif'};
        DB.suppliers.push(s);
      }
      if(s){ p.supplierId=s.id; p.supplier=s.name; }
    });
    (DB.purchaseOrders||[]).forEach(po=>{
      let s = DB.suppliers.find(x=>x.id===po.supplierId) || DB.suppliers.find(x=>x.name===po.supplier);
      if(s){ po.supplierId=s.id; po.supplier=s.name; }
    });
    saveDB();
  }
  function supplierName(id){ const s=DB.suppliers.find(x=>x.id===id); return s?s.name:''; }
  function activeSuppliers(){ return DB.suppliers.filter(s=>s.status==='Aktif'); }

  const originalRender = render;
  const originalAction = action;
  const originalOpenProductForm = openProductForm;
  const originalOpenPOForm = openPOForm;

  function vendorPage(){
    const q = (S.vendorQuery||'').toLowerCase();
    const list = DB.suppliers.filter(s=>!q || (s.name+s.contact+s.phone+s.address).toLowerCase().includes(q));
    const totalPO = (id)=>DB.purchaseOrders.filter(p=>p.supplierId===id || p.supplier===supplierName(id)).length;
    const totalValue = (id)=>DB.purchaseOrders.filter(p=>p.supplierId===id || p.supplier===supplierName(id)).reduce((a,p)=>a+(p.value||0),0);
    return `<section class="page active"><div class="head"><div><h2>Vendor / Supplier</h2><p>Kelola data pemasok untuk obat dan purchase order.</p></div><button class="primary" data-action="add-supplier">＋ Tambah Vendor</button></div>
      <div class="grid4"><div class="card kpi"><div class="kicon">🏢</div><div><label>Total Vendor</label><strong>${DB.suppliers.length}</strong><span class="muted">Terdaftar</span></div></div><div class="card kpi"><div class="kicon">✓</div><div><label>Vendor Aktif</label><strong>${activeSuppliers().length}</strong><span class="up">Siap digunakan</span></div></div><div class="card kpi"><div class="kicon">🛒</div><div><label>Total PO</label><strong>${DB.purchaseOrders.length}</strong><span class="muted">Semua vendor</span></div></div><div class="card kpi"><div class="kicon">◈</div><div><label>Nilai Pembelian</label><strong>${fmt(DB.purchaseOrders.reduce((a,p)=>a+(p.value||0),0))}</strong><span class="muted">Akumulasi PO</span></div></div></div>
      <div style="height:16px"></div><div class="card"><div class="tools"><input class="flex" id="supplierSearch" placeholder="Cari nama vendor, kontak, telepon, atau alamat..."/></div>
      <table><thead><tr><th>Vendor</th><th>Kontak</th><th>Telepon</th><th>Termin</th><th>PO</th><th>Nilai Pembelian</th><th>Status</th><th></th></tr></thead><tbody id="supplierBody">${supplierRows(list,totalPO,totalValue)}</tbody></table></div></section>`;
  }
  function supplierRows(list,totalPO,totalValue){
    if(!list.length) return '<tr><td colspan="8" class="empty">Vendor tidak ditemukan.</td></tr>';
    return list.map(s=>`<tr><td><b>${esc(s.name)}</b><br><small class="muted">${esc(s.address||'-')}</small></td><td>${esc(s.contact||'-')}</td><td>${esc(s.phone||'-')}</td><td>${esc(s.paymentTerm||'-')}</td><td>${totalPO(s.id)}</td><td>${fmt(totalValue(s.id))}</td><td>${status(s.status,s.status==='Aktif'?'ok':'warn')}</td><td><button class="outline" data-edit-supplier="${s.id}">Edit</button> <button class="danger-btn" data-delete-supplier="${s.id}">Hapus</button></td></tr>`).join('');
  }

  function openSupplierForm(existing){
    const s=existing||{};
    modal(existing?'Edit Vendor':'Tambah Vendor', `<div class="form"><label>Nama Vendor<input id="supName" value="${esc(s.name||'')}" placeholder="Contoh: PT Farmasi Sejahtera"/></label><label>Nama PIC / Kontak<input id="supContact" value="${esc(s.contact||'')}" placeholder="Nama sales atau PIC"/></label><label>Telepon<input id="supPhone" value="${esc(s.phone||'')}" placeholder="021... / 08..."/></label><label>Email<input id="supEmail" value="${esc(s.email||'')}" placeholder="email@vendor.com"/></label><label>Alamat<textarea id="supAddress">${esc(s.address||'')}</textarea></label><label>Termin Pembayaran<select id="supTerm">${['COD','7 hari','14 hari','30 hari','45 hari','60 hari'].map(x=>`<option ${s.paymentTerm===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Status<select id="supStatus"><option ${s.status!=='Nonaktif'?'selected':''}>Aktif</option><option ${s.status==='Nonaktif'?'selected':''}>Nonaktif</option></select></label></div>`, ()=>{
      const name=document.querySelector('#supName').value.trim();
      if(!name) return toast('Nama vendor wajib diisi','err'),false;
      const payload={name,contact:document.querySelector('#supContact').value.trim(),phone:document.querySelector('#supPhone').value.trim(),email:document.querySelector('#supEmail').value.trim(),address:document.querySelector('#supAddress').value.trim(),paymentTerm:document.querySelector('#supTerm').value,status:document.querySelector('#supStatus').value};
      if(existing){
        const old=existing.name; Object.assign(existing,payload);
        DB.products.forEach(p=>{if(p.supplierId===existing.id || p.supplier===old){p.supplierId=existing.id;p.supplier=existing.name;}});
        DB.purchaseOrders.forEach(p=>{if(p.supplierId===existing.id || p.supplier===old){p.supplierId=existing.id;p.supplier=existing.name;}});
      } else DB.suppliers.push({id:uid('s'),...payload});
      saveDB(); render(); toast(existing?'Vendor diperbarui':'Vendor berhasil ditambahkan');
    });
  }
  function removeSupplier(id){
    const s=DB.suppliers.find(x=>x.id===id); if(!s) return;
    const linked=DB.products.filter(p=>p.supplierId===id).length + DB.purchaseOrders.filter(p=>p.supplierId===id).length;
    if(linked) return toast('Vendor masih dipakai oleh obat atau PO. Ubah relasinya terlebih dahulu.','err');
    confirmAction('Hapus vendor '+s.name+'?',()=>{DB.suppliers=DB.suppliers.filter(x=>x.id!==id);saveDB();render();toast('Vendor dihapus');});
  }

  render = function(){
    if(S.page==='vendor'){
      nav();
      document.querySelector('#pages').innerHTML=vendorPage();
      bindVendor();
      return;
    }
    originalRender();
  };

  action = function(a,el){
    if(a==='add-supplier') return openSupplierForm();
    return originalAction(a,el);
  };

  openProductForm = function(existing){
    const p=existing||{};
    modal(existing?'Edit Obat':'Tambah Obat', `<div class="form"><label>Nama Obat<input id="fName" value="${esc(p.name||'')}" placeholder="Contoh: Cetirizine 10mg"/></label><label>Kategori<select id="fCat">${['Antihistamin','Analgesik','Antibiotik','Suplemen','Herbal'].map(c=>`<option ${p.cat===c?'selected':''}>${c}</option>`).join('')}</select></label><label>Jenis<input id="fType" value="${esc(p.type||'Tablet')}"/></label><label>Harga Jual<input id="fPrice" type="number" value="${p.price||''}"/></label><label>Harga Modal<input id="fCost" type="number" value="${p.cost||''}"/></label><label>Stok Awal<input id="fStock" type="number" value="${p.stock!=null?p.stock:''}" ${existing?'disabled':''}/></label><label>Titik Reorder<input id="fReorder" type="number" value="${p.reorder||20}"/></label><label>Tanggal Expired<input id="fExpired" type="date" value="${p.expired||''}"/></label><label>Vendor / Supplier<select id="fSupplierId"><option value="">Pilih vendor</option>${activeSuppliers().map(s=>`<option value="${s.id}" ${(p.supplierId===s.id || p.supplier===s.name)?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label></div>`, ()=>{
      const name=document.querySelector('#fName').value.trim(); const price=Number(document.querySelector('#fPrice').value); const supplierId=document.querySelector('#fSupplierId').value; const sup=DB.suppliers.find(s=>s.id===supplierId);
      if(!name) return toast('Nama obat wajib diisi','err'),false;
      if(!price||price<=0) return toast('Harga jual harus lebih dari 0','err'),false;
      if(!sup) return toast('Pilih vendor terlebih dahulu','err'),false;
      const expired=document.querySelector('#fExpired').value || new Date(Date.now()+365*86400000).toISOString().slice(0,10);
      const payload={name,cat:document.querySelector('#fCat').value,type:document.querySelector('#fType').value||'Tablet',price,cost:Number(document.querySelector('#fCost').value)||0,reorder:Number(document.querySelector('#fReorder').value)||20,expired,supplierId:sup.id,supplier:sup.name};
      if(existing) Object.assign(existing,payload);
      else {const stock=Number(document.querySelector('#fStock').value)||0;const batchNo='NEW-'+String(Date.now()).slice(-5);DB.products.push({id:uid('p'),...payload,stock,batch:batchNo,batches:[{batchNo,received:new Date().toISOString().slice(0,10),expired,qty:stock,location:'Gudang Pusat'}]});}
      saveDB();render();toast(existing?'Obat berhasil diperbarui':'Obat baru berhasil ditambahkan');
    });
  };

  openPOForm = function(){
    modal('Buat Purchase Order', `<div class="form"><label>Vendor / Supplier<select id="poSupplierId"><option value="">Pilih vendor</option>${activeSuppliers().map(s=>`<option value="${s.id}">${esc(s.name)} — ${esc(s.paymentTerm||'')}</option>`).join('')}</select></label><label>Obat<select id="poProduct">${DB.products.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label><label>Jumlah<input id="poQty" type="number" placeholder="100"/></label><label>Harga Modal per Unit<input id="poCost" type="number" placeholder="3000"/></label><label>Catatan<input id="poNote" placeholder="Kebutuhan restock minggu ini"/></label></div>`, ()=>{
      const supplierId=document.querySelector('#poSupplierId').value; const supplier=DB.suppliers.find(s=>s.id===supplierId); const qty=Number(document.querySelector('#poQty').value); const cost=Number(document.querySelector('#poCost').value)||0;
      if(!supplier) return toast('Pilih vendor terlebih dahulu','err'),false;
      if(!qty||qty<=0) return toast('Jumlah harus lebih dari 0','err'),false;
      const productId=document.querySelector('#poProduct').value; const p=DB.products.find(x=>x.id===productId);
      DB.purchaseOrders.push({id:uid('po'),code:'PO-'+String(Date.now()).slice(-8),supplierId,supplier:supplier.name,note:document.querySelector('#poNote').value,items:[{productId,qty,cost,expired:p.expired}],value:qty*cost,status:'Draft',date:Date.now()});
      saveDB();render();toast('PO draft berhasil dibuat');
    });
  };

  function bindVendor(){
    document.querySelectorAll('[data-page]').forEach(x=>x.onclick=()=>{S.page=x.dataset.page;render();});
    document.querySelectorAll('[data-action]').forEach(x=>x.onclick=()=>action(x.dataset.action,x));
    document.querySelectorAll('[data-edit-supplier]').forEach(x=>x.onclick=()=>openSupplierForm(DB.suppliers.find(s=>s.id===x.dataset.editSupplier)));
    document.querySelectorAll('[data-delete-supplier]').forEach(x=>x.onclick=()=>removeSupplier(x.dataset.deleteSupplier));
    const search=document.querySelector('#supplierSearch');
    if(search) search.oninput=()=>{S.vendorQuery=search.value;render();setTimeout(()=>{const next=document.querySelector('#supplierSearch');if(next){next.focus();next.value=S.vendorQuery;}},0);};
  }

  ensureSuppliers();
  const pos=NAV.findIndex(n=>n[0]==='pembelian');
  if(!NAV.some(n=>n[0]==='vendor')) NAV.splice(pos<0?NAV.length:pos,0,['vendor','🏢','Vendor']);
})();
