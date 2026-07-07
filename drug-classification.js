/* Master Golongan Obat, validasi resep, dan rekap penjualan golongan */
(function(){
  const GOLONGAN=['Bebas','Bebas Terbatas','Keras','Narkotika','Psikotropika'];
  const RESTRICTED=['Keras','Narkotika','Psikotropika'];
  const reportIndex=NAV.findIndex(x=>x[0]==='penjualan');
  if(!NAV.some(x=>x[0]==='laporan-golongan')) NAV.splice(reportIndex<0?NAV.length:reportIndex+1,0,['laporan-golongan','▥','Laporan Golongan']);
  function normalize(){(DB.products||[]).forEach(p=>{if(!GOLONGAN.includes(p.golongan))p.golongan='Bebas';});saveDB();}
  normalize();
  const escText=v=>esc(String(v==null?'':v));
  const day=v=>v?new Date(v).toISOString().slice(0,10):'';
  const verifiedRx=()=> (DB.prescriptions||[]).filter(r=>['Diproses','Siap Diambil','Selesai'].includes(r.status));
  const itemGolongan=it=>it.golongan||(DB.products.find(p=>p.id===it.productId)||{}).golongan||'Bebas';
  const controlledCart=()=>S.cart.filter(c=>{const p=DB.products.find(x=>x.id===c.id);return p&&RESTRICTED.includes(p.golongan);});

  function injectGolonganField(){
    const form=document.querySelector('#modalContent .form');const title=document.querySelector('#modalTitle')?.textContent||'';
    if(!form||!/(Tambah Obat|Edit Obat|Tambah Produk|Edit Produk)/i.test(title)||document.querySelector('#drugGolongan'))return;
    const nameInput=document.querySelector('#uName,#fName');
    const existing=nameInput?DB.products.find(p=>p.name===nameInput.value.trim()):null;
    const label=document.createElement('label');label.innerHTML=`Golongan Obat <select id="drugGolongan" required><option value="">Pilih golongan obat</option>${GOLONGAN.map(g=>`<option value="${g}" ${(existing?.golongan||'')===g?'selected':''}>${g}</option>`).join('')}</select>`;
    form.appendChild(label);
    const save=document.querySelector('#modalSave'); if(!save||save.dataset.drugGolonganPatched)return;
    save.dataset.drugGolonganPatched='1'; const original=save.onclick;
    save.onclick=function(ev){
      const gol=document.querySelector('#drugGolongan')?.value;if(!gol){toast('Golongan obat wajib dipilih','err');return false;}
      const beforeIds=new Set(DB.products.map(p=>p.id));const nm=(document.querySelector('#uName,#fName')?.value||'').trim();
      const out=original?original.call(this,ev):undefined;
      const p=DB.products.find(x=>x.name===nm&&(!beforeIds.has(x.id)||x===existing))||DB.products.find(x=>x.name===nm);
      if(p){p.golongan=gol;saveDB();}
      return out;
    };
  }
  const observer=new MutationObserver(()=>injectGolonganField());observer.observe(document.body,{childList:true,subtree:true});

  function injectPrescriptionPicker(){
    if(S.page!=='kasir')return;
    const controlled=controlledCart();const cart=document.querySelector('#uomCart');if(!cart||!controlled.length||document.querySelector('#rxForSale'))return;
    const current=S.cartPrescriptionId||'';const rx=verifiedRx();const box=document.createElement('div');box.className='notice';box.id='rxForSale';box.style.marginTop='12px';
    box.innerHTML=`<i>!</i><div style="width:100%"><b>Resep terverifikasi wajib</b><small>Keranjang memuat: ${controlled.map(c=>escText((DB.products.find(p=>p.id===c.id)||{}).name)).join(', ')}</small><select id="rxSaleSelect" style="margin-top:8px;width:100%"><option value="">Pilih resep terverifikasi</option>${rx.map(r=>`<option value="${r.id}" ${r.id===current?'selected':''}>${escText(r.patient)} · ${escText(r.doctor||'-')} · ${r.status}</option>`).join('')}</select></div>`;
    cart.appendChild(box);const select=box.querySelector('#rxSaleSelect');select.onchange=()=>{S.cartPrescriptionId=select.value||null;};
  }

  const oldCheckout=checkout;
  checkout=function(){
    const controlled=controlledCart();
    if(!controlled.length){S.cartPrescriptionId=null;return oldCheckout();}
    const rx=(DB.prescriptions||[]).find(r=>r.id===S.cartPrescriptionId);
    if(!rx||!['Diproses','Siap Diambil','Selesai'].includes(rx.status)){
      const list=verifiedRx();
      if(!list.length)return toast('Tidak ada resep terverifikasi. Verifikasi resep terlebih dahulu.','err');
      return modal('Resep Terverifikasi Wajib',`<div class="form"><p>Keranjang memuat obat golongan <b>${[...new Set(controlled.map(c=>DB.products.find(p=>p.id===c.id)?.golongan))].join(', ')}</b>.</p><label>Pilih Resep Terverifikasi<select id="checkoutRx"><option value="">Pilih resep</option>${list.map(r=>`<option value="${r.id}">${escText(r.patient)} · ${escText(r.doctor||'-')} · ${r.status}</option>`).join('')}</select></label></div>`,()=>{const id=document.querySelector('#checkoutRx').value;if(!id)return toast('Pilih resep terverifikasi','err'),false;S.cartPrescriptionId=id;return checkout();},{saveLabel:'Lanjutkan Transaksi'});
    }
    const prior=DB.transactions.length;const result=oldCheckout();
    if(DB.transactions.length>prior){const tx=DB.transactions[0]||DB.transactions[DB.transactions.length-1];if(tx){tx.prescriptionId=rx.id;tx.items=(tx.items||[]).map(it=>({...it,golongan:itemGolongan(it)}));saveDB();}}
    return result;
  };
  document.addEventListener('click',e=>{const b=e.target.closest('[data-uom-checkout]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();checkout();},true);

  function reportFilter(){return S.drugClassReportFilter||(S.drugClassReportFilter={start:'',end:''});}
  function reportRows(){const f=reportFilter();const map=Object.fromEntries(GOLONGAN.map(g=>[g,{golongan:g,transactions:0,qty:0,value:0}]));(DB.transactions||[]).forEach(tx=>{const d=day(tx.time);if(f.start&&d<f.start)return;if(f.end&&d>f.end)return;(tx.items||[]).forEach(it=>{const g=itemGolongan(it);if(!map[g])map[g]={golongan:g,transactions:0,qty:0,value:0};map[g].transactions++;map[g].qty+=Number(it.baseQty??it.qty)||0;map[g].value+=(Number(it.price)||0)*(Number(it.qty)||0);});});return Object.values(map);}
  function reportPage(){const f=reportFilter(),rows=reportRows(),total=rows.reduce((a,r)=>a+r.value,0);return `<section class="page active"><div class="head"><div><h2>Rekap Penjualan per Golongan</h2><p>Ringkasan penjualan berdasarkan golongan obat yang tersimpan pada produk/transaksi.</p></div></div><div class="grid4"><div class="card kpi"><div class="kicon">▥</div><div><label>Total Penjualan</label><strong>${fmt(total)}</strong><span class="muted">Sesuai periode</span></div></div><div class="card kpi"><div class="kicon">!</div><div><label>Golongan Keras</label><strong>${fmt((rows.find(x=>x.golongan==='Keras')||{}).value||0)}</strong><span class="muted">Nilai penjualan</span></div></div><div class="card kpi"><div class="kicon">!</div><div><label>Narkotika</label><strong>${fmt((rows.find(x=>x.golongan==='Narkotika')||{}).value||0)}</strong><span class="muted">Nilai penjualan</span></div></div><div class="card kpi"><div class="kicon">!</div><div><label>Psikotropika</label><strong>${fmt((rows.find(x=>x.golongan==='Psikotropika')||{}).value||0)}</strong><span class="muted">Nilai penjualan</span></div></div></div><div style="height:16px"></div><div class="card"><div class="tools"><input id="classStart" type="date" value="${escText(f.start)}"><input id="classEnd" type="date" value="${escText(f.end)}"><button class="outline" id="classReset">Reset</button></div><table><thead><tr><th>Golongan Obat</th><th>Baris Penjualan</th><th>Qty Base Unit</th><th>Nilai Penjualan</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${escText(r.golongan)}</b></td><td>${r.transactions}</td><td>${r.qty}</td><td><b>${fmt(r.value)}</b></td></tr>`).join('')}</tbody></table></div></section>`;}
  function bindReport(){const f=reportFilter();const st=document.querySelector('#classStart');if(st)st.onchange=()=>{f.start=st.value;render();};const en=document.querySelector('#classEnd');if(en)en.onchange=()=>{f.end=en.value;render();};const rs=document.querySelector('#classReset');if(rs)rs.onclick=()=>{S.drugClassReportFilter={start:'',end:''};render();};}
  const baseRender=render;render=function(){if(S.page==='laporan-golongan'){nav();document.querySelector('#pages').innerHTML=reportPage();document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{S.page=b.dataset.page;render();});bindReport();return;}baseRender();injectGolonganField();injectPrescriptionPicker();};
})();
