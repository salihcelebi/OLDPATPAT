/* content.js
 *
 * Amaç:
 * - Background/UI komutlarını almak ve content-crawler.js çekirdeğine yönlendirmek
 * - Worker tab "ready" el sıkışması
 * - Selector test + highlight araçları
 * - İptal sinyali ile güvenli durdurma (cancel)
 *
 * Not:
 * - Bu dosya tek başına tarama yapmaz; çekirdek content-crawler.js içindedir.
 * - try/catch standardı: tüm handler'lar safeTry ile sarılıdır.
 */

(() => {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Güvenli çalıştırma
  // ─────────────────────────────────────────────────────────────
  function safeTry(label, fn) {
    try { return fn(); }
    catch (err) {
      // Background şu an "log" mesajını dinlemese bile, sessizce yollamak zararsızdır.
      try {
        chrome.runtime.sendMessage({
          type: "content_log",
          level: "Hata",
          message: `${label}: ${formatErr(err)}`
        });
      } catch {}
      return undefined;
    }
  }

  function formatErr(err) {
    if (!err) return "Bilinmeyen hata";
    if (typeof err === "string") return err;
    const s = err.message || String(err);
    return s.length > 500 ? s.slice(0, 500) + "…" : s;
  }

  // ─────────────────────────────────────────────────────────────
  // Bölüm: İptal yönetimi (cancel token)
  // ─────────────────────────────────────────────────────────────
  let activeRun = null;
  function newRunContext() {
    // AbortController: gecikmelerde / beklemelerde kullanılabilir
    const controller = new AbortController();
    return {
      id: `run_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      cancelled: false,
      abort() {
        this.cancelled = true;
        try { controller.abort(); } catch {}
      },
      signal: controller.signal
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Worker tab ready handshake
  // ─────────────────────────────────────────────────────────────
  safeTry("ready_handshake", () => {
    // Background şu an bunu zorunlu kullanmıyor; ileride load beklemeyi güçlendirmek için var.
    chrome.runtime.sendMessage({
      type: "content_ready",
      href: location.href,
      ts: Date.now()
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Highlight/Selector test araçları
  // ─────────────────────────────────────────────────────────────
  const HIGHLIGHT_ID = "__patpat_highlight_box__";

  function clearHighlight() {
    const el = document.getElementById(HIGHLIGHT_ID);
    if (el) el.remove();
  }

  function highlightElements(elements) {
    clearHighlight();
    if (!elements || elements.length === 0) return;

    // Basit overlay: ilk elemanı highlight et (çoklu durumda da ilk yeterli)
    const target = elements[0];
    const rect = target.getBoundingClientRect();
    const box = document.createElement("div");
    box.id = HIGHLIGHT_ID;
    box.style.position = "fixed";
    box.style.left = `${Math.max(0, rect.left)}px`;
    box.style.top = `${Math.max(0, rect.top)}px`;
    box.style.width = `${Math.max(0, rect.width)}px`;
    box.style.height = `${Math.max(0, rect.height)}px`;
    box.style.border = "2px solid #6ea8ff";
    box.style.boxShadow = "0 0 0 4px rgba(110,168,255,.20)";
    box.style.borderRadius = "10px";
    box.style.zIndex = "2147483647";
    box.style.pointerEvents = "none";
    document.documentElement.appendChild(box);

    // 1.5s sonra otomatik kaldır (UI spam olmasın)
    setTimeout(() => clearHighlight(), 1500);
  }

  function testSelector(selector) {
    if (!selector || typeof selector !== "string") {
      return { ok: false, count: 0, message: "Seçici boş." };
    }
    try {
      const nodes = Array.from(document.querySelectorAll(selector));
      return { ok: true, count: nodes.length, message: "Seçici çalıştı.", nodes };
    } catch (e) {
      return { ok: false, count: 0, message: `Seçici hatalı: ${formatErr(e)}` };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Background/UI komutları
  // ─────────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    return safeTry("onMessage", () => {
      if (!msg || typeof msg !== "object") return false;

      // 1) İptal komutu (UI STOP veya job iptali)
      if (msg.type === "cancel_crawl") {
        if (activeRun) {
          activeRun.abort();
          activeRun = null;
        }
        clearHighlight();
        sendResponse?.({ ok: true, cancelled: true });
        return true;
      }

      // 2) Selector test (UI aracı)
      if (msg.type === "ui_test_selector") {
        const selector = String(msg.selector || "");
        const res = testSelector(selector);
        if (msg.highlight && res.ok) highlightElements(res.nodes);
        sendResponse?.({
          ok: res.ok,
          count: res.count,
          message: res.message
        });
        return true;
      }

      // 3) Highlight temizle
      if (msg.type === "ui_clear_highlight") {
        clearHighlight();
        sendResponse?.({ ok: true });
        return true;
      }

      // 4) Asıl iş: crawl komutu (background.js bunu gönderiyor)
      if (msg.type === "crawl") {
        // Önceki run varsa iptal et (çakışmayı engelle)
        if (activeRun) activeRun.abort();
        activeRun = newRunContext();

        const mode = String(msg.mode || "unknown");
        const url = String(msg.url || location.href);
        const options = msg.options || {};

        // Crawler çekirdeği window üstünde bekleniyor
        const crawler = window.__PatpatCrawler;
        if (!crawler || typeof crawler.run !== "function") {
          const payload = {
            type: "crawl_result",
            mode,
            rows: [],
            meta: { url, runId: activeRun.id },
            errors: ["CRAWLER_NOT_FOUND"]
          };
          chrome.runtime.sendMessage(payload).catch(() => {});
          sendResponse?.({ ok: false, error: "CRAWLER_NOT_FOUND" });
          return true;
        }

        // Progress callback: background şu an dinlemese de geleceğe dönük
        const onProgress = (p) => {
          try {
            chrome.runtime.sendMessage({
              type: "crawl_progress",
              mode,
              runId: activeRun.id,
              progress: p
            });
          } catch {}
        };

        // Asenkron çalıştır
        (async () => {
          try {
            onProgress({ step: "Başlatıldı", pct: 0 });

            const result = await crawler.run({
              mode,
              url,
              options,
              cancel: () => Boolean(activeRun?.cancelled),
              signal: activeRun.signal,
              onProgress
            });

            // Sonuç mesajı: background.js bunu işliyor
            await chrome.runtime.sendMessage({
              type: "crawl_result",
              mode,
              rows: result.rows || [],
              meta: result.meta || { url },
              errors: result.errors || []
            });

            onProgress({ step: "Tamamlandı", pct: 100 });
          } catch (e) {
            await chrome.runtime.sendMessage({
              type: "crawl_result",
              mode,
              rows: [],
              meta: { url, runId: activeRun?.id || "" },
              errors: ["CRAWL_FAILED", formatErr(e)]
            });
          } finally {
            activeRun = null;
          }
        })();

        // sendResponse hemen döner; background await ediyor olabilir
        sendResponse?.({ ok: true, accepted: true });
        return true;
      }

      return false;
    });
  });
})();