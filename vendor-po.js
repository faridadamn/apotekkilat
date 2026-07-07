/* Purchase Order multi-item: harga otomatis dari harga modal produk vendor */
(function(){
  function productsForVendor(vendorId){
    const vendor=(DB.suppliers||[]).find(s=>s.id===vendorId);
    if(!vendor) return [];
    return DB.products.filter(p=>p.supplierId===vendorId || p.supplier===vendor.name);
  }
  function money(n){ return fmt(Number(n)||0); }

  openPOForm = function(preselectedSupplierId){
    const state={supplierId:preselectedSupplierId||'',items:[]};
    const addFirstAvailable=()=>{
      const available=productsForVendor(state.supplierId);
      if(available.length && !state.items.length) state.items.push({productId:available[0].id,qty:1});
    };
    const recalc=()=>state.items.reduce((sum,it)=>{const p=DB.products.find(x=>x.id===it.productId);return sum+(p?(Number(p.cost)||0)*(Number(it.qty)||0):0);},0);
    const syncInputs=()=>{
      document.querySelectorAll('[data-po-item]').forEach(row=>{
        const i=Number(row.dataset.poItem);
        const sel=row.querySelector('.po-product');
        const qty=row.querySelector('.po-qty');
        if(state.items[i]){state.items[i].productId=sel.value;state.items[i].qty=Math.max(1,Number(qty.value)||1);}
      });
    };
    const draw=()=>{
      const vendor=(DB.suppliers||[]).find(s=>s.id===state.supplierId);
      const available=productsForVendor(state.supplierId);
      const selectedIds=state.items.map(x=>x.productId);
      const lineRows=state.items.map((it,i)=>{
        const product=DB.products.find(p=>p.id===it.productId) || available[0];
        const options=available.map(p=>`<option value="${p.id}" ${p.id===it.productId?'selected':''} ${selectedIds.includes(p.id)&&p.id!==it.productId?'disabled':''}>${esc(p.name)}</option>`).join('');
        const subtotal=(product?(Number(product.cost)||0)*(Number(it.qty)||0):0);
        return `<tr data-po-item="${i}"><td><select class="po-product">${options}</select></td><td class="muted">${product?esc(product.cat):'-'}</td><td><b>${product?money(product.cost):money(0)}</b><br><small class="muted">Otomatis dari produk</small></td><td><input class="po-qty" type="number" min="1" value="${it.qty}" style="width:90px"/></td><td><b>${money(subtotal)}</b></td><td><button class="danger-btn po-remove" data-remove-po-item="${i}" ${state.items.length===1?'disabled':''}>Hapus</button></td></tr>`;
      }).join('');
      modal('Buat Purchase Order', `<div class="form"><label>Vendor / Supplier<select id="poSupplierId"><option value="">Pilih vendor</option>${(DB.suppliers||[]).filter(s=>s.status==='Aktif').map(s=>`<option value="${s.id}" ${s.id===state.supplierId?'selected':''}>${esc(s.name)} — ${esc(s.paymentTerm||'-')}</option>`).join('')}</select></label>
        ${vendor?`<div class="card" style="padding:12px"><b>${esc(vendor.name)}</b><br><small class="muted">${esc(vendor.contact||'-')} · ${esc(vendor.phone||'-')} · Termin ${esc(vendor.paymentTerm||'-')}</small></div>`:''}
        <label>Catatan Purchase Order<input id="poNote" value="${esc(state.note||'')}" placeholder="Contoh: Restock stok menipis minggu ini"/></label>
      </div>
      <div style="height:12px"></div>
      <div class="title"><span>Item Pembelian</span><button class="outline" id="addPOItem" ${!available.length?'disabled':''}>＋ Tambah Item</button></div>
      ${!state.supplierId?'<div class="empty">Pilih vendor terlebih dahulu untuk menampilkan produk yang dijual.</div>':!available.length?'<div class="empty">Vendor ini belum memiliki produk. Hubungkan produk ke vendor pada Detail Obat terlebih dahulu.</div>':`<div style="overflow:auto"><table><thead><tr><th>Produk</th><th>Kategori</th><th>Harga Modal</th><th>Jumlah</th><th>Subtotal</th><th></th></tr></thead><tbody>${lineRows}</tbody><tfoot><tr><td colspan="4" style="text-align:right;padding:14px"><b>Total Purchase Order</b></td><td colspan="2" style="padding:14px"><b style="font-size:17px;color:var(--g)">${money(recalc())}</b></td></tr></tfoot></table></div>`}`, ()=>{
        syncInputs();
        state.note=(document.querySelector('#poNote')||{}).value||'';
        const supplier=(DB.suppliers||[]).find(s=>s.id===state.supplierId);
        if(!supplier) return toast('Pilih vendor terlebih dahulu','err'),false;
        if(!state.items.length) return toast('Tambahkan minimal satu item pembelian','err'),false;
        const products=productsForVendor(supplier.id);
        const items=state.items.map(it=>{const p=products.find(x=>x.id===it.productId);return p?{productId:p.id,qty:Math.max(1,Number(it.qty)||1),cost:Number(p.cost)||0,expired:p.expired}:null;}).filter(Boolean);
        if(items.length!==state.items.length) return toast('Ada produk yang tidak tersedia pada vendor ini','err'),false;
        const value=items.reduce((sum,it)=>sum+(it.qty*it.cost),0);
        DB.purchaseOrders.push({id:uid('po'),code:'PO-'+String(Date.now()).slice(-8),supplierId:supplier.id,supplier:supplier.name,note:state.note,items,value,status:'Draft',date:Date.now()});
        saveDB();render();toast('PO multi-item berhasil dibuat');
      },{saveLabel:'Simpan PO'});
      bindModal();
    };
    const bindModal=()=>{
      const vendorEl=document.querySelector('#poSupplierId');
      if(vendorEl) vendorEl.onchange=()=>{state.supplierId=vendorEl.value;state.items=[];addFirstAvailable();draw();};
      const note=document.querySelector('#poNote'); if(note) note.oninput=()=>state.note=note.value;
      const add=document.querySelector('#addPOItem');
      if(add) add.onclick=()=>{syncInputs();const available=productsForVendor(state.supplierId);const used=new Set(state.items.map(x=>x.productId));const next=available.find(p=>!used.has(p.id));if(!next) return toast('Semua produk vendor sudah ditambahkan','err');state.items.push({productId:next.id,qty:1});draw();};
      document.querySelectorAll('.po-product').forEach((el,i)=>el.onchange=()=>{state.items[i].productId=el.value;draw();});
      document.querySelectorAll('.po-qty').forEach((el,i)=>el.oninput=()=>{state.items[i].qty=Math.max(1,Number(el.value)||1);draw();});
      document.querySelectorAll('[data-remove-po-item]').forEach(el=>el.onclick=()=>{syncInputs();state.items.splice(Number(el.dataset.removePoItem),1);draw();});
    };
    addFirstAvailable();
    draw();
  };
})();
