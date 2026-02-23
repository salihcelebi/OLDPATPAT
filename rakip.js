(() => {
  if (typeof window === 'undefined' || document.body?.dataset?.page !== 'sidepanel') return;
  'use strict';

  const STORAGE_KEYS = Object.freeze({
    selectors: 'rakipDomSelectors',
    regexOverrides: 'regexOverrides'
  });

  const SERVICES_COMMON = ['hesap','takipci','begeni','izlenme','yorum','kaydet','paylas','canli-yayin-izleyici'];
  const SERVICES_PLATFORM = {
    tiktok: ['pk-savas-puani'],
    instagram: ['hikaye-izlenme', 'reels-izlenme'],
    youtube: ['abone', 'izlenme-suresi'],
    twitter: ['retweet', 'goruntulenme'],
    twitch: ['izleyici']
  };

  const state = {
    rows: [],
    hashes: new Set(),
    dropped: 0,
    stopped: false,
    pickField: '',
    currentKey: ''
  };

  const ui = {};

  function byId(id){ return document.getElementById(id); }
  function toast(msg){ window.__PatpatUI?.UI?.toast?.(msg) || alert(msg); }
  function log(level,msg){ window.__PatpatUI?.UI?.log?.(level,msg); }

  function normalizeSpace(s){ return String(s||'').replace(/\s+/g,' ').trim(); }
  function qtyFromTitle(title){
    const m = String(title||'').match(/(\d{1,3}(?:\.\d{3})+|\d+)/);
    if (!m) return 0;
    return Number(m[1].replace(/\./g,'')) || 0;
  }
  function titleShort(title){ return normalizeSpace(title).split(' ').slice(0,3).join(' '); }
  function parsePrice(v){
    const m = String(v||'').match(/(\d+(?:,\d+)?)/);
    return m ? Number(m[1].replace(',','.')) : 0;
  }
  function parseWarranty(v){
    const m = String(v||'').match(/Garanti:\s*(\d+)\s*(Gün|Saat)/i);
    return m ? Number(m[1]) : 0;
  }
  function parseAdPower(v){
    const m = String(v||'').match(/%(\d+)/);
    return m ? Number(m[1]) : 0;
  }

  async function hashRow(r){
    const data = `${r.platform}|${r.service}|${r.qty}|${r.shopName}|${r.priceTl}|${r.warrantyDays}|${r.adPowerPercent}`;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
    return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  async function getLocal(key){ const o = await chrome.storage.local.get(key); return o[key]; }
  async function setLocal(key,val){ await chrome.storage.local.set({[key]:val}); }

  function getServiceOptions(platform){
    if (!platform) return [];
    return [...SERVICES_COMMON, ...(SERVICES_PLATFORM[platform]||[])];
  }

  function buildUrl(platform, service){
    return `https://hesap.com.tr/ilanlar/${platform}-${service}-satin-al`;
  }

  function updateStats(){
    if (ui.stats) ui.stats.textContent = `Satır: ${state.rows.length} • Atılan (dedup): ${state.dropped}`;
    if (ui.marketEmpty) ui.marketEmpty.hidden = state.rows.length > 0;
  }

  function appendRowUI(row){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.platform}</td><td>${row.titleShort}</td><td>${row.service}</td><td>${row.shopName}</td><td>${row.warrantyDays}</td><td>${row.priceTl}</td><td>%${row.adPowerPercent}</td>`;
    ui.tblBody.appendChild(tr);
    updateStats();
  }

  async function extractRowsFromPage({ platform, service, qtyMin, qtyMax }) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) throw new Error('Aktif sekme bulunamadı.');

    const key = `${platform}|${service}`;
    const selectors = (await getLocal(STORAGE_KEYS.selectors) || {})[key] || {};
    const overrides = (await getLocal(STORAGE_KEYS.regexOverrides) || {})[key] || {};

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [platform, service, qtyMin, qtyMax, selectors, overrides],
      func: (platformArg, serviceArg, qtyMinArg, qtyMaxArg, selectorsArg, overridesArg) => {
        const out = [];
        const clean = (s) => String(s||'').replace(/\s+/g,' ').trim();
        const blocks = Array.from(document.querySelectorAll('article, .card, .ilan, [class*="ilan"], .col, .row')).filter((n) => clean(n.innerText).length > 20);
        const domPick = (root, key, fallbackRegex) => {
          const selector = selectorsArg?.[key];
          if (selector) {
            const node = root.querySelector(selector);
            if (node) return clean(node.textContent);
          }
          const txt = clean(root.innerText);
          const m = txt.match(fallbackRegex);
          return m ? clean(m[1] || m[0]) : '';
        };

        for (const b of blocks) {
          try {
            const text = clean(b.innerText || '');
            if (!text || /İLGİNİZİ ÇEKEBİLİR/i.test(text)) continue;
            const title = clean((b.querySelector('h1,h2,h3,h4,strong,.title,[class*="title"]') || b).textContent || '').split('\n')[0];
            if (!title) continue;
            const qtyM = title.match(/(\d{1,3}(?:\.\d{3})+|\d+)/);
            const qty = qtyM ? Number(qtyM[1].replace(/\./g,'')) : 0;
            if (qty && (qty < qtyMinArg || qty > qtyMaxArg)) continue;

            const serviceRaw = domPick(b, 'service', /(İzlenme|Takipçi|Beğeni|Yorum|Kaydet|Paylaş|Hesap)/i) || serviceArg;
            const shop = domPick(b, 'shopName', /(^[A-Za-z0-9_]{3,30}$)/m);
            const warranty = domPick(b, 'warranty', /Garanti:\s*(\d+\s*(?:Gün|Saat))/i);
            const price = domPick(b, 'price', /(\d+(?:,\d+)?)\s*TL/i);
            const success = domPick(b, 'successCount', /(\d{1,3}(?:\.\d{3})*)\s*Başarılı İşlem/i);
            const adPower = domPick(b, 'adPower', /(%\d+)/i);

            out.push({
              platform: platformArg,
              service: String(serviceRaw).toLowerCase(),
              qty,
              titleFull: title,
              shopName: shop,
              warrantyRaw: warranty,
              priceRaw: price,
              adPowerRaw: adPower,
              successRaw: success,
              url: location.href,
              isVitrin: /VİTRİN İLANI/i.test(text),
              isCokSatan: /ÇOK SATAN|Ç\s*O\s*K\s*S\s*A\s*T\s*A\s*N/i.test(text),
              error: ''
            });
          } catch (e) {
            out.push({ platform: platformArg, service: serviceArg, qty: 0, titleFull: '', shopName: '', warrantyRaw:'', priceRaw:'', adPowerRaw:'', successRaw:'', url: location.href, isVitrin:false, isCokSatan:false, error: String(e && e.message || e) });
          }
        }

        if (out.length) return out;

        // Regex fallback on full text
        const text = document.body.innerText || '';
        const titleRx = /^(.+)$/gm;
        let m;
        while ((m = titleRx.exec(text)) !== null) {
          const t = clean(m[1]);
          if (!t || t.length < 10 || /İLGİNİZİ ÇEKEBİLİR/.test(t)) continue;
          const qtyM = t.match(/(\d{1,3}(?:\.\d{3})+|\d+)/);
          const qty = qtyM ? Number(qtyM[1].replace(/\./g,'')) : 0;
          if (qty && (qty < qtyMinArg || qty > qtyMaxArg)) continue;
          out.push({
            platform: platformArg,
            service: serviceArg,
            qty,
            titleFull: t,
            shopName: (t.match(/^[A-Za-z0-9_]{3,30}$/m)||[])[0] || '',
            warrantyRaw: (t.match(/Garanti:\s*(\d+\s*(?:Gün|Saat))/i)||[])[1] || '',
            priceRaw: (t.match(/(\d+(?:,\d+)?)\s*TL/i)||[])[1] || '',
            adPowerRaw: (t.match(/(%\d+)/i)||[])[1] || '',
            successRaw: (t.match(/(\d{1,3}(?:\.\d{3})*)\s*Başarılı İşlem/i)||[])[1] || '',
            url: location.href,
            isVitrin: /VİTRİN İLANI/i.test(t),
            isCokSatan: /ÇOK SATAN|Ç\s*O\s*K\s*S\s*A\s*T\s*A\s*N/.test(t),
            error: ''
          });
        }
        return out;
      }
    });

    return Array.isArray(result) ? result : [];
  }

  async function startScan({ platform, service, qtyMin, qtyMax }) {
    if (!platform || !service) throw new Error('Platform ve hizmet zorunlu.');
    state.stopped = false;
    state.currentKey = `${platform}|${service}`;
    const url = buildUrl(platform, service);
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) throw new Error('Aktif sekme yok.');
    await chrome.tabs.update(tab.id, { url });
    await new Promise((resolve) => {
      const listener = (tid, info) => {
        if (tid === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(true);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    const rawRows = await extractRowsFromPage({ platform, service, qtyMin, qtyMax });

    for (const rr of rawRows) {
      if (state.stopped) break;
      try {
        const row = {
          platform,
          service,
          qty: Number(rr.qty || qtyFromTitle(rr.titleFull)),
          titleFull: normalizeSpace(rr.titleFull),
          titleShort: titleShort(rr.titleFull),
          shopName: normalizeSpace(rr.shopName),
          warrantyDays: parseWarranty(rr.warrantyRaw),
          priceTl: parsePrice(rr.priceRaw),
          adPowerPercent: parseAdPower(rr.adPowerRaw),
          url: rr.url || url,
          isVitrin: Boolean(rr.isVitrin),
          isCokSatan: Boolean(rr.isCokSatan),
          successCount: Number(String(rr.successRaw || '').replace(/\./g,'')) || 0,
          hash: '',
          error: rr.error || ''
        };

        if (row.qty && (row.qty < qtyMin || row.qty > qtyMax)) continue;
        const h = await hashRow(row);
        row.hash = h;
        if (state.hashes.has(h)) { state.dropped++; continue; }
        state.hashes.add(h);
        state.rows.push(row);
        appendRowUI(row);
      } catch (e) {
        state.rows.push({ platform, service, qty:0, titleFull:'', titleShort:'', shopName:'', warrantyDays:0, priceTl:0, adPowerPercent:0, url, isVitrin:false, isCokSatan:false, successCount:0, hash:'', error:String(e.message||e) });
      }
    }

    toast(`Rakip tarama tamamlandı. Satır: ${state.rows.length}`);
  }

  function stopScan(){ state.stopped = true; }
  function clearTable(){ if (!confirm('Rakip tablosu temizlensin mi?')) return; state.rows=[]; state.hashes.clear(); state.dropped=0; ui.tblBody.innerHTML=''; updateStats(); }

  async function copyTableMarkdown(){
    const head = '| Platform | İlan Başlığı | Hizmet | Mağaza | Garanti | Fiyat | Reklam Gücü |\n|---|---|---|---|---:|---:|---:|';
    const body = state.rows.map(r => `| ${r.platform} | ${r.titleShort} | ${r.service} | ${r.shopName} | ${r.warrantyDays} | ${r.priceTl} | ${r.adPowerPercent} |`).join('\n');
    try { await navigator.clipboard.writeText(`${head}\n${body}`); toast('Markdown tablo panoya kopyalandı.'); }
    catch { toast('Panoya kopyalama başarısız.'); }
  }

  function download(name, text, type){
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 800);
  }

  function exportJson(){
    const rows = state.rows.map(({platform,service,qty,titleFull,titleShort,shopName,warrantyDays,priceTl,adPowerPercent,url,isVitrin,isCokSatan,successCount,hash}) => ({platform,service,qty,titleFull,titleShort,shopName,warrantyDays,priceTl,adPowerPercent,url,isVitrin,isCokSatan,successCount,hash}));
    download(`rakip_${Date.now()}.json`, JSON.stringify(rows, null, 2), 'application/json');
  }
  function exportCsv(){
    const header = ['Platform','İlan Başlığı','Hizmet','Mağaza','Garanti','Fiyat','Reklam Gücü','URL'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g,'""')}"`;
    const lines = [header.join(',')].concat(state.rows.map(r => [r.platform, r.titleFull, r.service, r.shopName, r.warrantyDays, r.priceTl, r.adPowerPercent, r.url].map(esc).join(',')));
    download(`rakip_${Date.now()}.csv`, '\ufeff' + lines.join('\n'), 'text/csv;charset=utf-8');
  }

  async function enterPickMode(fieldKey){
    state.pickField = fieldKey;
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (window.__rakipPickerCleanup) window.__rakipPickerCleanup();
        const style = document.createElement('style');
        style.id = '__rakip_picker_style';
        style.textContent = '*{cursor:crosshair!important}.rakip-hover{outline:2px solid #ff5c77!important;}';
        document.documentElement.appendChild(style);
        let hovered = null;
        const cssPath = (el) => {
          if (!(el instanceof Element)) return '';
          const parts = [];
          let cur = el;
          while (cur && cur.nodeType === 1 && cur !== document.body) {
            let sel = cur.nodeName.toLowerCase();
            if (cur.id) { sel += `#${cur.id}`; parts.unshift(sel); break; }
            const cls = (cur.className || '').toString().trim().split(/\s+/).filter(Boolean).slice(0,2).join('.');
            if (cls) sel += `.${cls}`;
            const siblings = Array.from(cur.parentNode?.children || []).filter((n) => n.nodeName === cur.nodeName);
            if (siblings.length > 1) sel += `:nth-of-type(${siblings.indexOf(cur)+1})`;
            parts.unshift(sel);
            cur = cur.parentElement;
          }
          return parts.join(' > ');
        };
        const onMove = (e) => {
          if (hovered) hovered.classList.remove('rakip-hover');
          hovered = e.target;
          hovered.classList.add('rakip-hover');
        };
        const onClick = (e) => {
          e.preventDefault(); e.stopPropagation();
          const selector = cssPath(e.target);
          chrome.runtime.sendMessage({ type:'rakip_pick_result', selector });
          window.__rakipPickerCleanup();
        };
        window.__rakipPickerCleanup = () => {
          document.removeEventListener('mousemove', onMove, true);
          document.removeEventListener('click', onClick, true);
          if (hovered) hovered.classList.remove('rakip-hover');
          document.getElementById('__rakip_picker_style')?.remove();
        };
        document.addEventListener('mousemove', onMove, true);
        document.addEventListener('click', onClick, true);
      }
    });
    toast('Pick mode aktif. Hedef alanı tıklayın.');
  }

  async function cancelPickMode(){
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { window.__rakipPickerCleanup && window.__rakipPickerCleanup(); } });
  }

  async function openRegexPanel(fieldKey){
    const text = prompt(`${fieldKey} için regex girin:`);
    if (!text) return;
    try {
      new RegExp(text, 'm');
    } catch {
      toast('Geçersiz regex.');
      return;
    }
    await applyRegexOverride(fieldKey, [text], 0);
    toast('Regex kaydedildi.');
  }

  async function applyRegexOverride(fieldKey, regexList, selectedIndex){
    const key = state.currentKey || `${ui.selPlatform.value}|${ui.selService.value}`;
    const all = await getLocal(STORAGE_KEYS.regexOverrides) || {};
    all[key] = all[key] || {};
    all[key][fieldKey] = { regexList, selectedIndex };
    await setLocal(STORAGE_KEYS.regexOverrides, all);
  }

  async function savePickedSelector(selector){
    if (!state.pickField) return;
    const key = `${ui.selPlatform.value}|${ui.selService.value}`;
    const all = await getLocal(STORAGE_KEYS.selectors) || {};
    all[key] = all[key] || {};
    all[key][state.pickField] = selector;
    await setLocal(STORAGE_KEYS.selectors, all);
    toast(`${state.pickField} selector kaydedildi.`);
    state.pickField = '';
  }

  function bind(){
    ui.selPlatform = byId('selPlatform');
    ui.selService = byId('selService');
    ui.inpQtyMin = byId('inpQtyMin');
    ui.inpQtyMax = byId('inpQtyMax');
    ui.tblBody = byId('tblRakipBody');
    ui.marketEmpty = byId('marketEmpty');
    ui.stats = byId('rakipStats');

    ui.selPlatform?.addEventListener('change', () => {
      const options = getServiceOptions(ui.selPlatform.value);
      ui.selService.innerHTML = '<option value="">Hizmet seç</option>' + options.map((x)=>`<option value="${x}">${x}</option>`).join('');
      ui.selService.disabled = !options.length;
    });

    byId('btnRakipStart')?.addEventListener('click', async () => {
      try {
        const platform = ui.selPlatform.value;
        const service = ui.selService.value;
        const qtyMin = Number(ui.inpQtyMin.value || 0);
        const qtyMax = Number(ui.inpQtyMax.value || Number.MAX_SAFE_INTEGER);
        if (!platform || !service) return toast('Platform ve hizmet zorunludur.');
        if (qtyMax < qtyMin) return toast('Max adet, min adetten küçük olamaz.');
        await startScan({ platform, service, qtyMin, qtyMax });
      } catch (e) { toast(`Rakip tarama hatası: ${e.message || e}`); }
    });

    byId('btnRakipStop')?.addEventListener('click', () => stopScan());
    byId('btnRakipClear')?.addEventListener('click', () => clearTable());
    byId('btnRakipCopyMd')?.addEventListener('click', () => copyTableMarkdown());
    byId('btnRakipExportJson')?.addEventListener('click', () => exportJson());
    byId('btnRakipExportCsv')?.addEventListener('click', () => exportCsv());
    byId('btnRakipRegexPanel')?.addEventListener('click', () => openRegexPanel('titleFull'));

    byId('btnPickService')?.addEventListener('click', () => enterPickMode('service'));
    byId('btnPickShop')?.addEventListener('click', () => enterPickMode('shopName'));
    byId('btnPickWarranty')?.addEventListener('click', () => enterPickMode('warranty'));
    byId('btnPickSuccess')?.addEventListener('click', () => enterPickMode('successCount'));
    byId('btnPickPrice')?.addEventListener('click', () => enterPickMode('price'));
    byId('btnPickAdPower')?.addEventListener('click', () => enterPickMode('adPower'));
    byId('btnPickCancel')?.addEventListener('click', () => cancelPickMode());

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'rakip_pick_result' && msg.selector) savePickedSelector(msg.selector);
    });
  }

  const Rakip = {
    init(){ bind(); updateStats(); },
    startScan,
    stopScan,
    clearTable,
    copyTableMarkdown,
    exportJson,
    exportCsv,
    enterPickMode,
    openRegexPanel,
    applyRegexOverride
  };

  window.Patpat = window.Patpat || {};
  window.Patpat.Rakip = Rakip;
  Rakip.init();
})();
