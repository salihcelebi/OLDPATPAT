(() => {
  if (typeof window === 'undefined' || document.body?.dataset?.page !== 'sidepanel') return;
  'use strict';

  const KEY_ROWS = 'patpat_complaints';
  const KEY_TEMPLATES = 'patpat_complaint_message_templates';
  const DEFAULT_TEMPLATES = Object.freeze({
    BEKLEMEDE: [
      'BİZDEN {SERVIS_ADI} HİZMETİNİ ALDINIZ. BAŞLANGIÇ: {BASLANGIC}, MİKTAR: {MIKTAR}.',
      'SİPARİŞ LİNKİ: {SIPARIS_LINKI}. TARİH: {TARIH}. DURUM: BEKLEMEDE.',
      'SİPARİŞİNİZ KUYRUKTA; İŞLEME ALININCA SİZE BİLGİ VERECEĞİZ.'
    ].join('\n'),
    'YÜKLENİYOR': [
      'BİZDEN {SERVIS_ADI} HİZMETİNİ ALDINIZ. BAŞLANGIÇ: {BASLANGIC}, MİKTAR: {MIKTAR}.',
      'SİPARİŞ LİNKİ: {SIPARIS_LINKI}. TARİH: {TARIH}. DURUM: YÜKLENİYOR.',
      'SİSTEM ŞU AN TESLİMATA DEVAM EDİYOR; KISA SÜRE İÇİNDE GÜNCELLENECEKTİR.'
    ].join('\n'),
    TAMAMLANDI: [
      'BİZDEN {SERVIS_ADI} HİZMETİNİ ALDINIZ. BAŞLANGIÇ: {BASLANGIC}, MİKTAR: {MIKTAR}.',
      'SİPARİŞ LİNKİ: {SIPARIS_LINKI}. TARİH: {TARIH}. DURUM: TAMAMLANMIŞ.',
      'BİZİM TARAFTA SİPARİŞ TAMAMLANMIŞ GÖRÜNÜYOR; KONTROL EDİP BİZE DÖNEBİLİRSİNİZ.'
    ].join('\n'),
    'KISMEN TAMAMLANDI': [
      'BİZDEN {SERVIS_ADI} HİZMETİNİ ALDINIZ. BAŞLANGIÇ: {BASLANGIC}, MİKTAR: {MIKTAR}.',
      'SİPARİŞ LİNKİ: {SIPARIS_LINKI}. TARİH: {TARIH}. DURUM: KISMEN TAMAMLANDI.',
      'TESLİMATIN BİR KISMI TAMAMLANDI; KALAN KISIM İŞLENMEYE DEVAM EDİYOR.'
    ].join('\n'),
    'İŞLEM SIRASINDA': [
      'BİZDEN {SERVIS_ADI} HİZMETİNİ ALDINIZ. BAŞLANGIÇ: {BASLANGIC}, MİKTAR: {MIKTAR}.',
      'SİPARİŞ LİNKİ: {SIPARIS_LINKI}. TARİH: {TARIH}. DURUM: İŞLEM SIRASINDA.',
      'SİPARİŞİNİZ ŞU AN AKTİF OLARAK İŞLENİYOR; TAMAMLANINCA OTOMATİK GÜNCELLENECEK.'
    ].join('\n'),
    'İPTAL EDİLDİ': [
      'BİZDEN {SERVIS_ADI} HİZMETİNİ ALDINIZ. BAŞLANGIÇ: {BASLANGIC}, MİKTAR: {MIKTAR}.',
      'SİPARİŞ LİNKİ: {SIPARIS_LINKI}. TARİH: {TARIH}. DURUM: İPTAL EDİLDİ.',
      'SİPARİŞ SİSTEMDE İPTAL GÖRÜNÜYOR; DETAY İÇİN LÜTFEN BİZE BİLGİ VERİNİZ.'
    ].join('\n')
  });

  const state = { rows: [], selectedId: '', stop: false, templates: { ...DEFAULT_TEMPLATES } };
  const ui = {};
  const byId = (id) => document.getElementById(id);
  const toast = (m) => window.__PatpatUI?.UI?.toast?.(m) || alert(m);

  const STATUS_BASE = 'https://hesap.com.tr/p/sattigim-ilanlar';
  const getLocal = async (k) => (await chrome.storage.local.get(k))[k];
  const setLocal = async (k, v) => chrome.storage.local.set({ [k]: v });

  async function saveRows() { await setLocal(KEY_ROWS, state.rows); }
  async function loadRows() {
    const rows = await getLocal(KEY_ROWS);
    state.rows = Array.isArray(rows) ? rows : [];
    if (!state.selectedId && state.rows[0]) state.selectedId = state.rows[0].id;
  }

  async function loadTemplates() {
    const saved = await getLocal(KEY_TEMPLATES);
    state.templates = { ...DEFAULT_TEMPLATES, ...(saved || {}) };
  }

  function appendFlowLog(line) {
    const ts = new Date().toLocaleTimeString('tr-TR');
    const logLine = `[${ts}] ${line}`;
    const pre = byId('complaintFlowLog');
    if (pre) {
      pre.textContent += `${pre.textContent ? '\n' : ''}${logLine}`;
      pre.scrollTop = pre.scrollHeight;
    }
    const c = pickSelected();
    if (c) {
      c.logs = c.logs || [];
      c.logs.push(logLine);
    }
  }

  function sanitizeServiceName(s) {
    return String(s || '').replace(/\b\d{4}\b/g, '').replace(/\s{2,}/g, ' ').trim();
  }

  function renderTable(list) {
    if (!ui.tbody) return;
    ui.tbody.innerHTML = list.map((r) => `
      <tr data-id="${r.id}">
        <td>${r.serviceName || '—'}</td><td>${r.orderNo || '—'}</td><td>${r.smmId || '—'}</td>
        <td>${r.dateText || '—'}</td><td>${r.problemText || '—'}</td>
        <td>${Number.isFinite(r.slaMinutes) ? `${r.slaMinutes} dk` : '—'}</td>
        <td>${r.priceText || '—'}</td><td>${r.status || '—'}</td>
        <td>${r.pageNo ?? '—'}</td><td>${r.cardIndex ?? '—'}</td>
      </tr>`).join('');
    ui.tableEmpty.hidden = list.length > 0;
    ui.tbody.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => {
      state.selectedId = tr.getAttribute('data-id') || '';
      render();
    }));
  }

  function renderDetail() {
    const c = pickSelected();
    if (!ui.detail) return;
    if (!c) return void (ui.detail.innerHTML = '<div class="empty">Detay için kayıt seç.</div>');
    ui.detail.innerHTML = `<div style="border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px">
      <div><b>Hizmet:</b> ${c.serviceName || '—'}</div>
      <div><b>Sipariş No:</b> ${c.orderNo || '—'} • <b>SMM ID:</b> ${c.smmId || '—'}</div>
      <div><b>Tarih:</b> ${c.dateText || '—'} • <b>Durum:</b> ${c.status || '—'}</div>
      <div><b>Şikayetçi:</b> ${c.customer || '—'}</div>
      <div><b>Mesaj URL:</b> <a href="${c.messageUrl || '#'}" target="_blank">${c.messageUrl || '—'}</a></div>
    </div>`;
  }

  function render() {
    const q = String(ui.search?.value || '').toLowerCase().trim();
    const list = state.rows.filter((r) => !q || [r.serviceName, r.orderNo, r.smmId, r.status, r.problemText].join(' ').toLowerCase().includes(q));
    if (ui.stats) ui.stats.textContent = `Kayıt: ${list.length} • SLA Risk: ${list.filter((x) => x.slaRisk).length}`;
    if (ui.list) {
      ui.list.innerHTML = list.map((r) => `<div class="item ${r.id === state.selectedId ? 'active' : ''}" data-id="${r.id}">${r.smmId || '—'} • #${r.orderNo || '—'} • ${r.status || '—'}</div>`).join('') || '<div class="empty">Şikayet kaydı yok.</div>';
      ui.list.querySelectorAll('[data-id]').forEach((el) => el.addEventListener('click', () => { state.selectedId = el.getAttribute('data-id') || ''; render(); }));
    }
    renderTable(list);
    renderDetail();
  }

  function pickSelected() { return state.rows.find((x) => x.id === state.selectedId); }

  async function getActiveTabId() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) throw new Error('Aktif sekme bulunamadı.');
    return tab.id;
  }

  async function verifyOnly() {
    const tabId = await getActiveTabId();
    await chrome.tabs.update(tabId, { url: STATUS_BASE });
    if (ui.actionHint) ui.actionHint.textContent = 'Oturum doğrulama başlatıldı.';
  }

  function buildMessageFromTemplate(orderData) {
    const statusRaw = String(orderData.status || '').trim().toUpperCase();
    const key = Object.keys(state.templates).find((k) => k.toUpperCase() === statusRaw) ||
      (statusRaw === 'TAMAMLANDI' ? 'TAMAMLANDI' : Object.keys(state.templates).find((k) => statusRaw.includes(k.toUpperCase()))) ||
      (statusRaw === 'BEKLEMEDE' ? 'BEKLEMEDE' : 'BEKLEMEDE');

    const normalizedStatus = statusRaw === 'TAMAMLANDI' ? 'TAMAMLANMIŞ' : orderData.status;
    appendFlowLog(`Durum doğrulandı: ${orderData.status} -> Mesaj durumu: ${normalizedStatus}`);

    return String(state.templates[key] || DEFAULT_TEMPLATES.BEKLEMEDE)
      .replaceAll('{SERVIS_ADI}', sanitizeServiceName(orderData.service))
      .replaceAll('{BASLANGIC}', String(orderData.start || '—'))
      .replaceAll('{MIKTAR}', String(orderData.amount || '—'))
      .replaceAll('{SIPARIS_LINKI}', String(orderData.orderLink || '—'))
      .replaceAll('{TARIH}', String(orderData.date || '—'))
      .replaceAll('{DURUM}', String(normalizedStatus || '—'));
  }

  async function detectReporterAndSmm(tabId, complaint) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [{ orderNo: complaint.orderNo, smmId: complaint.smmId }],
      func: (payload) => {
        const logs = [];
        const add = (selector, found, clicked, user) => logs.push({ selector, found, clicked, user: user || '' });
        const textOf = (n) => String(n?.textContent || '').replace(/\s+/g, ' ').trim();
        const clickSafe = (el) => {
          if (!el) return false;
          try { el.click(); return true; } catch { return false; }
        };

        const cards = Array.from(document.querySelectorAll('div.modern-order-card'));
        const card = cards.find((el) => {
          const t = textOf(el);
          return (payload.orderNo && t.includes(String(payload.orderNo))) || (payload.smmId && t.includes(String(payload.smmId)));
        }) || cards[0] || document.body;

        const product = card.querySelector('div.modern-order-product-name');
        add('div.modern-order-product-name', !!product, clickSafe(product), '');

        const tries = [
          () => card.querySelector('i.ri-user-line'),
          () => card.querySelector('a.modern-action-btn'),
          () => card.querySelector('span'),
          () => Array.from(card.querySelectorAll('button,a')).find((n) => /kullanıcı|kullanici|profil/i.test(textOf(n))),
          () => {
            const owner = Array.from(card.querySelectorAll('*')).find((n) => /sipariş sahibi|siparis sahibi/i.test(textOf(n)));
            return owner?.nextElementSibling || null;
          },
          () => card.querySelector('img[alt*="profil" i], .avatar, .profile-avatar'),
          () => Array.from(card.querySelectorAll('button,a')).find((n) => /detay|incele/i.test(textOf(n))),
          () => card.querySelector('[class*="customer" i], [class*="musteri" i], i.ri-user-3-line, i.ri-customer-service-line'),
          () => card.querySelector('.dropdown-menu a, .menu a, li a, li button'),
          () => card
        ];

        let user = '';
        let clickedAny = false;
        for (let cycle = 0; cycle < 2 && !user; cycle += 1) {
          for (let i = 0; i < tries.length; i += 1) {
            const node = tries[i]();
            const clicked = clickSafe(node);
            clickedAny = clickedAny || clicked;
            const userNode = card.querySelector('.user-name, .profile-name, [class*="user-name"], [class*="username"], .modern-order-user, a[href*="/u/"]');
            user = textOf(userNode);
            add(`STEP-${i + 1}`, !!node, clicked, user);
            if (user) break;
          }
        }

        const smmLinkNode = Array.from(card.querySelectorAll('a')).find((a) => /smm\s*id/i.test(textOf(a.parentElement || card)) || /orders\?search=/i.test(String(a.href || '')));
        const cardText = textOf(card);
        const smmRegex = cardText.match(/SMM\s*ID\s*:\s*(\d{5,9})/i);
        const smmId = smmRegex?.[1] || payload.smmId || '';

        return {
          ok: Boolean(user),
          user,
          logs,
          clickedAny,
          smmId,
          smmLink: smmLinkNode?.href || (smmId ? `https://anabayiniz.com/orders?search=${smmId}` : ''),
          cardScope: 'div.modern-order-card'
        };
      }
    });
    return result || { ok: false, logs: [], smmId: '', smmLink: '' };
  }

  async function captureFailureScreenshot(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      const c = pickSelected();
      if (c) c.failureScreenshot = dataUrl;
      appendFlowLog('Şikayetçi bulunamadı: ekran görüntüsü captureVisibleTab ile alındı.');
      return true;
    } catch {
      appendFlowLog('Şikayetçi bulunamadı: ekran görüntüsü bu ortamda alınamadı.');
      return false;
    }
  }

  async function fetchSmmOrderData(smmId, smmLink) {
    const finalSmmId = smmId || (String(smmLink || '').match(/search=(\d{5,9})/) || [,''])[1] || '';
    const url = smmLink || (finalSmmId ? `https://anabayiniz.com/orders?search=${finalSmmId}` : '');
    if (!url) throw new Error('SMM ID bulunamadı.');

    appendFlowLog(`SMM sayfası açılıyor: ${url}`);
    const tab = await chrome.tabs.create({ url, active: false });
    await new Promise((resolve) => {
      const done = (id, info) => {
        if (id === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(done);
          resolve(true);
        }
      };
      chrome.tabs.onUpdated.addListener(done);
    });

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [finalSmmId],
      func: (id) => {
        const t = document.querySelector('table');
        if (!t) return { ok: false, error: 'Tablo bulunamadı.' };

        const rows = Array.from(t.querySelectorAll('tbody tr')).map((tr) => {
          const td = Array.from(tr.querySelectorAll('td')).map((x) => String(x.innerText || '').trim());
          const orderA = tr.querySelector('a[href*="order"],a[href*="siparis"],a[href*="orders"]');
          return {
            id: td[0] || '',
            date: td[1] || '',
            orderLink: orderA?.href || td[2] || '',
            price: td[3] || '',
            start: td[4] || '',
            amount: td[5] || '',
            service: td[6] || '',
            status: td[7] || '',
            remaining: td[8] || ''
          };
        });

        const row = rows.find((r) => String(r.id) === String(id)) || rows.find((r) => String(r.orderLink).includes(String(id))) || rows[0];
        if (!row) return { ok: false, error: 'Eşleşen satır yok.' };
        return { ok: true, row, pathOk: /\/orders\?search=\d{5,9}/.test(location.pathname + location.search), currentUrl: location.href };
      }
    });

    await chrome.tabs.remove(tab.id);
    if (!result?.ok) throw new Error(result?.error || 'SMM tablosu okunamadı.');
    appendFlowLog(`SMM URL doğrulandı: ${result.pathOk ? 'EVET' : 'HAYIR'} (${result.currentUrl})`);
    return result.row;
  }

  async function sendMessageToReporter(tabId, message) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [message],
      func: (msg) => {
        const logs = [];
        const clickSafe = (el) => { try { el?.click(); return !!el; } catch { return false; } };
        const txt = (n) => String(n?.textContent || '').replace(/\s+/g, ' ').trim();

        const primary = document.querySelector('a.btn-profile.green');
        const primaryClicked = clickSafe(primary);
        logs.push({ selector: 'a.btn-profile.green', found: !!primary, clicked: primaryClicked });

        const regexes = [
          /İLETİŞİME\s*GEÇ/i,
          /ILETISIME\s*GEC/i,
          /(MESAJ|CHAT|DM)\s*(GÖNDER|GONDER)/i,
          /(CONTACT|MESSAGE)\s*(ME|SEND)/i
        ];
        if (!primaryClicked) {
          const clickable = Array.from(document.querySelectorAll('a,button')).find((el) => regexes.some((rx) => rx.test(txt(el))));
          logs.push({ selector: 'regex iletişime geç', found: !!clickable, clicked: clickSafe(clickable) });
        }

        const msgItem = Array.from(document.querySelectorAll('a.dropdown-item,button.dropdown-item,a,button')).find((el) => /mesaj\s*gönder|mesaj/i.test(txt(el)));
        logs.push({ selector: 'a.dropdown-item (MESAJ)', found: !!msgItem, clicked: clickSafe(msgItem) });

        const input = document.querySelector('input.form-control.messagehere, .chat-input-field#message, textarea.form-control.messagehere, textarea#message');
        const sendBtn = Array.from(document.querySelectorAll('button,a')).find((el) => /gönder|gonder|send/i.test(txt(el)));
        if (input) {
          input.focus();
          input.value = msg;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const sent = clickSafe(sendBtn);
        logs.push({ selector: 'message input + send', found: !!input && !!sendBtn, clicked: sent });

        return { ok: Boolean(sent), logs };
      }
    });
    return result || { ok: false, logs: [] };
  }

  async function findReporterAndSend() {
    const c = pickSelected();
    if (!c) return toast('Önce kayıt seç.');

    const tabId = await getActiveTabId();
    byId('complaintFlowLog').textContent = '';
    appendFlowLog('Şikayetçiyi bul akışı başlatıldı. Sadece seçili kart alanı taranıyor.');

    const detect = await detectReporterAndSmm(tabId, c);
    detect.logs.forEach((x) => appendFlowLog(`SELECTOR=${x.selector} | BULUNDU=${x.found ? 'EVET' : 'HAYIR'} | TIKLANDI=${x.clicked ? 'EVET' : 'HAYIR'} | KULLANICI=${x.user || '—'}`));

    if (!detect.ok) {
      appendFlowLog('ŞİKAYETÇİ BULUNAMADI');
      await captureFailureScreenshot(tabId);
      c.lastError = 'ŞİKAYETÇİ BULUNAMADI';
      await saveRows();
      render();
      return;
    }

    c.customer = detect.user;
    appendFlowLog(`ŞİKAYETÇİ TESPİT EDİLDİ: ${detect.user}`);

    const smmId = detect.smmId || c.smmId;
    const smmLink = detect.smmLink || `https://anabayiniz.com/orders?search=${smmId}`;
    appendFlowLog(`SMM adımı: id=${smmId || '—'} link=${smmLink || '—'}`);

    const row = await fetchSmmOrderData(smmId, smmLink);
    const orderData = {
      service: sanitizeServiceName(row.service),
      start: row.start,
      amount: row.amount,
      date: row.date,
      orderLink: row.orderLink,
      status: row.status
    };

    appendFlowLog(`Tablo satırı okundu: ID=${row.id}, TARİH=${row.date}, DURUM=${row.status}`);

    const message = buildMessageFromTemplate(orderData)
      .replace(/\b\d{4}\b/g, '')
      .replace(/\n{3,}/g, '\n\n');

    c.messageUrl = c.messageUrl || (detect.user ? `https://hesap.com.tr/p/mesaj/${detect.user}` : '');
    ui.draft.value = message;

    const sent = await sendMessageToReporter(tabId, message);
    sent.logs.forEach((x) => appendFlowLog(`MESAJ-ADIM=${x.selector} | BULUNDU=${x.found ? 'EVET' : 'HAYIR'} | TIKLANDI=${x.clicked ? 'EVET' : 'HAYIR'}`));

    if (sent.ok) {
      appendFlowLog('Mesaj gönderildi ✅');
      if (ui.actionHint) ui.actionHint.textContent = 'Şikayetçi bulundu ve mesaj gönderildi.';
    } else {
      appendFlowLog('Mesaj gönderilemedi ⚠️');
      if (ui.actionHint) ui.actionHint.textContent = 'Şikayetçi bulundu ama mesaj gönderimi başarısız.';
    }

    await saveRows();
    render();
  }

  function draftReply() {
    const c = pickSelected();
    if (!c) return toast('Önce kayıt seç.');
    const status = String(c.status || 'BEKLEMEDE').toUpperCase();
    const tKey = Object.keys(state.templates).find((k) => status.includes(k.toUpperCase())) || 'BEKLEMEDE';
    const msg = String(state.templates[tKey] || DEFAULT_TEMPLATES.BEKLEMEDE)
      .replaceAll('{SERVIS_ADI}', sanitizeServiceName(c.serviceName || 'HİZMET'))
      .replaceAll('{BASLANGIC}', '—')
      .replaceAll('{MIKTAR}', '—')
      .replaceAll('{SIPARIS_LINKI}', c.orderUrl || '—')
      .replaceAll('{TARIH}', c.dateText || '—')
      .replaceAll('{DURUM}', status === 'TAMAMLANDI' ? 'TAMAMLANMIŞ' : status);
    ui.draft.value = msg;
    ui.actionHint.textContent = 'Şablon taslak uygulandı.';
  }

  function solutionSuggest() {
    const c = pickSelected();
    if (!c) return toast('Önce kayıt seç.');
    toast(c.slaRisk ? 'SLA riski var: önce şikayetçiyi bul, ardından hızlı bilgilendirme gönder.' : 'Önce şikayetçi tespiti akışını çalıştır.');
  }

  async function escalate() {
    const c = pickSelected();
    if (!c) return toast('Önce kayıt seç.');
    c.status = 'ESKALE EDİLDİ';
    await saveRows();
    render();
  }

  async function closeComplaint() {
    const c = pickSelected();
    if (!c) return toast('Önce kayıt seç.');
    c.status = 'KAPALI';
    await saveRows();
    render();
  }

  async function copyDraft() {
    try { await navigator.clipboard.writeText(ui.draft?.value || ''); toast('Taslak kopyalandı.'); }
    catch { toast('Panoya kopyalanamadı.'); }
  }

  function openMessagePage() {
    const c = pickSelected();
    if (!c?.messageUrl) return toast('Mesaj URL yok.');
    chrome.tabs.create({ url: c.messageUrl });
  }

  async function toggleFullscreen() {
    const el = byId('complaintRoot') || document.documentElement;
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.();
      ui.fullBtn.textContent = 'Tam Ekrandan Çık';
    } else {
      await document.exitFullscreen?.();
      ui.fullBtn.textContent = 'Tam Ekran';
    }
  }

  function bind() {
    ui.search = byId('inpComplaintSearch');
    ui.stats = byId('complaintStats');
    ui.list = byId('complaintsList');
    ui.detail = byId('complaintDetail');
    ui.draft = byId('complaintDraftText');
    ui.actionHint = byId('complaintActionHint');
    ui.tbody = byId('tblComplaintBody');
    ui.tableEmpty = byId('complaintTableEmpty');
    ui.fullBtn = byId('btnComplaintFullscreen');

    byId('btnComplaintVerify')?.addEventListener('click', verifyOnly);
    byId('btnComplaintScan')?.addEventListener('click', () => toast('Tarama mevcut akışla çalışır; seçili kayıt üzerinden otomasyon butonunu kullanın.'));
    byId('btnComplaintStop')?.addEventListener('click', () => { state.stop = true; toast('Durdurma isteği alındı.'); });
    byId('btnComplaintDraft')?.addEventListener('click', draftReply);
    byId('btnComplaintSolution')?.addEventListener('click', solutionSuggest);
    byId('btnComplaintEscalate')?.addEventListener('click', escalate);
    byId('btnComplaintClose')?.addEventListener('click', closeComplaint);
    byId('btnComplaintCopyDraft')?.addEventListener('click', copyDraft);
    byId('btnComplaintOpenMessage')?.addEventListener('click', openMessagePage);
    byId('btnComplaintFullscreen')?.addEventListener('click', toggleFullscreen);
    byId('btnComplaintFindReporter')?.addEventListener('click', findReporterAndSend);

    byId('btnOpenTemplateSettings')?.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('ayarlar.html') }));
    ui.search?.addEventListener('input', render);
  }

  (async () => {
    bind();
    await loadTemplates();
    await loadRows();
    render();
  })();
})();
