/* P6 B2 — Incremental cloud sync fallback for modules that still relied on disabled global snapshot sync.
   This intentionally avoids delete-all/insert-all. It upserts changed/new rows only.
   Covered: suppliers, branches, prescriptions/items, price lists/rules/customers,
   conversations/messages, settings, AP/AR payment records.
   Not covered here: product/PO create handled by P6 B1, checkout/returns/opname handled by RPC hooks. */
(function(){
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
  const uuid = () => crypto.randomUUID();
  const isUuid = id => UUID_RE.test(String(id || ''));
  const n = v => Number(v) || 0;
  const iso = v => v ? new Date(v).toISOString() : new Date().toISOString();
  const clone = v => JSON.parse(JSON.stringify(v || null));
  const cloudReady = () => !!(window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getMode && window.ApotekKilatSupabaseData.getMode() === 'cloud' && typeof supabaseClient !== 'undefined' && supabaseClient);
  const pharmacyId = () => window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getPharmacyId ? window.ApotekKilatSupabaseData.getPharmacyId() : null;
  const membership = () => window.ApotekKilatSupabaseData && window.ApotekKilatSupabaseData.getMembership ? window.ApotekKilatSupabaseData.getMembership() : null;
  const setSyncStatus = status => window.dispatchEvent(new CustomEvent('apotekkilat:sync-status', {detail:{status}}));

  const relationIds = {priceListCustomers:new Map()};
  let baseline = '{}';
  let syncing = false;
  let queued = false;

  function ensureId(row, prefix){
    if(row && !isUuid(row.id)) row.id = uuid();
    return row && row.id;
  }
  function stableRelationId(bucket, key){
    if(!relationIds[bucket].has(key)) relationIds[bucket].set(key, uuid());
    return relationIds[bucket].get(key);
  }
  function stableJson(value){ return JSON.stringify(value || {}); }
  function getSnapshot(){
    if(!window.DB) return {};
    return {
      suppliers: clone(DB.suppliers || []),
      branches: clone(DB.branches || []),
      prescriptions: clone(DB.prescriptions || []),
      priceLists: clone(DB.priceLists || []),
      conversations: clone(DB.conversations || []),
      settings: clone(DB.settings || {}),
      payables: clone(DB.payables || []),
      receivables: clone(DB.receivables || [])
    };
  }
  function refreshBaseline(){ baseline = stableJson(getSnapshot()); }

  async function upsert(table, rows, options){
    if(!rows || !rows.length) return;
    const res = await supabaseClient.from(table).upsert(rows, options || {onConflict:'id'});
    if(res.error) throw res.error;
  }

  function supplierRows(pid){
    return (DB.suppliers || []).map(s=>{
      ensureId(s, 's');
      return {
        id:s.id, pharmacy_id:pid, name:s.name || 'Vendor', contact:s.contact || null,
        phone:s.phone || null, email:s.email || null, address:s.address || null,
        payment_term:s.paymentTerm || null, status:s.status || 'Aktif'
      };
    });
  }

  function branchRows(pid){
    return (DB.branches || []).map(b=>{
      ensureId(b, 'b');
      return {id:b.id, pharmacy_id:pid, name:b.name || 'Cabang', address:b.address || null, is_main:!!b.isMain};
    });
  }

  function prescriptionRows(pid){
    const rows = [], items = [];
    (DB.prescriptions || []).forEach(rx=>{
      ensureId(rx, 'rx');
      rows.push({
        id:rx.id, pharmacy_id:pid, customer_id:isUuid(rx.customerId) ? rx.customerId : null,
        patient_name:rx.patient || rx.patientName || null, gender:rx.gender || null,
        age:n(rx.age), phone:rx.phone || null, doctor:rx.doctor || null,
        status:rx.status || 'Menunggu Verifikasi', note:rx.note || null,
        received_at:iso(rx.time || Date.now())
      });
      (rx.items || []).forEach(it=>{
        ensureId(it, 'rxi');
        items.push({
          id:it.id, pharmacy_id:pid, prescription_id:rx.id,
          product_id:isUuid(it.productId) ? it.productId : null,
          medicine_name:it.name || it.medicineName || null,
          qty:n(it.qty), sig:it.sig || null
        });
      });
    });
    return {rows, items};
  }

  function priceListRows(pid){
    const lists = [], customers = [], rules = [];
    (DB.priceLists || []).forEach(pl=>{
      ensureId(pl, 'pl');
      lists.push({
        id:pl.id, pharmacy_id:pid, name:pl.name || 'Price List', type:pl.type || 'Diskon',
        status:pl.status || 'Aktif', start_date:(pl.dateRange && pl.dateRange.start) || null,
        end_date:(pl.dateRange && pl.dateRange.end) || null
      });
      (pl.customerIds || []).forEach(cid=>{
        if(isUuid(cid)) customers.push({id:stableRelationId('priceListCustomers', `${pl.id}:${cid}`), pharmacy_id:pid, price_list_id:pl.id, customer_id:cid});
      });
      (pl.rules || []).forEach(r=>{
        ensureId(r, 'plr');
        rules.push({
          id:r.id, pharmacy_id:pid, price_list_id:pl.id, product_id:isUuid(r.productId) ? r.productId : null,
          discount_percent:r.discountPercent==null ? null : n(r.discountPercent),
          fixed_price:r.fixedPrice==null ? null : n(r.fixedPrice)
        });
      });
    });
    return {lists, customers, rules};
  }

  function conversationRows(pid){
    const conversations = [], messages = [];
    (DB.conversations || []).forEach(c=>{
      ensureId(c, 'k');
      conversations.push({
        id:c.id, pharmacy_id:pid, customer_id:isUuid(c.customerId) ? c.customerId : null,
        name:c.name || 'Kontak', phone:c.phone || null, status:c.status || 'Aktif', tone:c.tone || null
      });
      (c.messages || []).forEach(m=>{
        ensureId(m, 'km');
        messages.push({
          id:m.id, pharmacy_id:pid, conversation_id:c.id,
          direction:m.from || m.direction || 'in', message:m.text || m.message || '', sent_at:iso(m.time || Date.now())
        });
      });
    });
    return {conversations, messages};
  }

  function settingRow(pid){
    const s = DB.settings || {};
    return {
      pharmacy_id:pid,
      notif_low_stock:s.notifLowStock !== false,
      notif_expiry:s.notifExpiry !== false,
      notif_daily_summary:!!s.notifDailySummary,
      knowledge_snapshot:s.knowledgeSnapshot || {}
    };
  }

  function apPaymentRows(pid){
    const rows = [];
    (DB.payables || []).forEach(ap=>{
      (ap.payments || []).forEach(p=>{
        ensureId(p, 'app');
        if(isUuid(ap.id)) rows.push({
          id:p.id, pharmacy_id:pid, payable_id:ap.id,
          amount:n(p.amount), method:p.method || 'Tunai', paid_at:iso(p.date || Date.now())
        });
      });
    });
    return rows;
  }

  function arPaymentRows(pid){
    const rows = [];
    (DB.receivables || []).forEach(ar=>{
      (ar.payments || []).forEach(p=>{
        ensureId(p, 'arp');
        if(isUuid(ar.id)) rows.push({
          id:p.id, pharmacy_id:pid, receivable_id:ar.id,
          amount:n(p.amount), method:p.method || 'Tunai', paid_at:iso(p.date || Date.now())
        });
      });
    });
    return rows;
  }

  async function syncFallbackNow(reason){
    if(!cloudReady() || syncing || !window.DB) { if(syncing) queued = true; return; }
    const pid = pharmacyId();
    if(!pid) return;
    const now = stableJson(getSnapshot());
    if(now === baseline) return;

    syncing = true;
    setSyncStatus('saving');
    try{
      await upsert('suppliers', supplierRows(pid));
      await upsert('branches', branchRows(pid));

      const rx = prescriptionRows(pid);
      await upsert('prescriptions', rx.rows);
      await upsert('prescription_items', rx.items);

      const pl = priceListRows(pid);
      await upsert('price_lists', pl.lists);
      await upsert('price_list_rules', pl.rules);
      await upsert('price_list_customers', pl.customers, {onConflict:'id'});

      const chat = conversationRows(pid);
      await upsert('conversations', chat.conversations);
      await upsert('conversation_messages', chat.messages);

      await upsert('pharmacy_settings', [settingRow(pid)], {onConflict:'pharmacy_id'});
      await upsert('accounts_payable_payments', apPaymentRows(pid));
      await upsert('accounts_receivable_payments', arPaymentRows(pid));

      refreshBaseline();
      setSyncStatus('synced');
      if(typeof toast === 'function') toast('Perubahan modul umum tersinkron ke Supabase');
    }catch(err){
      console.error('P6 B2 fallback sync gagal:', err);
      setSyncStatus('error');
      if(typeof toast === 'function') toast(err.message || 'Fallback sync Supabase gagal', 'err');
      if(cloudReady() && pid){
        try{
          await supabaseClient.rpc('log_sync_failure', {p_payload:{
            pharmacy_id:pid,
            branch_id:(membership() && membership().branch_id) || (DB.activeBranchId || null),
            entity_type:'p6_b2_fallback', operation:'incremental_sync', error_message:String(err.message || err), payload:{reason}
          }});
        }catch(logErr){ console.warn('Gagal log sync failure:', logErr); }
      }
    }finally{
      syncing = false;
      if(queued){ queued = false; setTimeout(()=>syncFallbackNow('queued'), 300); }
    }
  }

  const oldSaveDB = typeof saveDB === 'function' ? saveDB : null;
  if(oldSaveDB){
    window.saveDB = saveDB = function(){
      const result = oldSaveDB.apply(this, arguments);
      setTimeout(()=>syncFallbackNow('saveDB'), 0);
      return result;
    };
  }

  if(typeof showApp === 'function'){
    const oldShowApp = showApp;
    window.showApp = showApp = async function(){
      const out = await oldShowApp.apply(this, arguments);
      refreshBaseline();
      return out;
    };
  }

  refreshBaseline();
  window.ApotekKilatP6B2IncrementalSyncFallback = {refreshBaseline, syncFallbackNow};
})();
