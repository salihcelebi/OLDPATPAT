<<<<<<< Updated upstream
/* ui-shared.js
 *
 * Amaç:
 * - Ortak yardımcılar: toast, modal, tablo, doğrulama, hata kartı
 * - Depolama ve background mesajlaşması için güvenli sarmallar
 * - Türkçe metin standardı (kullanıcı mesajları)
 *
 * Not:
 * - Bu dosya, window.Patpat.Shared altında yardımcıları yayınlar.
 * - sidepanel.js varlığını zorunlu kılmaz; varsa ondan faydalanır.
 */

(() => {
  'use strict';

  const root = (typeof window !== 'undefined') ? window : globalThis;
  root.Patpat = root.Patpat || {};

  const Shared = {};

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Güvenli çalıştırma
  // ─────────────────────────────────────────────────────────────
  Shared.safeTry = function safeTry(label, fn, onError) {
    try { return fn(); }
    catch (err) {
      try { Shared.log('Hata', `${label}: ${Shared.formatErr(err)}`); } catch {}
      if (typeof onError === 'function') onError(err);
      return undefined;
    }
  };

  Shared.formatErr = function formatErr(err) {
    if (!err) return 'Bilinmeyen hata';
    if (typeof err === 'string') return err;
    const s = err.message || String(err);
    return s.length > 600 ? s.slice(0, 600) + '…' : s;
  };

  // ─────────────────────────────────────────────────────────────
  // Bölüm: UI erişimi (varsa sidepanel.js UI objesi)
  // ─────────────────────────────────────────────────────────────
  Shared.getUI = function getUI() {
    return root.__PatpatUI?.UI || null;
  };

  Shared.log = function log(level, message) {
    const UI = Shared.getUI();
    if (UI?.log) return UI.log(level, message);
    // UI yoksa console'a düş
    const p = `[${level}] ${message}`;
    // eslint-disable-next-line no-console
    console.log(p);
  };

  Shared.toast = function toast(message) {
    const UI = Shared.getUI();
    if (UI?.toast) return UI.toast(message);
    // UI yoksa basit fallback
    alert(message);
  };

  Shared.setLocalProgress = function setLocalProgress(jobName, step, pct, queue) {
    const UI = Shared.getUI();
    if (UI?.setProgress) {
      UI.setProgress({ jobName, step, progress: pct, queue });
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Bekleme (UI hazır olana kadar)
  // ─────────────────────────────────────────────────────────────
  Shared.waitFor = function waitFor(predicate, opts = {}) {
    const timeoutMs = Number(opts.timeoutMs || 15000);
    const intervalMs = Number(opts.intervalMs || 80);

    return new Promise((resolve, reject) => {
      const started = Date.now();
      const t = setInterval(() => {
        const ok = Shared.safeTry('waitFor', () => Boolean(predicate()));
        if (ok) {
          clearInterval(t);
          resolve(true);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          clearInterval(t);
          reject(new Error('Zaman aşımı: Arayüz hazır değil.'));
        }
      }, intervalMs);
    });
  };

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Chrome depolama sarmalları
  // ─────────────────────────────────────────────────────────────
  Shared.getLocal = async function getLocal(key) {
    if (root.chrome?.storage?.local) {
      const obj = await root.chrome.storage.local.get(key);
      return obj[key];
    }
    // fallback
    return JSON.parse(localStorage.getItem(key) || 'null');
  };

  Shared.setLocal = async function setLocal(key, value) {
    if (root.chrome?.storage?.local) {
      await root.chrome.storage.local.set({ [key]: value });
      return true;
    }
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  };

  Shared.getSync = async function getSync(key) {
    if (root.chrome?.storage?.sync) {
      const obj = await root.chrome.storage.sync.get(key);
      return obj[key];
    }
    return JSON.parse(localStorage.getItem(key) || 'null');
  };

  Shared.setSync = async function setSync(key, value) {
    if (root.chrome?.storage?.sync) {
      await root.chrome.storage.sync.set({ [key]: value });
      return true;
    }
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  };

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Background mesajlaşması
  // ─────────────────────────────────────────────────────────────
  Shared.sendToBackground = async function sendToBackground(type, payload = {}) {
    if (!root.chrome?.runtime?.sendMessage) {
      throw new Error('Chrome mesajlaşması kullanılamıyor.');
    }
    return await root.chrome.runtime.sendMessage({ type, ...payload });
  };

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Modal (basit, Türkçe başlıklarla)
  // ─────────────────────────────────────────────────────────────
  const MODAL_ID = '__patpat_modal__';

  function ensureModal() {
    let wrap = document.getElementById(MODAL_ID);
    if (wrap) return wrap;

    wrap = document.createElement('div');
    wrap.id = MODAL_ID;
    wrap.style.position = 'fixed';
    wrap.style.inset = '0';
    wrap.style.background = 'rgba(0,0,0,.55)';
    wrap.style.display = 'none';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'center';
    wrap.style.zIndex = '2147483646';
    wrap.style.padding = '14px';

    const box = document.createElement('div');
    box.style.width = 'min(920px, 100%)';
    box.style.maxHeight = 'min(86vh, 900px)';
    box.style.overflow = 'auto';
    box.style.background = 'rgba(15,22,48,.96)';
    box.style.border = '1px solid rgba(255,255,255,.14)';
    box.style.borderRadius = '18px';
    box.style.boxShadow = '0 8px 24px rgba(0,0,0,.35)';
    box.style.padding = '12px';

    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:10px;margin-bottom:10px;">
        <b id="__patpat_modal_title__" style="font-size:13px;">Pencere</b>
        <button id="__patpat_modal_close__" style="height:36px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(18,28,58,.45);color:#e7ecff;padding:0 12px;cursor:pointer;">
          Kapat
        </button>
      </div>
      <div id="__patpat_modal_body__" style="font-size:12px;line-height:1.45;color:rgba(231,236,255,.90);"></div>
    `;

    wrap.appendChild(box);
    document.documentElement.appendChild(wrap);

    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) Shared.closeModal();
    });

    const closeBtn = wrap.querySelector('#__patpat_modal_close__');
    closeBtn?.addEventListener('click', () => Shared.closeModal());

    return wrap;
  }

  Shared.openModal = function openModal(title, html) {
    const wrap = ensureModal();
    const t = wrap.querySelector('#__patpat_modal_title__');
    const b = wrap.querySelector('#__patpat_modal_body__');
    if (t) t.textContent = title || 'Pencere';
    if (b) b.innerHTML = html || '';
    wrap.style.display = 'flex';
  };

  Shared.closeModal = function closeModal() {
    const wrap = document.getElementById(MODAL_ID);
    if (wrap) wrap.style.display = 'none';
  };

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Tablo render (basit, hızlı)
  // ─────────────────────────────────────────────────────────────
  Shared.renderTable = function renderTable(container, columns, rows, opts = {}) {
    if (!container) return;
    const emptyText = String(opts.emptyText || 'Henüz veri yok.');

    if (!Array.isArray(rows) || rows.length === 0) {
      container.innerHTML = `<div style="border:1px dashed rgba(255,255,255,.18);border-radius:16px;padding:12px;color:rgba(169,180,230,.75);background:rgba(255,255,255,.03);font-size:12px;">${escapeHtml(emptyText)}</div>`;
      return;
    }

    const head = columns.map(c => `<th style="text-align:left;padding:10px;border-bottom:1px solid rgba(255,255,255,.10);font-size:12px;color:rgba(231,236,255,.92);">${escapeHtml(c.label)}</th>`).join('');
    const body = rows.map(r => {
      const tds = columns.map(c => `<td style="padding:10px;border-bottom:1px solid rgba(255,255,255,.06);font-size:12px;color:rgba(231,236,255,.88);vertical-align:top;">${escapeHtml(String(r?.[c.key] ?? ''))}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');

    container.innerHTML = `
      <div style="border:1px solid rgba(255,255,255,.10);border-radius:16px;overflow:hidden;background:rgba(0,0,0,.12);">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  };

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Doğrulamalar (minimum izin, webhook, sheets)
  // ─────────────────────────────────────────────────────────────
  Shared.validateWebhookExec = function validateWebhookExec(url) {
    const u = String(url || '').trim();
    if (!u) return { ok: false, message: 'Webhook adresi boş olamaz.' };
    if (!u.startsWith('https://script.google.com/')) return { ok: false, message: 'Webhook adresi script.google.com ile başlamalı.' };
    if (!u.endsWith('/exec')) return { ok: false, message: 'Webhook adresi /exec ile bitmelidir.' };
    return { ok: true, message: 'Webhook adresi geçerli görünüyor.' };
  };

  Shared.validateSheetsId = function validateSheetsId(id) {
    const s = String(id || '').trim();
    if (!s) return { ok: false, message: 'Sheets kimliği boş olamaz.' };
    if (s.length < 20) return { ok: false, message: 'Sheets kimliği çok kısa görünüyor.' };
    return { ok: true, message: 'Sheets kimliği geçerli görünüyor.' };
  };

  Shared.validateManifestMinimum = function validateManifestMinimum(manifestObj) {
    const warnings = [];
    if (!manifestObj || typeof manifestObj !== 'object') {
      return { ok: false, warnings: ['manifest.json okunamadı.'] };
    }

    const allowedHosts = [
      'https://hesap.com.tr/*',
      'https://anabayiniz.com/*',
      'https://script.google.com/*'
    ];
    const hosts = Array.isArray(manifestObj.host_permissions) ? manifestObj.host_permissions : [];
    for (const h of hosts) {
      if (!allowedHosts.includes(h)) warnings.push(`Gereksiz host izni görünüyor: ${h}`);
    }

    const allowedPerms = [
      'storage',
      'unlimitedStorage',
      'sidePanel',
      'tabs',
      'scripting',
      // opsiyonel: ileride gerekirse
      'notifications',
      'alarms',
      'downloads'
    ];
    const perms = Array.isArray(manifestObj.permissions) ? manifestObj.permissions : [];
    for (const p of perms) {
      if (!allowedPerms.includes(p)) warnings.push(`Gereksiz izin görünüyor: ${p}`);
    }

    const mv3 = manifestObj.manifest_version === 3;
    if (!mv3) warnings.push('manifest_version 3 olmalıdır.');

    return { ok: warnings.length === 0, warnings };
  };

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Dosya indirme (rapor/export için)
  // ─────────────────────────────────────────────────────────────
  Shared.downloadText = function downloadText(filename, text, mime = 'application/json') {
    const blob = new Blob([String(text || '')], { type: mime });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'dosya.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  Shared.readFileAsText = function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(new Error('Dosya okunamadı.'));
      r.readAsText(file);
    });
  };

  Shared.readFileAsArrayBuffer = function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('Dosya okunamadı.'));
      r.readAsArrayBuffer(file);
    });
  };

  function escapeHtml(s) {
    const str = String(s ?? '');
    return str.replace(/[&<>"']/g, (c) => {
      switch (c) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return c;
      }
    });
  }

  root.Patpat.Shared = Shared;
=======
/* ui-shared.js
 *
 * Amaç:
 * - Ortak yardımcılar: toast, modal, tablo, doğrulama, hata kartı
 * - Depolama ve background mesajlaşması için güvenli sarmallar
 * - Türkçe metin standardı (kullanıcı mesajları)
 *
 * Not:
 * - Bu dosya, window.Patpat.Shared altında yardımcıları yayınlar.
 * - sidepanel.js varlığını zorunlu kılmaz; varsa ondan faydalanır.
 */

(() => {
  'use strict';

  const root = (typeof window !== 'undefined') ? window : globalThis;
  root.Patpat = root.Patpat || {};

  const Shared = {};

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Güvenli çalıştırma
  // ─────────────────────────────────────────────────────────────
  Shared.safeTry = function safeTry(label, fn, onError) {
    try { return fn(); }
    catch (err) {
      try { Shared.log('Hata', `${label}: ${Shared.formatErr(err)}`); } catch {}
      if (typeof onError === 'function') onError(err);
      return undefined;
    }
  };

  Shared.formatErr = function formatErr(err) {
    if (!err) return 'Bilinmeyen hata';
    if (typeof err === 'string') return err;
    const s = err.message || String(err);
    return s.length > 600 ? s.slice(0, 600) + '…' : s;
  };

  // ─────────────────────────────────────────────────────────────
  // Bölüm: UI erişimi (varsa sidepanel.js UI objesi)
  // ─────────────────────────────────────────────────────────────
  Shared.getUI = function getUI() {
    return root.__PatpatUI?.UI || null;
  };

  Shared.log = function log(level, message) {
    const UI = Shared.getUI();
    if (UI?.log) return UI.log(level, message);
    // UI yoksa console'a düş
    const p = `[${level}] ${message}`;
    // eslint-disable-next-line no-console
    console.log(p);
  };

  Shared.toast = function toast(message) {
    const UI = Shared.getUI();
    if (UI?.toast) return UI.toast(message);
    // UI yoksa basit fallback
    alert(message);
  };

  Shared.setLocalProgress = function setLocalProgress(jobName, step, pct, queue) {
    const UI = Shared.getUI();
    if (UI?.setProgress) {
      UI.setProgress({ jobName, step, progress: pct, queue });
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Bekleme (UI hazır olana kadar)
  // ─────────────────────────────────────────────────────────────
  Shared.waitFor = function waitFor(predicate, opts = {}) {
    const timeoutMs = Number(opts.timeoutMs || 15000);
    const intervalMs = Number(opts.intervalMs || 80);

    return new Promise((resolve, reject) => {
      const started = Date.now();
      const t = setInterval(() => {
        const ok = Shared.safeTry('waitFor', () => Boolean(predicate()));
        if (ok) {
          clearInterval(t);
          resolve(true);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          clearInterval(t);
          reject(new Error('Zaman aşımı: Arayüz hazır değil.'));
        }
      }, intervalMs);
    });
  };

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Chrome depolama sarmalları
  // ─────────────────────────────────────────────────────────────
  Shared.getLocal = async function getLocal(key) {
    if (root.chrome?.storage?.local) {
      const obj = await root.chrome.storage.local.get(key);
      return obj[key];
    }
    // fallback
    return JSON.parse(localStorage.getItem(key) || 'null');
  };

  Shared.setLocal = async function setLocal(key, value) {
    if (root.chrome?.storage?.local) {
      await root.chrome.storage.local.set({ [key]: value });
      return true;
    }
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  };

  Shared.getSync = async function getSync(key) {
    if (root.chrome?.storage?.sync) {
      const obj = await root.chrome.storage.sync.get(key);
      return obj[key];
    }
    return JSON.parse(localStorage.getItem(key) || 'null');
  };

  Shared.setSync = async function setSync(key, value) {
    if (root.chrome?.storage?.sync) {
      await root.chrome.storage.sync.set({ [key]: value });
      return true;
    }
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  };

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Background mesajlaşması
  // ─────────────────────────────────────────────────────────────
  Shared.sendToBackground = async function sendToBackground(type, payload = {}) {
    if (!root.chrome?.runtime?.sendMessage) {
      throw new Error('Chrome mesajlaşması kullanılamıyor.');
    }
    return await root.chrome.runtime.sendMessage({ type, ...payload });
  };

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Modal (basit, Türkçe başlıklarla)
  // ─────────────────────────────────────────────────────────────
  const MODAL_ID = '__patpat_modal__';

  function ensureModal() {
    let wrap = document.getElementById(MODAL_ID);
    if (wrap) return wrap;

    wrap = document.createElement('div');
    wrap.id = MODAL_ID;
    wrap.style.position = 'fixed';
    wrap.style.inset = '0';
    wrap.style.background = 'rgba(0,0,0,.55)';
    wrap.style.display = 'none';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'center';
    wrap.style.zIndex = '2147483646';
    wrap.style.padding = '14px';

    const box = document.createElement('div');
    box.style.width = 'min(920px, 100%)';
    box.style.maxHeight = 'min(86vh, 900px)';
    box.style.overflow = 'auto';
    box.style.background = 'rgba(15,22,48,.96)';
    box.style.border = '1px solid rgba(255,255,255,.14)';
    box.style.borderRadius = '18px';
    box.style.boxShadow = '0 8px 24px rgba(0,0,0,.35)';
    box.style.padding = '12px';

    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:10px;margin-bottom:10px;">
        <b id="__patpat_modal_title__" style="font-size:13px;">Pencere</b>
        <button id="__patpat_modal_close__" style="height:36px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(18,28,58,.45);color:#e7ecff;padding:0 12px;cursor:pointer;">
          Kapat
        </button>
      </div>
      <div id="__patpat_modal_body__" style="font-size:12px;line-height:1.45;color:rgba(231,236,255,.90);"></div>
    `;

    wrap.appendChild(box);
    document.documentElement.appendChild(wrap);

    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) Shared.closeModal();
    });

    const closeBtn = wrap.querySelector('#__patpat_modal_close__');
    closeBtn?.addEventListener('click', () => Shared.closeModal());

    return wrap;
  }

  Shared.openModal = function openModal(title, html) {
    const wrap = ensureModal();
    const t = wrap.querySelector('#__patpat_modal_title__');
    const b = wrap.querySelector('#__patpat_modal_body__');
    if (t) t.textContent = title || 'Pencere';
    if (b) b.innerHTML = html || '';
    wrap.style.display = 'flex';
  };

  Shared.closeModal = function closeModal() {
    const wrap = document.getElementById(MODAL_ID);
    if (wrap) wrap.style.display = 'none';
  };

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Tablo render (basit, hızlı)
  // ─────────────────────────────────────────────────────────────
  Shared.renderTable = function renderTable(container, columns, rows, opts = {}) {
    if (!container) return;
    const emptyText = String(opts.emptyText || 'Henüz veri yok.');

    if (!Array.isArray(rows) || rows.length === 0) {
      container.innerHTML = `<div style="border:1px dashed rgba(255,255,255,.18);border-radius:16px;padding:12px;color:rgba(169,180,230,.75);background:rgba(255,255,255,.03);font-size:12px;">${escapeHtml(emptyText)}</div>`;
      return;
    }

    const head = columns.map(c => `<th style="text-align:left;padding:10px;border-bottom:1px solid rgba(255,255,255,.10);font-size:12px;color:rgba(231,236,255,.92);">${escapeHtml(c.label)}</th>`).join('');
    const body = rows.map(r => {
      const tds = columns.map(c => `<td style="padding:10px;border-bottom:1px solid rgba(255,255,255,.06);font-size:12px;color:rgba(231,236,255,.88);vertical-align:top;">${escapeHtml(String(r?.[c.key] ?? ''))}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');

    container.innerHTML = `
      <div style="border:1px solid rgba(255,255,255,.10);border-radius:16px;overflow:hidden;background:rgba(0,0,0,.12);">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  };

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Doğrulamalar (minimum izin, webhook, sheets)
  // ─────────────────────────────────────────────────────────────
  Shared.validateWebhookExec = function validateWebhookExec(url) {
    const u = String(url || '').trim();
    if (!u) return { ok: false, message: 'Webhook adresi boş olamaz.' };
    if (!u.startsWith('https://script.google.com/')) return { ok: false, message: 'Webhook adresi script.google.com ile başlamalı.' };
    if (!u.endsWith('/exec')) return { ok: false, message: 'Webhook adresi /exec ile bitmelidir.' };
    return { ok: true, message: 'Webhook adresi geçerli görünüyor.' };
  };

  Shared.validateSheetsId = function validateSheetsId(id) {
    const s = String(id || '').trim();
    if (!s) return { ok: false, message: 'Sheets kimliği boş olamaz.' };
    if (s.length < 20) return { ok: false, message: 'Sheets kimliği çok kısa görünüyor.' };
    return { ok: true, message: 'Sheets kimliği geçerli görünüyor.' };
  };

  Shared.validateManifestMinimum = function validateManifestMinimum(manifestObj) {
    const warnings = [];
    if (!manifestObj || typeof manifestObj !== 'object') {
      return { ok: false, warnings: ['manifest.json okunamadı.'] };
    }

    const allowedHosts = [
      'https://hesap.com.tr/*',
      'https://anabayiniz.com/*',
      'https://script.google.com/*'
    ];
    const hosts = Array.isArray(manifestObj.host_permissions) ? manifestObj.host_permissions : [];
    for (const h of hosts) {
      if (!allowedHosts.includes(h)) warnings.push(`Gereksiz host izni görünüyor: ${h}`);
    }

    const allowedPerms = [
      'storage',
      'unlimitedStorage',
      'sidePanel',
      'tabs',
      'scripting',
      // opsiyonel: ileride gerekirse
      'notifications',
      'alarms',
      'downloads'
    ];
    const perms = Array.isArray(manifestObj.permissions) ? manifestObj.permissions : [];
    for (const p of perms) {
      if (!allowedPerms.includes(p)) warnings.push(`Gereksiz izin görünüyor: ${p}`);
    }

    const mv3 = manifestObj.manifest_version === 3;
    if (!mv3) warnings.push('manifest_version 3 olmalıdır.');

    return { ok: warnings.length === 0, warnings };
  };

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Dosya indirme (rapor/export için)
  // ─────────────────────────────────────────────────────────────
  Shared.downloadText = function downloadText(filename, text, mime = 'application/json') {
    const blob = new Blob([String(text || '')], { type: mime });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'dosya.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  Shared.readFileAsText = function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(new Error('Dosya okunamadı.'));
      r.readAsText(file);
    });
  };

  Shared.readFileAsArrayBuffer = function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('Dosya okunamadı.'));
      r.readAsArrayBuffer(file);
    });
  };

  function escapeHtml(s) {
    const str = String(s ?? '');
    return str.replace(/[&<>"']/g, (c) => {
      switch (c) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return c;
      }
    });
  }

  root.Patpat.Shared = Shared;
>>>>>>> Stashed changes
})();