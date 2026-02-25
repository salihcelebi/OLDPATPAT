(() => {
  if (typeof window === 'undefined' || document.body?.dataset?.page !== 'sidepanel') return;
  'use strict';

  const STATUSES = ['pending', 'processing', 'completed', 'cancelled', 'returnprocess'];
  const BASE_URL = 'https://hesap.com.tr/p/sattigim-ilanlar';

  const state = {
    rows: [],
    hashes: new Set(),
    dropped: 0,
    stop: false,
    running: false
  };

  const ui = {};

  function byId(id){ return document.getElementById(id); }
  function toast(msg){ window.__PatpatUI?.UI?.toast?.(msg) || alert(msg); }
  function log(level, msg){ window.__PatpatUI?.UI?.log?.(level, msg); }
  function wait(ms){ return new Promise(r => setTimeout(r, ms)); }

  function normalizeSpace(v){ return String(v || '').replace(/\s+/g, ' ').trim(); }
  function normalizeStatus(s){
    const t = normalizeSpace(s).toLowerCase();
    if (t.includes('teslimat bekleniyor')) return 'pending';
    if (t.includes('müşteriden onay bekleniyor')) return 'processing';
    if (t.includes('teslim edildi')) return 'completed';
    if (t.includes('iptal edildi')) return 'cancelled';
    if (t.includes('iade sürecinde')) return 'returnprocess';
    if (t.includes('sorun bildirildi')) return 'problem';
    return t;
  }

  function updateStats(extra='beklemede'){
    if (ui.stats) ui.stats.textContent = `Satır: ${state.rows.length} • Atılan: ${state.dropped} • Durum: ${extra}`;
    if (ui.empty) ui.empty.hidden = state.rows.length > 0;
  }

  async function hashRow(r){
    const src = `${r.orderNo}|${r.smmId}|${r.dateTime}|${r.totalTl}|${r.status}`;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(src));
    return Array.from(new Uint8Array(digest)).map((b)=>b.toString(16).padStart(2,'0')).join('');
  }

  function appendRow(row){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.title}</td><td>${row.orderNo}</td><td>${row.smmId}</td><td>${row.dateTime}</td><td>${row.status}</td><td>${row.totalTl}</td><td>${row.username || ''}</td>`;
    ui.tbody.appendChild(tr);
    updateStats(state.running ? 'taranıyor' : 'tamamlandı');
  }

  function buildPageUrl(status, page){
    const qs = [];
    if (status) qs.push(`status=${encodeURIComponent(status)}`);
    if (page > 1) qs.push(`page=${page}`);
    return qs.length ? `${BASE_URL}?${qs.join('&')}` : BASE_URL;
  }

  async function getActiveTabId(){
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tabs[0]?.id) throw new Error('Aktif sekme bulunamadı.');
    return tabs[0].id;
  }

  async function navigateWait(tabId, url){
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
    await wait(800);
  }

  async function executeExtract(tabId){
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        const sleep = (ms) => new Promise((r)=>setTimeout(r, ms));

        // Scroll to bottom in 0.4s steps
        const step = Math.floor(window.innerHeight * 0.9);
        let y = 0;
        while (y < document.body.scrollHeight) {
          window.scrollTo({ top: y, behavior: 'auto' });
          y += step;
          await sleep(400);
        }
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
        await sleep(400);

        const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim();
        const getText = (root, sel) => clean(root.querySelector(sel)?.textContent || '');

        const rows = [];
        const cards = Array.from(document.querySelectorAll('article, .card, [class*="order"], [class*="siparis"], .list-group-item')).filter((n) => clean(n.innerText).includes('Sipariş'));

        for (const c of cards) {
          try {
            const text = clean(c.innerText);
            const title = clean((c.querySelector('h1,h2,h3,h4,strong,[class*="title"]') || c).textContent || '').split('Sipariş')[0].trim();
            const orderNo = (text.match(/(?:Sipari[sş])\s*#(\d+)/i) || [,''])[1];
            const smmId = (text.match(/SMM ID:\s*(\d+)/i) || [,''])[1];
            const dateTime = (text.match(/(\d{2}\.\d{2}\.\d{4}\s\d{2}:\d{2})/) || [,''])[1];
            const statusRaw = (text.match(/\d{2}:\d{2}\s+([^\n]+?)\s+Toplam Tutar/i) || [,''])[1];
            const totalTl = (text.match(/(\d+(?:,\d+)?)\s*TL/i) || [,''])[1];
            const username = (text.match(/^([A-Za-z0-9_\.]{3,32})$/m) || [,''])[1];

            if (orderNo || smmId) {
              rows.push({ title, orderNo, smmId, dateTime, statusRaw, totalTl, username, error: '' });
            }
          } catch (e) {
            rows.push({ title:'', orderNo:'', smmId:'', dateTime:'', statusRaw:'', totalTl:'', username:'', error: String(e?.message || e) });
          }
        }

        if (rows.length) return { rows, pageText: '' };

        // regex fallback over innerText
        const txt = String(document.body.innerText || '');
        const blocks = txt.split(/(?=Sipari[sş]\s*#\d+)/g).map((b) => b.trim()).filter(Boolean);
        const fallback = [];
        for (const b of blocks) {
          const title = (b.match(/^(.+?)(?=\nSipariş)/m) || [,''])[1].trim();
          const orderNo = (b.match(/(?:Sipari[sş])\s*#(\d+)/i) || [,''])[1];
          const smmId = (b.match(/SMM ID:\s*(\d+)/i) || [,''])[1];
          const dateTime = (b.match(/(\d{2}\.\d{2}\.\d{4}\s\d{2}:\d{2})/) || [,''])[1];
          const statusRaw = (b.match(/(?<=\d{2}:\d{2}\n)(.+?)(?=\nToplam Tutar)/s) || [,''])[1];
          const totalTl = (b.match(/(\d+(?:,\d+)?)\s*TL/i) || [,''])[1];
          const username = (b.match(/^([A-Za-z0-9_\.]{3,32})$/m) || [,''])[1];
          if (orderNo || smmId) fallback.push({ title, orderNo, smmId, dateTime, statusRaw, totalTl, username, error: '' });
        }

        return { rows: fallback, pageText: txt };
      }
    });
    return result || { rows: [], pageText: '' };
  }

  async function getMaxPage(tabId){
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const vals = Array.from(document.querySelectorAll('a,button,li,span')).map((n) => Number((n.textContent || '').trim())).filter((n) => Number.isFinite(n));
        const max = vals.length ? Math.max(...vals) : 1;
        return max > 0 ? max : 1;
      }
    });
    return Number(result || 1);
  }

  async function scanStatus(tabId, status, pageLimitInput){
    const firstUrl = buildPageUrl(status, 1);
    await navigateWait(tabId, firstUrl);
    let maxPage = await getMaxPage(tabId);
    const pageLimit = Math.max(1, Math.min(maxPage, pageLimitInput || 5));

    for (let p = 1; p <= pageLimit; p++) {
      if (state.stop) return;
      const url = buildPageUrl(status, p);
      updateStats(`${status || 'genel'} p${p}/${pageLimit}`);
      await navigateWait(tabId, url);

      let ext = await executeExtract(tabId);
      if (!ext.rows.length) {
        await chrome.tabs.reload(tabId);
        await wait(1200);
        ext = await executeExtract(tabId);
      }

      if (!ext.rows.length) {
        window.__PatpatUI?.UI?.toast?.('Veri alınamadı. Sayfa metni regex paneline hazırlandı.');
      }

      for (const raw of ext.rows) {
        if (state.stop) return;
        try {
          const row = {
            title: normalizeSpace(raw.title),
            orderNo: raw.orderNo || '',
            smmId: raw.smmId || '',
            dateTime: raw.dateTime || '',
            status: normalizeStatus(raw.statusRaw || status || ''),
            totalTl: Number(String(raw.totalTl || '0').replace(',', '.')) || 0,
            username: raw.username || '',
            error: raw.error || ''
          };
          const h = await hashRow(row);
          if (state.hashes.has(h)) { state.dropped += 1; continue; }
          state.hashes.add(h);
          state.rows.push(row);
          appendRow(row);
        } catch (e) {
          log('Hata', `Satır parse hatası: ${String(e?.message || e)}`);
        }
      }
    }
  }

  async function startScan({ status, maxPages }){
    if (state.running) throw new Error('Tarama zaten çalışıyor.');
    state.stop = false;
    state.running = true;
    updateStats('başlatıldı');

    const tabId = await getActiveTabId();
    const statuses = status === 'all' ? STATUSES : [status];
    for (const st of statuses) {
      if (state.stop) break;
      await scanStatus(tabId, st, maxPages || 5);
    }

    state.running = false;
    updateStats(state.stop ? 'durduruldu' : 'tamamlandı');
    toast(state.stop ? 'Sipariş taraması durduruldu.' : 'Sipariş taraması tamamlandı.');
  }

  function stopScan(){ state.stop = true; }
  function clearTable(){
    if (!confirm('Sipariş tablosu ve state temizlensin mi?')) return;
    state.rows = [];
    state.hashes.clear();
    state.dropped = 0;
    ui.tbody.innerHTML = '';
    updateStats('temizlendi');
  }

  async function copyTableMarkdown(){
    const head = '| İlan Başlığı | Sipariş No | SMM ID | Tarih | Durum | Tutar (TL) | Kullanıcı |\n|---|---|---|---|---|---:|---|';
    const body = state.rows.map((r) => `| ${r.title} | ${r.orderNo} | ${r.smmId} | ${r.dateTime} | ${r.status} | ${r.totalTl} | ${r.username} |`).join('\n');
    try { await navigator.clipboard.writeText(`${head}\n${body}`); toast('Sipariş tablosu MD olarak kopyalandı.'); }
    catch { toast('Panoya kopyalama başarısız.'); }
  }

  function download(name, text, mime){
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportJson(){
    download(`siparis_${Date.now()}.json`, JSON.stringify(state.rows, null, 2), 'application/json');
  }

  function exportCsv(){
    const cols = ['İlan Başlığı','Sipariş No','SMM ID','Tarih','Durum','Tutar (TL)','Kullanıcı'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [cols.join(',')].concat(state.rows.map((r) => [r.title, r.orderNo, r.smmId, r.dateTime, r.status, r.totalTl, r.username].map(esc).join(',')));
    download(`siparis_${Date.now()}.csv`, '\ufeff' + lines.join('\n'), 'text/csv;charset=utf-8');
  }

  function bind(){
    ui.selStatus = byId('selSiparisStatus');
    ui.inpMaxPage = byId('inpSiparisMaxPage');
    ui.tbody = byId('tblSiparisBody');
    ui.stats = byId('siparisStats');
    ui.empty = byId('ordersEmpty');

    byId('btnSiparisStart')?.addEventListener('click', async () => {
      try {
        const status = ui.selStatus?.value || 'all';
        const maxPages = Number(ui.inpMaxPage?.value || 5);
        await startScan({ status, maxPages });
      } catch (e) {
        toast(`Sipariş tarama hatası: ${String(e?.message || e)}`);
      }
    });
    byId('btnSiparisStop')?.addEventListener('click', () => stopScan());
    byId('btnSiparisClear')?.addEventListener('click', () => clearTable());
    byId('btnSiparisCopyMd')?.addEventListener('click', () => copyTableMarkdown());
    byId('btnSiparisExportJson')?.addEventListener('click', () => exportJson());
    byId('btnSiparisExportCsv')?.addEventListener('click', () => exportCsv());
  }

  const Siparis = {
    init: bind,
    startScan,
    stopScan,
    clearTable,
    copyTableMarkdown,
    exportJson,
    exportCsv
  };

  window.Patpat = window.Patpat || {};
  window.Patpat.Siparis = Siparis;
  Siparis.init();
})();


(()=>{
  const b=document.getElementById('btnSiparisFullscreen');
  b?.addEventListener('click', async ()=>{
    await chrome.tabs.create({ url: chrome.runtime.getURL('siparis.html'), active:true });
  });
})();
