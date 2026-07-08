/* P6 P1 — Transaction metadata safety wrapper.
   Fixes the legacy bug where price-list or prescription metadata could attach to DB.transactions[0]
   instead of the transaction created by the current checkout.
   drug-classification.js is patched directly; this wrapper protects remaining minified/legacy checkout wrappers. */
(function(){
  function n(v){ return Number(v) || 0; }
  function today(){ return new Date().toISOString().slice(0,10); }
  function unit(p,code){return p?.units?.find(u=>u.code===code)||p?.units?.find(u=>u.code===p?.baseUnit)||{code:p?.baseUnit||'UNIT',label:p?.type||'Unit',factorToBase:1,price:p?.price||0,cost:p?.cost||0};}
  function normalPrice(p,code){const u=unit(p,code);return n(u.basePrice??u.price??p.price);}
  function isActive(pl,customerId,date=today()){
    if(!pl||pl.status==='Nonaktif')return false;
    if(pl.type==='Customer Group')return !!customerId&&(pl.customerIds||[]).includes(customerId);
    const r=pl.dateRange||{};return (!r.start||date>=r.start)&&(!r.end||date<=r.end);
  }
  function bestRule(productId,customerId,date=today(),basePrice){
    const candidates=[];
    (DB.priceLists||[]).filter(pl=>isActive(pl,customerId,date)).forEach(pl=>{
      const r=(pl.rules||[]).find(x=>x.productId===productId);if(!r)return;
      const price=r.fixedPrice!=null&&r.fixedPrice!==''?n(r.fixedPrice):Math.max(0,Math.round(basePrice*(1-n(r.discountPercent)/100)));
      if(price<basePrice)candidates.push({price,pl,rule:r});
    });
    return candidates.sort((a,b)=>a.price-b.price)[0]||null;
  }
  function applyPriceMetadata(tx){
    if(!tx || !Array.isArray(tx.items)) return;
    const priceListIds=new Set(tx.priceListIds||[]);
    let discountTotal=0;
    tx.items=tx.items.map(it=>{
      const productId=it.productId||it.product_id;
      const p=DB.products.find(x=>x.id===productId);
      if(!p) return it;
      const code=it.unitCode||it.unit_code||p.saleUnit||p.baseUnit;
      const basePrice=normalPrice(p,code);
      const best=bestRule(p.id,tx.customerId||S.cartCustomerId,today(),basePrice);
      if(!best) return it;
      const qty=n(it.qty)||1;
      const discount=Math.max(0,basePrice-best.price)*qty;
      discountTotal+=discount;
      priceListIds.add(best.pl.id);
      return {...it,originalPrice:basePrice,discountAmount:discount,priceListId:best.pl.id,priceListName:best.pl.name,price:best.price};
    });
    if(discountTotal>0){
      tx.discountTotal=discountTotal;
      tx.priceListIds=[...priceListIds];
    }
  }
  function applyDrugMetadata(tx){
    if(!tx || !Array.isArray(tx.items)) return;
    const rxId=S.cartPrescriptionId||S.selectedPrescriptionId||tx.prescriptionId||null;
    if(rxId) tx.prescriptionId=rxId;
    tx.items=tx.items.map(it=>{
      const productId=it.productId||it.product_id;
      const p=DB.products.find(x=>x.id===productId);
      return {...it,golongan:it.golongan||p?.golongan||p?.drug_class||'Bebas'};
    });
  }

  const previousCheckout=typeof checkout==='function'?checkout:null;
  if(!previousCheckout) return;
  window.checkout=checkout=function(){
    const oldIds=new Set((DB.transactions||[]).map(t=>t.id));
    const out=previousCheckout.apply(this,arguments);
    const finalize=()=>{
      const tx=(DB.transactions||[]).find(t=>!oldIds.has(t.id));
      if(tx){applyPriceMetadata(tx);applyDrugMetadata(tx);saveDB();}
    };
    if(out && typeof out.then==='function') return out.then(result=>{finalize();return result;});
    finalize();
    return out;
  };
})();
