/* Pastikan tombol retur penjualan tampil pada header detail transaksi */
(function(){
  const oldRender=render;
  render=function(){oldRender();
    if(S.page!=='penjualan'||!S.selectedSaleId)return;
    const tx=DB.transactions.find(x=>x.id===S.selectedSaleId),head=document.querySelector('#pages .head');
    if(!tx||!head||head.querySelector('[data-return-sales]'))return;
    const b=document.createElement('button');b.className='outline';b.textContent='↩ Retur Transaksi Ini';b.dataset.returnSales=tx.id;head.appendChild(b);
  };
})();
