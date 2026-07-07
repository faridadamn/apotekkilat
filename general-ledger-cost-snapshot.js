/* Simpan harga pokok base unit pada transaksi baru untuk jurnal yang stabil */
(function(){
  const priorCheckout=checkout;
  checkout=function(){
    const before=(DB.transactions||[]).map(x=>x.id);
    const out=priorCheckout();
    const tx=(DB.transactions||[]).find(x=>!before.includes(x.id));
    if(tx){(tx.items||[]).forEach(it=>{const p=DB.products.find(x=>x.id===it.productId);const base=p?.units?.find(u=>u.code===p?.baseUnit);if(it.costBase==null)it.costBase=Number(base?.cost??p?.cost??0)||0;});saveDB();}
    return out;
  };
})();
