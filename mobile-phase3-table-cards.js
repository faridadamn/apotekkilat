/* Mobile UX Phase 3 — mobile table labels + drawer auto-close.
   UI-only. Does not change data, auth, sync, checkout, or routing logic. */
(function(){
  const mq = window.matchMedia('(max-width: 720px)');
  const app = () => document.querySelector('.app');

  function labelTables(){
    document.querySelectorAll('.page.active table').forEach(table=>{
      const headers = Array.from(table.querySelectorAll('thead th')).map(th=>th.textContent.trim());
      if(!headers.length) return;
      table.classList.add('mobile-card-table');
      table.querySelectorAll('tbody tr').forEach(row=>{
        const cells = Array.from(row.children).filter(el=>el.tagName && el.tagName.toLowerCase()==='td');
        cells.forEach((cell,idx)=>{
          if(!cell.dataset.label) cell.dataset.label = headers[idx] || '';
          if(cell.classList.contains('empty')) cell.classList.add('no-label');
        });
      });
    });
  }

  function closeDrawer(){
    const root = app();
    if(root) root.classList.remove('sidebar-collapsed');
  }

  document.addEventListener('click', function(e){
    if(!mq.matches) return;
    const root = app();
    if(!root || !root.classList.contains('sidebar-collapsed')) return;
    const sidebar = e.target.closest('.sidebar');
    const toggle = e.target.closest('#sidebarToggle');
    const navButton = e.target.closest('.sidebar .nav button');
    if(navButton){ setTimeout(closeDrawer, 50); return; }
    if(!sidebar && !toggle) closeDrawer();
  }, true);

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') closeDrawer();
  });

  const observer = new MutationObserver(()=>{
    if(mq.matches) labelTables();
  });
  function start(){
    labelTables();
    const pages = document.querySelector('#pages');
    if(pages) observer.observe(pages,{childList:true,subtree:true});
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.ApotekKilatMobilePhase3 = {labelTables, closeDrawer};
})();
