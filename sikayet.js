(() => {
  if (typeof window === 'undefined' || document.body?.dataset?.page !== 'sidepanel') return;
  'use strict';

  const KEY = 'patpat_complaints';
  const STATUS_BASE = 'https://hesap.com.tr/p/sattigim-ilanlar';
  const DATE_TIME_RX = /\b\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}\b/;

  const RX = Object.freeze({
    problemLine: /sorun/i,
    slaList: [
      /SORUN\s*BİLDİRİLDİ\s*\((\d{1,2})\s*SA\s*(\d{1,2})\s*DK\s*KALDI\)/i,
      /SORUN\s*BİLDİRİLDİ\s*\((\d{1,2})\s*SAAT\s*(\d{1,2})\s*DAKİKA\s*KALDI\)/i,
      /\((\d{1,2})\s*SA\s*(\d{1,2})\s*DK\s*KALDI\)/i
    ],
    smmList: [
      /\bSMM\s*ID\s*[:\-]?\s*(\d{4,12})\b/i,
      /\bSMMID\s*[:\-]?\s*(\d{4,12})\b/i,
      /\bSMM\s*İD\s*[:\-]?\s*(\d{4,12})\b/i
    ],
    serviceCleaners: [
      /^\s*\d{3,6}\s*[—-]\s*/,
      /^\s*\d{3,6}\s*:\s*/,
      /^\s*\(\d{3,6}\)\s*/
    ]
  });

  const ui = {};
  const state = {
    rows: [],
    stop: false,
    selectedId: '',
    nid: 0,
    targetDayMonths: new Set(),
    minAllowedDate: null
  };

  const byId = (id) => document.getElementById(id);
  const toast = (m) => window.__PatpatUI?.UI?.toast?.(m) || alert(m);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function getLocal(key) { const x = await chrome.storage.local.get(key); return x[key]; }
  async function setLocal(key, val) { await chrome.storage.local.set({ [key]: val }); }

  function cleanService(svc) {
    let out = String(svc || '').trim();
    RX.serviceCleaners.forEach((r) => { out = out.replace(r, ''); });
    return out.trim();
  }

  function parseSlaMinutes(text) {
    const s = String(text || '');
    for (const rx of RX.slaList) {
      const m = s.match(rx);
      if (m) return (Number(m[1]) * 60) + Number(m[2]);
    }
    return null;
  }

  function parseSmmId(text) {
    const s = String(text || '');
    for (const rx of RX.smmList) {
      const m = s.match(rx);
      if (m) return m[1];
    }
    return '';
  }

  function riskTag(slaMinutes) {
    if (!Number.isFinite(slaMinutes)) return 'NORMAL';
    if (slaMinutes <= 120) return 'ACİL';
    if (slaMinutes <= 480) return 'UYARI';
    return 'NORMAL';
  }

  function classify(c) {
    const t = `${c.status} ${c.rawText}`.toLowerCase();
    const tags = [];
    if (t.includes('yüklen')) tags.push('YÜKLENMEDİ');
    if (t.includes('iptal')) tags.push('İPTAL');
    if (t.includes('iade')) tags.push('İADE İSTİYOR');
    if (c.slaRisk) tags.push('SLA RİSK');
    if (!tags.length) tags.push('NORMAL');
    return tags;
  }

  function buildDraft(c) {
    if (!c) return '';
    const statusText = String(c.status || '').toUpperCase().includes('TAMAML') ? 'TESLİM EDİLDİ' : (c.status || '—');
    return [
      `Merhaba ${c.customer || 'değerli müşterimiz'},`,
      `Siparişi almadan önce başlangıç ${c.startCount ?? '—'}’ti.`,
      `Size ${c.quantity ?? '—'} adet ${cleanService(c.serviceName || '')} gönderdik.`,
      `Sipariş durumu: ${statusText}.`,
      `Kontrol için sipariş linki: ${c.orderUrl || '—'}.`,
      'Linke erişim yoksa bizim tarafımızda sorun görünmüyor.'
    ].join('\n');
  }

  function trMonthName(monthIndex) {
    return ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'][monthIndex] || '';
  }

  function parseTodayInput(value) {
    const src = String(value || '').trim().toLocaleUpperCase('tr-TR');
    const m = src.match(/^(\d{1,2})\s+([A-ZÇĞİÖŞÜ]+)$/u);
    if (!m) return new Date();
    const day = Number(m[1]);
    const names = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];
    const month = names.indexOf(m[2]);
    const now = new Date();
    if (day < 1 || day > 31 || month < 0) return now;
    return new Date(now.getFullYear(), month, day, now.getHours(), now.getMinutes(), 0, 0);
  }

  function buildTargetDays(todayDate, daysBack) {
    const safeDays = Math.max(1, Math.min(365, Number(daysBack || 1)));
    const out = [];
    for (let i = 0; i < safeDays; i += 1) {
      const d = new Date(todayDate);
      d.setDate(todayDate.getDate() - i);
      out.push(d);
    }
    state.targetDayMonths = new Set(out.map((d) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`));
    state.minAllowedDate = new Date(out[out.length - 1].getFullYear(), out[out.length - 1].getMonth(), out[out.length - 1].getDate(), 0, 0, 0, 0);
    return out;
  }

  function formatTargetLabel(dates) {
    return dates.map((d) => `${String(d.getDate()).padStart(2, '0')} ${trMonthName(d.getMonth())}`).join(', ');
  }

  function nidDelayScale(nid) {
    const n = Math.max(-100, Math.min(500, Number(nid || 0)));
    if (n >= 0) return 1 / (1 + (n / 100));
    return 1 + (Math.abs(n) / 100);
  }

  async function humanPause(baseMin = 280, baseMax = 800) {
    const scale = nidDelayScale(state.nid);
    const min = Math.max(90, Math.floor(baseMin * scale));
    const max = Math.max(min + 1, Math.floor(baseMax * scale));
    await wait(min + Math.floor(Math.random() * (max - min)));
  }

  function parseDateTime(dt) {
    const m = String(dt || '').match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/);
    if (!m) return null;
    return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), 0, 0);
  }

  function render() {
    const q = String(ui.search?.value || '').toLowerCase().trim();
    const list = state.rows.filter((r) => {
      if (!q) return true;
      return [r.smmId, r.customer, r.status, r.platform, r.serviceName].join(' ').toLowerCase().includes(q);
    });

    if (ui.stats) {
      const risk = list.filter((x) => x.slaRisk).length;
      ui.stats.textContent = `Kayıt: ${list.length} • SLA Risk: ${risk}`;
    }

    if (ui.list) {
      ui.list.innerHTML = list.map((r) => {
        const active = r.id === state.selectedId ? 'active' : '';
        const urgency = riskTag(r.slaMinutes);
        return `<div class="fileitem ${active}" data-id="${r.id}" style="margin-bottom:6px;border:1px solid rgba(255,255,255,.1)">
          <span>${r.smmId || '—'} • ${r.customer || 'müşteri-yok'} • ${r.platform || '-'} </span>
          <span>${r.status || '-'} • ${urgency}</span>
        </div>`;
      }).join('') || '<div class="empty">Şikayet kaydı yok.</div>';

      ui.list.querySelectorAll('[data-id]').forEach((el) => {
        el.addEventListener('click', () => {
          state.selectedId = el.getAttribute('data-id') || '';
          renderDetail();
          render();
        });
      });
    }
    renderDetail();
  }

  function current() { return state.rows.find((x) => x.id === state.selectedId) || null; }

  function renderDetail() {
    const c = current();
    if (!ui.detail) return;
    if (!c) {
      ui.detail.innerHTML = '<div class="empty">Detay görmek için soldan kayıt seçin.</div>';
      return;
    }
    ui.detail.innerHTML = `<div style="border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px;">
      <div><b>SMM ID:</b> ${c.smmId || '—'}</div>
      <div><b>Tarih:</b> ${c.dateText || '—'}</div>
      <div><b>Servis:</b> ${c.serviceName || '—'}</div>
      <div><b>Başlangıç:</b> ${c.startCount ?? '—'} • <b>Miktar:</b> ${c.quantity ?? '—'} • <b>Kalan:</b> ${c.remains ?? '—'}</div>
      <div><b>Durum:</b> ${c.status || '—'} • <b>SLA:</b> ${Number.isFinite(c.slaMinutes) ? `${c.slaMinutes} dk` : '—'}</div>
      <div><b>Sayfa:</b> ${c.pageNo ?? '—'} • <b>Kart:</b> ${c.cardIndex ?? '—'}</div>
      <div><b>Sipariş Link:</b> <a href="${c.orderUrl || '#'}" target="_blank">${c.orderUrl || '—'}</a></div>
      <div><b>Mesaj:</b> <a href="${c.messageUrl || '#'}" target="_blank">${c.messageUrl || '—'}</a></div>
      <div style="margin-top:8px;font-size:12px;color:rgba(169,180,230,.85)">Kontrol Logu: ${c.logs?.join(' • ') || '—'}</div>
    </div>`;
  }

  async function saveRows() { await setLocal(KEY, state.rows); }

  async function loadRows() {
    const rows = await getLocal(KEY);
    state.rows = Array.isArray(rows) ? rows : [];
    if (!state.selectedId && state.rows[0]) state.selectedId = state.rows[0].id;
    render();
  }

  async function getActiveTabId() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) throw new Error('Aktif sekme bulunamadı.');
    return tab.id;
  }

  async function navigateWait(tabId, url) {
    await chrome.tabs.update(tabId, { url });
    await new Promise((resolve) => {
      const listener = (id, info) => {
        if (id === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(true);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
    await humanPause(450, 1100);
  }

  async function verifySession(tabId) {
    await navigateWait(tabId, STATUS_BASE);
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const txt = String(document.body?.innerText || '').toLowerCase();
        const hasCards = document.querySelectorAll('article, .card, [class*="order"], [class*="ilan"]').length > 0;
        const loginInput = document.querySelector('input[type="password"], input[name*="password" i]');
        return { ok: !loginInput && (hasCards || txt.includes('sattığım ilanlar')) };
      }
    });
    return !!result?.ok;
  }

  async function extractPage(tabId, pageNo) {
    const url = pageNo <= 1 ? `${STATUS_BASE}?page=1` : `${STATUS_BASE}?page=${pageNo}`;
    await navigateWait(tabId, url);

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [state.nid],
      func: async (nid) => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const speed = Math.max(-100, Math.min(500, Number(nid || 0)));
        const scale = speed >= 0 ? (1 / (1 + speed / 100)) : (1 + Math.abs(speed) / 100);
        const rand = (a, b) => Math.floor((a + Math.random() * (b - a)) * scale);

        window.scrollTo({ top: 0, behavior: 'auto' });
        await wait(rand(250, 650));

        const total = Math.max(document.body.scrollHeight, window.innerHeight);
        let y = 0;
        while (y < total) {
          const step = Math.floor(window.innerHeight * (0.6 + Math.random() * 0.5));
          y += step;
          window.scrollTo({ top: y, behavior: 'auto' });
          await wait(rand(180, 620));
        }

        const cards = Array.from(document.querySelectorAll('article, .card, [class*="order"], [class*="ilan"]'));
        const out = [];
        const dateRx = /\b\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}\b/;

        for (let i = 0; i < cards.length; i += 1) {
          const c = cards[i];
          if (Math.random() > 0.65) {
            c.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 20 + Math.random() * 240, clientY: 30 + Math.random() * 120 }));
            await wait(rand(80, 220));
          }
          const text = String(c?.innerText || '');
          if (!/sorun/i.test(text)) continue;

          const dt = text.match(dateRx)?.[0] || '';
          const smm = (text.match(/\bSMM\s*ID\s*[:\-]?\s*(\d{4,12})\b/i) || [,''])[1] || '';
          const link = c.querySelector('a[href]')?.href || '';
          out.push({ cardIndex: i + 1, text, dateText: dt, smmId: smm, link });
        }
        return { totalCards: cards.length, rows: out };
      }
    });

    return result || { totalCards: 0, rows: [] };
  }

  function shouldKeepByDate(dateText) {
    const dt = parseDateTime(dateText);
    if (!dt) return false;
    const key = `${String(dt.getDate()).padStart(2, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    return state.targetDayMonths.has(key);
  }

  async function scanComplaints() {
    state.stop = false;
    const maxPages = Math.max(1, Math.min(200, Number(ui.pages?.value || 5)));
    const days = Math.max(1, Math.min(365, Number(ui.days?.value || 5)));
    state.nid = Math.max(-100, Math.min(500, Number(ui.nid?.value || 0)));

    const todayRef = parseTodayInput(ui.today?.value || '');
    const targetDates = buildTargetDays(todayRef, days);
    if (ui.targetDays) ui.targetDays.textContent = `Hedef günler: ${formatTargetLabel(targetDates)}`;

    const tabId = await getActiveTabId();
    if (ui.actionHint) ui.actionHint.textContent = 'Oturum doğrulanıyor...';

    const verified = await verifySession(tabId);
    if (!verified) {
      toast('Oturum doğrulanamadı. Lütfen hesap.com.tr girişini kontrol et.');
      if (ui.actionHint) ui.actionHint.textContent = 'Oturum doğrulanamadı.';
      return;
    }

    const dedup = new Set(state.rows.map((r) => r.smmId).filter(Boolean));
    let stopByDateLimit = false;

    for (let p = 1; p <= maxPages; p += 1) {
      if (state.stop) break;
      if (ui.actionHint) ui.actionHint.textContent = `Sayfa ${p} taranıyor...`;

      await humanPause(300, 900);
      const pageResult = await extractPage(tabId, p);
      if (!pageResult.totalCards) break;

      let pageHasInRange = false;
      let pageHasTooOld = false;

      for (const raw of pageResult.rows || []) {
        if (state.stop) break;
        const text = String(raw.text || '');
        if (!RX.problemLine.test(text)) continue;

        const dateText = raw.dateText || (text.match(DATE_TIME_RX)?.[0] || '');
        if (!dateText) continue;

        const asDate = parseDateTime(dateText);
        if (asDate && state.minAllowedDate && asDate < state.minAllowedDate) {
          pageHasTooOld = true;
        }

        if (!shouldKeepByDate(dateText)) continue;
        pageHasInRange = true;

        const smmId = raw.smmId || parseSmmId(text);
        if (!smmId) continue;
        if (dedup.has(smmId)) continue;
        dedup.add(smmId);

        const slaMinutes = parseSlaMinutes(text);
        const risk = Number.isFinite(slaMinutes) && slaMinutes <= 120;
        const user = (raw.link.match(/\/u\/([A-Za-z0-9._-]{3,32})/) || [,''])[1] || '';
        const service = cleanService((text.match(/\n([^\n]{8,120})\nSMM\s*ID/i) || [,''])[1] || '');

        const rec = {
          id: crypto.randomUUID(),
          smmId,
          customer: user,
          platform: (text.match(/(TIKTOK|INSTAGRAM|YOUTUBE|TWITTER|THREADS|TWITCH)/i) || [,''])[1] || '',
          serviceName: service,
          startCount: Number((text.match(/Başlangıç\s*:?\s*(\d+)/i) || [,''])[1]) || null,
          quantity: Number((text.match(/Miktar\s*:?\s*(\d+)/i) || [,''])[1]) || null,
          remains: Number((text.match(/Kalan\s*:?\s*(\d+)/i) || [,''])[1]) || null,
          status: (text.match(/(YÜKLENİYOR|İPTAL|TAMAMLANDI|BEKLEMEDE|HATA|İADE)/i) || [,''])[1] || 'BEKLEMEDE',
          slaMinutes,
          slaRisk: risk,
          orderUrl: raw.link,
          dateText,
          pageNo: p,
          cardIndex: raw.cardIndex,
          profileUrl: user ? `https://hesap.com.tr/u/${user}` : '',
          messageUrl: user ? `https://hesap.com.tr/p/mesaj/${user}` : '',
          tags: [],
          rawText: text,
          logs: [`${new Date().toLocaleString('tr-TR')} sayfa ${p} kart ${raw.cardIndex} okundu`, 'SORUN filtresi ile eşleşti']
        };

        rec.tags = classify(rec);
        state.rows.unshift(rec);
      }

      render();
      await humanPause(1000, 3000);

      if (!pageHasInRange && pageHasTooOld) {
        stopByDateLimit = true;
        break;
      }
    }

    await saveRows();
    if (!state.selectedId && state.rows[0]) state.selectedId = state.rows[0].id;
    render();
    if (ui.actionHint) ui.actionHint.textContent = stopByDateLimit ? 'Tarih limiti nedeniyle durduruldu.' : 'Tarama tamamlandı.';
    toast(`Şikayet tarama tamamlandı. Toplam kayıt: ${state.rows.length}`);
  }

  function stopScan() {
    state.stop = true;
    toast('Şikayet tarama durduruldu.');
  }

  async function draftReply() {
    const c = current();
    if (!c) return toast('Önce bir kayıt seçin.');
    const t = buildDraft(c);
    if (ui.draft) ui.draft.value = t;
    if (ui.actionHint) {
      const hidden = !/^\s*\d{3,6}\s*[—:-]/.test(t);
      ui.actionHint.textContent = `Servis ID gizleme kontrolü: ${hidden ? '✅ ID görünmüyor' : '⚠️ kontrol et'}`;
    }
  }

  function solutionSuggest() {
    const c = current();
    if (!c) return toast('Önce bir kayıt seçin.');
    const opts = [];
    if (String(c.status).toUpperCase().includes('TAMAML')) opts.push('Önce kanıtla, sonra açıkla.');
    if (c.remains > 0) opts.push('Kısmi teslim: kalan için ek yükleme öner.');
    if (c.slaRisk) opts.push('Acil eskale önerilir.');
    if (!opts.length) opts.push('İnceleme modunda takip et.');
    toast(opts.join(' | '));
  }

  async function escalate() {
    const c = current();
    if (!c) return toast('Önce bir kayıt seçin.');
    if (!confirm('Yöneticiye eskale edilsin mi?')) return;
    c.status = 'BEKLEMEDE';
    c.tags = [...new Set([...(c.tags || []), 'YÖNETİCİYE ESKALE'])];
    c.logs.push(`${new Date().toLocaleString('tr-TR')} eskale edildi`);
    await saveRows();
    render();
  }

  async function closeComplaint() {
    const c = current();
    if (!c) return toast('Önce bir kayıt seçin.');
    const reason = prompt('Kapatma nedeni (ÇÖZÜLDÜ/HATALI LİNK/İADE/DİĞER):', 'ÇÖZÜLDÜ');
    if (!reason) return;
    c.status = 'KAPALI';
    c.closeReason = reason;
    c.lastMessage = ui.draft?.value || '';
    c.logs.push(`${new Date().toLocaleString('tr-TR')} kapatıldı: ${reason}`);
    await saveRows();
    render();
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(ui.draft?.value || '');
      toast('Taslak kopyalandı.');
    } catch {
      toast('Panoya kopyalanamadı.');
    }
  }

  function openMessagePage() {
    const c = current();
    if (!c?.messageUrl) return toast('Mesaj URL bulunamadı.');
    chrome.tabs.create({ url: c.messageUrl });
  }

  async function verifyOnly() {
    const tabId = await getActiveTabId();
    const ok = await verifySession(tabId);
    if (ui.actionHint) ui.actionHint.textContent = ok ? 'Oturum doğrulandı ✅' : 'Oturum doğrulanamadı ⚠️';
    toast(ok ? 'Oturum doğrulandı.' : 'Oturum doğrulanamadı.');
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

    byId('btnComplaintVerify')?.addEventListener('click', verifyOnly);
    byId('btnComplaintScan')?.addEventListener('click', scanComplaints);
    byId('btnComplaintStop')?.addEventListener('click', stopScan);
    byId('btnComplaintDraft')?.addEventListener('click', draftReply);
    byId('btnComplaintSolution')?.addEventListener('click', solutionSuggest);
    byId('btnComplaintEscalate')?.addEventListener('click', escalate);
    byId('btnComplaintClose')?.addEventListener('click', closeComplaint);
    byId('btnComplaintCopyDraft')?.addEventListener('click', copyDraft);
    byId('btnComplaintOpenMessage')?.addEventListener('click', openMessagePage);

    ui.search?.addEventListener('input', render);
    ui.nid?.addEventListener('input', () => {
      state.nid = Math.max(-100, Math.min(500, Number(ui.nid.value || 0)));
      if (ui.nidValue) ui.nidValue.textContent = String(state.nid);
    });

    if (ui.today && !ui.today.value) {
      const n = new Date();
      ui.today.value = `${n.getDate()} ${trMonthName(n.getMonth())}`;
    }
    if (ui.nidValue) ui.nidValue.textContent = String(ui.nid?.value || 0);
  }

  const Sikayet = { init: async () => { bind(); await loadRows(); }, scanComplaints, stopScan };
  window.Patpat = window.Patpat || {};
  window.Patpat.Sikayet = Sikayet;
  Sikayet.init();
})();
