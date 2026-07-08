/* Iterasi 2 — Mobile drawer + table-to-card labels. */
(function(){
  function app(){ return document.querySelector('.app'); }
  function ensureOverlay(){
    let overlay = document.querySelector('.mobile-drawer-overlay');
    if(!overlay){
      overlay = document.createElement('div');
      overlay.className = 'mobile-drawer-overlay';
      const root = app();
      if(root && root.parentNode) root.parentNode.insertBefore(overlay, root.nextSibling);
      overlay.addEventListener('click', closeDrawer);
    }
    return overlay;
  }
  function openDrawer(){ const a = app(); if(a){ ensureOverlay(); a.classList.add('mobile-drawer-open'); const b=document.querySelector('#sidebarToggle'); if(b) b.textContent='×'; } }
  function closeDrawer(){ const a = app(); if(a){ a.classList.remove('mobile-drawer-open'); const b=document.querySelector('#sidebarToggle'); if(b) b.textContent='☰'; } }
  function toggleDrawer(){ const a=app(); if(!a) return; a.classList.contains('mobile-drawer-open') ? closeDrawer() : openDrawer(); }
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
  document.addEventListener('click', function(e){
    if(e.target.closest('#sidebarToggle')){ e.preventDefault(); toggleDrawer(); return; }
    if(e.target.closest('#nav [data-page]')) closeDrawer();
  }, true);
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeDrawer(); });
  setTimeout(()=>{ ensureOverlay(); labelTables(); }, 0);
})();
