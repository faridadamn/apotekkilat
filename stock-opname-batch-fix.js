/* Posting adjustment sebagai batch SO terpisah agar histori batch dan ledger tetap akurat */
(function(){
  const reasons=['Rusak','Kadaluarsa','Hilang','Kesalahan Input','Lainnya'];
  function complete(id){
    const so=(DB.stockOpnames||[]).find(x=>x.id===id);if(!so||so.status!=='Draft')return;
    document.querySelectorAll('[data-so-row]').forEach(row=>{const it=so.items[Number(row.dataset.soRow)];if(!it)return;it.physicalQty=Math.max(0,Number(row.querySelector('.so-physical')?.value)||0);it.diff=it.physicalQty-Number(it.systemQty||0);it.reason=row.querySelector('.so-reason')?.value||'';});
    const invalid=so.items.find(it=>Number(it.diff)!==0&&!reasons.includes(it.reason));if(invalid)return toast('Semua produk dengan selisih wajib memiliki alasan','err');
    so.items.forEach(it=>{const p=DB.products.find(x=>x.id===it.productId);if(!p||Number(it.diff)===0)return;p.batches=p.batches||[];p.batches.push({batchNo:'SO-'+so.code,received:new Date().toISOString().slice(0,10),expired:p.expired,qty:Number(it.diff),location:'Stock Adjustment'});p.stock=Number(it.physicalQty)||0;});
    so.status='Selesai';so.completedAt=Date.now();saveDB();render();toast('Stock opname selesai dan adjustment diposting');
  }
  document.addEventListener('click',e=>{const b=e.target.closest('[data-so-finish]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();complete(b.dataset.soFinish);},true);
})();
