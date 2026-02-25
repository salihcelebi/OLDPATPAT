(() => {
  if (typeof window === 'undefined' || document.body?.dataset?.page !== 'sidepanel') return;

  const status = document.getElementById('smmStatus');
  document.getElementById('btnSmmStart')?.addEventListener('click', async () => {
    status.textContent = 'Durum: Tarama isteği gönderildi.';
    await chrome.runtime.sendMessage({ type: 'ui_start_scan_smm', options: { maxPages: 3 } });
  });

  document.getElementById('btnSmmStop')?.addEventListener('click', async () => {
    status.textContent = 'Durum: Durduruldu.';
    await chrome.runtime.sendMessage({ type: 'ui_stop' });
  });

  document.getElementById('btnSmmFullscreen')?.addEventListener('click', async () => {
    await chrome.tabs.create({ url: chrome.runtime.getURL('smm.html'), active: true });
  });
})();
