/* P6 B1 — Preserve multi-UOM forms while allowing later cloud-aware scripts to call them.
   This file must be loaded immediately after multi-uom.js, before entity-crud.js and optimistic-concurrency.js override globals. */
(function(){
  window.ApotekKilatMultiUomBridge = window.ApotekKilatMultiUomBridge || {};
  window.ApotekKilatMultiUomBridge.openProductForm = typeof openProductForm === 'function' ? openProductForm : null;
  window.ApotekKilatMultiUomBridge.openPOForm = typeof openPOForm === 'function' ? openPOForm : null;
})();
