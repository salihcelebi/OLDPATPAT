(() => {
  if (typeof window === 'undefined' || document.body?.dataset?.page !== 'sidepanel') return;
  'use strict';

  const KEY = 'patpat_complaints';
  const STATUS_BASE = 'https://hesap.com.tr/p/sattigim-ilanlar';

  const RX = Object.freeze({
    serviceList: [
      /^([^\n]{6,200})\n\s*(?:Sipariş|Siparis|Order)\s*#?/mi,
      /(?:Hizmet|Servis)\s*[:\-]\s*([^\n]{4,200})/i,
      /^([^\n]{6,200})\n\s*SMM\s*(?:ID|İD)\s*[:\-]/mi,
      /^([^\n]{6,200})\n\s*\d{2}[./-]\d{2}[./-]\d{4}/mi,
      /İlan\s*Adı\s*[:\-]\s*([^\n]{4,200})/i
    ],
    orderList: [
      /\bSipariş\s*#\s*(\d{5,14})\b/i,
      /\bSiparis\s*#\s*(\d{5,14})\b/i,
      /\bOrder\s*#\s*(\d{5,14})\b/i,
      /\bSipariş\s*No\s*[:\-]\s*(\d{5,14})\b/i,
      /\bNo\s*[:\-]\s*(\d{5,14})\b/i
    ],
    smmList: [
      /\bSMM\s*ID\s*[:\-]?\s*(\d{4,14})\b/i,
      /\bSMM\s*İD\s*[:\-]?\s*(\d{4,14})\b/i,
      /\bSMMID\s*[:\-]?\s*(\d{4,14})\b/i,
      /\bSMM\s*No\s*[:\-]?\s*(\d{4,14})\b/i,
      /\bID\s*[:\-]?\s*(\d{4,14})\b/i
    ],
    dateList: [
      /\b(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2})\b/,
      /\b(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})\b/,
      /\b(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\b/,
      /\b(\d{2}\.\d{2}\.\d{4})\b/,
      /\b(\d{2}\/\d{2}\/\d{4})\b/
    ],
    problemList: [
      /(Sorun\s*Bildirildi\s*\([^\n]{2,100}\))/i,
      /(SORUN\s*BİLDİRİLDİ\s*\([^\n]{2,100}\))/i,
      /(Sorun\s*Bildirildi)/i,
      /(Problem\s*Bildirildi\s*\([^\n]{2,100}\))/i,
      /(Şikayet\s*Bildirildi\s*\([^\n]{2,100}\))/i
    ],
    priceList: [
      /Toplam\s*Tutar\s*\n\s*([\d.,]+\s*(?:TL|₺))/i,
      /Toplam\s*Tutar\s*[:\-]\s*([\d.,]+\s*(?:TL|₺))/i,
      /Fiyat\s*[:\-]\s*([\d.,]+\s*(?:TL|₺))/i,
      /Tutar\s*[:\-]\s*([\d.,]+\s*(?:TL|₺))/i,
      /\b([\d.,]+\s*(?:TL|₺))\b/i
    ],
    statusList: [
      /(YÜKLENİYOR|İPTAL|TAMAMLANDI|BEKLEMEDE|HATA|İADE)/i,
      /(TESLİM\s*EDİLDİ)/i,
      /(İŞLENİYOR)/i,
      /(ONAY\s*BEKLENİYOR)/i,
      /(PENDING|PROCESSING|COMPLETED|CANCELLED)/i
    ],
    slaList: [
      /\((\d{1,2})\s*sa\s*(\d{1,2})\s*dk\s*kaldı\)/i,
      /\((\d{1,2})\s*saat\s*(\d{1,2})\s*dakika\s*kaldı\)/i,
      /\((\d{1,2})\s*h\s*(\d{1,2})\s*m\s*left\)/i,
      /\((\d{1,2})\s*hr\s*(\d{1,2})\s*min\s*left\)/i,
      /(\d{1,2})\s*sa\s*(\d{1,2})\s*dk/i
    ]
  });

  const ui = {};
  const state = { rows: [], selectedId: '', stop: false, nid: 0, minDate: null, maxDate: null };

  const byId = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const toast = (m) => window.__PatpatUI?.UI?.toast?.(m) || alert(m);

  async function getLocal(key) { const x = await chrome.storage.local.get(key); return x[key]; }
  async function setLocal(key, val) { await chrome.storage.local.set({ [key]: val }); }

  const firstMatch = (text, list, group = 1) => {
    const src = String(text || '');
    for (const rx of list) {
      const m = src.match(rx);
      if (m?.[group]) return String(m[group]).trim();
    }
    return '';
  };

  function normalizeDateTime(v) {
    const s = String(v || '').trim();
    if (/^\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}$/.test(s)) return s;
    if (/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/.test(s)) {
      const [d, t] = s.split(/\s+/); const [dd, mm, yyyy] = d.split('/');
      return `${dd}.${mm}.${yyyy} ${t}`;
    }
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(s)) {
      const [d, t] = s.split(/\s+/); const [yyyy, mm, dd] = d.split('-');
      return `${dd}.${mm}.${yyyy} ${t}`;
    }
    if (/^\d{2}[./]\d{2}[./]\d{4}$/.test(s)) return `${s.replaceAll('/', '.')} 00:00`;
    return '';
  }

  function parseDateTime(dt) {
    const m = String(dt || '').match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/);
    if (!m) return null;
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), 0, 0);
  }

  function parseSlaMinutes(text) {
    for (const rx of RX.slaList) {
      const m = String(text || '').match(rx);
      if (m) return Number(m[1]) * 60 + Number(m[2]);
    }
    return null;
  }

  function buildRange(todayText, days) {
    const ref = parseDateTime(`${todayText} 00:00`) || new Date();
    const d = Math.max(1, Math.min(365, Number(days || 1)));
    const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
    const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);
    start.setDate(start.getDate() - (d - 1));
    state.minDate = start;
    state.maxDate = end;
    const labels = [];
    for (let i = 0; i < d; i += 1) {
      const cur = new Date(end);
      cur.setDate(end.getDate() - i);
      labels.push(`${String(cur.getDate()).padStart(2, '0')}.${String(cur.getMonth() + 1).padStart(2, '0')}.${cur.getFullYear()}`);
    }
    return labels;
  }

  function inRange(dateText) {
    const dt = parseDateTime(dateText);
    if (!dt || !state.minDate || !state.maxDate) return false;
    return dt >= state.minDate && dt <= state.maxDate;
  }

  function extractComplaintRow(cardText) {
    const text = String(cardText || '');
    const problemText = firstMatch(text, RX.problemList);
    if (!problemText || !/sorun/i.test(problemText)) return null;

    const row = {
      serviceName: firstMatch(text, RX.serviceList),
      orderNo: firstMatch(text, RX.orderList),
      smmId: firstMatch(text, RX.smmList),
      dateText: normalizeDateTime(firstMatch(text, RX.dateList)),
      problemText,
      priceText: firstMatch(text, RX.priceList),
      status: firstMatch(text, RX.statusList) || 'BEKLEMEDE',
      rawText: text
    };

    if (!row.orderNo || !row.smmId || !row.dateText) return null;
    row.slaMinutes = parseSlaMinutes(problemText);
    row.slaRisk = Number.isFinite(row.slaMinutes) && row.slaMinutes <= 120;
    return row;
  }

  function nidScale(n) {
    const v = Math.max(-100, Math.min(500, Number(n || 0)));
    return v >= 0 ? 1 / (1 + (v / 100)) : 1 + (Math.abs(v) / 100);
  }

  async function humanPause(min = 260, max = 900) {
    const scale = nidScale(state.nid);
    const low = Math.max(90, Math.floor(min * scale));
    const high = Math.max(low + 1, Math.floor(max * scale));
    await wait(low + Math.floor(Math.random() * (high - low)));
  }

  async function getActiveTabId() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) throw new Error('Aktif sekme bulunamadı.');
    return tab.id;
  }

  async function navigateWait(tabId, url) {
    await chrome.tabs.update(tabId, { url });
    await new Promise((resolve) => {
      const done = (id, info) => {
        if (id === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(done);
          resolve(true);
        }
      };
      chrome.tabs.onUpdated.addListener(done);
    });
    await humanPause(450, 1000);
  }

  async function verifySession(tabId) {
    await navigateWait(tabId, STATUS_BASE);
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const hasLogin = !!document.querySelector('input[type="password"], input[name*="password" i]');
        const txt = String(document.body?.innerText || '').toLowerCase();
        const cards = document.querySelectorAll('article, .card, [class*="order"], [class*="ilan"]').length;
        return !hasLogin && (cards > 0 || txt.includes('sattığım ilanlar'));
      }
    });
    return !!result;
  }

  async function extractPage(tabId, pageNo) {
    await navigateWait(tabId, `${STATUS_BASE}?page=${pageNo}`);
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [state.nid],
      func: async (nid) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const scale = (Number(nid) >= 0) ? (1 / (1 + (Number(nid) / 100))) : (1 + Math.abs(Number(nid)) / 100);
        const rand = (a, b) => Math.floor((a + Math.random() * (b - a)) * scale);

        window.scrollTo({ top: 0, behavior: 'auto' });
        await sleep(rand(250, 600));
        const full = Math.max(document.body.scrollHeight, window.innerHeight);
        for (let y = 0; y <= full; y += Math.floor(window.innerHeight * (0.55 + Math.random() * 0.3))) {
          window.scrollTo({ top: y, behavior: 'auto' });
          await sleep(rand(140, 450));
        }

        const nodes = [...document.querySelectorAll('article, .card, .ilan, [class*="order"]')];
        const rows = nodes.map((el, idx) => {
          const link = el.querySelector('a[href*="/p/"],a[href*="/siparis"],a[href*="/order"]')?.href || '';
          return { cardIndex: idx + 1, text: el.innerText || '', link };
        });
        return { totalCards: rows.length, rows };
      }
    });
    return result || { totalCards: 0, rows: [] };
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
    if (!ui.detail) return;
    const c = state.rows.find((x) => x.id === state.selectedId);
    if (!c) {
      ui.detail.innerHTML = '<div class="empty">Detay görmek için kayıt seç.</div>';
      return;
    }
    ui.detail.innerHTML = `<div style="border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px">
      <div><b>Hizmet:</b> ${c.serviceName || '—'}</div>
      <div><b>Sipariş No:</b> ${c.orderNo || '—'} • <b>SMM ID:</b> ${c.smmId || '—'}</div>
      <div><b>Tarih:</b> ${c.dateText || '—'} • <b>SLA:</b> ${Number.isFinite(c.slaMinutes) ? `${c.slaMinutes} dk` : '—'}</div>
      <div><b>Sorun:</b> ${c.problemText || '—'}</div>
      <div><b>Fiyat:</b> ${c.priceText || '—'}</div>
      <div><b>Mesaj:</b> <a href="${c.messageUrl || '#'}" target="_blank">${c.messageUrl || '—'}</a></div>
    </div>`;
  }

  function render() {
    const q = String(ui.search?.value || '').toLowerCase().trim();
    const list = state.rows.filter((r) => !q || [r.serviceName, r.orderNo, r.smmId, r.status, r.problemText].join(' ').toLowerCase().includes(q));
    if (ui.stats) ui.stats.textContent = `Kayıt: ${list.length} • SLA Risk: ${list.filter((x) => x.slaRisk).length}`;
    if (ui.list) {
      ui.list.innerHTML = list.map((r) => `<div class="item ${r.id === state.selectedId ? 'active' : ''}" data-id="${r.id}">${r.smmId} • #${r.orderNo} • ${r.status}</div>`).join('') || '<div class="empty">Şikayet kaydı yok.</div>';
      ui.list.querySelectorAll('[data-id]').forEach((el) => el.addEventListener('click', () => {
        state.selectedId = el.getAttribute('data-id') || '';
        render();
      }));
    }
    renderTable(list);
    renderDetail();
  }

  async function saveRows() { await setLocal(KEY, state.rows); }
  async function loadRows() {
    const rows = await getLocal(KEY);
    state.rows = Array.isArray(rows) ? rows : [];
    if (!state.selectedId && state.rows[0]) state.selectedId = state.rows[0].id;
    render();
  }

  async function verifyOnly() {
    const ok = await verifySession(await getActiveTabId());
    if (ui.actionHint) ui.actionHint.textContent = ok ? 'Oturum doğrulandı ✅' : 'Oturum doğrulanamadı ⚠️';
    toast(ok ? 'Oturum doğrulandı.' : 'Oturum doğrulanamadı.');
  }

  async function scanComplaints() {
    state.stop = false;
    state.nid = Number(ui.nid?.value || 0);
    const maxPages = Math.max(1, Math.min(500, Number(ui.pages?.value || 5)));

    if (!ui.today?.value) {
      const n = new Date();
      ui.today.value = `${String(n.getDate()).padStart(2, '0')}.${String(n.getMonth() + 1).padStart(2, '0')}.${n.getFullYear()}`;
    }
    const labels = buildRange(ui.today.value, ui.days?.value || 5);
    if (ui.targetDays) ui.targetDays.textContent = `Hedef günler: ${labels.join(', ')}`;

    const tabId = await getActiveTabId();
    if (ui.actionHint) ui.actionHint.textContent = 'Oturum doğrulanıyor...';
    if (!(await verifySession(tabId))) {
      if (ui.actionHint) ui.actionHint.textContent = 'Oturum doğrulanamadı.';
      toast('Oturum doğrulanamadı. Önce giriş yapın.');
      return;
    }

    const dedup = new Set(state.rows.map((r) => `${r.smmId}|${r.orderNo}|${r.dateText}`));
    for (let p = 1; p <= maxPages; p += 1) {
      if (state.stop) break;
      if (ui.actionHint) ui.actionHint.textContent = `Sayfa ${p} taranıyor...`;
      const page = await extractPage(tabId, p);
      if (!page.totalCards) break;

      for (const item of page.rows) {
        if (state.stop) break;
        const row = extractComplaintRow(item.text);
        if (!row || !inRange(row.dateText)) continue;
        const key = `${row.smmId}|${row.orderNo}|${row.dateText}`;
        if (dedup.has(key)) continue;
        dedup.add(key);

        const user = (item.link.match(/\/u\/([A-Za-z0-9._-]{3,32})/) || [,''])[1] || '';
        state.rows.unshift({
          id: crypto.randomUUID(),
          ...row,
          pageNo: p,
          cardIndex: item.cardIndex,
          orderUrl: item.link,
          customer: user,
          messageUrl: user ? `https://hesap.com.tr/p/mesaj/${user}` : '',
          logs: [`${new Date().toLocaleString('tr-TR')} sayfa ${p} kart ${item.cardIndex}`]
        });
      }
      render();
      await humanPause(700, 1800);
    }

    await saveRows();
    if (!state.selectedId && state.rows[0]) state.selectedId = state.rows[0].id;
    render();
    if (ui.actionHint) ui.actionHint.textContent = state.stop ? 'Tarama kullanıcı tarafından durduruldu.' : 'Tarama tamamlandı.';
    toast(`Şikayet tarama tamamlandı. Toplam kayıt: ${state.rows.length}`);
  }

  function stopScan() { state.stop = true; toast('Tarama durdurma isteği alındı.'); }
  function pickSelected() { return state.rows.find((x) => x.id === state.selectedId); }

  function draftReply() {
    const c = pickSelected();
    if (!c) return toast('Önce kayıt seç.');
    ui.draft.value = [`Merhaba,`, `Sipariş #${c.orderNo} ve SMM ID ${c.smmId} kaydını kontrol ettik.`, `Durum: ${c.status}.`, `Sorun satırı: ${c.problemText}.`, `Fiyat: ${c.priceText || '—'}.`].join('\n');
    ui.actionHint.textContent = 'Yanıt taslağı oluşturuldu.';
  }

  function solutionSuggest() {
    const c = pickSelected();
    if (!c) return toast('Önce kayıt seç.');
    toast(c.slaRisk ? 'SLA riski var: hızlı çözüm + eskalasyon önerilir.' : 'Sipariş logunu doğrula ve durum güncellemesi ver.');
  }

  async function escalate() {
    const c = pickSelected();
    if (!c) return toast('Önce kayıt seç.');
    c.status = 'ESKALE EDİLDİ';
    c.logs.push(`${new Date().toLocaleString('tr-TR')} eskale edildi`);
    await saveRows();
    render();
  }

  async function closeComplaint() {
    const c = pickSelected();
    if (!c) return toast('Önce kayıt seç.');
    c.status = 'KAPALI';
    c.logs.push(`${new Date().toLocaleString('tr-TR')} kapatıldı`);
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
    ui.pages = byId('inpComplaintPages');
    ui.days = byId('inpComplaintDays');
    ui.today = byId('inpComplaintToday');
    ui.nid = byId('inpComplaintNid');
    ui.nidValue = byId('complaintNidValue');
    ui.targetDays = byId('complaintTargetDays');
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
    byId('btnComplaintScan')?.addEventListener('click', scanComplaints);
    byId('btnComplaintStop')?.addEventListener('click', stopScan);
    byId('btnComplaintDraft')?.addEventListener('click', draftReply);
    byId('btnComplaintSolution')?.addEventListener('click', solutionSuggest);
    byId('btnComplaintEscalate')?.addEventListener('click', escalate);
    byId('btnComplaintClose')?.addEventListener('click', closeComplaint);
    byId('btnComplaintCopyDraft')?.addEventListener('click', copyDraft);
    byId('btnComplaintOpenMessage')?.addEventListener('click', openMessagePage);
    byId('btnComplaintFullscreen')?.addEventListener('click', toggleFullscreen);

    ui.search?.addEventListener('input', render);
    ui.nid?.addEventListener('input', () => {
      state.nid = Number(ui.nid.value || 0);
      ui.nidValue.textContent = String(state.nid);
    });

    if (!ui.today.value) {
      const n = new Date();
      ui.today.value = `${String(n.getDate()).padStart(2, '0')}.${String(n.getMonth() + 1).padStart(2, '0')}.${n.getFullYear()}`;
    }
    ui.nidValue.textContent = String(ui.nid?.value || 0);
  }

  bind();
  loadRows();
})();
