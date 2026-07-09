(function(){
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const state = {client:null, session:null, pharmacyId:null, membership:null, mode:'demo', loading:false, saving:false, queued:false, timer:null, syncStatus:'idle', legacyFlushDisabled:true};

  const arr = v => Array.isArray(v) ? v : [];
  const n = v => Number(v) || 0;
  const ts = v => v ? new Date(v).toISOString() : null;
  const ms = v => v ? new Date(v).getTime() : Date.now();
  const uuid = () => crypto.randomUUID();
  const isUuid = id => UUID_RE.test(String(id || ''));
  const ensureUuid = obj => { if(obj && !isUuid(obj.id)) obj.id = uuid(); return obj ? obj.id : uuid(); };

  function emit(message, kind){ if(typeof toast === 'function') toast(message, kind); }
  function setSyncStatus(status){ state.syncStatus = status; window.dispatchEvent(new CustomEvent('apotekkilat:sync-status', {detail:{status}})); }

  async function selectAll(table, columns='*'){
    const {data, error} = await state.client.from(table).select(columns);
    if(error) throw error;
    return data || [];
  }

  async function init(client, session, fallbackDb){
    state.client = client;
    state.session = session;
    state.mode = 'demo';
    state.pharmacyId = null;
    state.membership = null;
    setSyncStatus('idle');
    if(!client || !session || !session.user) return null;

    const {data: memberships, error} = await client
      .from('pharmacy_users')
      .select('id, pharmacy_id, branch_id, full_name, role, status')
      .eq('user_id', session.user.id)
      .eq('status', 'Aktif')
      .limit(1);
    if(error) {
      console.warn('Gagal cek membership Supabase:', error);
      return null;
    }
    if(!memberships || !memberships.length){
      state.mode = 'demo';
      emit('Mode lokal aktif. Data tersimpan di perangkat ini.', 'warn');
      window.dispatchEvent(new CustomEvent('apotekkilat:local-mode'));
      return null;
    }

    state.mode = 'cloud';
    state.membership = memberships[0];
    state.pharmacyId = memberships[0].pharmacy_id;
    try{
      state.loading = true;
      setSyncStatus('loading');
      const remote = await loadRemote(fallbackDb);
      state.loading = false;
      setSyncStatus('synced');
      emit('Data Supabase tersambung');
      return remote;
    }catch(err){
      state.loading = false;
      state.mode = 'demo';
      setSyncStatus('error');
      console.error('Gagal memuat data Supabase:', err);
      emit('Gagal memuat Supabase. Aplikasi memakai data lokal dulu.', 'err');
      return null;
    }
  }

  async function loadRemote(fallbackDb){
    const [
      pharmacies, settings, branches, users, suppliers, products, uoms, batches,
      customers, transactions, txItems, prescriptions, rxItems, purchaseOrders,
      poItems, conversations, messages, stockOpnames, soItems, purchaseReturns,
      purchaseReturnItems, salesReturns, salesReturnItems, payables, payablePayments,
      receivables, receivablePayments, accounts, journals, journalLines, priceLists,
      priceListCustomers, priceListRules
    ] = await Promise.all([
      selectAll('pharmacies'), selectAll('pharmacy_settings'), selectAll('branches'),
      selectAll('pharmacy_users'), selectAll('suppliers'), selectAll('products'),
      selectAll('product_uoms'), selectAll('product_batches'), selectAll('customers'),
      selectAll('transactions'), selectAll('transaction_items'), selectAll('prescriptions'),
      selectAll('prescription_items'), selectAll('purchase_orders'), selectAll('purchase_order_items'),
      selectAll('conversations'), selectAll('conversation_messages'), selectAll('stock_opnames'),
      selectAll('stock_opname_items'), selectAll('purchase_returns'), selectAll('purchase_return_items'),
      selectAll('sales_returns'), selectAll('sales_return_items'), selectAll('accounts_payable'),
      selectAll('accounts_payable_payments'), selectAll('accounts_receivable'),
      selectAll('accounts_receivable_payments'), selectAll('chart_of_accounts'),
      selectAll('journal_entries'), selectAll('journal_entry_lines'), selectAll('price_lists'),
      selectAll('price_list_customers'), selectAll('price_list_rules')
    ]);

    const pharmacy = pharmacies[0] || {};
    const setting = settings[0] || {};
    const db = fallbackDb && typeof fallbackDb === 'object' ? JSON.parse(JSON.stringify(fallbackDb)) : {};
    Object.assign(db, {
      branches: branches.map(b=>({id:b.id,name:b.name,address:b.address||'',isMain:!!b.is_main})),
      users: users.map(u=>({id:u.id,userId:u.user_id,name:u.full_name,branchId:u.branch_id,role:u.role,status:u.status})),
      suppliers: suppliers.map(s=>({id:s.id,name:s.name,contact:s.contact||'',phone:s.phone||'',email:s.email||'',address:s.address||'',paymentTerm:s.payment_term||'',status:s.status})),
      products: products.map(p=>({
        id:p.id,name:p.name,type:p.type||'',cat:p.category||'',price:n(p.price),cost:n(p.cost),stock:n(p.stock),
        reorder:n(p.reorder_point),baseUnit:p.base_unit||'UNIT',purchaseUnit:p.purchase_unit||p.base_unit||'UNIT',
        saleUnit:p.sale_unit||p.base_unit||'UNIT',batch:p.default_batch_no||'',expired:p.default_expired_at||'',
        supplierId:p.supplier_id||'',supplier:(suppliers.find(s=>s.id===p.supplier_id)||{}).name||'',golongan:p.drug_class||'Bebas',
        units:uoms.filter(u=>u.product_id===p.id).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(u=>({
          id:u.id,code:u.code,label:u.label,factorToBase:n(u.factor_to_base)||1,price:n(u.price),cost:n(u.cost),basePrice:u.base_price==null?undefined:n(u.base_price),isBase:!!u.is_base
        })),
        batches:batches.filter(b=>b.product_id===p.id).map(b=>({id:b.id,batchNo:b.batch_no,received:b.received_at,expired:b.expired_at,qty:n(b.qty),location:b.location||''}))
      })),
      customers: customers.map(c=>({id:c.id,name:c.name,phone:c.phone||'',points:n(c.points),status:c.status,paymentTerm:c.payment_term||''})),
      transactions: transactions.map(t=>({
        id:t.id,code:t.code,customerId:t.customer_id,branchId:t.branch_id,subtotal:n(t.subtotal),tax:n(t.tax),total:n(t.total),
        payment:t.payment_method,status:t.status,time:ms(t.happened_at),prescriptionId:t.prescription_id,priceListIds:t.price_list_ids||[],
        items:txItems.filter(i=>i.transaction_id===t.id).map(i=>({id:i.id,productId:i.product_id,name:i.product_name,unitCode:i.unit_code,qty:n(i.qty),baseQty:n(i.base_qty),price:n(i.price),costBase:n(i.cost_base),originalPrice:n(i.original_price),discountAmount:n(i.discount_amount),priceListId:i.price_list_id,priceListName:i.price_list_name,golongan:i.drug_class}))
      })),
      prescriptions: prescriptions.map(r=>({
        id:r.id,customerId:r.customer_id,patient:r.patient_name,gender:r.gender,age:n(r.age),phone:r.phone||'',doctor:r.doctor||'',status:r.status,note:r.note||'',time:ms(r.received_at),
        items:rxItems.filter(i=>i.prescription_id===r.id).map(i=>({id:i.id,productId:i.product_id,name:i.medicine_name,qty:n(i.qty),sig:i.sig||''}))
      })),
      purchaseOrders: purchaseOrders.map(p=>({
        id:p.id,code:p.code,supplierId:p.supplier_id,supplier:p.supplier_name||'',note:p.note||'',value:n(p.value),status:p.status,sourcePO:p.source_po_code,rejectionReason:p.rejection_reason,
        date:ms(p.ordered_at),submittedAt:ms(p.submitted_at),approvedAt:ms(p.approved_at),shippedAt:ms(p.shipped_at),receivedAt:ms(p.received_at),rejectedAt:ms(p.rejected_at),
        items:poItems.filter(i=>i.purchase_order_id===p.id).map(i=>({id:i.id,productId:i.product_id,qty:n(i.qty),displayQty:n(i.display_qty),unitCode:i.unit_code,unitLabel:i.unit_label,cost:n(i.cost),expired:i.expired_at}))
      })),
      conversations: conversations.map(c=>({
        id:c.id,customerId:c.customer_id,name:c.name,phone:c.phone||'',status:c.status,tone:c.tone,
        messages:messages.filter(m=>m.conversation_id===c.id).map(m=>({id:m.id,from:m.direction,text:m.message,time:ms(m.sent_at)}))
      })),
      stockOpnames: stockOpnames.map(s=>({
        id:s.id,code:s.code,category:s.category,note:s.note||'',status:s.status,date:ms(s.counted_at),
        items:soItems.filter(i=>i.stock_opname_id===s.id).map(i=>({id:i.id,productId:i.product_id,systemQty:n(i.system_qty),physicalQty:n(i.physical_qty),diff:n(i.diff_qty),reason:i.reason||''}))
      })),
      purchaseReturns: purchaseReturns.map(r=>({
        id:r.id,code:r.code,poId:r.purchase_order_id,supplierId:r.supplier_id,value:n(r.value),status:r.status,date:ms(r.returned_at),note:r.note||'',rejectionReason:r.rejection_reason,submittedAt:ms(r.submitted_at),approvedAt:ms(r.approved_at),rejectedAt:ms(r.rejected_at),completedAt:ms(r.completed_at),
        items:purchaseReturnItems.filter(i=>i.purchase_return_id===r.id).map(i=>({id:i.id,productId:i.product_id,qty:n(i.qty),baseQty:n(i.base_qty),displayQty:n(i.display_qty),unitCode:i.unit_code,unitLabel:i.unit_label,cost:n(i.cost),reason:i.reason||''}))
      })),
      salesReturns: salesReturns.map(r=>({
        id:r.id,code:r.code,transactionId:r.transaction_id,customerId:r.customer_id,value:n(r.value),status:r.status,date:ms(r.returned_at),refundMethod:r.refund_method,note:r.note||'',rejectionReason:r.rejection_reason,submittedAt:ms(r.submitted_at),approvedAt:ms(r.approved_at),rejectedAt:ms(r.rejected_at),completedAt:ms(r.completed_at),
        items:salesReturnItems.filter(i=>i.sales_return_id===r.id).map(i=>({id:i.id,productId:i.product_id,qty:n(i.qty),baseQty:n(i.base_qty),displayQty:n(i.display_qty),unitCode:i.unit_code,unitLabel:i.unit_label,price:n(i.price),reason:i.reason||''}))
      })),
      payables: payables.map(p=>({id:p.id,supplierId:p.supplier_id,poId:p.purchase_order_id,amount:n(p.amount),adjustedAmount:n(p.adjusted_amount),paidAmount:n(p.paid_amount),dueDate:p.due_date,status:p.status,createdAt:ms(p.created_at),payments:payablePayments.filter(x=>x.payable_id===p.id).map(x=>({id:x.id,date:ms(x.paid_at),amount:n(x.amount),method:x.method}))})),
      receivables: receivables.map(r=>({id:r.id,customerId:r.customer_id,transactionId:r.transaction_id,amount:n(r.amount),paidAmount:n(r.paid_amount),dueDate:r.due_date,status:r.status,createdAt:ms(r.created_at),payments:receivablePayments.filter(x=>x.receivable_id===r.id).map(x=>({id:x.id,date:ms(x.paid_at),amount:n(x.amount),method:x.method}))})),
      chartOfAccounts: accounts.map(a=>({id:a.id,code:a.code,name:a.name,class:a.class})),
      journal: journals.map(j=>({id:j.id,date:ms(j.posted_at),sourceType:j.source_type,sourceId:j.source_id,note:j.note||'',entries:journalLines.filter(l=>l.journal_entry_id===j.id).map(l=>({id:l.id,account:l.account_code,debit:n(l.debit),credit:n(l.credit)}))})),
      priceLists: priceLists.map(pl=>({id:pl.id,name:pl.name,type:pl.type,status:pl.status,dateRange:{start:pl.start_date||'',end:pl.end_date||''},customerIds:priceListCustomers.filter(c=>c.price_list_id===pl.id).map(c=>c.customer_id),rules:priceListRules.filter(r=>r.price_list_id===pl.id).map(r=>({id:r.id,productId:r.product_id,discountPercent:r.discount_percent==null?null:n(r.discount_percent),fixedPrice:r.fixed_price==null?null:n(r.fixed_price)}))})),
      settings:{
        pharmacyName: pharmacy.name || 'Apotek Sehat',
        address: pharmacy.address || '',
        whatsapp: pharmacy.whatsapp || '',
        notifLowStock: setting.notif_low_stock !== false,
        notifExpiry: setting.notif_expiry !== false,
        notifDailySummary: !!setting.notif_daily_summary,
        knowledgeSnapshot: setting.knowledge_snapshot || {}
      },
      activeBranchId: state.membership.branch_id || (branches[0] && branches[0].id) || null
    });
    return db;
  }

  function normalizeIds(db){
    const maps = {};
    const collections = [
      ['branches','b'],['suppliers','s'],['products','p'],['customers','c'],['transactions','t'],['prescriptions','rx'],
      ['purchaseOrders','po'],['conversations','k'],['stockOpnames','so'],['purchaseReturns','pr'],['salesReturns','sr'],
      ['payables','ap'],['receivables','ar'],['priceLists','pl'],['journal','j']
    ];
    collections.forEach(([key])=>{
      maps[key] = {};
      arr(db[key]).forEach(x=>{ if(!isUuid(x.id)){ const old=x.id; x.id=uuid(); maps[key][old]=x.id; } });
    });
    const rep = (v,key)=> maps[key] && maps[key][v] ? maps[key][v] : v;
    db.activeBranchId = rep(db.activeBranchId, 'branches');
    arr(db.users).forEach(u=>{u.branchId=rep(u.branchId,'branches');});
    arr(db.products).forEach(p=>{p.supplierId=rep(p.supplierId,'suppliers'); arr(p.units).forEach(ensureUuid); arr(p.batches).forEach(ensureUuid);});
    arr(db.transactions).forEach(t=>{t.customerId=rep(t.customerId,'customers');t.branchId=rep(t.branchId,'branches');t.prescriptionId=rep(t.prescriptionId,'prescriptions');arr(t.items).forEach(i=>{ensureUuid(i);i.productId=rep(i.productId,'products');i.priceListId=rep(i.priceListId,'priceLists');});});
    arr(db.prescriptions).forEach(r=>{r.customerId=rep(r.customerId,'customers');arr(r.items).forEach(i=>{ensureUuid(i);i.productId=rep(i.productId,'products');});});
    arr(db.purchaseOrders).forEach(p=>{p.supplierId=rep(p.supplierId,'suppliers');arr(p.items).forEach(i=>{ensureUuid(i);i.productId=rep(i.productId,'products');});});
    arr(db.stockOpnames).forEach(s=>{arr(s.items).forEach(i=>{ensureUuid(i);i.productId=rep(i.productId,'products');});});
    arr(db.purchaseReturns).forEach(r=>{r.poId=rep(r.poId,'purchaseOrders');r.supplierId=rep(r.supplierId,'suppliers');arr(r.items).forEach(i=>{ensureUuid(i);i.productId=rep(i.productId,'products');});});
    arr(db.salesReturns).forEach(r=>{r.transactionId=rep(r.transactionId,'transactions');r.customerId=rep(r.customerId,'customers');arr(r.items).forEach(i=>{ensureUuid(i);i.productId=rep(i.productId,'products');});});
    arr(db.payables).forEach(p=>{p.supplierId=rep(p.supplierId,'suppliers');p.poId=rep(p.poId,'purchaseOrders');arr(p.payments).forEach(ensureUuid);});
    arr(db.receivables).forEach(r=>{r.customerId=rep(r.customerId,'customers');r.transactionId=rep(r.transactionId,'transactions');arr(r.payments).forEach(ensureUuid);});
    arr(db.journal).forEach(j=>{arr(j.entries).forEach(ensureUuid);});
    return db;
  }

  async function saveRemote(db){
    // Legacy full snapshot sync is intentionally disabled.
    // Cloud writes must go through explicit RPC/CRUD handlers with RLS, role checks, idempotency, and/or version checks.
    // This prevents noisy RLS failures and prevents broad full-tenant upserts from overwriting concurrent changes.
    if(state.mode !== 'cloud' || state.loading) return {skipped:true, reason:'not-cloud-or-loading'};
    setSyncStatus('synced');
    return {skipped:true, reason:'legacy-full-flush-disabled'};
  }

  function scheduleSave(db){
    // saveDB() is still used for local cache and UI responsiveness.
    // In cloud mode, do not queue full-dataset upsert. Every cloud mutation must call its own RPC/CRUD writer.
    if(state.mode !== 'cloud' || state.loading) return;
    clearTimeout(state.timer);
    state.queued = false;
    setSyncStatus('synced');
  }

  async function flush(db){
    // Kept for backward compatibility with callers/tests. It no longer writes the full tenant snapshot.
    if(state.mode !== 'cloud' || state.loading) return {skipped:true, reason:'not-cloud-or-loading'};
    state.saving = false;
    state.queued = false;
    clearTimeout(state.timer);
    setSyncStatus('synced');
    return {skipped:true, reason:'legacy-full-flush-disabled'};
  }

  window.ApotekKilatSupabaseData = {init, scheduleSave, flush, saveRemote, getMode:()=>state.mode, getPharmacyId:()=>state.pharmacyId, getMembership:()=>state.membership, getSyncStatus:()=>state.syncStatus, isLegacyFlushDisabled:()=>state.legacyFlushDisabled};
})();