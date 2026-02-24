(() => {
  if (typeof window === 'undefined' || document.body?.dataset?.page !== 'sidepanel') return;
  'use strict';

  const STORAGE_KEYS = Object.freeze({ templates: 'rakipTemplates', activeTemplate: 'rakipActiveTemplate', regexOverrides: 'regexOverrides' });

  const PLATFORM_SERVICE_MAP = Object.freeze({
    tiktok: ['hesap','takipci','begeni','izlenme','yorum','kaydet','paylas','canli-yayin-izleyici','pk-savas-puani'],
    instagram: ['hesap','takipci','begeni','izlenme','yorum','kaydet','paylas','canli-yayin-izleyici','hikaye-izlenme','reels-izlenme'],
    youtube: ['hesap','takipci','begeni','izlenme','yorum','kaydet','paylas','canli-yayin-izleyici','abone','izlenme-suresi'],
    twitter: ['hesap','takipci','begeni','izlenme','yorum','kaydet','paylas','canli-yayin-izleyici','retweet','goruntulenme']
  });

  const PLATFORM_REGEX = Object.freeze({
    tiktok: [/\bT\s*i\s*k\s*T\s*o\s*k\b/i,/\bTik\s*Tok\b/i,/\bTiK\s*ToK\b/i,/\bTIKTOK\b/i,/\bTikTok\b/i,/\btik\s*tok\b/i,/\btiktok\b/i],
    instagram: [/\bInsta\s*gram\b/i,/\bIN\s*ST\s*A\s*GRAM\b/i,/\bInstagram\b/i,/\bINSTAGRAM\b/i,/\binsta\s*gram\b/i,/\binsta\b.*\bgram\b/i,/\binstagram\b/i],
    youtube: [/\bYou\s*Tube\b/i,/\bYOU\s*TUBE\b/i,/\bYouTube\b/i,/\bYOUTUBE\b/i,/\byou\s*tube\b/i,/\byoutube\b/i,/\bYou\s*tu\s*be\b/i],
    twitter: [/\bTwi\s*tter\b/i,/\bTWI\s*TTER\b/i,/\bTwitter\b/i,/\bTWITTER\b/i,/\btwi\s*tter\b/i,/\btwitter\b/i,/\bX\s*\(Twitter\)\b|\bTwitter\s*\(X\)\b/i]
  });

  const NUMBER_REGEX_SET = Object.freeze([
    /\b\d{1,3}(?:\.\d{3})+\b/g,
    /\b\d{1,3}(?:,\d{3})+\b/g,
    /\b\d+\b/g,
    /\b\d{1,3}(?:\s\d{3})+\b/g,
    /\b\d+\s*(?:k|K)\b/g,
    /\b\d+\s*(?:bin|BIN|Bin)\b/g,
    /\b\d+(?:[.,]\d{1,2})?\s*(?:k|K|bin|BIN)\b/g
  ]);

  const REGEX = Object.freeze({
    FILTER_RECOMMEND: /İLGİNİZİ ÇEKEBİLİR[\s\S]*?(?=(?:Ç\s*\n\s*O\s*\n\s*K\s*\n\s*S\s*\n\s*A\s*\n\s*T\s*\n\s*A\s*\n\s*N|VİTRİN İLANI|$))/g,
    FILTER_JETON: /TikTok Jeton Satın Al[\s\S]*?(?=(?:Ç\s*\n\s*O\s*\n\s*K\s*\n\s*S\s*\n\s*A\s*\n\s*T\s*\n\s*A\s*\n\s*N|VİTRİN İLANI|$))/g,
    COK_SATAN_STACK: /Ç\s*\n\s*O\s*\n\s*K\s*\n\s*S\s*\n\s*A\s*\n\s*T\s*\n\s*A\s*\n\s*N/g,
    AD_POWER_PERCENT: /%\s*(\d{1,3})\b/g,
    BLOCK_SPLIT: /(VİTRİN İLANI\s*)?(Ç\s*\n\s*O\s*\n\s*K\s*\n\s*S\s*\n\s*A\s*\n\s*T\s*\n\s*A\s*\n\s*N\s*)?([\s\S]*?Garanti:\s*\d+\s*(?:Gün|Saat)[\s\S]*?(?:\d+(?:\.\d{3})*)\s*\n\s*Başarılı İşlem[\s\S]*?\d+(?:,\d+)?\s*TL[\s\S]*?%?\d{1,2})/g,
    TITLE: /^([^\n]{10,160})/m,
    SERVICE: /^(Takipçi|İzlenme|Beğeni|Yorum|Kaydet|Paylaş|Hesap)\s*$/m,
    SHOP: /\b([A-Za-z0-9._-]{3,})\b(?=\s*$)/m,
    WARRANTY: /\bGaranti:\s*(\d+)\s*(Gün|Ay|Yıl)\b|\b(\d+)\s*(Gün|Ay|Yıl)\s*Garanti\b/i,
    SUCCESS: /\b([\d.]+)\s*Başarılı\s*İşlem\b/i,
    PRICE: /\b([\d.]+(?:,\d{2})?)\s*TL\b/i,
    VITRIN: /\bVitrin\s*İlanı\b|\bVİTRİN İLANI\b/i,
    TITLE_CANDIDATE: /^.*\b(tiktok|youtube|instagram|twitter)\b.*(\b\d{1,3}(?:\.\d{3})*\b|\b\d+\s*(k|K|bin|BIN)\b).*$/i,
    TITLE_3: /^((?:\S+\s+){0,2}\S+).*$/,
    CLEAN_TITLE: /\s+[-–]\s+|\s{2,}/g
  });

  const state = { rows: [], hashes: new Set(), dropped: 0, stopped: false, templates: {}, activeTemplateKey: '', pickField: '', draft: { selectors: {} } };
  const ui = {};

  const byId = (id) => document.getElementById(id);
  const toast = (m) => window.__PatpatUI?.UI?.toast?.(m) || alert(m);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const nSpace = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const randomWait = () => wait(200 + Math.floor(Math.random() * 400));

  const nQty = (v) => {
    const s = String(v || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!s) return null;
    if (s.endsWith('k')) return Math.round(parseFloat(s.replace('k','').replace(',','.')) * 1000);
    if (s.endsWith('bin')) return Math.round(parseFloat(s.replace('bin','').replace(',','.')) * 1000);
    return Number(s.replace(/\./g, '').replace(',', '.')) || null;
  };
  const nPrice = (v) => Number(String(v || '').replace(/\.(?=\d{3}\b)/g,'').replace(/,(?=\d{2}\b)/g,'.')) || 0;

  function updateStats() {
    if (ui.stats) ui.stats.textContent = `Satır: ${state.rows.length} • Atılan (dedup): ${state.dropped}`;
    if (ui.marketEmpty) ui.marketEmpty.hidden = state.rows.length > 0;
  }

  function detectPlatform(text) {
    const t = String(text || '');
    for (const [k, list] of Object.entries(PLATFORM_REGEX)) if (list.some((r) => r.test(t))) return k;
    return '';
  }

  function extractTwoCounts(text) {
    const hits = [];
    for (const rx of NUMBER_REGEX_SET) {
      const arr = String(text || '').match(rx) || [];
      for (const v of arr) {
        const n = nQty(v);
        if (Number.isFinite(n) && n > 0) hits.push(n);
      }
    }
    const uniq = [...new Set(hits)];
    return { min: uniq[0] || null, max: uniq[1] || null };
  }

  function templateKeyFromUi() {
    return `${ui.selPlatform?.value || 'none'}|${ui.selService?.value || 'none'}|${ui.inpQtyMin?.value || ''}-${ui.inpQtyMax?.value || ''}`;
  }

  async function getLocal(k){ const o = await chrome.storage.local.get(k); return o[k]; }
  async function setLocal(k,v){ await chrome.storage.local.set({ [k]: v }); }

  function renderTemplates() {
    if (!ui.selTemplate) return;
    const keys = Object.keys(state.templates);
    ui.selTemplate.innerHTML = '<option value="">Şablon seç</option>' + keys.map((k) => `<option value="${k}">${k}${k===state.activeTemplateKey?' (aktif)':''}</option>`).join('');
    if (state.activeTemplateKey) ui.selTemplate.value = state.activeTemplateKey;
  }

  async function loadTemplates() {
    state.templates = (await getLocal(STORAGE_KEYS.templates)) || {};
    state.activeTemplateKey = (await getLocal(STORAGE_KEYS.activeTemplate)) || '';
    renderTemplates();
  }

  async function saveTemplates() {
    await setLocal(STORAGE_KEYS.templates, state.templates);
    await setLocal(STORAGE_KEYS.activeTemplate, state.activeTemplateKey || '');
    renderTemplates();
  }

  async function hashRow(r) {
    const src = `${r.platform}|${r.service}|${r.shopName}|${r.priceTl}|${r.warrantyText}|${r.adPowerText}`;
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(src));
    return Array.from(new Uint8Array(d)).map((b)=>b.toString(16).padStart(2,'0')).join('');
  }

  function appendRow(row) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.platform}</td><td>${row.titleShort}</td><td>${row.service}</td><td>${row.shopName}</td><td>${row.warrantyText}</td><td>${row.priceTl}</td><td>${row.adPowerText}</td>`;
    ui.tblBody.appendChild(tr);
    updateStats();
  }

  function selectedCombos() {
    const p = ui.selPlatform.value;
    const s = ui.selService.value;
    const platforms = p === 'hepsi' ? ['tiktok','instagram','youtube','twitter'] : [p];
    const out = [];
    for (const pl of platforms) {
      const services = PLATFORM_SERVICE_MAP[pl] || [];
      if (s === 'hepsi' || !s) services.forEach((sv) => out.push({ platform: pl, service: sv }));
      else if (services.includes(s)) out.push({ platform: pl, service: s });
    }
    return out;
  }

  async function extractPage(tabId, sel, context) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [sel, context],
      func: async (selectors, ctx) => {
        const sleep = (ms) => new Promise((r)=>setTimeout(r, ms));
        const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        const RX = {
          filterRecommend: /İLGİNİZİ ÇEKEBİLİR[\s\S]*?(?=(?:Ç\s*\n\s*O\s*\n\s*K\s*\n\s*S\s*\n\s*A\s*\n\s*T\s*\n\s*A\s*\n\s*N|VİTRİN İLANI|$))/g,
          filterJeton: /TikTok Jeton Satın Al[\s\S]*?(?=(?:Ç\s*\n\s*O\s*\n\s*K\s*\n\s*S\s*\n\s*A\s*\n\s*T\s*\n\s*A\s*\n\s*N|VİTRİN İLANI|$))/g,
          split: /(VİTRİN İLANI\s*)?(Ç\s*\n\s*O\s*\n\s*K\s*\n\s*S\s*\n\s*A\s*\n\s*T\s*\n\s*A\s*\n\s*N\s*)?([\s\S]*?Garanti:\s*\d+\s*(?:Gün|Saat)[\s\S]*?(?:\d+(?:\.\d{3})*)\s*\n\s*Başarılı İşlem[\s\S]*?\d+(?:,\d+)?\s*TL[\s\S]*?%?\d{1,2})/g,
          title: /^([^\n]{10,160})/m,
          service: /^(Takipçi|İzlenme|Beğeni|Yorum|Kaydet|Paylaş|Hesap)\s*$/m,
          shop: /\b([A-Za-z0-9._-]{3,})\b(?=\s*$)/m,
          warranty: /\bGaranti:\s*(\d+)\s*(Gün|Ay|Yıl)\b|\b(\d+)\s*(Gün|Ay|Yıl)\s*Garanti\b/i,
          success: /\b([\d.]+)\s*Başarılı\s*İşlem\b/i,
          price: /\b([\d.]+(?:,\d{2})?)\s*TL\b/i,
          vitrin: /\bVitrin\s*İlanı\b|\bVİTRİN İLANI\b/i,
          cok: /Ç\s*\n\s*O\s*\n\s*K\s*\n\s*S\s*\n\s*A\s*\n\s*T\s*\n\s*A\s*\n\s*N/g,
          pct: /%\s*(\d{1,3})\b/g,
          title3: /^((?:\S+\s+){0,2}\S+).*/,
          cleanTitle: /\s+[-–]\s+|\s{2,}/g,
          titleCandidate: /^.*\b(tiktok|youtube|instagram|twitter)\b.*(\b\d{1,3}(?:\.\d{3})*\b|\b\d+\s*(k|K|bin|BIN)\b).*$/i
        };

        const selRead = (key, root) => {
          const css = selectors?.[key];
          if (!css) return '';
          const n = (root || document).querySelector(css);
          return n ? clean(n.textContent || n.innerText || '') : '';
        };

        let seenBlocks = new Set();
        let out = [];
        let scrollCount = 0;
        let y = 0;
        let lastCount = 0;
        const step = Math.floor(window.innerHeight * 0.9);

        while (true) {
          const text = String(document.body.innerText || '').replace(RX.filterRecommend, '').replace(RX.filterJeton, '');
          const blocks = [...text.matchAll(RX.split)].map((m) => String(m[0] || ''));

          for (const b of blocks) {
            const bh = b.slice(0, 280);
            if (seenBlocks.has(bh)) continue;
            seenBlocks.add(bh);

            const titleRaw = selRead('title') || (b.match(RX.title) || [,''])[1] || '';
            if (!RX.titleCandidate.test(titleRaw)) continue;
            const titleFull = clean(String(titleRaw).replace(RX.cleanTitle, ' '));
            const service = (selRead('service') || (b.match(RX.service) || [,''])[1] || ctx.service || '').toLowerCase();
            const shop = selRead('shopName') || (b.match(RX.shop) || [,''])[1] || '';
            const w = b.match(RX.warranty) || [];
            const warrantyText = w[0] || '';
            const success = (selRead('successCount') || (b.match(RX.success) || [,'0'])[1] || '0').replace(/\.(?=\d{3}\b)/g,'');
            const priceRaw = selRead('price') || (b.match(RX.price) || [,'0'])[1] || '0';
            const price = Number(String(priceRaw).replace(/\.(?=\d{3}\b)/g,'').replace(/,(?=\d{2}\b)/g,'.')) || 0;
            const isVitrin = RX.vitrin.test(b);
            const hasCok = RX.cok.test(b);
            const pct = (b.match(RX.pct) || [,''])[1] || '';
            const adPowerText = hasCok && pct ? `ÇOK SATAN | %${pct}` : hasCok ? 'ÇOK SATAN' : pct ? `%${pct}` : '';

            out.push({
              platform: ctx.platform,
              titleFull,
              titleShort: (titleFull.match(RX.title3) || [,''])[1] || titleFull,
              service,
              shopName: clean(shop),
              warrantyText,
              priceTl: price,
              adPowerText,
              successCount: Number(success) || 0,
              isVitrin,
              url: location.href,
              error: ''
            });
          }

          // human-like scroll and stop conditions
          scrollCount += 1;
          y += step;
          window.scrollTo({ top: y, behavior: 'auto' });
          await sleep(200);
          await sleep(200 + Math.floor(Math.random() * 400));
          if (scrollCount % 3 === 0) await sleep(1200);

          const cards = document.querySelectorAll('a[href*="ilanlar"], article, .card').length;
          if (cards >= 40) break;
          if (out.length === lastCount && scrollCount > 10) break;
          if (scrollCount > 45) break;
          lastCount = out.length;
        }

        return { rows: out, cardCount: document.querySelectorAll('a[href*="ilanlar"], article, .card').length };
      }
    });
    return result || { rows: [], cardCount: 0 };
  }

  async function runPickTest() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const combo = { platform: ui.selPlatform.value === 'hepsi' ? 'tiktok' : ui.selPlatform.value, service: ui.selService.value === 'hepsi' ? 'izlenme' : ui.selService.value };
    const test = await extractPage(tab.id, state.draft.selectors, combo);
    const sample = (test.rows || []).slice(0, 10);
    if (ui.testWrap) {
      if (!sample.length) ui.testWrap.innerHTML = '<span style="color:#ff5c77">Test sonucu boş.</span>';
      else ui.testWrap.innerHTML = `<table style="width:100%;border-collapse:collapse"><thead><tr><th>Başlık</th><th>Hizmet</th><th>Mağaza</th><th>Fiyat</th></tr></thead><tbody>${sample.map((r)=>`<tr><td>${r.titleFull}</td><td>${r.service}</td><td>${r.shopName}</td><td>${r.priceTl}</td></tr>`).join('')}</tbody></table>`;
    }
    const ok = confirm('TEST tamamlandı. Doğru çalıştı mı?');
    if (!ok) return;
    const name = prompt('Şablon adı girin:', templateKeyFromUi()) || templateKeyFromUi();
    state.templates[name] = { selectors: { ...state.draft.selectors }, createdAt: Date.now() };
    state.activeTemplateKey = name;
    await saveTemplates();
    toast('Şablon kaydedildi.');
  }

  async function savePickedSelector(selector) {
    if (!state.pickField) return;
    state.draft.selectors[state.pickField] = selector;
    await runPickTest();
    state.pickField = '';
  }

  async function enterPickMode(fieldKey) {
    state.pickField = fieldKey;
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (window.__rakipPickerCleanup) window.__rakipPickerCleanup();
        const st = document.createElement('style');
        st.id='__rakip_picker_style';
        st.textContent='*{cursor:crosshair!important}.rakip-hover{outline:2px solid #6ea8ff!important}';
        document.documentElement.appendChild(st);
        let hovered=null;
        const cssPath=(el)=>{ if(!(el instanceof Element)) return ''; const parts=[]; let cur=el; while(cur && cur.nodeType===1 && cur!==document.body){ let sel=cur.nodeName.toLowerCase(); if(cur.id){ sel+=`#${cur.id}`; parts.unshift(sel); break;} const cls=(cur.className||'').toString().trim().split(/\s+/).filter(Boolean).slice(0,2).join('.'); if(cls) sel+=`.${cls}`; const sib=Array.from(cur.parentNode?.children||[]).filter(x=>x.nodeName===cur.nodeName); if(sib.length>1) sel+=`:nth-of-type(${sib.indexOf(cur)+1})`; parts.unshift(sel); cur=cur.parentElement;} return parts.join(' > '); };
        const onMove=(e)=>{ if(hovered) hovered.classList.remove('rakip-hover'); hovered=e.target; hovered.classList.add('rakip-hover'); };
        const onClick=(e)=>{ e.preventDefault(); e.stopPropagation(); chrome.runtime.sendMessage({type:'rakip_pick_result',selector:cssPath(e.target)}); window.__rakipPickerCleanup(); };
        window.__rakipPickerCleanup=()=>{ document.removeEventListener('mousemove',onMove,true); document.removeEventListener('click',onClick,true); if(hovered) hovered.classList.remove('rakip-hover'); document.getElementById('__rakip_picker_style')?.remove(); };
        document.addEventListener('mousemove',onMove,true); document.addEventListener('click',onClick,true);
      }
    });
    toast('Pick mode açıldı.');
  }

  async function cancelPickMode() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { window.__rakipPickerCleanup && window.__rakipPickerCleanup(); } });
    state.pickField = '';
  }

  async function applyRegexOverride(fieldKey, regexList, selectedIndex) {
    const all = (await getLocal(STORAGE_KEYS.regexOverrides)) || {};
    const key = templateKeyFromUi();
    all[key] = all[key] || {};
    all[key][fieldKey] = { regexList, selectedIndex };
    await setLocal(STORAGE_KEYS.regexOverrides, all);
  }

  async function openRegexPanel(fieldKey) {
    const txt = prompt(`${fieldKey} için regex girin:`);
    if (!txt) return;
    try { new RegExp(txt, 'm'); } catch { return toast('Geçersiz regex.'); }
    await applyRegexOverride(fieldKey, [txt], 0);
    toast('Regex override kaydedildi.');
  }

  async function deleteTemplate() {
    const key = ui.selTemplate?.value;
    if (!key) return toast('Şablon seçin.');
    if (!confirm(`Şablon silinsin mi?\n${key}`)) return;
    delete state.templates[key];
    if (state.activeTemplateKey === key) state.activeTemplateKey = '';
    await saveTemplates();
  }

  async function startScan({ pageCount }) {
    state.stopped = false;
    const combos = selectedCombos();
    if (!combos.length) return toast('Platform/hizmet seçimi geçersiz.');
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return toast('Aktif sekme bulunamadı.');

    const selectors = (state.templates[state.activeTemplateKey] || {}).selectors || {};
    const maxPage = Math.max(1, Number(pageCount || 1));

    for (const combo of combos) {
      if (state.stopped) break;
      const baseUrl = `https://hesap.com.tr/ilanlar/${combo.platform}-${combo.service}-satin-al?page=1`;
      await wait(200); await randomWait();
      await chrome.tabs.update(tab.id, { url: baseUrl });
      await new Promise((resolve) => {
        const listener = (id, info) => { if (id === tab.id && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(listener); resolve(true); } };
        chrome.tabs.onUpdated.addListener(listener);
      });

      // first page + 2..N
      for (let p = 1; p <= maxPage; p++) {
        if (state.stopped) break;
        const url = p === 1 ? baseUrl : `https://hesap.com.tr/ilanlar/${combo.platform}-${combo.service}-satin-al?page=${p}`;
        if (p > 1) {
          await wait(200); await randomWait();
          await chrome.tabs.update(tab.id, { url });
          await new Promise((resolve) => {
            const listener = (id, info) => { if (id === tab.id && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(listener); resolve(true); } };
            chrome.tabs.onUpdated.addListener(listener);
          });
        }

        const extracted = await extractPage(tab.id, selectors, combo);
        for (const raw of (extracted.rows || [])) {
          if (state.stopped) break;
          const derivedPlatform = detectPlatform(raw.titleFull || raw.service || '') || combo.platform;
          const counts = extractTwoCounts(`${raw.titleFull} ${raw.service}`);
          const row = {
            ...raw,
            platform: derivedPlatform,
            minQtyDerived: counts.min,
            maxQtyDerived: counts.max,
            serviceCount: counts.min,
            titleShort: nSpace((raw.titleFull.match(REGEX.TITLE_3) || [,''])[1] || raw.titleFull)
          };
          const h = await hashRow(row);
          if (state.hashes.has(h)) { state.dropped += 1; continue; }
          state.hashes.add(h);
          state.rows.push(row);
          appendRow(row);
        }

        if ((extracted.cardCount || 0) < 40 && p >= 1) break;
      }
    }

    updateStats();
    toast(`Rakip tarama tamamlandı. Satır: ${state.rows.length}`);
  }

  function stopScan() { state.stopped = true; }
  function clearTable() {
    if (!confirm('Rakip tablosu temizlensin mi?')) return;
    state.rows = []; state.hashes.clear(); state.dropped = 0;
    ui.tblBody.innerHTML = '';
    updateStats();
  }

  async function copyTableMarkdown() {
    const head='| Platform | İlan Başlığı | Hizmet | Mağaza | Garanti | Fiyat | Reklam Gücü | Başarı |\n|---|---|---|---|---|---:|---|---:|';
    const body=state.rows.map((r)=>`| ${r.platform} | ${r.titleFull} | ${r.service} | ${r.shopName} | ${r.warrantyText} | ${r.priceTl} | ${r.adPowerText} | ${r.successCount} |`).join('\n');
    try { await navigator.clipboard.writeText(`${head}\n${body}`); toast('Markdown kopyalandı.'); } catch { toast('Panoya kopyalama başarısız.'); }
  }

  function exportJson() { const b=new Blob([JSON.stringify(state.rows,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=`rakip_${Date.now()}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
  function exportCsv() {
    const cols=['Platform','İlan Başlığı','Hizmet','Mağaza','Garanti','Fiyat','Reklam Gücü','Başarı','URL'];
    const esc=(v)=>`"${String(v??'').replace(/"/g,'""')}"`;
    const lines=[cols.join(',')].concat(state.rows.map((r)=>[r.platform,r.titleFull,r.service,r.shopName,r.warrantyText,r.priceTl,r.adPowerText,r.successCount,r.url].map(esc).join(',')));
    const b=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=`rakip_${Date.now()}.csv`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  function fillServiceOptions() {
    const p = ui.selPlatform.value;
    let services = [];
    if (p === 'hepsi') services = [...new Set(Object.values(PLATFORM_SERVICE_MAP).flat())];
    else if (PLATFORM_SERVICE_MAP[p]) services = PLATFORM_SERVICE_MAP[p];
    ui.selService.innerHTML = '<option value="">Hizmet seç</option><option value="hepsi">hepsi</option>' + services.map((x)=>`<option value="${x}">${x}</option>`).join('');
    ui.selService.disabled = !p;
  }

  function bind() {
    ui.selPlatform=byId('selPlatform'); ui.selService=byId('selService'); ui.inpQtyMin=byId('inpQtyMin'); ui.inpQtyMax=byId('inpQtyMax'); ui.inpPage=byId('inpRakipPageCount');
    ui.tblBody=byId('tblRakipBody'); ui.marketEmpty=byId('marketEmpty'); ui.stats=byId('rakipStats'); ui.selTemplate=byId('selRakipTemplate'); ui.testWrap=byId('rakipTestPreviewWrap');
    ui.selPlatform?.addEventListener('change', fillServiceOptions);
    byId('btnRakipStart')?.addEventListener('click', ()=>startScan({ pageCount: Number(ui.inpPage?.value || 1) }));
    byId('btnRakipStop')?.addEventListener('click', stopScan);
    byId('btnRakipClear')?.addEventListener('click', clearTable);
    byId('btnRakipCopyMd')?.addEventListener('click', copyTableMarkdown);
    byId('btnRakipExportJson')?.addEventListener('click', exportJson);
    byId('btnRakipExportCsv')?.addEventListener('click', exportCsv);
    byId('btnPickService')?.addEventListener('click', ()=>enterPickMode('service'));
    byId('btnPickShop')?.addEventListener('click', ()=>enterPickMode('shopName'));
    byId('btnPickWarranty')?.addEventListener('click', ()=>enterPickMode('warranty'));
    byId('btnPickSuccess')?.addEventListener('click', ()=>enterPickMode('successCount'));
    byId('btnPickPrice')?.addEventListener('click', ()=>enterPickMode('price'));
    byId('btnPickAdPower')?.addEventListener('click', ()=>enterPickMode('adPower'));
    byId('btnPickCancel')?.addEventListener('click', cancelPickMode);
    byId('btnRakipRegexPanel')?.addEventListener('click', ()=>openRegexPanel('titleFull'));
    byId('btnRakipTemplateUse')?.addEventListener('click', async ()=>{ const k=ui.selTemplate.value; if(!k) return toast('Şablon seçin.'); state.activeTemplateKey=k; await saveTemplates(); toast('Aktif şablon seçildi.'); });
    byId('btnRakipTemplateDelete')?.addEventListener('click', deleteTemplate);
    chrome.runtime.onMessage.addListener((msg)=>{ if(msg?.type==='rakip_pick_result' && msg.selector) savePickedSelector(msg.selector); });
  }

  const Rakip = { init: async()=>{ bind(); await loadTemplates(); updateStats(); }, startScan, stopScan, clearTable, copyTableMarkdown, exportJson, exportCsv, enterPickMode, openRegexPanel, applyRegexOverride };
  window.Patpat = window.Patpat || {};
  window.Patpat.Rakip = Rakip;
  Rakip.init();
})();
