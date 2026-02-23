/* options.js
 *
 * Amaç:
 * - Ayarları Türkçe, anlaşılır şekilde görüntülemek ve kaydetmek
 * - Export/Import (JSON) ile yedekleme
 * - “Yan Paneli Aç” kısayolu
 *
 * Not:
 * - Kilitli alanlar (Sheets/Webhook) burada görüntülenir (disabled).
 * - Ayarlar chrome.storage.sync ve local üzerinde tutulur (mevcut mimariyle uyumlu).
 */

(() => {
  if (typeof document === 'undefined' || document.body?.dataset?.page !== 'options') return;
  'use strict';

  const KEYS = Object.freeze({
    settingsLocal: 'patpat_settings',
    instructionLocal: 'patpat_instruction',
    workspaceLocal: 'workspace_files',
    workspaceHistoryLocal: 'workspace_history',

    // kullanıcı tercihleri
    prefsSync: 'patpat_user_prefs',
    aiPrefsSync: 'patpat_ai_prefs',
    aiModelSync: 'puter_model_id'
  });

  const el = (id) => document.getElementById(id);

  const UI = {
    toastTimer: null,
    toast(msg) {
      const t = el('toast');
      t.textContent = msg;
      t.style.display = 'block';
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => (t.style.display = 'none'), 2600);
    },
    setStatus(msg) {
      el('statusLine').textContent = msg;
    },
    setSyncStatus(ok) {
      const dot = el('dotSync');
      const label = el('syncLabel');
      if (ok) {
        dot.className = 'dot good';
        label.textContent = 'Senkron: Hazır';
      } else {
        dot.className = 'dot';
        label.textContent = 'Senkron: Bilinmiyor';
      }
    }
  };

  async function boot() {
    UI.setStatus('Durum: Yükleniyor…');

    // sync erişimi var mı?
    UI.setSyncStatus(Boolean(chrome?.storage?.sync));

    await loadAll();

    el('btnSaveAll').addEventListener('click', () => safeTry('Kaydet', saveAll));
    el('btnOpenPanel').addEventListener('click', () => safeTry('Yan panel', openSidePanelFromOptions));
    el('btnExport').addEventListener('click', () => safeTry('Dışa aktar', exportJson));
    el('btnImport').addEventListener('click', () => safeTry('İçe aktar', importJson));
    el('btnReset').addEventListener('click', () => safeTry('Sıfırla', resetDefaults));

    UI.setStatus('Durum: Hazır');
  }

  function safeTry(label, fn) {
    try { return fn(); }
    catch (e) {
      UI.toast(`Hata: ${label}`);
      UI.setStatus(`Durum: Hata (${label})`);
    }
  }

  async function loadAll() {
    // Kilitli ayarlar local’den gelir
    const settings = (await getLocal(KEYS.settingsLocal)) || {};
    el('sheetsId').value = String(settings.sheetsId || '');
    el('webhookUrl').value = String(settings.webhookUrl || '');

    // Kullanıcı tercihleri sync
    const prefs = (await getSync(KEYS.prefsSync)) || {};
    el('writeMode').value = String(prefs.writeMode || 'apps_script');
    el('maxPages').value = String(Number(prefs.maxPages || 3));
    el('timeoutSec').value = String(Number(prefs.timeoutSec || 30));
    el('retryCount').value = String(Number(prefs.retryCount || 5));
    el('backoffEnabled').value = (prefs.backoffEnabled === false) ? 'off' : 'on';

    el('verboseDebug').value = (prefs.verboseDebug ? 'on' : 'off');
    el('safeMode').value = (prefs.safeMode ? 'on' : 'off');
    el('dryRun').value = (prefs.dryRun ? 'on' : 'off');

    // AI
    const aiPrefs = (await getSync(KEYS.aiPrefsSync)) || {};
    const aiModel = (await getSync(KEYS.aiModelSync)) || '';
    el('aiModel').value = String(aiModel || '');

    el('aiAutoSuggest').value = (aiPrefs.otomatikOneri ? 'on' : 'off');
    el('aiMaskPII').value = (aiPrefs.maskelemeAcik === false ? 'off' : 'on');
    el('aiInjectionGuard').value = (aiPrefs.injectionKoruma === false ? 'off' : 'on');
  }

  async function saveAll() {
    const prefs = {
      writeMode: el('writeMode').value,
      maxPages: clampNum(el('maxPages').value, 1, 50, 3),
      timeoutSec: clampNum(el('timeoutSec').value, 5, 120, 30),
      retryCount: clampNum(el('retryCount').value, 0, 10, 5),
      backoffEnabled: el('backoffEnabled').value === 'on',
      verboseDebug: el('verboseDebug').value === 'on',
      safeMode: el('safeMode').value === 'on',
      dryRun: el('dryRun').value === 'on',
      updatedAt: Date.now()
    };

    await setSync(KEYS.prefsSync, prefs);

    // AI
    const model = el('aiModel').value;
    if (model) await setSync(KEYS.aiModelSync, model);

    const aiPrefs = {
      otomatikOneri: el('aiAutoSuggest').value === 'on',
      maskelemeAcik: el('aiMaskPII').value !== 'off',
      injectionKoruma: el('aiInjectionGuard').value !== 'off',
      patchZorunlu: true,
      minimumIzin: true,
      updatedAt: Date.now()
    };
    await setSync(KEYS.aiPrefsSync, aiPrefs);

    UI.toast('Ayarlar kaydedildi.');
    UI.setStatus('Durum: Kaydedildi');
  }

  async function exportJson() {
    const settings = await getLocal(KEYS.settingsLocal);
    const instruction = await getLocal(KEYS.instructionLocal);
    const workspace = await getLocal(KEYS.workspaceLocal);
    const history = await getLocal(KEYS.workspaceHistoryLocal);

    const prefs = await getSync(KEYS.prefsSync);
    const aiPrefs = await getSync(KEYS.aiPrefsSync);
    const aiModel = await getSync(KEYS.aiModelSync);

    const notes = String(el('importNotes').value || '').trim();

    const payload = {
      meta: {
        type: 'patpat_backup',
        createdAt: new Date().toISOString(),
        notes
      },
      local: { settings, instruction, workspace, history },
      sync: { prefs, aiPrefs, aiModel }
    };

    downloadText(`patpat_yedek_${Date.now()}.json`, JSON.stringify(payload, null, 2), 'application/json');
    UI.toast('Yedek indirildi (JSON).');
  }

  async function importJson() {
    const file = await pickFile('.json');
    if (!file) return;

    const txt = await readFileAsText(file);
    let parsed;
    try { parsed = JSON.parse(txt); }
    catch {
      UI.toast('JSON okunamadı. Dosya bozuk olabilir.');
      return;
    }

    const ok = confirm('İçe aktarma, mevcut verilerin üstüne yazabilir. Devam edilsin mi?');
    if (!ok) return;

    // En iyi çaba ile uygula
    if (parsed?.local?.settings) await setLocal(KEYS.settingsLocal, parsed.local.settings);
    if (parsed?.local?.instruction) await setLocal(KEYS.instructionLocal, parsed.local.instruction);
    if (parsed?.local?.workspace) await setLocal(KEYS.workspaceLocal, parsed.local.workspace);
    if (parsed?.local?.history) await setLocal(KEYS.workspaceHistoryLocal, parsed.local.history);

    if (parsed?.sync?.prefs) await setSync(KEYS.prefsSync, parsed.sync.prefs);
    if (parsed?.sync?.aiPrefs) await setSync(KEYS.aiPrefsSync, parsed.sync.aiPrefs);
    if (parsed?.sync?.aiModel) await setSync(KEYS.aiModelSync, parsed.sync.aiModel);

    UI.toast('İçe aktarma tamamlandı.');
    await loadAll();
  }

  async function resetDefaults() {
    const ok = confirm('Varsayılanlara dönmek istiyor musun?');
    if (!ok) return;

    // Kullanıcı tercihlerinde sıfırla; kilitli settings’e dokunmuyoruz
    await setSync(KEYS.prefsSync, {
      writeMode: 'apps_script',
      maxPages: 3,
      timeoutSec: 30,
      retryCount: 5,
      backoffEnabled: true,
      verboseDebug: false,
      safeMode: false,
      dryRun: false,
      updatedAt: Date.now()
    });

    await setSync(KEYS.aiPrefsSync, {
      otomatikOneri: false,
      maskelemeAcik: true,
      injectionKoruma: true,
      patchZorunlu: true,
      minimumIzin: true,
      updatedAt: Date.now()
    });

    UI.toast('Varsayılanlara dönüldü.');
    await loadAll();
  }

  async function openSidePanelFromOptions() {
    // VARSAYIM: side panel açma desteği tarayıcıda mevcut olabilir.
    // Destek yoksa kullanıcıya yönlendirme mesajı verilir.
    try {
      if (chrome?.sidePanel?.open) {
        const win = await chrome.windows.getCurrent();
        await chrome.sidePanel.open({ windowId: win.id });
        UI.toast('Yan panel açıldı.');
        return;
      }
    } catch {}

    UI.toast('Yan panel otomatik açılamadı. Eklenti ikonundan açabilirsin.');
  }

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Yardımcılar (dosya/dep.)
  // ─────────────────────────────────────────────────────────────
  function clampNum(v, min, max, def) {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.max(min, Math.min(max, Math.floor(n)));
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob([String(text || '')], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'dosya.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept || '*/*';
      input.onchange = () => resolve(input.files?.[0] || null);
      input.click();
    });
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(new Error('Dosya okunamadı.'));
      r.readAsText(file);
    });
  }

  async function getLocal(key) {
    if (chrome?.storage?.local) {
      const obj = await chrome.storage.local.get(key);
      return obj[key];
    }
    return JSON.parse(localStorage.getItem(key) || 'null');
  }

  async function setLocal(key, value) {
    if (chrome?.storage?.local) {
      await chrome.storage.local.set({ [key]: value });
      return true;
    }
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  }

  async function getSync(key) {
    if (chrome?.storage?.sync) {
      const obj = await chrome.storage.sync.get(key);
      return obj[key];
    }
    return JSON.parse(localStorage.getItem(key) || 'null');
  }

  async function setSync(key, value) {
    if (chrome?.storage?.sync) {
      await chrome.storage.sync.set({ [key]: value });
      return true;
    }
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  }

  boot();
})();