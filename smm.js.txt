(() => {
  if (typeof window === 'undefined' || document.body?.dataset?.page !== 'sidepanel') return;
  'use strict';

  const BASE = 'https://anabayiniz.com/orders';
  const STATUSES = ['pending', 'completed', 'inprogress', 'canceled'];

  const state = {
    rows: [],
    hashes: new Set(),
    dropped: 0,
    stop: false,
    running: false
  };

  const ui = {};

  const byId = (id) => document.getElementById(id);
  const toast = (m) => window.__PatpatUI?.UI?.toast?.(m) || alert(m);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function normalizeSpace(v){ return String(v || '').replace(/\s+/g, ' ').trim(); }
  function updateStats(mode='beklemede'){
    if (ui.stats) ui.stats.textContent = `Satır: ${state.rows.length} • Atılan: ${state.dropped} • Durum: ${mode}`;
    if (ui.empty) ui.empty.hidden = state.rows.length > 0;
  }

  async function hashRow(r){
    const src = `${r.orderId}|${r.dateTime}|${r.orderUrl}|${r.unitPrice}|${r.service}|${r.status}|${r.remains}`;
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(src));
    return Array.from(new Uint8Array(d)).map((b)=>b.toString(16).padStart(2,'0')).join('');
  }

  function appendRow(row){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.orderId}</td><td>${row.dateTime}</td><td>${row.orderUrl}</td><td>${row.unitPrice}</td><td>${row.service}</td><td>${row.status}</td><td>${row.remains}</td>`;
    ui.tbody.appendChild(tr);
    updateStats(state.running ? 'taranıyor' : 'tamamlandı');
  }

  function statusUrl(status){ return status ? `${BASE}/${status}` : BASE; }

  async function getActiveTabId(){
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) throw new Error('Aktif sekme bulunamadı.');
    return tab.id;
  }

  async function gotoAndWait(tabId, url){
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

  async function detectMaxPage(tabId){
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const nums = Array.from(document.querySelectorAll('a,button,li,span'))
          .map((n) => Number((n.textContent || '').trim()))
          .filter((n) => Number.isFinite(n));
        return nums.length ? Math.max(...nums) : 1;
      }
    });
    return Math.max(1, Number(result || 1));
  }

  async function extractFromCurrentPage(tabId){
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
        const rows = [];

        const trList = Array.from(document.querySelectorAll('table tbody tr'));
        for (const tr of trList) {
          try {
            const txt = clean(tr.innerText);
            if (!txt) continue;
            const orderId = (txt.match(/^(\d{7,10})$/m) || [,''])[1];
            const dateTime = (txt.match(/(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})/) || [,''])[1];
            const orderUrl = tr.querySelector('a[href]')?.href || (txt.match(/https?:\/\/[^\s\]]+/) || [,''])[1] || '';
            const unitPrice = Number((txt.match(/(\d+(?:\.\d+)?)/) || [,'0'])[1]);
            const service = (txt.match(/(\d+\s*—\s*.*)/) || [,''])[1];
            const status = (txt.match(/(Tamamlandı|İşlem Sırasında|Beklemede|İptal Edildi|Kısmi Tamamlandı|İade Edildi)/) || [,''])[1];
            const remains = Number((txt.match(/\t(\d+)$/) || [,'0'])[1]);
            if (orderId || orderUrl) rows.push({ orderId, dateTime, orderUrl, unitPrice, service, status, remains, error: '' });
          } catch (e) {
            rows.push({ orderId:'', dateTime:'', orderUrl:'', unitPrice:0, service:'', status:'', remains:0, error: String(e?.message || e) });
          }
        }

        if (rows.length) return { rows, pageText: '' };

        const text = String(document.body.innerText || '');
        const fallback = [];
        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
        for (const ln of lines) {
          const orderId = (ln.match(/^(\d{7,10})$/) || [,''])[1];
          const dateTime = (ln.match(/(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})/) || [,''])[1];
          const orderUrl = (ln.match(/https?:\/\/[^\s\]]+/) || [,''])[1];
          const unitPrice = Number((ln.match(/(\d+(?:\.\d+)?)/) || [,'0'])[1]);
          const service = (ln.match(/(\d+\s*—\s*.*)/) || [,''])[1];
          const status = (ln.match(/(Tamamlandı|İşlem Sırasında|Beklemede|İptal Edildi|Kısmi Tamamlandı|İade Edildi)/) || [,''])[1];
          const remains = Number((ln.match(/\t(\d+)$/) || [,'0'])[1]);
          if (orderId || orderUrl || dateTime) fallback.push({ orderId, dateTime, orderUrl, unitPrice, service, status, remains, error: '' });
        }
        return { rows: fallback, pageText: text };
      }
    });
    return result || { rows: [], pageText: '' };
  }

  function passTimeFilter(dateTime){
    const mode = ui.timeFilter?.value || 'all';
    if (mode === 'all') return true;
    const d = new Date(String(dateTime || '').replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return false;
    const now = Date.now();
    if (mode === '1d') return now - d.getTime() <= 24 * 3600 * 1000;
    if (mode === '7d') return now - d.getTime() <= 7 * 24 * 3600 * 1000;
    const x = Number(ui.xDays?.value || 30);
    return now - d.getTime() <= x * 24 * 3600 * 1000;
  }

  async function scanStatus(tabId, status, userMaxPage){
    await gotoAndWait(tabId, statusUrl(status));
    const maxDom = await detectMaxPage(tabId);
    const max = Math.max(1, Math.min(maxDom, Number(userMaxPage || 5)));

    for (let p = 1; p <= max; p++) {
      if (state.stop) return;
      const target = p === 1 ? statusUrl(status) : `${statusUrl(status)}?page=${p}`;
      updateStats(`${status || 'genel'} p${p}/${max}`);
      await gotoAndWait(tabId, target);

      let ext = await extractFromCurrentPage(tabId);
      if (!ext.rows.length) {
        await chrome.tabs.reload(tabId);
        await wait(1200);
        ext = await extractFromCurrentPage(tabId);
      }
      if (!ext.rows.length) toast('DOM+Regex veri bulamadı. Sayfayı Kopyala akışı kullanılmalı.');

      for (const r of ext.rows) {
        if (state.stop) return;
        if (!passTimeFilter(r.dateTime)) continue;
        const row = {
          orderId: normalizeSpace(r.orderId),
          dateTime: normalizeSpace(r.dateTime),
          orderUrl: normalizeSpace(r.orderUrl),
          unitPrice: Number(r.unitPrice || 0),
          service: normalizeSpace(r.service),
          status: normalizeSpace(r.status),
          remains: Number(r.remains || 0),
          error: r.error || ''
        };
        const h = await hashRow(row);
        if (state.hashes.has(h)) { state.dropped += 1; continue; }
        state.hashes.add(h);
        state.rows.push(row);
        appendRow(row);
      }
    }
  }

  async function startScan({ status, maxPages }){
    if (state.running) throw new Error('SMM taraması zaten çalışıyor.');
    state.stop = false;
    state.running = true;
    updateStats('başlatıldı');

    const tabId = await getActiveTabId();
    const list = status === 'all' ? STATUSES : [status];
    await gotoAndWait(tabId, BASE);
    for (const st of list) {
      if (state.stop) break;
      await scanStatus(tabId, st, maxPages || 5);
    }

    state.running = false;
    updateStats(state.stop ? 'durduruldu' : 'tamamlandı');
    toast(state.stop ? 'SMM taraması durduruldu.' : 'SMM taraması tamamlandı.');
  }

  function stopScan(){ state.stop = true; }
  function clearTable(){
    if (!confirm('SMM tablo ve state temizlensin mi?')) return;
    state.rows = [];
    state.hashes.clear();
    state.dropped = 0;
    ui.tbody.innerHTML = '';
    updateStats('temizlendi');
  }

  async function copyTableMarkdown(){
    const head = '| Sipariş ID | Tarih | Sipariş Link | Birim Fiyat | Servis | Durum | Kalan |\n|---|---|---|---:|---|---|---:|';
    const body = state.rows.map((r) => `| ${r.orderId} | ${r.dateTime} | ${r.orderUrl} | ${r.unitPrice} | ${r.service} | ${r.status} | ${r.remains} |`).join('\n');
    try { await navigator.clipboard.writeText(`${head}\n${body}`); toast('SMM tablosu MD kopyalandı.'); }
    catch { toast('Panoya kopyalama başarısız.'); }
  }

  function dl(name, text, mime){
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportJson(){ dl(`smm_${Date.now()}.json`, JSON.stringify(state.rows, null, 2), 'application/json'); }
  function exportCsv(){
    const cols = ['Sipariş ID','Tarih','Sipariş Link','Birim Fiyat','Servis','Durum','Kalan'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g,'""')}"`;
    const lines = [cols.join(',')].concat(state.rows.map((r) => [r.orderId, r.dateTime, r.orderUrl, r.unitPrice, r.service, r.status, r.remains].map(esc).join(',')));
    dl(`smm_${Date.now()}.csv`, '\ufeff' + lines.join('\n'), 'text/csv;charset=utf-8');
  }

  function bind(){
    ui.selStatus = byId('selSmmStatus');
    ui.maxPage = byId('inpSmmMaxPage');
    ui.timeFilter = byId('selSmmTimeFilter');
    ui.xDays = byId('inpSmmXDays');
    ui.tbody = byId('tblSmmBody');
    ui.stats = byId('smmStats');
    ui.empty = byId('smmEmpty');

    byId('btnSmmStart')?.addEventListener('click', async () => {
      try {
        await startScan({ status: ui.selStatus?.value || 'all', maxPages: Number(ui.maxPage?.value || 5) });
      } catch (e) {
        toast(`SMM tarama hatası: ${String(e?.message || e)}`);
      }
    });
    byId('btnSmmStop')?.addEventListener('click', () => stopScan());
    byId('btnSmmClear')?.addEventListener('click', () => clearTable());
    byId('btnSmmCopyMd')?.addEventListener('click', () => copyTableMarkdown());
    byId('btnSmmExportJson')?.addEventListener('click', () => exportJson());
    byId('btnSmmExportCsv')?.addEventListener('click', () => exportCsv());
  }

  const SMM = { init: bind, startScan, stopScan, clearTable, copyTableMarkdown, exportJson, exportCsv };
  window.Patpat = window.Patpat || {};
  window.Patpat.SMM = SMM;
  SMM.init();
})();
