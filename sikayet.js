(() => {
  if (typeof window === 'undefined' || document.body?.dataset?.page !== 'sidepanel') return;
  'use strict';

  const KEY_ROWS = 'patpat_complaints';
  const KEY_RULES = 'ASSISTANT_RULES_V1';
  const KEY_TEMPLATES = 'TEMPLATES_V1';
  const KEY_SELECTED = 'selectedComplaintId';
  const LEGACY_TEMPLATES_KEY = 'patpat_complaint_message_templates';

  const DEFAULT_RULES = [
    'Tüm mesajları müşteri mesajı olarak değerlendir.',
    'Çıktı tek parça metin olmalı; JSON/madde/başlık üretme.',
    'Fiyat bilgisi asla yazma.',
    'Servis adındaki 4 haneli ID veya #### — prefix gösterme.',
    'Eksik veri varsa tek soru ile tamamla.',
    'Üslup saygılı olmalı, aşırı emoji/argo kullanma.',
    'Müşteri kral/kanka derse hafif samimi yanıt ver.'
  ].join('\n');

  const DEFAULT_TEMPLATES = Object.freeze({
    BEKLEMEDE: 'BİZDEN {SERVIS_ADI} HİZMETİNİ ALDINIZ. BAŞLANGIÇ: {BASLANGIC}, MİKTAR: {MIKTAR}.\nSİPARİŞ LİNKİ: {SIPARIS_LINKI}. TARİH: {TARIH}. DURUM: BEKLEMEDE.\nSİPARİŞİNİZ KUYRUKTA; İŞLEME ALININCA SİZE BİLGİ VERECEĞİZ.',
    'YÜKLENİYOR': 'BİZDEN {SERVIS_ADI} HİZMETİNİ ALDINIZ. BAŞLANGIÇ: {BASLANGIC}, MİKTAR: {MIKTAR}.\nSİPARİŞ LİNKİ: {SIPARIS_LINKI}. TARİH: {TARIH}. DURUM: YÜKLENİYOR.\nSİSTEM ŞU AN TESLİMATA DEVAM EDİYOR; KISA SÜRE İÇİNDE GÜNCELLENECEKTİR.',
    TAMAMLANDI: 'BİZDEN {SERVIS_ADI} HİZMETİNİ ALDINIZ. BAŞLANGIÇ: {BASLANGIC}, MİKTAR: {MIKTAR}.\nSİPARİŞ LİNKİ: {SIPARIS_LINKI}. TARİH: {TARIH}. DURUM: TAMAMLANMIŞ.\nBİZİM TARAFTA SİPARİŞ TAMAMLANMIŞ GÖRÜNÜYOR; KONTROL EDİP BİZE DÖNEBİLİRSİNİZ.',
    'KISMEN TAMAMLANDI': 'BİZDEN {SERVIS_ADI} HİZMETİNİ ALDINIZ. BAŞLANGIÇ: {BASLANGIC}, MİKTAR: {MIKTAR}.\nSİPARİŞ LİNKİ: {SIPARIS_LINKI}. TARİH: {TARIH}. DURUM: KISMEN TAMAMLANDI.\nTESLİMATIN BİR KISMI TAMAMLANDI; KALAN KISIM İŞLENMEYE DEVAM EDİYOR.',
    'İŞLEM SIRASINDA': 'BİZDEN {SERVIS_ADI} HİZMETİNİ ALDINIZ. BAŞLANGIÇ: {BASLANGIC}, MİKTAR: {MIKTAR}.\nSİPARİŞ LİNKİ: {SIPARIS_LINKI}. TARİH: {TARIH}. DURUM: İŞLEM SIRASINDA.\nSİPARİŞİNİZ ŞU AN AKTİF OLARAK İŞLENİYOR; TAMAMLANINCA OTOMATİK GÜNCELLENECEK.',
    'İPTAL EDİLDİ': 'BİZDEN {SERVIS_ADI} HİZMETİNİ ALDINIZ. BAŞLANGIÇ: {BASLANGIC}, MİKTAR: {MIKTAR}.\nSİPARİŞ LİNKİ: {SIPARIS_LINKI}. TARİH: {TARIH}. DURUM: İPTAL EDİLDİ.\nSİPARİŞ SİSTEMDE İPTAL GÖRÜNÜYOR; DETAY İÇİN LÜTFEN BİZE BİLGİ VERİNİZ.'
  });

  const state = { rows: [], selectedId: '', selectedIds: new Set(), templates: { ...DEFAULT_TEMPLATES }, rules: DEFAULT_RULES, stopScan: false };
  const ui = {};
  const byId = (id) => document.getElementById(id);
  const toast = (m) => window.__PatpatUI?.UI?.toast?.(m) || alert(m);
  const getLocal = async (k) => (await chrome.storage.local.get(k))[k];
  const setLocal = async (k, v) => chrome.storage.local.set({ [k]: v });

  const pickSelected = () => state.rows.find((x) => x.id === state.selectedId);

  function logFlow(line) {
    const pre = byId('complaintFlowLog');
    const stamp = `[${new Date().toLocaleTimeString('tr-TR')}] ${line}`;
    if (pre) {
      pre.textContent += `${pre.textContent ? '\n' : ''}${stamp}`;
      pre.scrollTop = pre.scrollHeight;
    }
    const row = pickSelected();
    if (row) {
      row.logs = row.logs || [];
      row.logs.push(stamp);
    }
  }

  function sanitizeServiceName(s) {
    return String(s || '').replace(/^\s*\d{4}\s*[—-]\s*/u, '').replace(/\b\d{4}\b/g, '').replace(/\s{2,}/g, ' ').trim();
  }

  async function loadPersistedState() {
    const rows = await getLocal(KEY_ROWS);
    state.rows = Array.isArray(rows) ? rows : [];
    const savedSelected = await getLocal(KEY_SELECTED);
    if (savedSelected && state.rows.some((x) => x.id === savedSelected)) state.selectedId = savedSelected;
    if (!state.selectedId && state.rows[0]) state.selectedId = state.rows[0].id;

    const templates = await getLocal(KEY_TEMPLATES) || await getLocal(LEGACY_TEMPLATES_KEY);
    state.templates = { ...DEFAULT_TEMPLATES, ...(templates || {}) };
    await setLocal(KEY_TEMPLATES, state.templates);

    const savedRules = await getLocal(KEY_RULES);
    state.rules = String(savedRules || DEFAULT_RULES).trim();
    if (!savedRules) await setLocal(KEY_RULES, state.rules);
  }

  async function saveRows() { await setLocal(KEY_ROWS, state.rows); await setLocal(KEY_SELECTED, state.selectedId || ''); }

  function renderTable(list) {
    ui.tbody.innerHTML = list.map((r) => `
      <tr data-id="${r.id}" class="${r.id === state.selectedId ? 'active-row' : ''}">
        <td><input type="checkbox" data-id="${r.id}" ${state.selectedIds.has(r.id) ? 'checked' : ''}></td>
        <td>${r.serviceName || '—'}</td><td>${r.orderNo || '—'}</td><td>${r.smmId || '—'}</td>
        <td>${r.dateText || '—'}</td><td>${r.problemText || '—'}</td>
        <td>${r.slaMinutes ?? '—'}</td><td>${r.priceText || '—'}</td><td>${r.status || '—'}</td>
        <td>${r.pageNo ?? '—'}</td><td>${r.cardIndex ?? '—'}</td>
      </tr>
    `).join('');
    ui.tableEmpty.hidden = list.length > 0;
  }

  function render() {
    const q = String(ui.search?.value || '').toLowerCase().trim();
    const list = state.rows.filter((r) => !q || [r.serviceName, r.orderNo, r.smmId, r.status, r.problemText].join(' ').toLowerCase().includes(q));
    ui.stats.textContent = `Kayıt: ${list.length} • SLA Risk: ${list.filter((x) => x.slaRisk).length}`;
    byId('selCount').textContent = `SEÇİLİ: ${state.selectedIds.size}`;
    ui.list.innerHTML = list.map((r) => `<div class="item ${r.id === state.selectedId ? 'active' : ''}" data-id="${r.id}">${r.smmId || '—'} • #${r.orderNo || '—'} • ${r.status || '—'}</div>`).join('') || '<div class="empty">Şikayet kaydı yok.</div>';
    ui.list.querySelectorAll('[data-id]').forEach((el) => el.addEventListener('click', () => {
      state.selectedId = el.getAttribute('data-id') || '';
      render();
    }));
    renderTable(list);

    const c = pickSelected();
    updateActionButtons();
    ui.detail.innerHTML = c ? `<div style="border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px"><div><b>Şikayetçi:</b> ${c.customer || '—'}</div><div><b>SMM ID:</b> ${c.smmId || '—'}</div><div><b>Durum:</b> ${c.status || '—'}</div></div>` : '<div class="empty">Detay için kayıt seç.</div>';
  }

  async function getActiveTabId() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) throw new Error('Aktif sekme bulunamadı.');
    return tab.id;
  }

  async function detectReporterAndSmm(tabId, complaint) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [{ orderNo: complaint.orderNo, smmId: complaint.smmId }],
      func: (payload) => {
        const textOf = (n) => String(n?.textContent || '').replace(/\s+/g, ' ').trim();
        const logs = [];
        const clickSafe = (el) => {
          if (!el) return false;
          try { el.click(); return true; } catch { return false; }
        };
        const add = (selector, node, clicked, user) => logs.push({ selector, found: !!node, clicked, user: user || '' });

        const cards = [...document.querySelectorAll('div.modern-order-card')];
        const card = cards.find((x) => {
          const t = textOf(x);
          return (payload.orderNo && t.includes(String(payload.orderNo))) || (payload.smmId && t.includes(String(payload.smmId)));
        }) || cards[0];
        if (!card) return { ok: false, logs, smmId: payload.smmId || '', smmLink: '' };

        const product = card.querySelector('div.modern-order-product-name');
        add('div.modern-order-product-name', product, clickSafe(product), '');

        const tries = [
          () => card.querySelector('i.ri-user-line'),
          () => card.querySelector('a.modern-action-btn'),
          () => card.querySelector('span'),
          () => [...card.querySelectorAll('button,a')].find((n) => /kullanıcı|kullanici|profil/i.test(textOf(n))),
          () => {
            const owner = [...card.querySelectorAll('*')].find((n) => /sipariş sahibi|siparis sahibi/i.test(textOf(n)));
            return owner?.nextElementSibling || null;
          },
          () => card.querySelector('img[alt*="profil" i], .avatar, .profile-avatar'),
          () => [...card.querySelectorAll('button,a')].find((n) => /detay|incele/i.test(textOf(n))),
          () => card.querySelector('[class*="customer" i], [class*="musteri" i], i.ri-user-3-line, i.ri-customer-service-line'),
          () => card.querySelector('.dropdown-menu a, .menu a, li a, li button'),
          () => card
        ];

        let user = '';
        for (let i = 0; i < tries.length; i += 1) {
          const node = tries[i]();
          const clicked = clickSafe(node);
          const userNode = card.querySelector('.user-name,.profile-name,[class*="user-name"],[class*="username"],a[href*="/u/"]');
          user = textOf(userNode);
          add(`STEP-${i + 1}`, node, clicked, user);
          if (user) break;
        }

        const cardText = textOf(card);
        const smmId = (cardText.match(/SMM\s*ID\s*:\s*(\d{5,9})/i) || [,''])[1] || payload.smmId || '';
        const smmLinkNode = [...card.querySelectorAll('a')].find((a) => /orders\?search=/i.test(String(a.href || '')) || /smm\s*id/i.test(textOf(a.parentElement || card)));

        return {
          ok: Boolean(user),
          user,
          logs,
          smmId,
          smmLink: smmLinkNode?.href || (smmId ? `https://anabayiniz.com/orders?search=${smmId}` : '')
        };
      }
    });
    return result || { ok: false, logs: [], smmId: complaint.smmId || '', smmLink: '' };
  }

  async function getIncomingMessages(tabId) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        const ignored = [/kullanıcı mesajıdır, sistem mesajı değildir!/i, /uyarı|warning|dikkat/i];
        const nodes = [...document.querySelectorAll('ul.messagelist li, .message-bubble, .chat-bubble, .message-text, .conversation .msg, .chat-message')];
        const raw = nodes
          .map((n, i) => ({ idx: i, text: clean(n.textContent) }))
          .filter((x) => x.text && !ignored.some((rx) => rx.test(x.text)));

        const merged = [];
        for (const item of raw) {
          const prev = merged[merged.length - 1];
          const short = item.text.length <= 42;
          if (prev && short && prev.text.length <= 120) prev.text += ` ${item.text}`;
          else merged.push({ ...item });
        }

        const last15 = merged.slice(-15);
        const oldCount = Math.max(0, merged.length - last15.length);
        return {
          context: last15.map((x) => x.text),
          summary: oldCount ? `Daha eski ${oldCount} mesaj var (özetlenmedi).` : ''
        };
      }
    });
    return result || { context: [], summary: '' };
  }

  function classifyMessage(text) {
    const t = String(text || '').toLowerCase();
    if (/acil|hızlı|hemen|acele/.test(t)) return 'ACELE';
    if (/sipariş|smm id|order/.test(t)) return 'SİPARİŞ';
    if (/şikayet|sorun|problem/.test(t)) return 'ŞİKAYET';
    if (/selam|merhaba/.test(t)) return 'SELAM';
    if (/teşekkür|sağ ol/.test(t)) return 'TEŞEKKÜR';
    return 'BİLGİ';
  }

  async function fetchSmmOrderData(smmId, smmLink) {
    const finalSmmId = smmId || (String(smmLink || '').match(/search=(\d{5,9})/) || [,''])[1] || '';
    const url = smmLink || (finalSmmId ? `https://anabayiniz.com/orders?search=${finalSmmId}` : '');
    if (!url) throw new Error('SMM ID bulunamadı.');

    logFlow(`URL: ${url}`);
    const tab = await chrome.tabs.create({ url, active: false });
    await new Promise((resolve) => {
      const done = (id, info) => { if (id === tab.id && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(done); resolve(true); } };
      chrome.tabs.onUpdated.addListener(done);
    });

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [finalSmmId],
      func: (id) => {
        const table = document.querySelector('table');
        if (!table) return { ok: false, error: 'Tablo yok.' };
        const rows = [...table.querySelectorAll('tbody tr')].map((tr) => {
          const td = [...tr.querySelectorAll('td')].map((x) => String(x.innerText || '').trim());
          const link = tr.querySelector('a[href*="order"],a[href*="siparis"],a[href*="orders"]')?.href || td[2] || '';
          return { id: td[0] || '', date: td[1] || '', orderLink: link, start: td[4] || '', amount: td[5] || '', service: td[6] || '', status: td[7] || '' };
        });
        const row = rows.find((r) => String(r.id) === String(id)) || rows[0];
        if (!row) return { ok: false, error: 'Eşleşen satır yok.' };
        return { ok: true, row, urlOk: /\/orders\?search=\d{5,9}/.test(location.pathname + location.search) };
      }
    });

    await chrome.tabs.remove(tab.id);
    if (!result?.ok) throw new Error(result?.error || 'SMM tablo okuma hatası');
    logFlow(`SMM URL format doğrulama: ${result.urlOk ? 'EVET' : 'HAYIR'}`);
    return result.row;
  }

  function buildTemplateMessage(orderData) {
    const statusRaw = String(orderData.status || '').trim().toUpperCase();
    const templateKey = Object.keys(state.templates).find((k) => statusRaw.includes(k.toUpperCase())) || 'BEKLEMEDE';
    const viewStatus = statusRaw === 'TAMAMLANDI' ? 'TAMAMLANMIŞ' : orderData.status;

    return String(state.templates[templateKey] || DEFAULT_TEMPLATES.BEKLEMEDE)
      .replaceAll('{SERVIS_ADI}', sanitizeServiceName(orderData.service))
      .replaceAll('{BASLANGIC}', String(orderData.start || '—'))
      .replaceAll('{MIKTAR}', String(orderData.amount || '—'))
      .replaceAll('{SIPARIS_LINKI}', String(orderData.orderLink || '—'))
      .replaceAll('{TARIH}', String(orderData.date || '—'))
      .replaceAll('{DURUM}', String(viewStatus || '—'))
      .replace(/\b\d{4}\b/g, '');
  }

  async function humanizeWithPuter(baseMessage, incoming) {
    if (!window.puter?.ai?.chat) return baseMessage;
    const systemPrompt = `${state.rules}\n\nÇIKTI KURALI: TEK PARÇA MESAJ ÜRET.`;
    try {
      const response = await window.puter.ai.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Müşteri bağlamı:\n${incoming.summary}\n${incoming.context.join('\n')}\n\nŞablon:\n${baseMessage}` }
      ], { model: 'gpt-5-nano', stream: false, testMode: true });
      const out = response?.message?.content || response?.content || baseMessage;
      return String(out || baseMessage).trim();
    } catch {
      return `${baseMessage}\n\nKısa not: detayları kontrol edip hemen güncelleme sağlayacağız.`;
    }
  }

  async function sendToCustomer(tabId, message) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [message],
      func: async (msg) => {
        const logs = [];
        const textOf = (n) => String(n?.textContent || '').replace(/\s+/g, ' ').trim();
        const clickSafe = (el) => { try { el?.click(); return !!el; } catch { return false; } };

        const primary = document.querySelector('a.btn-profile.green');
        const firstClick = clickSafe(primary);
        logs.push({ selector: 'a.btn-profile.green', found: !!primary, clicked: firstClick });

        if (!firstClick) {
          const rx = [/İLETİŞİME\s*GEÇ/i, /ILETISIME\s*GEC/i, /(MESAJ|CHAT|DM)\s*(GÖNDER|GONDER)/i, /(CONTACT|MESSAGE)\s*(ME|SEND)/i];
          const fallback = [...document.querySelectorAll('a,button')].find((el) => rx.some((r) => r.test(textOf(el))));
          logs.push({ selector: 'contact regex fallback', found: !!fallback, clicked: clickSafe(fallback) });
        }

        const msgMenu = [...document.querySelectorAll('a.dropdown-item,button.dropdown-item,a,button')].find((el) => /mesaj/i.test(textOf(el)));
        logs.push({ selector: 'a.dropdown-item[mesaj]', found: !!msgMenu, clicked: clickSafe(msgMenu) });

        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const inputSelectors = ['input.form-control.messagehere', '.chat-input-field#message', 'textarea#message', 'textarea.form-control.messagehere'];
        const findInput = () => document.querySelector(inputSelectors.join(','));

        let input = findInput();
        if (!input) {
          for (let i = 0; i < 3 && !input; i += 1) {
            // @ts-ignore
            await wait(250);
            input = findInput();
          }
        }
        if (input) {
          input.focus();
          input.value = msg;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const sendBtn = [...document.querySelectorAll('button,a')].find((el) => /gönder|gonder|send/i.test(textOf(el)));
        const sent = clickSafe(sendBtn);
        logs.push({ selector: 'send button', found: !!sendBtn, clicked: sent });

        return { ok: Boolean(sent), logs };
      }
    });
    return result || { ok: false, logs: [] };
  }

  async function runComplaintAutomation() {
    const selected = pickSelected();
    if (!selected) return toast('Önce kayıt seç.');

    byId('complaintFlowLog').textContent = '';
    const tabId = await getActiveTabId();
    const detected = await detectReporterAndSmm(tabId, selected);
    detected.logs.forEach((x) => logFlow(`SELECTOR=${x.selector} | BULUNDU=${x.found ? 'EVET' : 'HAYIR'} | TIKLANDI=${x.clicked ? 'EVET' : 'HAYIR'} | SONUÇ=${x.user || '—'}`));

    if (!detected.ok) {
      logFlow('ŞİKAYETÇİ BULUNAMADI');
      return;
    }

    selected.customer = detected.user;
    logFlow(`ŞİKAYETÇİ TESPİT EDİLDİ: ${selected.customer}`);

    const incoming = await getIncomingMessages(tabId);
    incoming.context.forEach((m) => logFlow(`OKUNAN BALON: ${m}`));
    const classes = incoming.context.map(classifyMessage);
    classes.forEach((c) => logFlow(`SINIF: ${c}`));

    const urgent = classes.includes('ACELE');
    const smmId = detected.smmId || selected.smmId;
    const smmData = await fetchSmmOrderData(smmId, detected.smmLink || `https://anabayiniz.com/orders?search=${smmId}`);
    logFlow(`DURUM: ${smmData.status}`);

    const templateMsg = buildTemplateMessage(smmData);
    const finalMessage = await humanizeWithPuter(templateMsg, incoming);
    const ackMessage = 'TAMAM KRAL 🤴 HEMEN BAKIYORUM 🙏🏻';

    if (urgent) {
      const ackSent = await sendToCustomer(tabId, ackMessage);
      ackSent.logs.forEach((x) => logFlow(`ACK | ${x.selector} | BULUNDU=${x.found ? 'EVET' : 'HAYIR'} | TIKLANDI=${x.clicked ? 'EVET' : 'HAYIR'}`));
    }

    const sent = await sendToCustomer(tabId, finalMessage);
    sent.logs.forEach((x) => logFlow(`MESAJ | ${x.selector} | BULUNDU=${x.found ? 'EVET' : 'HAYIR'} | TIKLANDI=${x.clicked ? 'EVET' : 'HAYIR'}`));
    logFlow(`MESAJ: ${finalMessage}`);

    ui.draft.value = finalMessage;
    await saveRows();
    render();
  }


  function debounce(fn, wait = 150) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function setActionHint(text, ok = true) {
    const el = byId('complaintActionHint');
    if (!el) return;
    el.textContent = text;
    el.style.color = ok ? '#88ffb7' : '#ff9ba5';
  }

  function updateActionButtons() {
    const on = !!state.selectedId;
    ['btnComplaintDraft', 'btnComplaintSolution', 'btnComplaintEscalate', 'btnComplaintClose'].forEach((id) => {
      const el = byId(id);
      if (el) el.disabled = !on;
    });
  }

  function selectRow(id) {
    if (!id) return;
    state.selectedId = id;
    saveRows();
    render();
  }

  async function verifySession() {
    try {
      const tabId = await getActiveTabId();
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({ ok: !!document.querySelector('body') && !/login|giriş/i.test(document.body.innerText.slice(0, 3000)) })
      });
      setActionHint(result?.ok ? 'Oturum OK' : 'Oturum Gerekli', !!result?.ok);
    } catch {
      setActionHint('Oturum Gerekli', false);
    }
  }

  function makeDraft() {
    const c = pickSelected();
    if (!c) return toast('Önce kayıt seç.');
    const data = { service: c.serviceName, start: c.startText || '—', amount: c.amountText || '—', orderLink: c.orderLink || c.messageUrl || '—', date: c.dateText || '—', status: c.status || 'BEKLEMEDE' };
    ui.draft.value = buildTemplateMessage(data);
  }

  function makeSolution() {
    const c = pickSelected();
    if (!c) return toast('Önce kayıt seç.');
    ui.draft.value = `${ui.draft.value || ''}

Çözüm: Sipariş detayları kontrol edilip hızlandırma talebi açıldı.`.trim();
  }

  async function escalate(ids) {
    const targets = ids?.length ? state.rows.filter((r) => ids.includes(r.id)) : [pickSelected()].filter(Boolean);
    if (!targets.length) return toast('Önce kayıt seç.');
    targets.forEach((r) => { r.escalated = true; });
    await saveRows();
    render();
    setActionHint(`Eskale edildi: ${targets.length}`);
  }

  async function closeComplaint(ids) {
    const targets = ids?.length ? state.rows.filter((r) => ids.includes(r.id)) : [pickSelected()].filter(Boolean);
    if (!targets.length) return toast('Önce kayıt seç.');
    if (!confirm('Şikayet kapatılsın mı?')) return;
    targets.forEach((r) => { r.closed = true; r.status = 'KAPATILDI'; });
    await saveRows();
    render();
  }

  async function startScan() { state.stopScan = false; setActionHint('Tarama başlatıldı.'); }
  async function stopScan() { state.stopScan = true; setActionHint('Tarama durduruldu.', false); }
  function bind() {
    ui.search = byId('inpComplaintSearch');
    ui.stats = byId('complaintStats');
    ui.list = byId('complaintsList');
    ui.detail = byId('complaintDetail');
    ui.draft = byId('complaintDraftText');
    ui.tbody = byId('tblComplaintBody');
    ui.tableEmpty = byId('complaintTableEmpty');

    byId('btnComplaintFindReporter')?.addEventListener('click', runComplaintAutomation);
    byId('btnOpenTemplateSettings')?.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('ayarlar.html') }));
    byId('btnComplaintCopyDraft')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(ui.draft?.value || ''); toast('Taslak kopyalandı.'); }
      catch { toast('Panoya kopyalanamadı.'); }
    });
    byId('btnComplaintOpenMessage')?.addEventListener('click', () => {
      const c = pickSelected();
    updateActionButtons();
      if (!c?.messageUrl) return toast('Mesaj URL yok.');
      chrome.tabs.create({ url: c.messageUrl });
    });
    byId('btnComplaintFullscreen')?.addEventListener('click', async () => {
      const el = byId('complaintRoot') || document.documentElement;
      if (!document.fullscreenElement) await el.requestFullscreen?.(); else await document.exitFullscreen?.();
    });
    ui.search?.addEventListener('input', debounce(render, 150));

    byId('btnComplaintVerify')?.addEventListener('click', verifySession);
    byId('btnComplaintScan')?.addEventListener('click', startScan);
    byId('btnComplaintStop')?.addEventListener('click', stopScan);
    byId('btnComplaintDraft')?.addEventListener('click', makeDraft);
    byId('btnComplaintSolution')?.addEventListener('click', makeSolution);
    byId('btnComplaintEscalate')?.addEventListener('click', () => escalate());
    byId('btnComplaintClose')?.addEventListener('click', () => closeComplaint());
    byId('btnBulkDraft')?.addEventListener('click', () => {
      const ids = [...state.selectedIds];
      if (!ids.length) return toast('Toplu taslak için seçim yap.');
      state.selectedId = ids[0];
      makeDraft();
      setActionHint(`Toplu taslak hazırlandı: ${ids.length}`);
    });
    byId('btnBulkEscalate')?.addEventListener('click', () => escalate([...state.selectedIds]));
    byId('btnBulkClose')?.addEventListener('click', () => closeComplaint([...state.selectedIds]));

    byId('inpComplaintToday').value = new Date().toLocaleDateString('tr-TR');
    byId('inpComplaintNid')?.addEventListener('input', (e) => { byId('complaintNidValue').textContent = `NID: ${e.target.value}`; });

    ui.tbody?.addEventListener('click', (e) => {
      const tr = e.target.closest('tr');
      const cb = e.target.closest('input[type="checkbox"]');
      if (cb?.dataset?.id) {
        if (cb.checked) state.selectedIds.add(cb.dataset.id); else state.selectedIds.delete(cb.dataset.id);
        byId('selCount').textContent = `SEÇİLİ: ${state.selectedIds.size}`;
        return;
      }
      if (tr?.dataset?.id) selectRow(tr.dataset.id);
    });

    byId('toggleLog')?.addEventListener('click', () => {
      const el = byId('complaintFlowLog');
      el.hidden = !el.hidden;
    });

    document.querySelectorAll('#btnComplaintFullscreen').forEach((b, i) => i && b.remove());

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); byId('btnComplaintFindReporter')?.click(); }
      if (e.key === 'Escape') { e.preventDefault(); stopScan(); }
    });
  }

  (async () => {
    if (window.__SikayetInit) return;
    window.__SikayetInit = true;
    bind();
    await loadPersistedState();
    render();
    verifySession();
  })();
})();

window.addEventListener('DOMContentLoaded', () => window.PatpatPuter?.autoMount?.({ page: 'Sikayet', rootSelector: '#complaintRoot', enableImage: false }));
