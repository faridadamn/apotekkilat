/* Tampilan qty ledger dalam UOM relevan + base unit */
(function(){
  function applyUomLedger(){
    if(S.page!=='obat')return;
    const p=DB.products.find(x=>x.id===S.selectedProductId);const table=document.querySelector('#medicineLedger table');if(!p||!table||!p.units)return;
    const unit=(code)=>p.units.find(x=>x.code===code)||p.units[0];
    table.querySelectorAll('tbody tr').forEach(row=>{
      if(row.dataset.uomLedgerDone||row.children.length<6)return;
      const type=row.children[1].textContent.trim(),inCell=row.children[3],outCell=row.children[4];
      const incoming=Number(inCell.textContent.replace(/[^0-9.-]/g,''))||0, outgoing=Number(outCell.textContent.replace(/[^0-9.-]/g,''))||0;
      const purchaseTypes=['Pembelian','Retur Pembelian'];const salesTypes=['Penjualan','Retur Penjualan'];
      const code=purchaseTypes.some(x=>type.includes(x))?p.purchaseUnit:salesTypes.some(x=>type.includes(x))?p.saleUnit:p.baseUnit;const u=unit(code);
      const fmtQty=(q,prefix)=>q?`${prefix}${q/u.factorToBase} ${u.label}<br><small class="muted">(${q} ${unit(p.baseUnit).label})</small>`:'0';
      inCell.innerHTML=fmtQty(incoming,'+');outCell.innerHTML=fmtQty(outgoing,'-');row.dataset.uomLedgerDone='1';
    });
  }
  const originalRender=render;render=function(){originalRender();applyUomLedger();};
})();
