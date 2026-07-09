/* Iterasi 2 — Reframe local chat log as manual follow-up notes.
   This feature is not WhatsApp integration. It stores customer follow-up notes locally. */
(function(){
  function isCloudMode(){
    return !!(window.ApotekKilatSupabaseData &&
      window.ApotekKilatSupabaseData.getMode &&
      window.ApotekKilatSupabaseData.getMode() === 'cloud');
  }

  function setFollowupNavLabel(){
    try{
      const item = Array.isArray(NAV) ? NAV.find(n => n[0] === 'chat') : null;
      if(item){
        item[1] = '☏';
        item[2] = 'Follow-up';
      }
    }catch(e){}
  }

  function seedFollowupNotes(){
    if(!DB || !Array.isArray(DB.conversations)) return;
    const looksLikeOldWhatsappDemo = DB.conversations.some(c =>
      String(c.name || '').includes('Rina Kartika') ||
      String(c.phone || '').includes('+62 812-3456-7890') ||
      (c.messages || []).some(m => String(m.text || '').includes('Pesanan obat saya kapan dikirim'))
    );
    if(!looksLikeOldWhatsappDemo) return;
    DB.conversations = [
      {
        id:'fu1',
        name:'Pelanggan Umum',
        phone:'-',
        status:'Perlu Follow-up',
        tone:'warn',
        messages:[
          {from:'in', text:'Catatan: pelanggan menanyakan ketersediaan obat dan perlu dihubungi ulang manual.', time:Date.now()-7200000},
          {from:'out', text:'Rencana follow-up: cek stok, lalu hubungi pelanggan melalui kanal resmi apotek.', time:Date.now()-6900000}
        ]
      },
      {
        id:'fu2',
        name:'Pasien Resep',
        phone:'-',
        status:'Tercatat',
        tone:'ok',
        messages:[
          {from:'in', text:'Catatan: resep sudah diverifikasi. Ingatkan pelanggan untuk pengambilan obat.', time:Date.now()-3600000}
        ]
      }
    ];
    localStorage.setItem(DB_KEY, JSON.stringify(DB));
  }

  function followupStatusTone(x){
    return x.tone || (x.status === 'Selesai' ? 'ok' : 'warn');
  }

  function followupPage(){
    seedFollowupNotes();
    const list = DB.conversations || [];
    const conv = list.find(c=>c.id===S.activeConversationId) || list[0];
    S.activeConversationId = conv ? conv.id : null;
    return `<section class="page active">
      <div class="head">
        <div>
          <h2>Riwayat Follow-up Pelanggan</h2>
          <p>Catatan manual untuk follow-up pelanggan. Ini bukan WhatsApp API dan tidak mengirim pesan otomatis.</p>
        </div>
        ${status('Catatan Lokal Manual','warn')}
      </div>
      <div class="card" style="margin-bottom:16px;border-style:dashed">
        <b>Bukan integrasi WhatsApp.</b>
        <p class="muted" style="margin:6px 0 0">Gunakan halaman ini untuk mencatat riwayat komunikasi, rencana follow-up, dan hasil kontak pelanggan. Pengiriman pesan tetap dilakukan dari WhatsApp/telepon resmi apotek di luar aplikasi.</p>
      </div>
      <div class="chatgrid">
        <div class="card">
          <div class="tools"><input class="flex" id="chatSearch" placeholder="Cari catatan follow-up..."/></div>
          ${list.length?list.map(x=>`<div class="conversation ${S.activeConversationId===x.id?'active':''}" data-select-chat="${x.id}"><b>${esc(x.name)}</b><br><small>${esc((x.messages && x.messages.length)?x.messages[x.messages.length-1].text:'(belum ada catatan)')}</small><span style="float:right">${status(x.status || 'Tercatat', followupStatusTone(x))}</span></div>`).join(''):'<p class="empty">Belum ada catatan follow-up.</p>'}
        </div>
        <div class="card">
          ${conv?`<div class="title"><span>${esc(conv.name)} ${status(conv.status || 'Tercatat', followupStatusTone(conv))}</span></div>
          <div id="messages">${(conv.messages||[]).map(m=>`<div class="bubble ${m.from==='out'?'out':''}">${esc(m.text)}</div>`).join('')}</div>
          <div class="tools" style="margin-top:16px"><input class="flex" id="chatInput" placeholder="Tulis catatan follow-up manual..."/><button class="primary" data-action="send-chat">Simpan Catatan</button></div>`:'<div class="empty">Pilih catatan follow-up.</div>'}
        </div>
        <aside class="side-right card">
          ${conv?`<div class="title"><span>Detail Follow-up</span></div>
          <h3>${esc(conv.name)}</h3>
          <p class="muted">Kontak rujukan<br><b style="color:var(--ink)">${esc(conv.phone || '-')}</b></p>
          <p class="muted" style="font-size:11px;margin-top:12px">Nomor ini hanya referensi manual. Aplikasi belum mengirim atau menerima pesan WhatsApp asli.</p>
          <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
          <b>Fitur Cloud berbayar potensial</b>
          <p class="muted" style="font-size:11px">Integrasi WhatsApp Business/API dapat dijadikan fitur paid tier ketika backend dan compliance sudah siap.</p>`:''}
        </aside>
      </div>
    </section>`;
  }

  const originalChat = typeof chat === 'function' ? chat : null;
  if(originalChat){
    chat = followupPage;
  }

  const originalSendChat = typeof sendChat === 'function' ? sendChat : null;
  if(originalSendChat){
    sendChat = function(){
      const input = document.querySelector('#chatInput');
      const text = input ? input.value.trim() : '';
      if(!text) return toast('Catatan follow-up masih kosong', 'err');
      const conv = (DB.conversations || []).find(c => c.id === S.activeConversationId);
      if(!conv) return toast('Pilih catatan follow-up dulu', 'err');
      conv.messages = conv.messages || [];
      conv.messages.push({from:'out', text, time:Date.now()});
      conv.status = 'Tercatat';
      conv.tone = 'ok';
      saveDB();
      render();
      toast('Catatan follow-up disimpan');
    };
  }

  const originalRender = typeof render === 'function' ? render : null;
  if(originalRender){
    render = function(){
      setFollowupNavLabel();
      return originalRender.apply(this, arguments);
    };
  }

  setTimeout(()=>{ setFollowupNavLabel(); seedFollowupNotes(); if(typeof nav === 'function') nav(); }, 0);
})();
