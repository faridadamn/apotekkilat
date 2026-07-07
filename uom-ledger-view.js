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
      const code=type.includes('Pembelian')?p.purchaseUnit:type.includes('Penjualan')?p.saleUnit:p.baseUnit;const u=unit(code);
      const fmt=(q,prefix)=>q?`${prefix}${q/u.factorToBase} ${u.label}<br><small class="muted">(${q} ${unit(p.baseUnit).label})</small>`:'0';
      inCell.innerHTML=fmt(incoming,'+');outCell.innerHTML=fmt(outgoing,'-');row.dataset.uomLedgerDone='1';
    });
  }
  const originalRender=render;render=function(){originalRender();applyUomLedger();};
})();
