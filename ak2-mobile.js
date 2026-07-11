/* Iterasi 2 — Table-to-card labels untuk tabel di layar sempit.
   Toggle drawer/hamburger dipindah sepenuhnya ke ak2-floating-sidebar.js
   (drawer off-canvas + tombol bulat terpadu, mobile & desktop) supaya tidak
   ada 2 sistem drawer yang saling menimpa. Riwayat: sistem lama di sini
   dulu memasang capturing listener + stopImmediatePropagation() yang
   memblokir sistem baru sepenuhnya — akibatnya tombol hamburger tidak
   membuka apa-apa sama sekali di mobile. Jangan tambahkan toggle drawer
   lagi di file ini; taruh di ak2-floating-sidebar.js supaya tetap satu
   sumber kebenaran. */
(function(){
  function labelTables(){
    document.querySelectorAll('table').forEach(table=>{
      const headers = Array.from(table.querySelectorAll('thead th')).map(th=>th.textContent.trim());
      if(!headers.length) return;
      table.classList.add('mobile-card-table');
      table.querySelectorAll('tbody tr').forEach(tr=>{
        Array.from(tr.children).forEach((td,i)=>{ if(!td.getAttribute('data-label')) td.setAttribute('data-label', headers[i] || 'Data'); });
      });
    });
  }
  const oldRender = typeof render === 'function' ? render : null;
  if(oldRender){
    render = function(){
      const out = oldRender.apply(this, arguments);
      setTimeout(labelTables, 0);
      return out;
    };
  }
  setTimeout(labelTables, 0);
})();
