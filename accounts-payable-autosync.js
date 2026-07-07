/* Pastikan payable langsung terbentuk setelah PO selesai */
(function(){
  function dateOnly(v){return v?new Date(v).toISOString().slice(0,10):'';}
  function termDays(s){const n=parseInt(String(s||'').match(/\d+/)?.[0]||'30',10);return Number.isFinite(n)?n:30;}
  function amount(po){return Math.round((po.items||[]).reduce((a,it)=>a+(Number(it.cost)||0)*(Number(it.displayQty??it.qty)||0),0)||Number(po.value)||0);}
  function syncPayables(){
    DB.payables=DB.payables||[];
    (DB.purchaseOrders||[]).filter(po=>po.status==='Selesai').forEach(po=>{
      if(DB.payables.some(p=>p.poId===po.id))return;
      const vendor=(DB.suppliers||[]).find(s=>s.id===po.supplierId)||{};const received=po.receivedAt||po.date||Date.now(),due=new Date(received);due.setDate(due.getDate()+termDays(vendor.paymentTerm));
      DB.payables.push({id:uid('ap'),supplierId:po.supplierId||'',poId:po.id,amount:amount(po),dueDate:dateOnly(due),paidAmount:0,status:'Belum Lunas',payments:[],createdAt:Date.now()});
      saveDB();
    });
  }
  const priorRender=render;render=function(){syncPayables();return priorRender();};
})();
