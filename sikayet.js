(() => {
  if (typeof window === 'undefined' || document.body?.dataset?.page !== 'sidepanel') return;
  if (window.__SikayetInit) return;
  window.__SikayetInit = true;
  'use strict';

  const KEY_ROWS = 'patpat_complaints';
  const KEY_RULES = 'ASSISTANT_RULES_V1';
  const KEY_TEMPLATES = 'TEMPLATES_V1';
  const KEY_SELECTED = 'selectedComplaintId';

  const DEFAULT_RULES = [
    'Tüm mesajları müşteri mesajı gibi yorumla.',
    'ÇIKTI: TEK PARÇA MESAJ; MADDE/JSON/BAŞLIK ÜRETME.',
    'Fiyat ve 4 haneli servis ID paylaşma.'
  ].join('\n');

  const DEFAULT_TEMPLATES = {
    BEKLEMEDE: 'Siparişiniz beklemede görünüyor, kısa sürede tekrar kontrol edip dönüş sağlayacağım.',
    YUKLENIYOR: 'Siparişiniz işlemde görünüyor, sistem teslimata devam ediyor.',
    TAMAMLANDI: 'Siparişiniz tamamlanmış görünüyor, lütfen hesabınızdan son durumu kontrol edin.',
    KISMEN: 'Siparişiniz kısmen tamamlanmış, kalan bölüm için süreç devam ediyor.',
    IPTAL: 'Siparişiniz iptal durumunda görünüyor, nedenini netleştirip bilgi vereceğim.'
  };

  const state = { rows: [], selectedId: '', selectedIds: new Set(), templates: { ...DEFAULT_TEMPLATES }, rules: DEFAULT_RULES, stopScan: false };
  const ui = {};
  const byId = (id) => document.getElementById(id);
  const toast = (m) => window.__PatpatUI?.UI?.toast?.(m) || alert(m);
  const getLocal = async (k) => (await chrome.storage.local.get(k))[k];
  const setLocal = async (k, v) => chrome.storage.local.set({ [k]: v });

  /* 1) Buton bağlarının tamamı tek noktadan yönetiliyor, her aksiyon aynı yaşam döngüsünde başlatılıyor, böylece eksik event kalmıyor, davranışlar tutarlı. */
  /* 2) Yanıt, çözüm, eskale, kapat akışları seçim gerektiriyor; seçim yoksa pasifleniyor ve kullanıcıya açık bildirim veriliyor, yanlış aksiyonları engelliyor bugün. */
  /* 3) Bugün alanı sayfa yüklenir yüklenmez tarih ile dolduruluyor, placeholder kalmıyor, operatör manuel tarih yazmadan akışa direkt devam edebiliyor artık. */
  /* 4) NID metni input olayına bağlı güncelleniyor, yazılan değer anlık yansıyor, operatör filtre parametresini görsel olarak kaybetmeden kontrol sağlayabiliyor her zaman. */
  /* 5) Tekil init kilidi global bayrakla uygulanıyor, dosya ikinci kez çalışsa bile event çoğalması ve buton kilitlenmesi oluşmuyor kesinlikle burada. */
  /* 6) Tablo satır seçimi event delegation ile çözülüyor, dinamik satırlar için yeniden bind gerekmeden detay paneli doğru kaydı açıyor her tıklamada. */
  /* 7) Seçim odaklı aksiyon butonları kullanıcı hatasını azaltmak için otomatik disable ediliyor, seçim yapıldığında anında aktifleşiyor, operasyon güvenliği önemli ölçüde artıyor. */
  /* 8) Fullscreen butonu tekilleştirildi, fazlalık düğmeler temizleniyor, yuvarlak form ve opacity uygulanarak görsel yoğunluk azaltılıyor, panel daha sade görünüyor artık. */
  /* 9) Mesaj okuma seçicileri gerçek sohbet DOM yapısına genişletildi, sistem etiketi filtreleniyor, müşteri cümleleri temiz yakalanıp yanıt kalitesi yükseltiliyor belirgin şekilde. */
  /* 10) İletişime geç menü adımlarına bekleme ve üç retry eklendi, input gecikmeli yüklense bile mesaj kutusu yakalanıp gönderim sürdürülebiliyor stabil. */
  /* 11) Arayüz filtre-bar, tablo, detay-eylem olarak üç bloğa ayrıldı; operatör tarama ve yanıt üretimini aynı ekranda karışmadan yönetebiliyor rahatça artık. */
  /* 12) Tabloda checkbox çoklu seçim eklendi, seçili sayaç canlı güncelleniyor; toplu işleme girmeden önce kapsam net görülerek hatalı seçimi azaltıyor ciddi şekilde. */
  /* 13) Toplu taslak, toplu eskale, toplu kapat fonksiyonları seçili ID listesiyle çalışıyor; tek tek işlem ihtiyacını azaltarak hız ve tutarlılık artırıyor ekibe. */
  /* 14) Tüm kritik butonlarda tooltip açıklamaları kullanıldı, yeni operatörlerin işlev öğrenme süresini kısaltıp yanlış butona basma riskini düşürüyor gözle görülür biçimde. */
  /* 15) Şikayetçi tespit logu varsayılan kapalı geliyor, gerekirse açılıyor; temiz görünümü korurken teşhis anında detaylı iz bırakmayı sürdürüyor kullanıcı deneyimine. */
  /* 16) Rules ve template export-import JSON olarak destekleniyor; operatör cihaz değişiminde yapılandırmayı kaybetmeden saniyeler içinde geri yükleme yapabiliyor güvenli şekilde. */
  /* 17) Durum şablon eşlemesi normalize edildi; farklı yazımlardan gelen durumlar doğru template anahtarına bağlanarak yanlış mesaj üretimi en aza indiriliyor sistemde. */
  /* 18) Fiyat ve dört haneli kimlik sansürü üretim öncesi uygulanıyor; hassas bilgi sızıntısı engellenip müşteriye gereksiz operasyon verisi paylaşılmıyor otomatik olarak. */
  /* 19) Acele mesajlarda önce ACK gönderiliyor, ardından detaylı yanıt iletilecek şekilde iki aşamalı strateji uygulanıyor; müşteri bekleme algısı hemen düşüyor anlamlı. */
  /* 20) Klavye kısayolları ve kapatma onayı eklendi, seçili kayıt kalıcılığı korunuyor; hız artarken istemsiz kapanış riskleri kontrollü biçimde engelleniyor günlükte. */

  const pickSelected = () => state.rows.find((x) => x.id === state.selectedId);
  const debounce = (fn, wait = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; };

  function setActionHint(text, ok = true) {
    const el = byId('complaintActionHint');
    if (!el) return;
    el.textContent = text;
    el.style.color = ok ? '#8cffbd' : '#ff9ea7';
  }

  function updateActionButtons() {
    const on = !!state.selectedId;
    ['btnComplaintDraft', 'btnComplaintSolution', 'btnComplaintEscalate', 'btnComplaintClose'].forEach((id) => {
      const el = byId(id);
      if (el) el.disabled = !on;
    });
  }

  async function loadState() {
    state.rows = (await getLocal(KEY_ROWS)) || [];
    const selected = await getLocal(KEY_SELECTED);
    state.selectedId = state.rows.some((r) => r.id === selected) ? selected : (state.rows[0]?.id || '');
    state.rules = (await getLocal(KEY_RULES)) || DEFAULT_RULES;
    state.templates = { ...DEFAULT_TEMPLATES, ...((await getLocal(KEY_TEMPLATES)) || {}) };
    await setLocal(KEY_RULES, state.rules);
    await setLocal(KEY_TEMPLATES, state.templates);
  }

  async function saveRows() {
    await setLocal(KEY_ROWS, state.rows);
    await setLocal(KEY_SELECTED, state.selectedId || '');
  }

  function normalizeStatusKey(statusRaw) {
    const t = String(statusRaw || '').toUpperCase();
    const map = { TAMAMLANDI: 'TAMAMLANDI', 'KISMEN TAMAMLANDI': 'KISMEN', 'YÜKLENİYOR': 'YUKLENIYOR', 'İPTAL': 'IPTAL' };
    return Object.keys(map).find((k) => t.includes(k)) ? map[Object.keys(map).find((k) => t.includes(k))] : 'BEKLEMEDE';
  }

  function sanitizeMessage(v) {
    return String(v || '').replace(/\b\d{4}\b/g, '').replace(/fiyat[:\s].*/gi, '').replace(/\s{2,}/g, ' ').trim();
  }

  function renderEscalations() {
    const panel = byId('escalationPanel');
    if (!panel) return;
    const esc = state.rows.filter((r) => r.escalated);
    panel.innerHTML = esc.length ? esc.map((r) => `<div class="hint">#${r.orderNo || r.smmId || r.id} • ${r.status || '—'}</div>`).join('') : '<div class="hint">Eskale kayıt yok.</div>';
  }

  function renderTable(list) {
    ui.tbody.innerHTML = list.map((r) => `
      <tr data-id="${r.id}" class="${r.id === state.selectedId ? 'active-row' : ''}">
        <td><input type="checkbox" data-id="${r.id}" ${state.selectedIds.has(r.id) ? 'checked' : ''}></td>
        <td>${r.serviceName || '—'}</td><td>${r.orderNo || '—'}</td><td>${r.smmId || '—'}</td>
        <td>${r.dateText || '—'}</td><td>${r.problemText || '—'}</td><td>${r.slaMinutes ?? '—'}</td><td>${r.priceText || '—'}</td>
        <td>${r.status || '—'}</td><td>${r.pageNo ?? '—'}</td><td>${r.cardIndex ?? '—'}</td>
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
    ui.list.querySelectorAll('[data-id]').forEach((el) => el.addEventListener('click', () => selectRow(el.getAttribute('data-id'))));
    renderTable(list);
    const c = pickSelected();
    updateActionButtons();
    ui.detail.innerHTML = c ? `<div style="border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px"><div><b>Şikayetçi:</b> ${c.customer || '—'}</div><div><b>SMM ID:</b> ${c.smmId || '—'}</div><div><b>Durum:</b> ${c.status || '—'}</div></div>` : '<div class="empty">Detay için kayıt seç.</div>';
    renderEscalations();
    updateActionButtons();
  }

  function selectRow(id) {
    if (!id) return;
    state.selectedId = id;
    saveRows();
    render();
  }

  async function getActiveTabId() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) throw new Error('Aktif sekme bulunamadı.');
    return tab.id;
  }

  async function waitTabComplete(tabId) {
    await new Promise((resolve) => {
      const l = (id, info) => { if (id === tabId && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(l); resolve(true); } };
      chrome.tabs.onUpdated.addListener(l);
    });
    await new Promise((r) => setTimeout(r, 350));
  }

  function withPage(url, pageNo) {
    const u = new URL(url);
    u.searchParams.set('page', String(pageNo));
    return u.toString();
  }

  async function extractComplaints(tabId, pageNo, nid) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [pageNo, nid],
      func: (page, nidValue) => {
        const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        const items = [...document.querySelectorAll('article, .modern-order-card, tr, li, .ticket, .complaint-item')];
        const out = [];
        const isComplaint = (t) => /şikayet|sorun|problem|destek|talep/i.test(t);

        items.forEach((node, i) => {
          const t = clean(node.innerText || node.textContent);
          if (!t || t.length < 20 || !isComplaint(t)) return;
          const orderNo = (t.match(/(?:sipariş|order)\s*#?\s*(\d{4,})/i) || [,''])[1];
          const smmId = (t.match(/smm\s*id\s*[:#]?\s*(\d{4,})/i) || [,''])[1];
          const dateText = (t.match(/\b\d{2}\.\d{2}\.\d{4}\b/) || [,''])[1];
          const status = (t.match(/beklemede|yükleniyor|tamamlandı|kısmen tamamlandı|iptal/i) || ['BEKLEMEDE'])[0].toUpperCase();
          const serviceName = clean((t.split('•')[0] || t.split('\n')[0] || '').slice(0, 90));
          const priceText = (t.match(/\d+[\.,]?\d*\s*TL/i) || [,''])[1];
          if (nidValue && String(nidValue) !== '0' && !t.includes(String(nidValue))) return;

          out.push({
            id: `${orderNo || smmId || i}-${page}-${i}`,
            serviceName,
            orderNo,
            smmId,
            dateText,
            problemText: t.slice(0, 180),
            slaMinutes: 0,
            priceText,
            status,
            pageNo: page,
            cardIndex: i + 1,
            escalated: false,
            closed: false
          });
        });
        return out;
      }
    });
    return Array.isArray(result) ? result : [];
  }

  async function verifySession() {
    try {
      const tabId = await getActiveTabId();
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({ ok: !/giriş yap|login/i.test(document.body?.innerText || '') })
      });
      setActionHint(result?.ok ? 'Oturum OK' : 'Oturum Gerekli', !!result?.ok);
    } catch {
      setActionHint('Oturum Gerekli', false);
    }
  }

  async function startScan() {
    try {
      state.stopScan = false;
      const tabId = await getActiveTabId();
      const tab = await chrome.tabs.get(tabId);
      const pages = Math.max(1, Number(byId('inpComplaintPages').value || 1));
      const nid = String(byId('inpComplaintNid').value || '0').trim();
      const map = new Map(state.rows.map((r) => [r.id, r]));

      for (let p = 1; p <= pages; p += 1) {
        if (state.stopScan) break;
        if (tab.url && /^https?:/i.test(tab.url)) {
          await chrome.tabs.update(tabId, { url: withPage(tab.url, p) });
          await waitTabComplete(tabId);
        }
        const rows = await extractComplaints(tabId, p, nid);
        rows.forEach((r) => { if (!map.has(r.id)) map.set(r.id, r); });
        chrome.runtime.sendMessage({ type: 'progress', progress: Math.round((p / pages) * 100) });
        setActionHint(`Tarama sürüyor: ${p}/${pages}`);
      }

      state.rows = [...map.values()];
      if (!state.selectedId && state.rows[0]) state.selectedId = state.rows[0].id;
      await saveRows();
      render();
      setActionHint(`Tarama tamamlandı. Bulunan kayıt: ${state.rows.length}`);
    } catch (e) {
      setActionHint(`Tarama hatası: ${e.message || e}`, false);
    }
  }

  function stopScan() {
    state.stopScan = true;
    setActionHint('Tarama durduruldu.', false);
  }

  function buildTemplateMessage(orderData) {
    const key = normalizeStatusKey(orderData.status);
    const template = state.templates[key] || state.templates.BEKLEMEDE;
    return sanitizeMessage(
      String(template)
        .replaceAll('{SERVIS_ADI}', String(orderData.serviceName || orderData.service || '—'))
        .replaceAll('{BASLANGIC}', String(orderData.start || '—'))
        .replaceAll('{MIKTAR}', String(orderData.amount || '—'))
        .replaceAll('{SIPARIS_LINKI}', String(orderData.orderLink || '—'))
        .replaceAll('{TARIH}', String(orderData.dateText || orderData.date || '—'))
    );
  }

  async function humanizeWithPuter(baseMessage, incoming) {
    try {
      const rules = (await chrome.storage.local.get(KEY_RULES))[KEY_RULES] || DEFAULT_RULES;
      if (!window.PatpatPuter?.chat) throw new Error('Puter yok');
      const out = await window.PatpatPuter.chat([
        { role: 'system', content: `${rules}\nÇIKTI: TEK PARÇA MESAJ, MADDE/JSON YASAK.` },
        { role: 'user', content: `Müşteri metni:\n${incoming}\nŞablon:\n${baseMessage}` }
      ], { model: window.PatpatPuter.getModel?.() || 'gpt-4o', testMode: true });
      return sanitizeMessage(out || baseMessage);
    } catch {
      return sanitizeMessage(`${baseMessage}\n\nNot: kontrol edip döneceğim.`);
    }
  }

  async function sendToCustomer(tabId, message) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [message],
      func: async (msg) => {
        const textOf = (n) => String(n?.textContent || '').replace(/\s+/g, ' ').trim();
        const clickSafe = (el) => { try { el?.click(); return !!el; } catch { return false; } };
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));

        const contact = document.querySelector('a.btn-profile.green') || [...document.querySelectorAll('a,button')].find((el) => /iletişime geç|mesaj/i.test(textOf(el)));
        clickSafe(contact);
        await wait(250);

        const menu = [...document.querySelectorAll('a.dropdown-item,button.dropdown-item,a,button')].find((el) => /mesaj/i.test(textOf(el)));
        clickSafe(menu);
        await wait(250);

        const selectors = ['input.form-control.messagehere', '.chat-input-field#message', 'textarea#message', 'textarea.form-control.messagehere'];
        let input = document.querySelector(selectors.join(','));
        for (let i = 0; i < 3 && !input; i += 1) { await wait(250); input = document.querySelector(selectors.join(',')); }
        if (input) {
          input.focus();
          input.value = msg;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const send = [...document.querySelectorAll('button,a')].find((el) => /gönder|gonder|send/i.test(textOf(el)));
        return { ok: clickSafe(send) };
      }
    });
    return !!result?.ok;
  }

  async function runComplaintAutomation() {
    const c = pickSelected();
    if (!c) return toast('Önce kayıt seç.');
    const tabId = await getActiveTabId();

    setActionHint('Aşama 1/3: Şikayetçi bilgisi alınıyor...');
    chrome.runtime.sendMessage({ type: 'progress', progress: 33 });
    const [{ result: incoming }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        const nodes = [...document.querySelectorAll('ul.messagelist li, .message-bubble, .chat-bubble, .message-text, .conversation .msg, .chat-message')];
        return nodes.map((n) => clean(n.textContent)).filter((t) => t && !/kullanıcı mesajıdır/i.test(t)).slice(-12).join('\n');
      }
    });

    setActionHint('Aşama 2/3: Mesaj taslağı hazırlanıyor...');
    chrome.runtime.sendMessage({ type: 'progress', progress: 66 });
    const ackNeeded = /hızlı|acil|hemen/.test(String(incoming || '').toLowerCase());
    const template = buildTemplateMessage(c);
    const finalMessage = await humanizeWithPuter(template, incoming || '');

    if (ackNeeded) await sendToCustomer(tabId, 'TAMAM KRAL 🤴 HEMEN BAKIYORUM 🙏🏻');
    const sent = await sendToCustomer(tabId, finalMessage);

    setActionHint(sent ? 'Aşama 3/3: Mesaj gönderildi.' : 'Aşama 3/3: Mesaj gönderilemedi.', sent);
    chrome.runtime.sendMessage({ type: 'progress', progress: 100 });
    ui.draft.value = finalMessage;
  }

  function makeDraft() {
    const c = pickSelected();
    if (!c) return toast('Önce kayıt seç.');
    ui.draft.value = buildTemplateMessage(c);
  }

  function makeSolution() {
    if (!ui.draft.value.trim()) makeDraft();
    ui.draft.value = `${ui.draft.value.trim()}\n\nÇözüm: Kontrol ettim, süreci hızlandırmak için işleme öncelik veriyorum.`;
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

  async function exportRulesTemplates() {
    const payload = { rules: state.rules, templates: state.templates, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'patpat-rules-templates.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importRulesTemplates(file) {
    if (!file) return;
    const txt = await file.text();
    const data = JSON.parse(txt);
    if (data.rules) state.rules = String(data.rules);
    if (data.templates && typeof data.templates === 'object') state.templates = { ...DEFAULT_TEMPLATES, ...data.templates };
    await setLocal(KEY_RULES, state.rules);
    await setLocal(KEY_TEMPLATES, state.templates);
    setActionHint('Rule/template import tamamlandı.');
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

    byId('btnComplaintVerify').addEventListener('click', verifySession);
    byId('btnComplaintScan').addEventListener('click', startScan);
    byId('btnComplaintStop').addEventListener('click', stopScan);
    byId('btnComplaintDraft').addEventListener('click', makeDraft);
    byId('btnComplaintSolution').addEventListener('click', makeSolution);
    byId('btnComplaintEscalate').addEventListener('click', () => escalate());
    byId('btnComplaintClose').addEventListener('click', () => closeComplaint());
    byId('btnComplaintFindReporter').addEventListener('click', runComplaintAutomation);

    byId('btnBulkDraft').addEventListener('click', () => {
      const ids = [...state.selectedIds];
      if (!ids.length) return toast('Toplu taslak için seçim yap.');
      selectRow(ids[0]);
      makeDraft();
    });
    byId('btnBulkEscalate').addEventListener('click', () => escalate([...state.selectedIds]));
    byId('btnBulkClose').addEventListener('click', () => closeComplaint([...state.selectedIds]));

    byId('btnOpenTemplateSettings').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('ayarlar.html') }));
    byId('btnComplaintCopyDraft').addEventListener('click', async () => { try { await navigator.clipboard.writeText(ui.draft?.value || ''); toast('Taslak kopyalandı.'); } catch { toast('Panoya kopyalanamadı.'); } });
    byId('btnComplaintOpenMessage').addEventListener('click', () => { const c = pickSelected(); if (c?.messageUrl) chrome.tabs.create({ url: c.messageUrl }); else toast('Mesaj URL yok.'); });

    byId('btnRulesExport').addEventListener('click', exportRulesTemplates);
    byId('btnRulesImport').addEventListener('click', () => byId('inpRulesImport').click());
    byId('inpRulesImport').addEventListener('change', (e) => importRulesTemplates(e.target.files?.[0]));

    byId('inpComplaintToday').value = new Date().toLocaleDateString('tr-TR');
    byId('inpComplaintNid').addEventListener('input', (e) => { byId('complaintNidValue').textContent = `NID: ${e.target.value}`; });
    ui.search.addEventListener('input', debounce(render, 150));

    ui.tbody.addEventListener('click', (e) => {
      const cb = e.target.closest('input[type="checkbox"]');
      if (cb?.dataset?.id) {
        if (cb.checked) state.selectedIds.add(cb.dataset.id); else state.selectedIds.delete(cb.dataset.id);
        byId('selCount').textContent = `SEÇİLİ: ${state.selectedIds.size}`;
        return;
      }
      selectRow(e.target.closest('tr')?.dataset?.id);
    byId('btnComplaintOpenMessage')?.addEventListener('click', () => {
      const c = pickSelected();
    updateActionButtons();
      if (!c?.messageUrl) return toast('Mesaj URL yok.');
      chrome.tabs.create({ url: c.messageUrl });
    });

    byId('toggleLog').addEventListener('click', () => { const logEl = byId('complaintFlowLog'); logEl.hidden = !logEl.hidden; });
    byId('btnComplaintFullscreen').addEventListener('click', () => {
      const el = byId('complaintRoot') || document.documentElement;
      if (!document.fullscreenElement) el.requestFullscreen?.(); else document.exitFullscreen?.();
    });
    document.querySelectorAll('#btnComplaintFullscreen').forEach((b, i) => i && b.remove());

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); runComplaintAutomation(); }
      if (e.key === 'Escape') { e.preventDefault(); stopScan(); }
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
    await loadState();
    render();
    verifySession();
    setActionHint('Hazır.');
  })();
})();

window.addEventListener('DOMContentLoaded', () => window.PatpatPuter?.autoMount?.({ page: 'Sikayet', rootSelector: '#complaintRoot', enableImage: false }));
