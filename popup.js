/* popup.js
 *
 * Amaç:
 * - Popup sadece “Yan Paneli Aç” launcher
 * - Ayarlar sayfasına hızlı geçiş
 *
 * VARSAYIM:
 * - chrome.sidePanel.open destekleniyorsa kullanır.
 * - Destek yoksa kullanıcıya açıklayıcı mesaj gösterir.
 */

(() => {
  'use strict';

  const el = (id) => document.getElementById(id);
  const msg = el('msg');

  el('btnOpenPanel').addEventListener('click', async () => {
    try {
      if (chrome?.sidePanel?.open) {
        const win = await chrome.windows.getCurrent();
        await chrome.sidePanel.open({ windowId: win.id });
        setMsg('Yan panel açıldı.');
        return;
      }
      setMsg('Yan panel otomatik açılamadı. Eklenti ikonundan açabilirsin.');
    } catch {
      setMsg('Yan panel açılamadı. Tarayıcı desteğini kontrol et.');
    }
  });

  el('btnOpenOptions').addEventListener('click', async () => {
    try {
      if (chrome?.runtime?.openOptionsPage) {
        await chrome.runtime.openOptionsPage();
        setMsg('Ayarlar açıldı.');
        return;
      }
      setMsg('Ayarlar açılamadı. Eklenti sayfasından açmayı dene.');
    } catch {
      setMsg('Ayarlar açılamadı.');
    }
  });

  function setMsg(t) {
    if (msg) msg.textContent = t;
  }
})();