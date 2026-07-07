/* Hindari handler ganda tombol Mulai Stock Opname */
(function(){
  const baseRender=render;
  render=function(){baseRender();document.querySelectorAll('[data-so-start]').forEach(b=>b.onclick=null);};
})();
