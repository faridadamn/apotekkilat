/* Mobile UX Phase 2 — drawer behavior only.
   Does not change routing, auth, sync, checkout, or business logic. */
(function(){
  const mq = window.matchMedia('(max-width: 720px)');
  const app = () => document.querySelector('.app');
  const body = () => document.body;
  const isOpen = () => app() && app().classList.contains('mobile-nav-open');
  function openNav(){ if(!mq.matches || !app()) return; app().classList.add('mobile-nav-open'); body().classList.add('mobile-nav-open'); }
  function closeNav(){ if(!app()) return; app().classList.remove('mobile-nav-open'); body().classList.remove('mobile-nav-open'); }
  function toggleNav(){ isOpen() ? closeNav() : openNav(); }

  document.addEventListener('click', function(e){
    const toggle = e.target.closest('#sidebarToggle');
    const navButton = e.target.closest('.sidebar .nav button');
    const insideSidebar = e.target.closest('.sidebar');

    if(toggle && mq.matches){
      e.preventDefault();
      e.stopImmediatePropagation();
      toggleNav();
      return;
    }
    if(navButton && mq.matches){
      setTimeout(closeNav, 40);
      return;
    }
    if(isOpen() && mq.matches && !insideSidebar && !toggle){
      closeNav();
    }
  }, true);

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') closeNav();
  });

  mq.addEventListener ? mq.addEventListener('change', closeNav) : mq.addListener(closeNav);
  window.ApotekKilatMobileNav = {open:openNav, close:closeNav, toggle:toggleNav};
})();
