(() => {
  if (typeof window === 'undefined' || document.body?.dataset?.page !== 'sidepanel') return;
  'use strict';

  const KEY = 'patpat_complaints';
  const STATUS_URL = 'https://hesap.com.tr/p/sattigim-ilanlar?page=';
  const ANABAYI_SEARCH = 'https://anabayiniz.com/orders?search=';

  const RX = Object.freeze({
    problemLine: /SORUN\s*BİLDİRİLDİ/i,
    slaList: [
      /SORUN\s*BİLDİRİLDİ\s*\((\d{1,2})\s*SA\s*(\d{1,2})\s*DK\s*KALDI\)/i,
      /SORUN\s*BİLDİRİLDİ\s*\((\d{1,2})\s*SAAT\s*(\d{1,2})\s*DAKİKA\s*KALDI\)/i,
      /SORUN\s*BİLDİRİLDİ\s*\((\d{1,2})\s*SA\s*(\d{1,2})\s*DK\)/i,
      /\((\d{1,2})\s*SA\s*(\d{1,2})\s*DK\s*KALDI\)/i,
      /SORUN\s*BİLDİRİLDİ\s*\(\s*(\d{1,2})\s*SA\s*(\d{1,2})\s*DK\s*KALDI\s*\)/i
    ],
    smmList: [
      /\bSMM\s*ID:\s*(\d{5,8})\b/i,
      /\bSMM\s*ID\s*[:\-]\s*(\d{5,8})\b/i,
      /\bSMM\s*ID\s*(\d{5,8})\b/i,
      /\bSMMID\s*[:\-]?\s*(\d{5,8})\b/i,
      /\bSMM\s*İD:\s*(\d{5,8})\b/i
    ],
    userFromProfile: /^https:\/\/hesap\.com\.tr\/u\/([A-Za-z0-9._-]{3,32})$/i,
    serviceCleaners: [
      /^\s*\d{3,6}\s*[—-]\s*/,
      /^\s*\d{3,6}\s*:\s*/,
      /^\s*\d{3,6}\s+/,
      /^\s*ID\s*\d{3,6}\s*[—-]\s*/i,
      /^\s*\(\d{3,6}\)\s*/
    ]
  });

  const ui = {};
  const state = { rows: [], stop: false, selectedId: '', speed: 5 };

  const byId = (id) => document.getElementById(id);
  const toast = (m) => window.__PatpatUI?.UI?.toast?.(m) || alert(m);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const randomDelay = () => {
    const k = Math.max(1, Math.min(10, Number(state.speed || 5)));
    const min = 200 + (10 - k) * 10;
    const max = 400 + (10 - k) * 20;
    return wait(min + Math.floor(Math.random() * Math.max(1, max - min)));
  };

  async function getLocal(key) { const x = await chrome.storage.local.get(key); return x[key]; }
  async function setLocal(key, val) { await chrome.storage.local.set({ [key]: val }); }

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

  function cleanService(svc) {
    let out = String(svc || '').trim();
    RX.serviceCleaners.forEach((r) => { out = out.replace(r, ''); });
    return out.trim();
  }

  function riskTag(slaMinutes) {
    if (!Number.isFinite(slaMinutes)) return 'NORMAL';
    if (slaMinutes <= 120) return 'ACİL';
    if (slaMinutes <= 480) return 'UYARI';
    return 'NORMAL';
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
      <div><b>Sipariş Link:</b> <a href="${c.orderUrl || '#'}" target="_blank">${c.orderUrl || '—'}</a></div>
      <div><b>Mesaj:</b> <a href="${c.messageUrl || '#'}" target="_blank">${c.messageUrl || '—'}</a></div>
      <div style="margin-top:8px;font-size:12px;color:rgba(169,180,230,.85)">Kontrol Logu: ${c.logs?.join(' • ') || '—'}</div>
    </div>`;
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
      'Linke erişim yoksa bizim tarafımızda sorun yok.'
    ].join('\n');
  }

  async function saveRows() { await setLocal(KEY, state.rows); }
  async function loadRows() {
    const rows = await getLocal(KEY);
    state.rows = Array.isArray(rows) ? rows : [];
    if (!state.selectedId && state.rows[0]) state.selectedId = state.rows[0].id;
    render();
  }

  async function scanComplaints() {
    state.stop = false;
    state.speed = Number(ui.speed?.value || 5);
    const maxPages = Math.max(1, Number(ui.pages?.value || 5));
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return toast('Aktif sekme bulunamadı.');

    const dedup = new Set(state.rows.map((r) => r.smmId).filter(Boolean));

    for (let p = 1; p <= maxPages; p += 1) {
      if (state.stop) break;
      await randomDelay();
      await chrome.tabs.update(tab.id, { url: `${STATUS_URL}${p}` });
      await new Promise((resolve) => {
        const h = (id, info) => { if (id === tab.id && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(h); resolve(true); } };
        chrome.tabs.onUpdated.addListener(h);
      });

      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async () => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const cards = Array.from(document.querySelectorAll('article, .card, [class*="order"], [class*="ilan"]'));
          const out = [];
          for (let i = 0; i < cards.length; i += 1) {
            window.scrollBy(0, Math.floor(window.innerHeight * 0.9));
            await sleep(220 + Math.floor(Math.random() * 200));
            const c = cards[i];
            const text = String(c?.innerText || '');
            if (!/SORUN\s*BİLDİRİLDİ/i.test(text)) continue;
            const link = c.querySelector('a[href]')?.href || '';
            const date = (text.match(/(\d{2}\.\d{2}\.\d{4}\s\d{2}:\d{2})/) || [,''])[1] || '';
            const smm = (text.match(/\bSMM\s*ID\s*[:\-]?\s*(\d{5,8})\b/i) || [,''])[1] || '';
            out.push({ text, link, date, cardHtml: c.outerHTML.slice(0, 1200), smm });
          }
          return { count: cards.length, rows: out };
        }
      });

      const pageResult = result || { count: 0, rows: [] };
      if (!pageResult.count) break;
      for (const raw of pageResult.rows || []) {
        const text = String(raw.text || '');
        const smmId = raw.smm || parseSmmId(text);
        if (smmId && dedup.has(smmId)) continue;
        if (smmId) dedup.add(smmId);

        const slaMinutes = parseSlaMinutes(text);
        const risk = Number.isFinite(slaMinutes) && slaMinutes <= 120;
        const user = (raw.link.match(/\/u\/([A-Za-z0-9._-]{3,32})/) || [,''])[1] || '';
        const service = cleanService((text.match(/\n([^\n]{8,90})\nSMM\s*ID/i) || [,''])[1] || '');

        const rec = {
          id: crypto.randomUUID(),
          smmId,
          customer: user,
          platform: (text.match(/(TIKTOK|INSTAGRAM|YOUTUBE|TWITTER)/i) || [,''])[1] || '',
          serviceName: service,
          startCount: Number((text.match(/Başlangıç\s*:?\s*(\d+)/i) || [,''])[1]) || null,
          quantity: Number((text.match(/Miktar\s*:?\s*(\d+)/i) || [,''])[1]) || null,
          remains: Number((text.match(/Kalan\s*:?\s*(\d+)/i) || [,''])[1]) || null,
          status: (text.match(/(YÜKLENİYOR|İPTAL|TAMAMLANDI|BEKLEMEDE|HATA|İADE)/i) || [,''])[1] || 'BEKLEMEDE',
          slaMinutes,
          slaRisk: risk,
          orderUrl: raw.link,
          dateText: raw.date,
          profileUrl: user ? `https://hesap.com.tr/u/${user}` : '',
          messageUrl: user ? `https://hesap.com.tr/p/mesaj/${user}` : '',
          tags: [],
          rawText: text,
          logs: [`${new Date().toLocaleString('tr-TR')} kart okundu`, risk ? 'İHLAL RİSKİ' : 'SLA normal']
        };
        rec.tags = classify(rec);
        state.rows.unshift(rec);
      }

      if ((pageResult.rows || []).length === 0) break;
    }

    await saveRows();
    if (!state.selectedId && state.rows[0]) state.selectedId = state.rows[0].id;
    render();
    toast(`Şikayet tarama tamamlandı. ${state.rows.length} kayıt.`);
  }

  function stopScan() { state.stop = true; toast('Şikayet tarama durduruldu.'); }

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

  function bind() {
    ui.pages = byId('inpComplaintPages');
    ui.speed = byId('rngComplaintSpeed');
    ui.search = byId('inpComplaintSearch');
    ui.stats = byId('complaintStats');
    ui.list = byId('complaintsList');
    ui.detail = byId('complaintDetail');
    ui.draft = byId('complaintDraftText');
    ui.actionHint = byId('complaintActionHint');

    byId('btnComplaintScan')?.addEventListener('click', scanComplaints);
    byId('btnComplaintStop')?.addEventListener('click', stopScan);
    byId('btnComplaintDraft')?.addEventListener('click', draftReply);
    byId('btnComplaintSolution')?.addEventListener('click', solutionSuggest);
    byId('btnComplaintEscalate')?.addEventListener('click', escalate);
    byId('btnComplaintClose')?.addEventListener('click', closeComplaint);
    byId('btnComplaintCopyDraft')?.addEventListener('click', copyDraft);
    byId('btnComplaintOpenMessage')?.addEventListener('click', openMessagePage);
    ui.search?.addEventListener('input', render);
    ui.speed?.addEventListener('input', () => { state.speed = Number(ui.speed.value || 5); });
  }

  const Sikayet = { init: async () => { bind(); await loadRows(); }, scanComplaints, stopScan };
  window.Patpat = window.Patpat || {};
  window.Patpat.Sikayet = Sikayet;
  Sikayet.init();
})();
