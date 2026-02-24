/* background.js (MV3 Service Worker, ES Module)
 *
 * Amaç:
 * - Yan panel (sidepanel) ile port üzerinden canlı log/progress paylaşımı
 * - Worker tab (active:false) ile hedef sayfaları açıp tarama komutu iletmek
 * - Offline queue + eksponansiyel geri bekleme ile webhook senkronu
 * - STOP/iptal mekanizması ile tüm işler güvenli durdurulsun
 *
 * Not: Bu dosya “çalıştırıldı/test edildi” iddiası içermez.
 */

const LOCKED_DEFAULTS = Object.freeze({
  sheetsId: "1XNDD1psw5sS-GMCS17w4xa8W2rCgRXqVWDvac6LpOGM",
  webhookUrl:
    "https://script.google.com/macros/s/AKfycbxgsP85wiwCJ_9-p9mpJymE1euSfsQAPiZWiCTURCrucWRtWOKqT7n14NXZs_i1-Qs/exec"
});

const TARGETS = Object.freeze({
  hesapOrders: [
    "https://hesap.com.tr/p/sattigim-ilanlar",
    "https://hesap.com.tr/p/sattigim-ilanlar?status=pending",
    "https://hesap.com.tr/p/sattigim-ilanlar?status=processing",
    "https://hesap.com.tr/p/sattigim-ilanlar?status=completed",
    "https://hesap.com.tr/p/sattigim-ilanlar?status=cancelled",
    "https://hesap.com.tr/p/sattigim-ilanlar?status=returnprocess",
    "https://hesap.com.tr/p/sattigim-ilanlar?status=problematic"
  ],
  smmOrders: [
    "https://anabayiniz.com/orders",
    "https://anabayiniz.com/orders/pending",
    "https://anabayiniz.com/orders/completed",
    "https://anabayiniz.com/orders/inprogress",
    "https://anabayiniz.com/orders/canceled"
  ],
  marketPlatforms: ["tiktok", "instagram", "youtube", "twitter", "twitch", "threads"]
});

const STORAGE_KEYS = Object.freeze({
  settings: "patpat_settings",
  instruction: "patpat_instruction",
  offlineQueue: "patpat_offline_queue",
  lastSentMap: "patpat_last_sent_map",
  previewOrders: "patpat_preview_orders",
  previewMarket: "patpat_preview_market"
});

// ──────────────────────────────────────────────────────────────
// Bölüm: Port Yönetimi (Yan Panel canlı akış)
// ──────────────────────────────────────────────────────────────
const ports = new Set();

// Content script hazır el sıkışması (tab bazlı)
const CONTENT_READY = new Map(); // tabId -> ts
const CONTENT_READY_WAITERS = new Map(); // tabId -> {resolve,reject}

function waitForContentReady(tabId, timeoutMs = 15000) {
  if (CONTENT_READY.has(tabId)) return Promise.resolve(true);

  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      CONTENT_READY_WAITERS.delete(tabId);
      reject(new Error("Content script hazır sinyali beklenirken zaman aşımı."));
    }, timeoutMs);

    CONTENT_READY_WAITERS.set(tabId, {
      resolve: () => { clearTimeout(t); CONTENT_READY_WAITERS.delete(tabId); resolve(true); },
      reject: (e) => { clearTimeout(t); CONTENT_READY_WAITERS.delete(tabId); reject(e); }
    });
  });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port?.name !== "patpat_sidepanel") return;

  ports.add(port);
  safeLog("Bilgi", "Yan panel bağlandı.");

  port.onDisconnect.addListener(() => {
    ports.delete(port);
    safeLog("Uyarı", "Yan panel bağlantısı kapandı.");
  });

  // İlk “durum” paketi (online bilgisini yan panel kendi hesaplıyor; burada override etmiyoruz)
  broadcastStatus({ site: "—" });
});

function broadcast(type, payload) {
  for (const p of ports) {
    try {
      p.postMessage({ type, ...payload });
    } catch {
      // Port kapanmış olabilir; sessiz geç.
    }
  }
}

function safeLog(level, message) {
  broadcast("log", { level, message });
}

function broadcastProgress({ jobName, progress, step, queue }) {
  broadcast("progress", { jobName, progress, step, queue });
}

function broadcastStatus({ online, site }) {
  const payload = {};
  // "online"/"offline" dışında gelen değerler (ör. "bilinmiyor") UI'ı bozmasın.
  if (online === "online" || online === "offline") payload.online = online;
  if (typeof site === "string") payload.site = site;
  broadcast("status", payload);
}

// ──────────────────────────────────────────────────────────────
// Bölüm: Kurulum Varsayılanları (Kilitli ayarlar)
// ──────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  safeLog("Bilgi", "Kurulum varsayılanları uygulandı.");
});

async function ensureDefaults() {
  const settings = (await getLocal(STORAGE_KEYS.settings)) || {};
  const merged = {
    ...settings,
    sheetsId: LOCKED_DEFAULTS.sheetsId,
    webhookUrl: LOCKED_DEFAULTS.webhookUrl,
    // Kullanıcı ileride options ekranında “güncelleyebilsin” istersen:
    // settingsLocked false yapılabilir. Şimdilik kilitli.
    settingsLocked: true
  };

  // /exec kontrolü (sadece uyarı; otomatik düzeltme yapmıyoruz)
  if (!String(merged.webhookUrl).endsWith("/exec")) {
    safeLog("Hata", "Webhook URL /exec ile bitmiyor. Bu senkron hatasına yol açar.");
  }

  await setLocal(STORAGE_KEYS.settings, merged);

  // Instruction iskeleti
  const instruction = (await getLocal(STORAGE_KEYS.instruction)) || null;
  if (!instruction) {
    await setLocal(STORAGE_KEYS.instruction, {
      learning_queue: [],
      mandatory: [],
      overrides: []
    });
  }

  // Offline queue iskeleti
  const q = (await getLocal(STORAGE_KEYS.offlineQueue)) || null;
  if (!q) await setLocal(STORAGE_KEYS.offlineQueue, []);
}

// ──────────────────────────────────────────────────────────────
// Bölüm: Job Orkestrasyonu + STOP/İptal
// ──────────────────────────────────────────────────────────────
const JOBS = new Map(); // jobId -> { cancelled, workerTabs:Set<number> }

function newJobId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function createJob(prefix) {
  const jobId = newJobId(prefix);
  JOBS.set(jobId, { cancelled: false, workerTabs: new Set() });
  return jobId;
}

function cancelAllJobs() {
  for (const [jobId, meta] of JOBS) {
    meta.cancelled = true;
    for (const tabId of meta.workerTabs) {
      try { chrome.tabs.remove(tabId); } catch {}
    }
    JOBS.delete(jobId);
  }
  safeLog("Uyarı", "Tüm işler iptal edildi.");
}

function isCancelled(jobId) {
  return Boolean(JOBS.get(jobId)?.cancelled);
}

// ──────────────────────────────────────────────────────────────
// Bölüm: Mesajlaşma (UI -> Background) ve (Content -> Background)
// ──────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

// Content script hazır sinyali (content.js)
if (msg?.type === "content_ready") {
  const tabId = sender?.tab?.id;
  if (Number.isFinite(tabId)) {
    CONTENT_READY.set(tabId, Date.now());
    const w = CONTENT_READY_WAITERS.get(tabId);
    if (w?.resolve) w.resolve(true);
  }
  safeLog("Bilgi", `Content hazır: ${String(msg.href || "")}`);
  sendResponse?.({ ok: true });
  return true;
}

// Content tarafı loglarını yan panele taşı (best-effort)
if (msg?.type === "content_log") {
  safeLog(String(msg.level || "Bilgi"), String(msg.message || ""));
  sendResponse?.({ ok: true });
  return true;
}

// Content progress (best-effort)
if (msg?.type === "crawl_progress") {
  Promise.resolve(queueCount()).then((q) => {
    const p = msg.progress || {};
    broadcastProgress({
      jobName: String(msg.mode || "crawl"),
      progress: Number(p.pct || 0),
      step: String(p.step || ""),
      queue: q
    });
  }).catch(() => {});
  sendResponse?.({ ok: true });
  return true;
}

  // UI’dan gelen komutlar
  if (msg?.type === "ui_stop") {
    cancelAllJobs();
    sendResponse?.({ ok: true });
    return true;
  }

  if (msg?.type === "ui_clear_ui_state") {
    clearUiPreviewState().then(() => sendResponse?.({ ok: true })).catch(() => sendResponse?.({ ok: false }));
    return true;
  }

  if (msg?.type === "ui_test_integration") {
    integrationDryRun().then((res) => sendResponse?.({ ok: true, ...res })).catch((e) => sendResponse?.({ ok: false, error: formatErr(e) }));
    return true;
  }

  if (msg?.type === "ui_start_scan_hesap") {
    const jobId = createJob("hesap_scan");
    runScanJob(jobId, "hesap_orders", TARGETS.hesapOrders, msg.options);
    sendResponse?.({ ok: true, jobId });
    return true;
  }

  if (msg?.type === "ui_start_scan_smm") {
    const jobId = createJob("smm_scan");
    runScanJob(jobId, "smm_orders", TARGETS.smmOrders, msg.options);
    sendResponse?.({ ok: true, jobId });
    return true;
  }

  if (msg?.type === "ui_sync_now") {
    const jobId = createJob("sync_now");
    flushOfflineQueue(jobId);
    sendResponse?.({ ok: true, jobId });
    return true;
  }

  if (msg?.type === "ui_market_start") {
    const platform = String(msg.platform || "instagram");
    const maxPages = Number(msg.maxPages || 3);
    const jobId = createJob("market_scan");
    runMarketJob(jobId, platform, maxPages);
    sendResponse?.({ ok: true, jobId });
    return true;
  }

  // Content script’ten tarama sonucu
  if (msg?.type === "crawl_result") {
    handleCrawlResult(msg, sender).then(() => {
      sendResponse?.({ ok: true });
    }).catch((e) => {
      safeLog("Hata", `crawl_result işlenemedi: ${formatErr(e)}`);
      sendResponse?.({ ok: false });
    });
    return true;
  }

  // Kurallar: onay / override
  if (msg?.type === "rule_approval") {
    handleRuleApproval(msg).then(() => sendResponse?.({ ok: true }))
      .catch((e) => {
        safeLog("Hata", `Kural onayı işlenemedi: ${formatErr(e)}`);
        sendResponse?.({ ok: false });
      });
    return true;
  }

  return false;
});

// ──────────────────────────────────────────────────────────────
// Bölüm: Worker Tab Açma (active:false) + Tarama Komutu İletme
// ──────────────────────────────────────────────────────────────
async function openWorkerTab(jobId, url) {
  const tab = await chrome.tabs.create({ url, active: false });
  JOBS.get(jobId)?.workerTabs.add(tab.id);

  await waitTabComplete(tab.id);

  // Content script (document_idle) bazen geç yüklenebilir; kısa bekleme yap
  try { await waitForContentReady(tab.id, 15000); }
  catch (e) { safeLog("Uyarı", `Content hazır değil (devam ediliyor): ${formatErr(e)}`); }

  // “site” durumunu yay
  const site = url.includes("hesap.com.tr") ? "hesap.com.tr"
            : url.includes("anabayiniz.com") ? "anabayiniz.com"
            : url.includes("script.google.com") ? "script.google.com"
            : "—";
  broadcastStatus({ site });

  return tab.id;
}

function waitTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timeoutMs = 45000; // VARSAYIM: 45 sn yeterli
    const t = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Sekme yükleme zaman aşımı."));
    }, timeoutMs);

    function listener(updatedTabId, info) {
      if (updatedTabId !== tabId) return;
      if (info.status === "complete") {
        clearTimeout(t);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(true);
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}



// Content script mesajlaşması: document_idle gecikmesi yüzünden sendMessage bazen erken kaçıyor.
async function sendMessageWithRetry(tabId, message, opts = {}) {
  const retries = Number(opts.retries || 25);
  const baseDelay = Number(opts.baseDelay || 250);

  for (let i = 0; i < retries; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (e) {
      const s = formatErr(e);
      const retryable = /receiving end does not exist|could not establish connection|the message port closed/i.test(s);
      if (!retryable || i === retries - 1) throw e;
      await sleep(baseDelay + (i * 120));
    }
  }
  return null;
}

async function ensureContentScripts(tabId) {
  // Önce ping ile “receiver var mı” kontrol et
  try {
    await chrome.tabs.sendMessage(tabId, { type: "ping" });
    return true;
  } catch {}

  // Gerekirse dosyaları enjekte et (manifest match kaçırırsa da çalışsın)
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["bundle.js"]
    });
    try { await waitForContentReady(tabId, 8000); } catch {}
    return true;
  } catch (e) {
    safeLog("Uyarı", `Content script enjekte edilemedi: ${formatErr(e)}`);
    return false;
  }
}
// ──────────────────────────────────────────────────────────────
// Bölüm: Tarama Job’ları
// ──────────────────────────────────────────────────────────────
async function runScanJob(jobId, mode, urls, uiOptions = {}) {
  safeLog("Bilgi", `Job başladı: ${mode}`);
  broadcastProgress({ jobName: mode, progress: 0, step: "Başlatıldı", queue: await queueCount() });

  const maxPages = Math.max(1, Math.min(50, Number(uiOptions?.maxPages || 3)));
  const lookbackDays = Math.max(1, Math.min(365, Number(uiOptions?.lookbackDays || 5)));
  const nid = Math.max(-100, Math.min(500, Number(uiOptions?.nid || 0)));
  const totalSteps = mode === "hesap_orders" ? (maxPages + 1) : urls.length;

  for (let i = 0; i < totalSteps; i++) {
    if (isCancelled(jobId)) break;

    const isBaseStep = mode === "hesap_orders" && i === 0;
    const pageNo = mode === "hesap_orders" ? i : 0;
    const url = mode === "hesap_orders"
      ? (isBaseStep
        ? "https://hesap.com.tr/p/sattigim-ilanlar"
        : `https://hesap.com.tr/p/sattigim-ilanlar?page=${pageNo}`)
      : urls[i];

    const pct = Math.round((i / totalSteps) * 100);
    broadcastProgress({
      jobName: mode,
      progress: pct,
      step: isBaseStep
        ? "Ana sayfa açılıyor"
        : `Sayfa açılıyor (${i}/${mode === "hesap_orders" ? maxPages : urls.length})`,
      queue: await queueCount()
    });

    let tabId = null;
    try {
      tabId = await openWorkerTab(jobId, url);

      broadcastProgress({
        jobName: mode,
        progress: pct,
        step: "Tarama komutu gönderiliyor",
        queue: await queueCount()
      });

      await ensureContentScripts(tabId);
      const result = await sendMessageWithRetry(tabId, {
        type: "crawl",
        mode,
        url,
        options: {
          safeMode: Boolean(uiOptions && uiOptions.safeMode),
          dryRun: Boolean(uiOptions && uiOptions.dryRun),
          page: pageNo || 1,
          maxPages,
          lookbackDays,
          nid
        }
      });

      if (result?.ok === false && /date/i.test(String(result?.error || ""))) {
        safeLog("Bilgi", "Tarih limiti dışına çıkıldı, tarama güvenli şekilde sonlandırılıyor.");
        break;
      }

      safeLog("Bilgi", `Tarama komutu gönderildi: ${url}`);
    } catch (e) {
      safeLog("Hata", `Tarama akışı hatası: ${url} • ${formatErr(e)}`);
      if (tabId && !isCancelled(jobId)) {
        try { await chrome.tabs.reload(tabId); } catch {}
      }
    } finally {
      if (tabId && !isCancelled(jobId)) {
        try { await chrome.tabs.remove(tabId); } catch {}
      }
      if (!isCancelled(jobId)) {
        await sleep(1000 + Math.floor(Math.random() * 2000));
      }
    }
  }

  broadcastProgress({
    jobName: mode,
    progress: 100,
    step: isCancelled(jobId) ? "İptal edildi" : "Tamamlandı",
    queue: await queueCount()
  });

  safeLog("Bilgi", `Job bitti: ${mode}`);
  JOBS.delete(jobId);
}

async function runMarketJob(jobId, platform, maxPages) {
  const mode = "market_scan";
  const p = TARGETS.marketPlatforms.includes(platform) ? platform : "instagram";
  const pages = Math.max(1, Math.min(50, Number(maxPages || 3)));

  safeLog("Bilgi", `Job başladı: market (${p})`);
  broadcastProgress({ jobName: mode, progress: 0, step: "Başlatıldı", queue: await queueCount() });

  for (let page = 1; page <= pages; page++) {
    if (isCancelled(jobId)) break;

    const url = `https://hesap.com.tr/ilanlar/${p}?page=${page}`;
    const pct = Math.round(((page - 1) / pages) * 100);

    broadcastProgress({
      jobName: mode,
      progress: pct,
      step: `Sayfa açılıyor (page=${page}/${pages})`,
      queue: await queueCount()
    });

    let tabId = null;
    try {
      tabId = await openWorkerTab(jobId, url);
      await ensureContentScripts(tabId);
      await sendMessageWithRetry(tabId, {
        type: "crawl",
        mode,
        url,
        options: { platform: p, page }
      });
      safeLog("Bilgi", `Rakip tarama komutu gönderildi: ${url}`);
    } catch (e) {
      safeLog("Hata", `Rakip tarama hatası: ${url} • ${formatErr(e)}`);
    } finally {
      if (tabId && !isCancelled(jobId)) {
        try { await chrome.tabs.remove(tabId); } catch {}
      }
    }
  }

  broadcastProgress({
    jobName: mode,
    progress: 100,
    step: isCancelled(jobId) ? "İptal edildi" : "Tamamlandı",
    queue: await queueCount()
  });

  safeLog("Bilgi", `Job bitti: market (${p})`);
  JOBS.delete(jobId);
}

// ──────────────────────────────────────────────────────────────
// Bölüm: Tarama Sonucu İşleme + Dedup + Webhook Senkron
// ──────────────────────────────────────────────────────────────
async function handleCrawlResult(msg, sender) {
  const mode = String(msg.mode || "unknown");
  const rows = Array.isArray(msg.rows) ? msg.rows : [];
  const meta = msg.meta || {};
  const errors = Array.isArray(msg.errors) ? msg.errors : [];

  if (errors.length) {
    safeLog("Uyarı", `Tarama uyarıları (${mode}): ${errors.slice(0, 3).join(" | ")}`);
  }

  safeLog("Bilgi", `Tarama sonucu alındı (${mode}): ${rows.length} satır`);

  if (mode === "market_scan") {
    await appendPreviewRows(STORAGE_KEYS.previewMarket, rows, { mode, meta });
    return;
  }

  await appendPreviewRows(STORAGE_KEYS.previewOrders, rows, { mode, meta });

  // Sipariş modlarında webhook senkronu
  const payload = {
    action: "upsert_orders",
    sheetName: "01_SİPARİŞLER",
    primaryKey: "smmId",
    timestamp: Date.now(),
    rows
  };

  // Dedup: satır bazlı son gönderilen hal ile kıyas
  const filtered = await dedupeRows(rows);
  if (filtered.length === 0) {
    safeLog("Bilgi", "Gönderilecek yeni/değişen kayıt yok (dedup).");
    return;
  }

  payload.rows = filtered;
  await syncToWebhook(payload);
  await rememberSent(filtered);
}

async function dedupeRows(rows) {
  const map = (await getLocal(STORAGE_KEYS.lastSentMap)) || {};
  const out = [];

  for (const r of rows) {
    const id = String(r?.smmId ?? "");
    if (!id) continue;

    const snapshot = stableStringify(r);
    if (map[id] === snapshot) continue; // değişmemiş

    out.push(r);
  }
  return out;
}

async function rememberSent(rows) {
  const map = (await getLocal(STORAGE_KEYS.lastSentMap)) || {};
  for (const r of rows) {
    const id = String(r?.smmId ?? "");
    if (!id) continue;
    map[id] = stableStringify(r);
  }

  // VARSAYIM: sınırsız storage var; ama yine de kaba limit
  const keys = Object.keys(map);
  if (keys.length > 5000) {
    // en eskiyi bilmediğimiz için rastgele budama (basit)
    for (let i = 0; i < 500; i++) delete map[keys[i]];
  }

  await setLocal(STORAGE_KEYS.lastSentMap, map);
}


async function appendPreviewRows(key, rows, meta = {}) {
  const current = (await getLocal(key)) || { rows: [] };
  const existing = Array.isArray(current.rows) ? current.rows : [];
  const merged = existing.concat(Array.isArray(rows) ? rows : []);
  await setLocal(key, { rows: merged, updatedAt: Date.now(), meta });
}

async function clearUiPreviewState() {
  await setLocal(STORAGE_KEYS.previewOrders, { rows: [], clearedAt: Date.now() });
  await setLocal(STORAGE_KEYS.previewMarket, { rows: [], clearedAt: Date.now() });
  broadcastProgress({ jobName: 'ui', progress: 0, step: 'UI durumu temizlendi', queue: await queueCount() });
}

async function integrationDryRun() {
  const settings = (await getLocal(STORAGE_KEYS.settings)) || {};
  const webhook = String(settings.webhookUrl || '');
  const sheets = String(settings.sheetsId || '');
  const webhookOk = webhook.endsWith('/exec');
  const sheetsOk = sheets.length > 20;
  safeLog('Bilgi', `Dry-run entegrasyon testi: webhook=${webhookOk ? 'ok' : 'hata'}, sheets=${sheetsOk ? 'ok' : 'hata'}`);
  return { webhookOk, sheetsOk };
}

// ──────────────────────────────────────────────────────────────
// Bölüm: Webhook Gönderimi (Eksponansiyel geri bekleme + offline queue)
// ──────────────────────────────────────────────────────────────
async function syncToWebhook(payload) {
  const settings = (await getLocal(STORAGE_KEYS.settings)) || {};
  const url = String(settings.webhookUrl || LOCKED_DEFAULTS.webhookUrl);

  // /exec kontrolü (uyarı)
  if (!url.endsWith("/exec")) {
    safeLog("Hata", "Webhook URL /exec ile bitmiyor. Gönderim başarısız olabilir.");
  }

  // Offline ise direkt kuyruğa al
  // (Service worker’da navigator.onLine her zaman güvenilir olmayabilir; hata yakalayarak da kuyruğa alıyoruz.)
  try {
    await postWithBackoff(url, payload, 5);
    safeLog("Bilgi", "Webhook senkron tamamlandı.");
  } catch (e) {
    safeLog("Hata", `Webhook başarısız; offline kuyruğa alındı: ${formatErr(e)}`);
    await enqueueOffline(payload);
  }
}

async function postWithBackoff(url, payload, maxRetries) {
  let attempt = 0;
  let delay = 1000;

  while (attempt < maxRetries) {
    attempt += 1;

    try {
      safeLog("Bilgi", `Webhook deneme ${attempt}/${maxRetries}`);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await safeReadText(res);
        throw new Error(`HTTP ${res.status} • ${text?.slice(0, 180) || "yanıt yok"}`);
      }

      return true;
    } catch (e) {
      if (attempt >= maxRetries) throw e;
      await sleep(delay);
      delay *= 2;
    }
  }

  return false;
}

async function enqueueOffline(payload) {
  const q = (await getLocal(STORAGE_KEYS.offlineQueue)) || [];
  q.push({
    id: `q_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    createdAt: Date.now(),
    payload
  });
  await setLocal(STORAGE_KEYS.offlineQueue, q);
  broadcastProgress({ jobName: "Kuyruk", progress: 0, step: "Offline kuyruk güncellendi", queue: q.length });
}

async function flushOfflineQueue(jobId) {
  const mode = "sync_queue";
  safeLog("Bilgi", "Offline kuyruk gönderimi başladı.");

  let q = (await getLocal(STORAGE_KEYS.offlineQueue)) || [];
  const total = q.length;

  if (total === 0) {
    broadcastProgress({ jobName: mode, progress: 100, step: "Kuyruk boş", queue: 0 });
    safeLog("Bilgi", "Offline kuyruk boş.");
    JOBS.delete(jobId);
    return;
  }

  broadcastProgress({ jobName: mode, progress: 0, step: "Gönderim başlatıldı", queue: total });

  const settings = (await getLocal(STORAGE_KEYS.settings)) || {};
  const url = String(settings.webhookUrl || LOCKED_DEFAULTS.webhookUrl);

  const remaining = [];
  for (let i = 0; i < q.length; i++) {
    if (isCancelled(jobId)) break;

    const item = q[i];
    const pct = Math.round((i / total) * 100);

    broadcastProgress({
      jobName: mode,
      progress: pct,
      step: `Kuyruk öğesi gönderiliyor (${i + 1}/${total})`,
      queue: total - i
    });

    try {
      await postWithBackoff(url, item.payload, 5);
      safeLog("Bilgi", `Kuyruk öğesi gönderildi: ${item.id}`);
    } catch (e) {
      safeLog("Hata", `Kuyruk öğesi gönderilemedi: ${item.id} • ${formatErr(e)}`);
      remaining.push(item);
    }
  }

  await setLocal(STORAGE_KEYS.offlineQueue, remaining);

  broadcastProgress({
    jobName: mode,
    progress: 100,
    step: isCancelled(jobId) ? "İptal edildi" : "Tamamlandı",
    queue: remaining.length
  });

  safeLog("Bilgi", `Offline kuyruk bitti. Kalan: ${remaining.length}`);
  JOBS.delete(jobId);
}

// ──────────────────────────────────────────────────────────────
// Bölüm: Kurallar (3 onay -> mandatory) + Manual Override
// ──────────────────────────────────────────────────────────────
async function handleRuleApproval(msg) {
  const instruction = (await getLocal(STORAGE_KEYS.instruction)) || {
    learning_queue: [],
    mandatory: [],
    overrides: []
  };

  const rule = msg.rule || null;

  // VARSAYIM: rule nesnesi şu alanları taşır:
  // { id, field, pattern, source, match_count }
  if (!rule?.id) {
    throw new Error("Kural nesnesi eksik (id yok).");
  }

  const isOverride = Boolean(msg.manualOverride);
  const isApproved = Boolean(msg.approved);

  if (isOverride) {
    // Manual override: anında zorunlu kural
    instruction.overrides.push({
      ...rule,
      appliedAt: Date.now(),
      priority: "highest"
    });

    instruction.mandatory.push({
      ...rule,
      appliedAt: Date.now(),
      match_count: 999,
      priority: "highest"
    });

    // learning_queue’dan sil
    instruction.learning_queue = instruction.learning_queue.filter((x) => x.id !== rule.id);

    await setLocal(STORAGE_KEYS.instruction, instruction);
    safeLog("Bilgi", `Manual override eklendi: ${rule.field || rule.id}`);
    return;
  }

  if (!isApproved) {
    // Reddet: learning_queue’dan çıkar
    instruction.learning_queue = instruction.learning_queue.filter((x) => x.id !== rule.id);
    await setLocal(STORAGE_KEYS.instruction, instruction);
    safeLog("Bilgi", `Kural reddedildi: ${rule.field || rule.id}`);
    return;
  }

  // Onaylandı: match_count artır
  const idx = instruction.learning_queue.findIndex((x) => x.id === rule.id);
  if (idx >= 0) {
    instruction.learning_queue[idx].match_count = Number(instruction.learning_queue[idx].match_count || 0) + 1;

    const c = instruction.learning_queue[idx].match_count;
    safeLog("Bilgi", `Kural onayı: ${rule.field || rule.id} (${c}/3)`);

    if (c >= 3) {
      // mandatory’e taşı
      const toMove = instruction.learning_queue[idx];
      instruction.learning_queue.splice(idx, 1);
      instruction.mandatory.push({ ...toMove, appliedAt: Date.now(), priority: "normal" });
      safeLog("Bilgi", `Kural kalıcılaştı (mandatory): ${rule.field || rule.id}`);
    }
  } else {
    // learning_queue’da yoksa ekle ve 1 onayla başlat
    instruction.learning_queue.push({ ...rule, match_count: 1 });
    safeLog("Bilgi", `Kural öğrenme kuyruğuna alındı: ${rule.field || rule.id} (1/3)`);
  }

  await setLocal(STORAGE_KEYS.instruction, instruction);
}

// ──────────────────────────────────────────────────────────────
// Bölüm: Storage yardımcıları
// ──────────────────────────────────────────────────────────────
async function getLocal(key) {
  const obj = await chrome.storage.local.get(key);
  return obj[key];
}

async function setLocal(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

async function queueCount() {
  const q = (await getLocal(STORAGE_KEYS.offlineQueue)) || [];
  return q.length;
}

// ──────────────────────────────────────────────────────────────
// Bölüm: Küçük yardımcılar
// ──────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeReadText(res) {
  try { return await res.text(); } catch { return ""; }
}

function formatErr(e) {
  if (!e) return "Bilinmeyen hata";
  if (typeof e === "string") return e;
  const s = e.message || String(e);
  return s.length > 450 ? s.slice(0, 450) + "…" : s;
}

function stableStringify(obj) {
  // Basit “anahtar sıralı” stringify (dedup için)
  try {
    return JSON.stringify(sortKeysDeep(obj));
  } catch {
    return JSON.stringify(obj);
  }
}

function sortKeysDeep(x) {
  if (Array.isArray(x)) return x.map(sortKeysDeep);
  if (x && typeof x === "object") {
    const out = {};
    for (const k of Object.keys(x).sort()) out[k] = sortKeysDeep(x[k]);
    return out;
  }
  return x;
}