(() => {
  if (typeof window === 'undefined' || document.body?.dataset?.page !== 'sidepanel') return;
  'use strict';

  const STORAGE_KEYS = Object.freeze({
    templates: 'rakipTemplates',
    activeTemplate: 'rakipActiveTemplate',
    regexOverrides: 'regexOverrides'
  });

  const REGEX = Object.freeze({
    FILTER_RECOMMEND: /İLGİNİZİ ÇEKEBİLİR[\s\S]*?(?=(?:Ç\s*\n\s*O\s*\n\s*K\s*\n\s*S\s*\n\s*A\s*\n\s*T\s*\n\s*A\s*\n\s*N|VİTRİN İLANI|$))/g,
    FILTER_JETON: /TikTok Jeton Satın Al[\s\S]*?(?=(?:Ç\s*\n\s*O\s*\n\s*K\s*\n\s*S\s*\n\s*A\s*\n\s*T\s*\n\s*A\s*\n\s*N|VİTRİN İLANI|$))/g,
    COK_SATAN_STACK: /Ç\s*\n\s*O\s*\n\s*K\s*\n\s*S\s*\n\s*A\s*\n\s*T\s*\n\s*A\s*\n\s*N/g,
    AD_POWER_PERCENT: /%(\d{1,2})/g,
    BLOCK_SPLIT: /(VİTRİN İLANI\s*)?(Ç\s*\n\s*O\s*\n\s*K\s*\n\s*S\s*\n\s*A\s*\n\s*T\s*\n\s*A\s*\n\s*N\s*)?([\s\S]*?Garanti:\s*\d+\s*(?:Gün|Saat)[\s\S]*?(?:\d+(?:\.\d{3})*)\s*\n\s*Başarılı İşlem[\s\S]*?\d+(?:,\d+)?\s*TL[\s\S]*?%?\d{1,2})/g,
    TITLE: /^([^\n]{10,160})/m,
    SERVICE: /^(Takipçi|İzlenme|Beğeni|Yorum|Kaydet|Paylaş|Hesap)\s*$/m,
    SHOP: /^(?!.*Frame$)([A-Za-z0-9_]{3,30})\s*$/m,
    WARRANTY: /Garanti:\s*(\d+)\s*(Gün|Saat)/i,
    SUCCESS: /(\d{1,3}(?:\.\d{3})*)\s*\n\s*Başarılı İşlem/i,
    PRICE: /(\d+(?:,\d+)?)\s*TL/i,
    VITRIN: /VİTRİN İLANI/i,
    QTY_FROM_TITLE: /(\d{1,3}(?:\.\d{3})+|\d+)/
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
    draftTemplate: { selectors: {} },
    templates: {},
    activeTemplateKey: ''
  };
  const ui = {};

  const byId = (id) => document.getElementById(id);
  const toast = (m) => window.__PatpatUI?.UI?.toast?.(m) || alert(m);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const normalizeSpace = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  const normalizeQty = (value) => Number(String(value || '').replace(/\./g,'').trim()) || 0;
  const normalizePrice = (value) => Number(String(value || '').replace(/\./g,'').replace(',','.').trim()) || 0;
  const normalizePercent = (value) => Number(String(value || '').replace('%','').trim()) || 0;
  const titleShort = (t) => normalizeSpace(t).split(' ').slice(0, 3).join(' ');

  function templateKey() {
    const p = ui.selPlatform?.value || 'none';
    const s = ui.selService?.value || 'none';
    const q = `${ui.inpQtyMin?.value || '0'}-${ui.inpQtyMax?.value || '999999'}`;
    return `${p}|${s}|${q}`;
  }

  async function getLocal(key){ const o = await chrome.storage.local.get(key); return o[key]; }
  async function setLocal(key, val){ await chrome.storage.local.set({ [key]: val }); }

  function updateStats() {
    if (ui.stats) ui.stats.textContent = `Satır: ${state.rows.length} • Atılan (dedup): ${state.dropped}`;
    if (ui.marketEmpty) ui.marketEmpty.hidden = state.rows.length > 0;
  }

  function renderTemplateList() {
    if (!ui.selTemplate) return;
    const keys = Object.keys(state.templates);
    ui.selTemplate.innerHTML = '<option value="">Şablon seç</option>' + keys.map((k) => `<option value="${k}">${k}${k === state.activeTemplateKey ? ' (aktif)' : ''}</option>`).join('');
    if (state.activeTemplateKey) ui.selTemplate.value = state.activeTemplateKey;
  }

  async function loadTemplates() {
    state.templates = (await getLocal(STORAGE_KEYS.templates)) || {};
    state.activeTemplateKey = (await getLocal(STORAGE_KEYS.activeTemplate)) || '';
    renderTemplateList();
  }

  async function saveTemplates() {
    await setLocal(STORAGE_KEYS.templates, state.templates);
    await setLocal(STORAGE_KEYS.activeTemplate, state.activeTemplateKey || '');
    renderTemplateList();
  }

  async function hashRow(r){
    const src = `${r.platform}|${r.service}|${r.qty}|${r.shopName}|${r.priceTl}|${r.warrantyDays}|${r.adPowerPercent}`;
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(src));
    return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function appendRowUI(row) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.platform}</td><td>${row.titleShort}</td><td>${row.service}</td><td>${row.shopName}</td><td>${row.warrantyDays}</td><td>${row.priceTl}</td><td>${row.adPowerText}</td>`;
    ui.tblBody.appendChild(tr);
    updateStats();
  }

  async function extractHumanLike(tabId, scanOpts, selectors = {}) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [scanOpts, selectors],
      func: async (opts, selectorsArg) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        const regex = {
          filterRecommend: /İLGİNİZİ ÇEKEBİLİR[\s\S]*?(?=(?:Ç\s*\n\s*O\s*\n\s*K\s*\n\s*S\s*\n\s*A\s*\n\s*T\s*\n\s*A\s*\n\s*N|VİTRİN İLANI|$))/g,
          filterJeton: /TikTok Jeton Satın Al[\s\S]*?(?=(?:Ç\s*\n\s*O\s*\n\s*K\s*\n\s*S\s*\n\s*A\s*\n\s*T\s*\n\s*A\s*\n\s*N|VİTRİN İLANI|$))/g,
          blockSplit: /(VİTRİN İLANI\s*)?(Ç\s*\n\s*O\s*\n\s*K\s*\n\s*S\s*\n\s*A\s*\n\s*T\s*\n\s*A\s*\n\s*N\s*)?([\s\S]*?Garanti:\s*\d+\s*(?:Gün|Saat)[\s\S]*?(?:\d+(?:\.\d{3})*)\s*\n\s*Başarılı İşlem[\s\S]*?\d+(?:,\d+)?\s*TL[\s\S]*?%?\d{1,2})/g,
          title: /^([^\n]{10,160})/m,
          service: /^(Takipçi|İzlenme|Beğeni|Yorum|Kaydet|Paylaş|Hesap)\s*$/m,
          shop: /^(?!.*Frame$)([A-Za-z0-9_]{3,30})\s*$/m,
          warranty: /Garanti:\s*(\d+)\s*(Gün|Saat)/i,
          success: /(\d{1,3}(?:\.\d{3})*)\s*\n\s*Başarılı İşlem/i,
          price: /(\d+(?:,\d+)?)\s*TL/i,
          vitrin: /VİTRİN İLANI/i,
          cokSatan: /Ç\s*\n\s*O\s*\n\s*K\s*\n\s*S\s*\n\s*A\s*\n\s*T\s*\n\s*A\s*\n\s*N/g,
          adPercent: /%(\d{1,2})/g,
          qty: /(\d{1,3}(?:\.\d{3})+|\d+)/
        };

        const getBySelector = (root, key) => {
          const sel = selectorsArg?.[key];
          if (!sel) return '';
          const node = root.querySelector(sel);
          return node ? clean(node.textContent || node.innerText || '') : '';
        };

        const seen = new Set();
        const out = [];
        let scrollCount = 0;
        let y = 0;
        const step = Math.floor(window.innerHeight * 0.9);

        while (y <= document.body.scrollHeight + step) {
          const txtRaw = String(document.body.innerText || '');
          let txt = txtRaw.replace(regex.filterRecommend, '').replace(regex.filterJeton, '');

          // block parse
          const matches = txt.matchAll(regex.blockSplit);
          for (const m of matches) {
            const block = String(m[0] || '');
            const blockHash = block.slice(0, 300);
            if (seen.has(blockHash)) continue;
            seen.add(blockHash);

            const title = getBySelector(document.body, 'title') || (block.match(regex.title) || [,''])[1] || '';
            const service = getBySelector(document.body, 'service') || (block.match(regex.service) || [,''])[1] || opts.service;
            const shopName = getBySelector(document.body, 'shopName') || (block.match(regex.shop) || [,''])[1] || '';
            const warranty = getBySelector(document.body, 'warranty') || ((block.match(regex.warranty) || [,''])[1] || '0');
            const success = getBySelector(document.body, 'successCount') || ((block.match(regex.success) || [,'0'])[1] || '0');
            const price = getBySelector(document.body, 'price') || ((block.match(regex.price) || [,'0'])[1] || '0');

            const qtyRaw = (title.match(regex.qty) || [,'0'])[1];
            const qty = Number(String(qtyRaw || '0').replace(/\./g, '')) || 0;
            if (qty < opts.qtyMin || qty > opts.qtyMax) continue;

            const isVitrin = regex.vitrin.test(block);
            const hasCok = regex.cokSatan.test(block);
            const percent = (block.match(regex.adPercent) || [,''])[1];
            let adPowerText = '';
            if (hasCok && percent) adPowerText = `ÇOK SATAN | %${percent}`;
            else if (hasCok) adPowerText = 'ÇOK SATAN';
            else if (percent) adPowerText = `%${percent}`;

            out.push({
              platform: opts.platform,
              service: String(service || '').toLowerCase(),
              qty,
              titleFull: clean(title),
              shopName: clean(shopName),
              warrantyDays: Number(String(warranty).replace(/\./g, '').trim()) || 0,
              priceTl: Number(String(price).replace(/\./g, '').replace(',', '.').trim()) || 0,
              adPowerText,
              adPowerPercent: Number(String(percent || '').trim()) || 0,
              isVitrin,
              isCokSatan: hasCok,
              successCount: Number(String(success).replace(/\./g, '')) || 0,
              url: location.href,
              error: ''
            });
          }

          window.scrollTo({ top: y, behavior: 'auto' });
          y += step;
          scrollCount += 1;
          await sleep(400);
          if (scrollCount % 3 === 0) await sleep(1200);
        }
        return out;
      }
    });
    return Array.isArray(result) ? result : [];
  }

  async function startScan({ platform, service, qtyMin, qtyMax }) {
    if (!platform || !service) throw new Error('Platform ve hizmet zorunlu.');
    state.stopped = false;

    const url = `https://hesap.com.tr/ilanlar/${platform}-${service}-satin-al`;
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) throw new Error('Aktif sekme bulunamadı.');
    await chrome.tabs.update(tab.id, { url });
    await new Promise((resolve) => {
      const listener = (id, info) => {
        if (id === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(true);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
    await wait(800);

    const key = state.activeTemplateKey || templateKey();
    const selectors = state.templates?.[key]?.selectors || {};
    let rows = await extractHumanLike(tab.id, { platform, service, qtyMin, qtyMax }, selectors);

    if (!rows.length && key) {
      toast('Aktif şablonla veri okunamadı. Pick mode ile yeniden seçin.');
    }

    for (const r of rows) {
      if (state.stopped) break;
      const row = {
        ...r,
        titleShort: titleShort(r.titleFull),
        hash: ''
      };
      const h = await hashRow(row);
      row.hash = h;
      if (state.hashes.has(h)) { state.dropped += 1; continue; }
      state.hashes.add(h);
      state.rows.push(row);
      appendRowUI(row);
    }
    toast(`Rakip tarama tamamlandı. Satır: ${state.rows.length}`);
  }

  function stopScan() { state.stopped = true; }
  function clearTable() {
    if (!confirm('Rakip tablosu temizlensin mi?')) return;
    state.rows = [];
    state.hashes.clear();
    state.dropped = 0;
    ui.tblBody.innerHTML = '';
    updateStats();
  }

  async function copyTableMarkdown() {
    const head = '| Platform | İlan Başlığı | Hizmet | Mağaza | Garanti | Fiyat | Reklam Gücü |\n|---|---|---|---|---:|---:|---|';
    const body = state.rows.map((r) => `| ${r.platform} | ${r.titleShort} | ${r.service} | ${r.shopName} | ${r.warrantyDays} | ${r.priceTl} | ${r.adPowerText || ''} |`).join('\n');
    try { await navigator.clipboard.writeText(`${head}\n${body}`); toast('Markdown kopyalandı.'); }
    catch { toast('Panoya kopyalama başarısız.'); }
  }

  function download(name, text, type){
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function exportJson() {
    download(`rakip_${Date.now()}.json`, JSON.stringify(state.rows, null, 2), 'application/json');
  }
  function exportCsv() {
    const cols = ['Platform','İlan Başlığı','Hizmet','Mağaza','Garanti','Fiyat','Reklam Gücü','URL'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [cols.join(',')].concat(state.rows.map((r) => [r.platform, r.titleFull, r.service, r.shopName, r.warrantyDays, r.priceTl, r.adPowerText || '', r.url].map(esc).join(',')));
    download(`rakip_${Date.now()}.csv`, '\ufeff' + lines.join('\n'), 'text/csv;charset=utf-8');
  }

  async function enterPickMode(fieldKey) {
    state.pickField = fieldKey;
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return;

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (window.__rakipPickerCleanup) window.__rakipPickerCleanup();
        const style = document.createElement('style');
        style.id = '__rakip_picker_style';
        style.textContent = '*{cursor:crosshair!important}.rakip-hover{outline:2px solid #6ea8ff!important}';
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
            const sib = Array.from(cur.parentNode?.children || []).filter((x) => x.nodeName === cur.nodeName);
            if (sib.length > 1) sel += `:nth-of-type(${sib.indexOf(cur)+1})`;
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
          chrome.runtime.sendMessage({ type: 'rakip_pick_result', selector: cssPath(e.target) });
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
    toast('Pick mode açıldı. Alanı seçin.');
  }

  async function cancelPickMode() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { window.__rakipPickerCleanup && window.__rakipPickerCleanup(); } });
    state.pickField = '';
  }

  async function runPickTest() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const key = templateKey();
    const selectors = state.draftTemplate.selectors;
    const rows = await extractHumanLike(tab.id, {
      platform: ui.selPlatform.value,
      service: ui.selService.value,
      qtyMin: Number(ui.inpQtyMin.value || 0),
      qtyMax: Number(ui.inpQtyMax.value || Number.MAX_SAFE_INTEGER)
    }, selectors);
    const sample = rows.slice(0, 10);

    if (ui.testWrap) {
      if (!sample.length) ui.testWrap.innerHTML = '<span style="color:#ff5c77">Test sonucu boş.</span>';
      else {
        ui.testWrap.innerHTML = `<table style="width:100%;border-collapse:collapse"><thead><tr><th>Başlık</th><th>Hizmet</th><th>Mağaza</th><th>Fiyat</th></tr></thead><tbody>${sample.map((r)=>`<tr><td>${r.titleFull}</td><td>${r.service}</td><td>${r.shopName}</td><td>${r.priceTl}</td></tr>`).join('')}</tbody></table>`;
      }
    }

    const ok = confirm('TEST tamamlandı. Doğru çalıştı mı?');
    if (!ok) return false;
    const name = prompt('Şablon adı girin:', key) || key;
    state.templates[name] = { selectors: { ...state.draftTemplate.selectors }, createdAt: Date.now() };
    state.activeTemplateKey = name;
    await saveTemplates();
    toast('Şablon kaydedildi ve aktif yapıldı.');
    return true;
  }

  async function savePickedSelector(selector) {
    if (!state.pickField) return;
    state.draftTemplate.selectors[state.pickField] = selector;
    await runPickTest();
    state.pickField = '';
  }

  async function deleteSelectedTemplate() {
    const key = ui.selTemplate?.value;
    if (!key) return toast('Silinecek şablon seçin.');
    if (!confirm(`Şablon silinsin mi?\n${key}`)) return;
    delete state.templates[key];
    if (state.activeTemplateKey === key) state.activeTemplateKey = '';
    await saveTemplates();
    toast('Şablon silindi.');
  }

  function getServiceOptions(platform) {
    if (!platform) return [];
    return [...SERVICES_COMMON, ...(SERVICES_PLATFORM[platform] || [])];
  }

  async function openRegexPanel(fieldKey) {
    const text = prompt(`${fieldKey} için regex girin:`);
    if (!text) return;
    try { new RegExp(text, 'm'); } catch { return toast('Geçersiz regex.'); }
    await applyRegexOverride(fieldKey, [text], 0);
    toast('Regex override kaydedildi.');
  }

  async function applyRegexOverride(fieldKey, regexList, selectedIndex) {
    const key = templateKey();
    const all = (await getLocal(STORAGE_KEYS.regexOverrides)) || {};
    all[key] = all[key] || {};
    all[key][fieldKey] = { regexList, selectedIndex };
    await setLocal(STORAGE_KEYS.regexOverrides, all);
  }

  function bind() {
    ui.selPlatform = byId('selPlatform');
    ui.selService = byId('selService');
    ui.inpQtyMin = byId('inpQtyMin');
    ui.inpQtyMax = byId('inpQtyMax');
    ui.tblBody = byId('tblRakipBody');
    ui.marketEmpty = byId('marketEmpty');
    ui.stats = byId('rakipStats');
    ui.selTemplate = byId('selRakipTemplate');
    ui.testWrap = byId('rakipTestPreviewWrap');

    ui.selPlatform?.addEventListener('change', () => {
      const options = getServiceOptions(ui.selPlatform.value);
      ui.selService.innerHTML = '<option value="">Hizmet seç</option>' + options.map((o) => `<option value="${o}">${o}</option>`).join('');
      ui.selService.disabled = !options.length;
    });

    byId('btnRakipStart')?.addEventListener('click', async () => {
      const platform = ui.selPlatform.value;
      const service = ui.selService.value;
      const qtyMin = Number(ui.inpQtyMin.value || 0);
      const qtyMax = Number(ui.inpQtyMax.value || Number.MAX_SAFE_INTEGER);
      if (!platform || !service) return toast('Platform ve hizmet zorunlu.');
      if (qtyMax < qtyMin) return toast('Max adet min adetten küçük olamaz.');
      await startScan({ platform, service, qtyMin, qtyMax });
    });

    byId('btnRakipStop')?.addEventListener('click', stopScan);
    byId('btnRakipClear')?.addEventListener('click', clearTable);
    byId('btnRakipCopyMd')?.addEventListener('click', copyTableMarkdown);
    byId('btnRakipExportJson')?.addEventListener('click', exportJson);
    byId('btnRakipExportCsv')?.addEventListener('click', exportCsv);

    byId('btnPickService')?.addEventListener('click', () => enterPickMode('service'));
    byId('btnPickShop')?.addEventListener('click', () => enterPickMode('shopName'));
    byId('btnPickWarranty')?.addEventListener('click', () => enterPickMode('warranty'));
    byId('btnPickSuccess')?.addEventListener('click', () => enterPickMode('successCount'));
    byId('btnPickPrice')?.addEventListener('click', () => enterPickMode('price'));
    byId('btnPickAdPower')?.addEventListener('click', () => enterPickMode('adPower'));
    byId('btnPickCancel')?.addEventListener('click', cancelPickMode);
    byId('btnRakipRegexPanel')?.addEventListener('click', () => openRegexPanel('titleFull'));

    byId('btnRakipTemplateUse')?.addEventListener('click', async () => {
      const key = ui.selTemplate?.value;
      if (!key) return toast('Şablon seçin.');
      state.activeTemplateKey = key;
      await saveTemplates();
      toast('Aktif şablon güncellendi.');
    });
    byId('btnRakipTemplateDelete')?.addEventListener('click', deleteSelectedTemplate);

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'rakip_pick_result' && msg.selector) savePickedSelector(msg.selector);
    });
  }

  const Rakip = {
    init: async () => { bind(); await loadTemplates(); updateStats(); },
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
