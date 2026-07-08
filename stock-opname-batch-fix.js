/* DEPRECATED — tidak dimuat di index.html sejak Iterasi 2.
   Alasan: listener capture lama selalu stopImmediatePropagation() sehingga workflow-rpc-hooks.js
   tidak pernah sempat memanggil RPC post_stock_opname di mode cloud.
   Jalur aktif sekarang:
   - Local/demo: stock-opname.js + stock-opname-fix.js
   - Cloud: workflow-rpc-hooks.js / ak2-critical-rpc-wiring.js → post_stock_opname RPC
*/
