/* CRUD dan CSV Produk Vendor pada halaman Detail Vendor */
(function(){
  function currentVendor(){ return (DB.suppliers||[]).find(s=>s.id===S.selectedSupplierId); }
  function productsOfVendor(vendorId){ const v=(DB.suppliers||[]).find(s=>s.id===vendorId); return v?DB.products.filter(p=>p.supplierId===vendorId||p.supplier===v.name):[]; }
  function csvEscape(v){ const x=String(v==null?'':v); return /[",\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x; }
  function parseCSV(text){
    const rows=[]; let row=[],cell='',q=false;
    for(let i=0;i<text.length;i++){
      const c=text[i],n=text[i+1];
      if(c==='"'&&q&&n==='"'){cell+='"';i++;continue;}
      if(c==='"'){q=!q;continue;}
      if(c===','&&!q){row.push(cell);cell='';continue;}
      if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&n==='\n')i++;row.push(cell);if(row.some(x=>x.trim()!==''))rows.push(row);row=[];cell='';continue;}
      cell+=c;
    }
    row.push(cell); if(row.some(x=>x.trim()!==''))rows.push(row);
    return rows;
  }
  function number(v, fallback=0){ const n=Number(String(v==null?'':v).replace(/[^0-9.-]/g,'')); return Number.isFinite(n)?n:fallback; }
  function isoDate(v){
    const x=String(v||'').trim();
    if(/^\d{4}-\d{2}-\d{2}$/.test(x)) return x;
    const d=new Date(x); return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10);
  }
  function createBatchNo(){ return 'IMP-'+String(Date.now()).slice(-7); }

  function productForm(existing){
    const vendor=currentVendor(); if(!vendor) return;
    const p=existing||{};
    modal(existing?'Edit Produk Vendor':'Tambah Produk Vendor', `<div class="form">
      <div class="card" style="padding:11px"><b>${esc(vendor.name)}</b><br><small class="muted">Produk akan otomatis terhubung ke vendor ini.</small></div>
      <label>Nama Produk<input id="vpName" value="${esc(p.name||'')}" placeholder="Contoh: Cetirizine 10mg"/></label>
      <label>Kategori<select id="vpCat">${['Antihistamin','Analgesik','Antibiotik','Suplemen','Herbal','Lainnya'].map(x=>`<option ${p.cat===x?'selected':''}>${x}</option>`).join('')}</select></label>
      <label>Jenis / Satuan<input id="vpType" value="${esc(p.type||'Tablet')}" placeholder="Tablet, Kapsul, Sirup"/></label>
      <label>Harga Modal<input id="vpCost" type="number" min="0" value="${p.cost||''}" placeholder="Harga dari vendor"/></label>
      <label>Harga Jual<input id="vpPrice" type="number" min="0" value="${p.price||''}" placeholder="Harga jual apotek"/></label>
      <label>Stok Awal<input id="vpStock" type="number" min="0" value="${p.stock!=null?p.stock:''}" ${existing?'disabled':''}/></label>
      <label>Reorder Point<input id="vpReorder" type="number" min="0" value="${p.reorder||20}"/></label>
      <label>Tanggal Expired<input id="vpExpired" type="date" value="${p.expired||''}"/></label>
      ${existing?'':`<label>No. Batch Awal<input id="vpBatch" placeholder="Otomatis jika dikosongkan"/></label>`}
    </div>`, ()=>{
      const name=document.querySelector('#vpName').value.trim(); const cost=number(document.querySelector('#vpCost').value); const price=number(document.querySelector('#vpPrice').value);
      if(!name) return toast('Nama produk wajib diisi','err'),false;
      if(cost<0||price<0) return toast('Harga tidak valid','err'),false;
      const expired=document.querySelector('#vpExpired').value||new Date(Date.now()+365*86400000).toISOString().slice(0,10);
      const payload={name,cat:document.querySelector('#vpCat').value,type:document.querySelector('#vpType').value.trim()||'Tablet',cost,price,reorder:number(document.querySelector('#vpReorder').value,20),expired,supplierId:vendor.id,supplier:vendor.name};
      if(existing){ Object.assign(existing,payload); }
      else {
        const stock=number(document.querySelector('#vpStock').value); const batchNo=document.querySelector('#vpBatch').value.trim()||createBatchNo();
        DB.products.push({id:uid('p'),...payload,stock,batch:batchNo,batches:[{batchNo,received:new Date().toISOString().slice(0,10),expired,qty:stock,location:'Gudang Pusat'}]});
      }
      saveDB();render();toast(existing?'Produk vendor diperbarui':'Produk vendor berhasil ditambahkan');
    });
  }

  function exportVendorCSV(){
    const vendor=currentVendor(); if(!vendor) return;
    const header=['nama_produk','jenis','kategori','harga_modal','harga_jual','stok','reorder_point','expired','batch'];
    const rows=productsOfVendor(vendor.id).map(p=>[p.name,p.type,p.cat,p.cost,p.price,p.stock,p.reorder,p.expired,p.batch]);
    const csv=[header,...rows].map(r=>r.map(csvEscape).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url;a.download='produk-vendor-'+vendor.name.toLowerCase().replace(/[^a-z0-9]+/gi,'-')+'.csv';a.click();URL.revokeObjectURL(url);toast('CSV produk vendor diunduh');
  }

  function openImport(){ const input=document.querySelector('#vendorProductCsv'); if(input) input.click(); }
  function importVendorCSV(file){
    const vendor=currentVendor(); if(!vendor||!file) return;
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const rows=parseCSV(String(reader.result||'')); if(rows.length<2) return toast('CSV belum memiliki data produk','err');
        const head=rows[0].map(x=>x.trim().toLowerCase()); const get=(row,key)=>row[head.indexOf(key)]||'';
        if(!head.includes('nama_produk')) return toast('Kolom wajib: nama_produk','err');
        let created=0,updated=0,skipped=0;
        rows.slice(1).forEach(row=>{
          const name=get(row,'nama_produk').trim(); if(!name){skipped++;return;}
          const existing=productsOfVendor(vendor.id).find(p=>p.name.toLowerCase()===name.toLowerCase());
          const cost=number(get(row,'harga_modal')); const price=number(get(row,'harga_jual')); const stock=number(get(row,'stok')); const reorder=number(get(row,'reorder_point'),20); const expired=isoDate(get(row,'expired'))||new Date(Date.now()+365*86400000).toISOString().slice(0,10); const type=get(row,'jenis').trim()||'Tablet'; const cat=get(row,'kategori').trim()||'Lainnya'; const batch=get(row,'batch').trim()||createBatchNo();
          const payload={name,type,cat,cost,price,reorder,expired,supplierId:vendor.id,supplier:vendor.name};
          if(existing){ Object.assign(existing,payload); updated++; }
          else { DB.products.push({id:uid('p'),...payload,stock,batch,batches:[{batchNo:batch,received:new Date().toISOString().slice(0,10),expired,qty:stock,location:'Gudang Pusat'}]}); created++; }
        });
        saveDB();render();toast(`Import selesai: ${created} baru, ${updated} diperbarui${skipped?`, ${skipped} dilewati`:''}`);
      }catch(e){ console.error(e);toast('CSV tidak dapat diproses','err'); }
    };
    reader.readAsText(file);
  }

  function enhance(){
    if(S.page!=='vendor'||!S.selectedSupplierId) return;
    const section=document.querySelector('#pages .page'); if(!section||section.dataset.vendorProductsReady) return; section.dataset.vendorProductsReady='1';
    const title=[...section.querySelectorAll('.title')].find(x=>x.textContent.includes('Produk yang Dijual'));
    if(title){
      const right=document.createElement('div'); right.className='tabs'; right.innerHTML='<button class="outline" data-vp-export>⇩ Export CSV</button><button class="outline" data-vp-import>⇧ Import CSV</button><button class="primary" data-vp-add>＋ Tambah Produk</button>';
      title.appendChild(right);
    }
    const productTable=[...section.querySelectorAll('table')].find(t=>t.querySelector('th')&&t.querySelector('th').textContent.includes('Produk')&&t.querySelector('th').textContent.includes('Harga Modal'));
    if(productTable){
      const head=productTable.querySelector('thead tr'); if(head&&!head.querySelector('[data-vp-action-head]')){const th=document.createElement('th');th.dataset.vpActionHead='1';th.textContent='Aksi';head.appendChild(th);}
      productTable.querySelectorAll('tbody tr[data-product]').forEach(row=>{if(row.querySelector('[data-vp-edit]'))return;const id=row.dataset.product;const td=document.createElement('td');td.innerHTML=`<button class="outline" data-vp-edit="${id}">Edit</button>`;row.appendChild(td);});
    }
    if(!document.querySelector('#vendorProductCsv')){const input=document.createElement('input');input.type='file';input.accept='.csv,text/csv';input.id='vendorProductCsv';input.style.display='none';document.body.appendChild(input);input.onchange=()=>{importVendorCSV(input.files[0]);input.value='';};}
  }

  const baseRender=render;
  render=function(){ baseRender(); enhance(); };
  document.addEventListener('click',e=>{
    const add=e.target.closest('[data-vp-add]'); if(add){e.preventDefault();productForm();return;}
    const edit=e.target.closest('[data-vp-edit]'); if(edit){e.preventDefault();e.stopPropagation();productForm(DB.products.find(p=>p.id===edit.dataset.vpEdit));return;}
    const out=e.target.closest('[data-vp-export]'); if(out){e.preventDefault();exportVendorCSV();return;}
    const imp=e.target.closest('[data-vp-import]'); if(imp){e.preventDefault();openImport();}
  },true);
})();
