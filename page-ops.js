/* page-ops.js
 *
 * Amaç:
 * - "Sipariş Yönetimi" ve "Rakip ve Pazar Analizi" sekmelerinin işlevleri
 * - Butonlar background job'larını tetikler
 * - Progress (yerel) güncellenir; background port progress gelirse zaten üstten akar
 * - Sonuç önizleme (VARSAYIM: storage'a yazılan preview varsa) tabloya basılır
 */

(() => {
  'use strict';

  const root = window;
  const Shared = root.Patpat?.Shared;

  if (!Shared) return;

  // VARSAYIM: İleride background/content son sonuçları buraya yazacak.
  const PREVIEW_KEYS = Object.freeze({
    orders: 'patpat_preview_orders',
    market: 'patpat_preview_market'
  });

  function el(id) { return document.getElementById(id); }

  async function init() {
    const btnScanHesap = el('btnScanHesap');
    const btnScanSmm = el('btnScanSmm');
    const btnDryRun = el('btnDryRun');
    const btnSyncNow = el('btnSyncNow');

    const btnMarketStart = el('btnMarketStart');
    const btnMarketOnePage = el('btnMarketOnePage');
    const btnMarketRegexTest = el('btnMarketRegexTest');
    const btnMarketExport = el('btnMarketExport');

    // Sipariş önizleme: ordersEmpty div'ini tablo ile değiştirebiliriz
    const ordersEmpty = el('ordersEmpty');
    const ordersPreviewWrap = ensurePreviewContainer(ordersEmpty, 'ordersPreviewWrap');

    // Market önizleme alanı oluştur (market tab panelindeki ikinci kartın içine)
    const marketPanel = document.querySelector('.tabpanel[data-tabpanel="market"]');
    const marketCard = marketPanel?.querySelectorAll('.card')?.[1] || null;
    const marketPreviewWrap = ensureCardPreview(marketCard, 'marketPreviewWrap', 'Henüz rakip verisi yok.');

    // Butonlar: background tetik
    btnScanHesap?.addEventListener('click', () => Shared.safeTry('Hesap tarama', async () => {
      Shared.setLocalProgress('hesap_orders', 'İş kuyruğa alınıyor', 5, 0);
      Shared.toast('Hesap taraması başlatıldı.');
      await Shared.sendToBackground('ui_start_scan_hesap');
    }));

    btnScanSmm?.addEventListener('click', () => Shared.safeTry('SMM tarama', async () => {
      Shared.setLocalProgress('smm_orders', 'İş kuyruğa alınıyor', 5, 0);
      Shared.toast('SMM panel taraması başlatıldı.');
      await Shared.sendToBackground('ui_start_scan_smm');
    }));

    // VARSAYIM: Dry run etkisi için background sonraki adımda okur.
    btnDryRun?.addEventListener('click', () => Shared.safeTry('Önizleme modu', async () => {
      await Shared.setSync('patpat_run_mode', { mode: 'dry_run', setAt: Date.now() });
      Shared.toast('Önizleme modu seçildi: Gönderme yapılmamalı.');
      // Kullanıcı isterse ardından tarama başlatır; burada otomatik başlatmıyoruz.
    }));

    btnSyncNow?.addEventListener('click', () => Shared.safeTry('Şimdi senkronla', async () => {
      Shared.setLocalProgress('sync_queue', 'Offline kuyruk gönderiliyor', 10, 0);
      Shared.toast('Senkron başlatıldı (offline kuyruk).');
      await Shared.sendToBackground('ui_sync_now');
    }));

    // Rakip taraması: platform ve maxPages sor
    btnMarketStart?.addEventListener('click', () => Shared.safeTry('Rakip tarama başlat', async () => {
      const platform = await askMarketPlatform();
      const maxPages = await askMaxPages();
      await Shared.setSync('patpat_market_settings', { platform, maxPages, setAt: Date.now() });

      Shared.setLocalProgress('market_scan', `Başlatılıyor: ${platform}`, 5, 0);
      Shared.toast(`Rakip taraması başlatıldı: ${platform}`);
      await Shared.sendToBackground('ui_market_start', { platform, maxPages });
    }));

    btnMarketOnePage?.addEventListener('click', () => Shared.safeTry('Tek sayfa tara', async () => {
      const platform = await askMarketPlatform();
      await Shared.setSync('patpat_market_settings', { platform, maxPages: 1, setAt: Date.now() });

      Shared.setLocalProgress('market_scan', `Tek sayfa: ${platform}`, 5, 0);
      Shared.toast(`Tek sayfa tarama başlatıldı: ${platform}`);
      await Shared.sendToBackground('ui_market_start', { platform, maxPages: 1 });
    }));

    btnMarketRegexTest?.addEventListener('click', () => Shared.safeTry('Satıcı regex test', () => {
      Shared.openModal('Satıcı Regex Test', `
        <div style="display:grid;gap:10px;">
          <div style="color:rgba(169,180,230,.9);font-size:12px;">
            Bu araç, sayfadaki metin üzerinde satıcı yakalamayı “en iyi çaba” ile gösterir.
          </div>
          <textarea id="__patpat_rx_text__" style="width:100%;min-height:160px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(18,28,58,.40);color:#e7ecff;padding:10px;font-family:ui-monospace;font-size:12px;"></textarea>
          <button id="__patpat_rx_run__" style="height:40px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:linear-gradient(135deg, rgba(110,168,255,.24), rgba(155,123,255,.16));color:#e7ecff;cursor:pointer;">
            Test Et
          </button>
          <pre id="__patpat_rx_out__" style="white-space:pre-wrap;font-size:11px;line-height:1.45;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:10px;margin:0;"></pre>
        </div>
      `);

      setTimeout(() => {
        const t = document.getElementById('__patpat_rx_text__');
        const b = document.getElementById('__patpat_rx_run__');
        const o = document.getElementById('__patpat_rx_out__');
        if (!t || !b || !o) return;

        b.addEventListener('click', () => {
          const txt = String(t.value || '');
          const rx = /(?:^|\n)([a-zA-Z0-9]+(?:Store|Media|Shop|Zone|Dukkan|Vakko|SocialStore))\b/gm;
          const found = [];
          let m;
          while ((m = rx.exec(txt)) !== null) found.push(m[1]);
          o.textContent = found.length ? `Bulunan satıcılar:\n- ${found.join('\n- ')}` : 'Eşleşme bulunamadı.';
        });
      }, 0);
    }));

    btnMarketExport?.addEventListener('click', () => Shared.safeTry('Rakip dışa aktar', async () => {
      const data = await Shared.getLocal(PREVIEW_KEYS.market);
      if (!data || !Array.isArray(data.rows) || data.rows.length === 0) {
        Shared.toast('Dışa aktarılacak rakip verisi yok.');
        return;
      }
      Shared.downloadText(`rakip_verisi_${Date.now()}.json`, JSON.stringify(data, null, 2), 'application/json');
      Shared.toast('Rakip verisi indirildi (JSON).');
    }));

    // Önizleme: depolamadan oku
    await refreshOrdersPreview(ordersPreviewWrap);
    await refreshMarketPreview(marketPreviewWrap);

    // storage değişimlerinde yenile
    if (chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[PREVIEW_KEYS.orders]) refreshOrdersPreview(ordersPreviewWrap);
        if (changes[PREVIEW_KEYS.market]) refreshMarketPreview(marketPreviewWrap);
      });
    }
  }

  function ensurePreviewContainer(ordersEmptyEl, id) {
    if (!ordersEmptyEl) return null;
    const parent = ordersEmptyEl.parentElement;
    if (!parent) return null;

    let wrap = document.getElementById(id);
    if (wrap) return wrap;

    wrap = document.createElement('div');
    wrap.id = id;
    parent.innerHTML = '';
    parent.appendChild(wrap);
    return wrap;
  }

  function ensureCardPreview(cardEl, id, emptyText) {
    if (!cardEl) return null;
    let wrap = document.getElementById(id);
    if (wrap) return wrap;

    cardEl.innerHTML = `
      <h3>Sonuç Önizleme</h3>
      <p>Tarama sonrası kayıtlar burada listelenir.</p>
      <div id="${id}"></div>
    `;
    wrap = document.getElementById(id);
    if (!wrap) return null;

    wrap.innerHTML = `<div style="border:1px dashed rgba(255,255,255,.18);border-radius:16px;padding:12px;color:rgba(169,180,230,.75);background:rgba(255,255,255,.03);font-size:12px;">${emptyText}</div>`;
    return wrap;
  }

  async function refreshOrdersPreview(container) {
    if (!container) return;
    const data = await Shared.getLocal(PREVIEW_KEYS.orders);

    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const cols = [
      { key: 'smmId', label: 'SMM ID' },
      { key: 'platform', label: 'Platform' },
      { key: 'status', label: 'Durum' },
      { key: 'toplamTutar', label: 'Tutar' },
      { key: 'tarih', label: 'Tarih' }
    ];

    Shared.renderTable(container, cols, rows.slice(0, 40), { emptyText: 'Henüz sipariş verisi yok. Tarama başlatınca burada görünür.' });
  }

  async function refreshMarketPreview(container) {
    if (!container) return;
    const data = await Shared.getLocal(PREVIEW_KEYS.market);
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const cols = [
      { key: 'platform', label: 'Platform' },
      { key: 'saticiAdi', label: 'Satıcı' },
      { key: 'kaynakUrl', label: 'Kaynak' }
    ];
    Shared.renderTable(container, cols, rows.slice(0, 60), { emptyText: 'Henüz rakip verisi yok. Tarama başlatınca burada görünür.' });
  }

  async function askMarketPlatform() {
    const saved = await Shared.getSync('patpat_market_settings');
    const def = saved?.platform || 'instagram';

    const input = prompt('Platform yaz (tiktok/instagram/youtube/twitter/twitch/threads):', def);
    const p = String(input || def).trim().toLowerCase();

    const allowed = ['tiktok', 'instagram', 'youtube', 'twitter', 'twitch', 'threads'];
    return allowed.includes(p) ? p : def;
  }

  async function askMaxPages() {
    const saved = await Shared.getSync('patpat_market_settings');
    const def = Number(saved?.maxPages || 3);

    const input = prompt('Kaç sayfa taransın? (1-50):', String(def));
    const n = Number(input || def);
    if (!Number.isFinite(n)) return def;
    return Math.max(1, Math.min(50, Math.floor(n)));
  }

  // UI hazır olunca başlat
  Shared.waitFor(() => window.__PatpatUI?.UI).then(init).catch((e) => {
    Shared.log('Uyarı', `page-ops başlatılamadı: ${Shared.formatErr(e)}`);
  });
})();