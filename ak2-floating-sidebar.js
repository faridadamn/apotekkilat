/* Floating sidebar drawer: ChatGPT-like circular menu button. */
(function(){
  function app(){ return document.querySelector('.app'); }
  function sidebar(){ return document.querySelector('.sidebar'); }
  function toggle(){ return document.querySelector('#sidebarToggle'); }

  function ensureBackdrop(){
    let el = document.querySelector('.ak2-sidebar-backdrop');
    if(!el){
      el = document.createElement('div');
      el.className = 'ak2-sidebar-backdrop';
      document.body.appendChild(el);
      el.addEventListener('click', closeDrawer);
    }
    return el;
  }

  function isMobile(){ return window.matchMedia('(max-width:720px)').matches; }

  function isOpen(){
    return document.body.classList.contains('ak2-drawer-open');
  }

  function syncToggle(){
    const btn = toggle();
    if(!btn) return;
    const open = isOpen();
    btn.classList.add('ak2-floating-toggle');
    btn.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.textContent = open ? '×' : '☰';
  }

  function openDrawer(){
    const a = app();
    if(!a) return;
    a.classList.remove('sidebar-collapsed');
    document.body.classList.add('ak2-drawer-open');
    syncToggle();
  }

  function closeDrawer(){
    const a = app();
    if(!a) return;
    document.body.classList.remove('ak2-drawer-open');
    if(!isMobile()) a.classList.add('sidebar-collapsed');
    syncToggle();
  }

  function toggleDrawer(e){
    if(e){ e.preventDefault(); e.stopPropagation(); }
    if(isOpen()) closeDrawer();
    else openDrawer();
  }

  function bind(){
    const btn = toggle();
    const a = app();
    if(!btn || !a) return;
    document.body.classList.add('ak2-floating-sidebar');
    ensureBackdrop();
    btn.classList.add('ak2-floating-toggle');
    btn.onclick = toggleDrawer;

    if(!document.body.classList.contains('ak2-floating-ready')){
      document.body.classList.add('ak2-floating-ready');
      document.body.classList.remove('ak2-drawer-open');
      if(!isMobile()) a.classList.add('sidebar-collapsed');
    }
    syncToggle();
  }

  document.addEventListener('click', function(e){
    if(!isOpen()) return;
    const btn = toggle();
    const side = sidebar();
    if((btn && btn.contains(e.target)) || (side && side.contains(e.target))) return;
    closeDrawer();
  }, true);

  document.addEventListener('click', function(e){
    const navBtn = e.target.closest('.sidebar [data-page]');
    if(navBtn && isMobile()) setTimeout(closeDrawer, 0);
  }, true);

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') closeDrawer();
  });

  window.addEventListener('resize', function(){
    bind();
    closeDrawer();
  });

  window.ApotekKilatFloatingSidebar = {openDrawer, closeDrawer, toggleDrawer, syncToggle};
  setTimeout(bind, 0);
  setInterval(bind, 1500);
})();
