(function(){
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const state = {client:null, session:null, pharmacyId:null, membership:null, mode:'demo', loading:false, saving:false, queued:false, timer:null};

  const arr = v => Array.isArray(v) ? v : [];
  const n = v => Number(v) || 0;
  const isoDate = v => v ? new Date(v).toISOString().slice(0,10) : null;
  const ts = v => v ? new Date(v).toISOString() : null;
  const ms = v => v ? new Date(v).getTime() : Date.now();
  const uuid = () => crypto.randomUUID();
  const isUuid = id => UUID_RE.test(String(id || ''));

  function emit(message, kind){
    if(typeof toast === 'function') toast(message, kind);
  }

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
      emit('Mode demo aktif. Data tetap tersimpan di browser.', 'warn');
      return null;
    }

    state.mode = 'cloud';
    state.membership = memberships[0];
    state.pharmacyId = memberships[0].pharmacy_id;
    try{
      state.loading = true;
      const remote = await loadRemote(fallbackDb);
      state.loading = false;
      emit('Data Supabase tersambung');
      return remote;
    }catch(err){
      state.loading = false;
      state.mode = 'demo';
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
          code:u.code,label:u.label,factorToBase:n(u.factor_to_base)||1,price:n(u.price),cost:n(u.cost),basePrice:u.base_price==null?undefined:n(u.base_price),isBase:!!u.is_base
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
    arr(db.products).forEach(p=>{p.supplierId=rep(p.supplierId,'suppliers');});
    arr(db.transactions).forEach(t=>{t.customerId=rep(t.customerId,'customers');t.branchId=rep(t.branchId,'branches');t.prescriptionId=rep(t.prescriptionId,'prescriptions');arr(t.items).forEach(i=>{i.productId=rep(i.productId,'products');i.priceListId=rep(i.priceListId,'priceLists');});});
    arr(db.prescriptions).forEach(r=>{r.customerId=rep(r.customerId,'customers');arr(r.items).forEach(i=>{i.productId=rep(i.productId,'products');});});
    arr(db.purchaseOrders).forEach(p=>{p.supplierId=rep(p.supplierId,'suppliers');arr(p.items).forEach(i=>{i.productId=rep(i.productId,'products');});});
    arr(db.conversations).forEach(c=>{c.customerId=rep(c.customerId,'customers');});
    arr(db.stockOpnames).forEach(s=>arr(s.items).forEach(i=>{i.productId=rep(i.productId,'products');}));
    arr(db.purchaseReturns).forEach(r=>{r.poId=rep(r.poId,'purchaseOrders');r.supplierId=rep(r.supplierId,'suppliers');arr(r.items).forEach(i=>{i.productId=rep(i.productId,'products');});});
    arr(db.salesReturns).forEach(r=>{r.transactionId=rep(r.transactionId,'transactions');r.customerId=rep(r.customerId,'customers');arr(r.items).forEach(i=>{i.productId=rep(i.productId,'products');});});
    arr(db.payables).forEach(p=>{p.supplierId=rep(p.supplierId,'suppliers');p.poId=rep(p.poId,'purchaseOrders');arr(p.payments).forEach(x=>{if(!isUuid(x.id))x.id=uuid();});});
    arr(db.receivables).forEach(r=>{r.customerId=rep(r.customerId,'customers');r.transactionId=rep(r.transactionId,'transactions');arr(r.payments).forEach(x=>{if(!isUuid(x.id))x.id=uuid();});});
    arr(db.priceLists).forEach(pl=>{pl.customerIds=arr(pl.customerIds).map(id=>rep(id,'customers'));arr(pl.rules).forEach(r=>{r.productId=rep(r.productId,'products');});});
  }

  async function replaceTable(table, rows){
    const del = await state.client.from(table).delete().eq('pharmacy_id', state.pharmacyId);
    if(del.error) throw del.error;
    if(rows.length){
      const ins = await state.client.from(table).insert(rows);
      if(ins.error) throw ins.error;
    }
  }

  async function upsertSettings(db){
    const settings = db.settings || {};
    await state.client.from('pharmacies').update({
      name: settings.pharmacyName || 'Apotek Sehat',
      address: settings.address || null,
      whatsapp: settings.whatsapp || null
    }).eq('id', state.pharmacyId);
    const payload = {
      pharmacy_id: state.pharmacyId,
      notif_low_stock: settings.notifLowStock !== false,
      notif_expiry: settings.notifExpiry !== false,
      notif_daily_summary: !!settings.notifDailySummary,
      knowledge_snapshot: settings.knowledgeSnapshot || {}
    };
    const {error} = await state.client.from('pharmacy_settings').upsert(payload, {onConflict:'pharmacy_id'});
    if(error) throw error;
  }

  async function saveRemote(db){
    if(state.mode !== 'cloud' || state.loading || !state.pharmacyId) return;
    normalizeIds(db);
    localStorage.setItem('apotekkilat_db_v1', JSON.stringify(db));
    await upsertSettings(db);
    const pid = state.pharmacyId;
    const rows = buildRows(db, pid);
    const deleteOrder = [
      'price_list_rules','price_list_customers','journal_entry_lines','journal_entries','accounts_receivable_payments','accounts_receivable','accounts_payable_payments','accounts_payable',
      'sales_return_items','sales_returns','purchase_return_items','purchase_returns','stock_opname_items','stock_opnames','conversation_messages','conversations',
      'purchase_order_items','purchase_orders','prescription_items','prescriptions','transaction_items','transactions','product_batches','product_uoms','products','customers','suppliers','branches','chart_of_accounts','price_lists'
    ];
    const insertOrder = [
      'branches','suppliers','customers','products','product_uoms','product_batches','prescriptions','prescription_items','transactions','transaction_items',
      'purchase_orders','purchase_order_items','conversations','conversation_messages','stock_opnames','stock_opname_items','purchase_returns','purchase_return_items',
      'sales_returns','sales_return_items','accounts_payable','accounts_payable_payments','accounts_receivable','accounts_receivable_payments','chart_of_accounts',
      'journal_entries','journal_entry_lines','price_lists','price_list_customers','price_list_rules'
    ];
    for(const t of deleteOrder) await state.client.from(t).delete().eq('pharmacy_id', pid);
    for(const t of insertOrder) if(rows[t] && rows[t].length) {
      const {error} = await state.client.from(t).insert(rows[t]);
      if(error) throw error;
    }
  }

  function buildRows(db, pid){
    const rows = {};
    rows.branches = arr(db.branches).map(b=>({id:b.id,pharmacy_id:pid,name:b.name,address:b.address||null,is_main:!!b.isMain}));
    rows.suppliers = arr(db.suppliers).map(s=>({id:s.id,pharmacy_id:pid,name:s.name,contact:s.contact||null,phone:s.phone||null,email:s.email||null,address:s.address||null,payment_term:s.paymentTerm||null,status:s.status||'Aktif'}));
    rows.customers = arr(db.customers).map(c=>({id:c.id,pharmacy_id:pid,name:c.name,phone:c.phone||null,points:n(c.points),status:c.status||'Aktif',payment_term:c.paymentTerm||null}));
    rows.products = arr(db.products).map(p=>({id:p.id,pharmacy_id:pid,supplier_id:isUuid(p.supplierId)?p.supplierId:null,name:p.name,type:p.type||null,category:p.cat||null,price:n(p.price),cost:n(p.cost),stock:n(p.stock),reorder_point:n(p.reorder),base_unit:p.baseUnit||'UNIT',purchase_unit:p.purchaseUnit||null,sale_unit:p.saleUnit||null,default_batch_no:p.batch||null,default_expired_at:p.expired||null,drug_class:p.golongan||'Bebas'}));
    rows.product_uoms = arr(db.products).flatMap(p=>arr(p.units).map((u,i)=>({id:isUuid(u.id)?u.id:uuid(),pharmacy_id:pid,product_id:p.id,code:u.code||p.baseUnit||'UNIT',label:u.label||u.code||'Unit',factor_to_base:n(u.factorToBase)||1,price:u.price==null?null:n(u.price),cost:u.cost==null?null:n(u.cost),base_price:u.basePrice==null?null:n(u.basePrice),is_base:!!u.isBase,sort_order:i})));
    rows.product_batches = arr(db.products).flatMap(p=>arr(p.batches).map(b=>({id:isUuid(b.id)?b.id:uuid(),pharmacy_id:pid,product_id:p.id,batch_no:b.batchNo||('BATCH-'+Date.now()),received_at:b.received||null,expired_at:b.expired||null,qty:n(b.qty),location:b.location||null})));
    rows.transactions = arr(db.transactions).map(t=>({id:t.id,pharmacy_id:pid,branch_id:isUuid(t.branchId)?t.branchId:null,customer_id:isUuid(t.customerId)?t.customerId:null,code:t.code,subtotal:n(t.subtotal),tax:n(t.tax),total:n(t.total),payment_method:t.payment||'Tunai',status:t.status||'Selesai',happened_at:ts(t.time),prescription_id:isUuid(t.prescriptionId)?t.prescriptionId:null,price_list_ids:arr(t.priceListIds).filter(isUuid)}));
    rows.transaction_items = arr(db.transactions).flatMap(t=>arr(t.items).map(i=>({id:isUuid(i.id)?i.id:uuid(),pharmacy_id:pid,transaction_id:t.id,product_id:isUuid(i.productId)?i.productId:null,product_name:i.name||'Produk',unit_code:i.unitCode||null,qty:n(i.qty),base_qty:i.baseQty==null?null:n(i.baseQty),price:n(i.price),cost_base:i.costBase==null?null:n(i.costBase),original_price:i.originalPrice==null?null:n(i.originalPrice),discount_amount:n(i.discountAmount),price_list_id:isUuid(i.priceListId)?i.priceListId:null,price_list_name:i.priceListName||null,drug_class:i.golongan||null})));
    rows.prescriptions = arr(db.prescriptions).map(r=>({id:r.id,pharmacy_id:pid,customer_id:isUuid(r.customerId)?r.customerId:null,patient_name:r.patient,gender:r.gender||null,age:r.age||null,phone:r.phone||null,doctor:r.doctor||null,status:r.status||'Menunggu Verifikasi',note:r.note||null,received_at:ts(r.time)}));
    rows.prescription_items = arr(db.prescriptions).flatMap(r=>arr(r.items).map(i=>({id:isUuid(i.id)?i.id:uuid(),pharmacy_id:pid,prescription_id:r.id,product_id:isUuid(i.productId)?i.productId:null,medicine_name:i.name||'Obat',qty:n(i.qty)||1,sig:i.sig||null})));
    rows.purchase_orders = arr(db.purchaseOrders).map(p=>({id:p.id,pharmacy_id:pid,supplier_id:isUuid(p.supplierId)?p.supplierId:null,code:p.code,supplier_name:p.supplier||null,note:p.note||null,value:n(p.value),status:p.status||'Draft',source_po_code:p.sourcePO||null,rejection_reason:p.rejectionReason||null,ordered_at:ts(p.date),submitted_at:ts(p.submittedAt),approved_at:ts(p.approvedAt),shipped_at:ts(p.shippedAt),received_at:ts(p.receivedAt),rejected_at:ts(p.rejectedAt)}));
    rows.purchase_order_items = arr(db.purchaseOrders).flatMap(p=>arr(p.items).map(i=>({id:isUuid(i.id)?i.id:uuid(),pharmacy_id:pid,purchase_order_id:p.id,product_id:isUuid(i.productId)?i.productId:null,qty:n(i.qty),display_qty:i.displayQty==null?null:n(i.displayQty),unit_code:i.unitCode||null,unit_label:i.unitLabel||null,cost:n(i.cost),expired_at:i.expired||null})));
    rows.conversations = arr(db.conversations).map(c=>({id:c.id,pharmacy_id:pid,customer_id:isUuid(c.customerId)?c.customerId:null,name:c.name,phone:c.phone||null,status:c.status||'Aktif',tone:c.tone||'ok'}));
    rows.conversation_messages = arr(db.conversations).flatMap(c=>arr(c.messages).map(m=>({id:isUuid(m.id)?m.id:uuid(),pharmacy_id:pid,conversation_id:c.id,direction:m.from||'in',message:m.text||'',sent_at:ts(m.time)})));
    rows.stock_opnames = arr(db.stockOpnames).map(s=>({id:s.id,pharmacy_id:pid,code:s.code,category:s.category||null,note:s.note||null,status:s.status||'Draft',counted_at:ts(s.date)}));
    rows.stock_opname_items = arr(db.stockOpnames).flatMap(s=>arr(s.items).map(i=>({id:isUuid(i.id)?i.id:uuid(),pharmacy_id:pid,stock_opname_id:s.id,product_id:isUuid(i.productId)?i.productId:null,system_qty:n(i.systemQty),physical_qty:n(i.physicalQty),diff_qty:n(i.diff),reason:i.reason||null})));
    rows.purchase_returns = arr(db.purchaseReturns).map(r=>({id:r.id,pharmacy_id:pid,purchase_order_id:isUuid(r.poId)?r.poId:null,supplier_id:isUuid(r.supplierId)?r.supplierId:null,code:r.code,value:n(r.value),status:r.status||'Draft',returned_at:ts(r.date),note:r.note||null,rejection_reason:r.rejectionReason||null,submitted_at:ts(r.submittedAt),approved_at:ts(r.approvedAt),rejected_at:ts(r.rejectedAt),completed_at:ts(r.completedAt)}));
    rows.purchase_return_items = arr(db.purchaseReturns).flatMap(r=>arr(r.items).map(i=>({id:isUuid(i.id)?i.id:uuid(),pharmacy_id:pid,purchase_return_id:r.id,product_id:isUuid(i.productId)?i.productId:null,qty:n(i.qty),base_qty:i.baseQty==null?null:n(i.baseQty),display_qty:i.displayQty==null?null:n(i.displayQty),unit_code:i.unitCode||null,unit_label:i.unitLabel||null,cost:n(i.cost),reason:i.reason||null})));
    rows.sales_returns = arr(db.salesReturns).map(r=>({id:r.id,pharmacy_id:pid,transaction_id:isUuid(r.transactionId)?r.transactionId:null,customer_id:isUuid(r.customerId)?r.customerId:null,code:r.code,value:n(r.value),status:r.status||'Draft',returned_at:ts(r.date),refund_method:r.refundMethod||null,note:r.note||null,rejection_reason:r.rejectionReason||null,submitted_at:ts(r.submittedAt),approved_at:ts(r.approvedAt),rejected_at:ts(r.rejectedAt),completed_at:ts(r.completedAt)}));
    rows.sales_return_items = arr(db.salesReturns).flatMap(r=>arr(r.items).map(i=>({id:isUuid(i.id)?i.id:uuid(),pharmacy_id:pid,sales_return_id:r.id,product_id:isUuid(i.productId)?i.productId:null,qty:n(i.qty),base_qty:i.baseQty==null?null:n(i.baseQty),display_qty:i.displayQty==null?null:n(i.displayQty),unit_code:i.unitCode||null,unit_label:i.unitLabel||null,price:n(i.price),reason:i.reason||null})));
    rows.accounts_payable = arr(db.payables).map(p=>({id:p.id,pharmacy_id:pid,supplier_id:isUuid(p.supplierId)?p.supplierId:null,purchase_order_id:isUuid(p.poId)?p.poId:null,amount:n(p.amount),adjusted_amount:p.adjustedAmount==null?null:n(p.adjustedAmount),paid_amount:n(p.paidAmount),due_date:p.dueDate||null,status:p.status||'Belum Lunas'}));
    rows.accounts_payable_payments = arr(db.payables).flatMap(p=>arr(p.payments).map(x=>({id:x.id,pharmacy_id:pid,payable_id:p.id,paid_at:ts(x.date),amount:n(x.amount),method:x.method||'Transfer Bank'})));
    rows.accounts_receivable = arr(db.receivables).map(r=>({id:r.id,pharmacy_id:pid,customer_id:isUuid(r.customerId)?r.customerId:null,transaction_id:isUuid(r.transactionId)?r.transactionId:null,amount:n(r.amount),paid_amount:n(r.paidAmount),due_date:r.dueDate||null,status:r.status||'Belum Lunas'}));
    rows.accounts_receivable_payments = arr(db.receivables).flatMap(r=>arr(r.payments).map(x=>({id:x.id,pharmacy_id:pid,receivable_id:r.id,paid_at:ts(x.date),amount:n(x.amount),method:x.method||'Transfer Bank'})));
    rows.chart_of_accounts = arr(db.chartOfAccounts).map(a=>({id:isUuid(a.id)?a.id:uuid(),pharmacy_id:pid,code:a.code,name:a.name,class:a.class||'Lainnya'}));
    rows.journal_entries = arr(db.journal).map(j=>({id:j.id,pharmacy_id:pid,source_type:j.sourceType||null,source_id:j.sourceId||null,note:j.note||null,posted_at:ts(j.date)}));
    rows.journal_entry_lines = arr(db.journal).flatMap(j=>arr(j.entries).map(e=>({id:isUuid(e.id)?e.id:uuid(),pharmacy_id:pid,journal_entry_id:j.id,account_code:e.account,debit:n(e.debit),credit:n(e.credit)})));
    rows.price_lists = arr(db.priceLists).map(pl=>({id:pl.id,pharmacy_id:pid,name:pl.name,type:pl.type,status:pl.status||'Aktif',start_date:pl.dateRange&&pl.dateRange.start?pl.dateRange.start:null,end_date:pl.dateRange&&pl.dateRange.end?pl.dateRange.end:null}));
    rows.price_list_customers = arr(db.priceLists).flatMap(pl=>arr(pl.customerIds).filter(isUuid).map(customerId=>({id:uuid(),pharmacy_id:pid,price_list_id:pl.id,customer_id:customerId})));
    rows.price_list_rules = arr(db.priceLists).flatMap(pl=>arr(pl.rules).map(r=>({id:isUuid(r.id)?r.id:uuid(),pharmacy_id:pid,price_list_id:pl.id,product_id:isUuid(r.productId)?r.productId:null,discount_percent:r.discountPercent==null?null:n(r.discountPercent),fixed_price:r.fixedPrice==null?null:n(r.fixedPrice)})).filter(r=>r.product_id));
    return rows;
  }

  function scheduleSave(db){
    if(state.mode !== 'cloud' || state.loading) return;
    clearTimeout(state.timer);
    state.timer = setTimeout(()=>flush(db), 1200);
  }

  async function flush(db){
    if(state.saving){ state.queued = true; return; }
    state.saving = true;
    try{
      await saveRemote(db);
      state.saving = false;
      if(state.queued){ state.queued = false; scheduleSave(db); }
    }catch(err){
      state.saving = false;
      console.error('Gagal sync Supabase:', err);
      emit('Data tersimpan lokal, tapi sync Supabase gagal.', 'err');
    }
  }

  return {init, scheduleSave, flush, getMode:()=>state.mode, getPharmacyId:()=>state.pharmacyId};
})();
