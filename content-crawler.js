/* content-crawler.js
 *
 * Amaç:
 * - Target sayfalardan “en iyi çaba” ile veri çıkarmak (hesap/smm siparişleri + rakip/pazar taraması)
 * - window.__PatpatCrawler altında tek bir run() API'si yayınlamak
 *
 * Notlar:
 * - Bu dosya, content.js tarafından çağrılır.
 * - DOM yapıları siteye göre değişebileceği için seçiciler “heuristic”tir.
 * - Çökme yerine boş sonuç + hata kodu döndürmeyi tercih eder.
 */

(() => {
  'use strict';

  const root = window;
  if (root.__PatpatCrawler) return; // çift yüklemeye karşı

  const Crawler = {};

  // ─────────────────────────────────────────────────────────────
  // Küçük yardımcılar
  // ─────────────────────────────────────────────────────────────
  const sleep = (ms, signal) => new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      if (signal.aborted) {
        clearTimeout(t);
        reject(new Error('ABORTED'));
        return;
      }
      signal.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new Error('ABORTED'));
      }, { once: true });
    }
  });

  function text(el) {
    if (!el) return '';
    const t = (el.innerText || el.textContent || '').trim();
    return t.replace(/\s+/g, ' ');
  }

  function normalizeKey(s) {
    // Header'ları anahtar olarak kullanırken makul normalize
    const raw = String(s || '').trim();
    const cleaned = raw
      .replace(/\s+/g, ' ')
      .replace(/[:：]+$/g, '')
      .slice(0, 80);

    if (!cleaned) return 'alan';
    return cleaned;
  }

  function bestTable() {
    const tables = Array.from(document.querySelectorAll('table'));
    if (tables.length === 0) return null;

    let best = null;
    let bestScore = -1;
    for (const t of tables) {
      const bodyRows = t.querySelectorAll('tbody tr').length;
      const headCells = t.querySelectorAll('thead th, thead td').length;
      const score = (bodyRows * 10) + headCells;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  function extractTableRows(table, limit = 500) {
    const out = [];
    if (!table) return out;

    // Header
    let headers = Array.from(table.querySelectorAll('thead th, thead td')).map(h => normalizeKey(text(h)));
    if (headers.length === 0) {
      // thead yoksa ilk satırı header gibi kullanmayı dene
      const first = table.querySelector('tr');
      if (first) headers = Array.from(first.querySelectorAll('th,td')).map(h => normalizeKey(text(h)));
    }
    if (headers.length === 0) headers = ['alan1', 'alan2', 'alan3', 'alan4'];

    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const dataRows = rows.length ? rows : Array.from(table.querySelectorAll('tr')).slice(1);

    for (const tr of dataRows.slice(0, limit)) {
      const cells = Array.from(tr.querySelectorAll('td,th'));
      if (cells.length === 0) continue;

      const obj = {};
      for (let i = 0; i < Math.max(headers.length, cells.length); i++) {
        const k = headers[i] || `alan${i + 1}`;
        obj[k] = text(cells[i]) || '';
      }

      // Boş satırları atla
      const nonEmpty = Object.values(obj).some(v => String(v).trim());
      if (!nonEmpty) continue;

      out.push(obj);
    }

    return out;
  }

  function pickIdFromRow(obj) {
    const keys = Object.keys(obj || {});
    const candidates = [];

    // ID içerme olasılığı yüksek anahtarlar
    const keyPriority = [
      'smmid', 'id', 'sipariş id', 'sipariş no', 'siparis no', 'siparis id', 'order id', 'order no', 'no'
    ];

    for (const k of keys) {
      const lk = k.toLowerCase();
      const v = String(obj[k] || '').trim();
      if (!v) continue;

      // bariz id
      if (keyPriority.some(p => lk === p || lk.includes(p))) {
        const m = v.match(/\d{3,}/);
        if (m) return m[0];
      }

      // genel aday
      const m = v.match(/\d{5,}/);
      if (m) candidates.push(m[0]);
    }

    return candidates[0] || '';
  }

  function hash32(str) {
    // deterministik hafif hash (market_scan için)
    let h = 2166136261;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  async function waitDomIdle(signal, maxMs = 15000) {
    const start = Date.now();

    // Hazırsa hemen dön
    if (document.readyState === 'complete' || document.readyState === 'interactive') return true;

    while (Date.now() - start < maxMs) {
      if (signal?.aborted) throw new Error('ABORTED');
      if (document.readyState === 'complete' || document.readyState === 'interactive') return true;
      await sleep(120, signal);
    }

    return false;
  }

  // ─────────────────────────────────────────────────────────────
  // Modlar
  // ─────────────────────────────────────────────────────────────
  async function crawlOrders({ mode, onProgress, signal, cancel }) {
    onProgress?.({ step: 'DOM hazırlanıyor', pct: 10 });
    await waitDomIdle(signal);

    if (cancel?.()) return { rows: [], meta: {}, errors: ['CANCELLED'] };

    onProgress?.({ step: 'Tablo aranıyor', pct: 25 });
    const table = bestTable();
    if (!table) {
      return {
        rows: [],
        meta: { url: location.href, mode, scannedAt: Date.now() },
        errors: ['TABLE_NOT_FOUND']
      };
    }

    onProgress?.({ step: 'Satırlar çıkarılıyor', pct: 55 });
    const rawRows = extractTableRows(table, 700);

    onProgress?.({ step: 'Normalize ediliyor', pct: 80 });
    const rows = rawRows.map((r) => {
      const smmId = pickIdFromRow(r);
      return {
        smmId: smmId || `row_${hash32(JSON.stringify(r))}`,
        source: mode,
        url: location.href,
        ...r
      };
    });

    return {
      rows,
      meta: { url: location.href, mode, scannedAt: Date.now(), count: rows.length },
      errors: []
    };
  }

  async function crawlMarket({ mode, options, onProgress, signal, cancel }) {
    onProgress?.({ step: 'DOM hazırlanıyor', pct: 10 });
    await waitDomIdle(signal);

    if (cancel?.()) return { rows: [], meta: {}, errors: ['CANCELLED'] };

    onProgress?.({ step: 'İlan kartları aranıyor', pct: 30 });

    // Heuristic: çok sayıda link arasından “kart” gibi görünenleri seç
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const seen = new Set();
    const rows = [];

    for (const a of anchors) {
      if (cancel?.()) break;

      const href = a.href || a.getAttribute('href') || '';
      if (!href) continue;

      // kategori/paging linklerini azalt
      const lc = href.toLowerCase();
      const isLikelyListing = lc.includes('ilan') || lc.includes('listing') || lc.includes('product');
      if (!isLikelyListing) continue;

      const t = text(a);
      if (t.length < 8 || t.length > 260) continue;

      // görsel/başlık içeriyorsa puan artır, ama basit filtre yeterli
      const key = href.split('#')[0];
      if (seen.has(key)) continue;
      seen.add(key);

      rows.push({
        smmId: `m_${hash32(key)}`,
        source: mode,
        platform: String(options?.platform || ''),
        page: Number(options?.page || 0),
        url: location.href,
        href: key,
        title: t
      });

      if (rows.length >= 120) break;
    }

    onProgress?.({ step: 'Tamamlandı', pct: 95 });

    return {
      rows,
      meta: {
        url: location.href,
        mode,
        scannedAt: Date.now(),
        count: rows.length,
        platform: String(options?.platform || ''),
        page: Number(options?.page || 0)
      },
      errors: rows.length ? [] : ['MARKET_NO_ITEMS']
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────
  Crawler.run = async function run(args) {
    const mode = String(args?.mode || 'unknown');
    const options = args?.options || {};
    const cancel = typeof args?.cancel === 'function' ? args.cancel : () => false;
    const signal = args?.signal;
    const onProgress = typeof args?.onProgress === 'function' ? args.onProgress : null;

    try {
      if (cancel()) return { rows: [], meta: { url: location.href, mode }, errors: ['CANCELLED'] };

      if (mode === 'market_scan') {
        return await crawlMarket({ mode, options, onProgress, signal, cancel });
      }

      // default: sipariş taraması
      return await crawlOrders({ mode, onProgress, signal, cancel });
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      return {
        rows: [],
        meta: { url: location.href, mode, scannedAt: Date.now() },
        errors: ['CRAWLER_EXCEPTION', msg]
      };
    }
  };

  root.__PatpatCrawler = Crawler;
})();
