/* Sinkronkan harga tampilan saat satuan jual diganti di kasir */
(function(){
  document.addEventListener('change',e=>{
    const select=e.target.closest('[data-uom-sale-unit]');if(!select)return;
    const p=DB.products.find(x=>x.id===select.dataset.uomSaleUnit);if(!p||!p.units)return;
    const u=p.units.find(x=>x.code===select.value)||p.units[0];const card=select.closest('.product');const price=card&&card.querySelector('strong');if(price)price.textContent=fmt(Number(u.price)||0);
  },true);
})();
