(async () => {
  const uiMount = document.getElementById('uiMount');
  const tabsMount = document.getElementById('tabsMount');
  const frame = document.getElementById('moduleFrame');
  const fsBtn = document.getElementById('btnFullscreen');

  async function loadPartial(file, mount) {
    const html = await fetch(chrome.runtime.getURL(file)).then((r) => r.text());
    mount.innerHTML = html;
  }

  await loadPartial('ui.html', uiMount);
  await loadPartial('tabs.html', tabsMount);

  const ui = window.PatpatUi.initUi();
  const tabs = window.PatpatTabs.initTabs({
    root: tabsMount,
    frame,
    onChange(tab) {
      window.PatpatCommon.logger('Bilgi', `Aktif sekme: ${tab}`);
      ui.setProgress(100);
      setTimeout(() => ui.setProgress(0), 250);
    }
  });

  const settings = await window.PatpatStorage.readSettings();
  tabs.setActive(settings.defaultTab || 'smm');

  fsBtn.addEventListener('click', async () => {
    const src = frame.getAttribute('src') || 'smm.html';
    await window.PatpatFullscreen.openFullscreen(chrome.runtime.getURL(src));
    window.PatpatCommon.postMessage(frame.contentWindow, 'patpat_fullscreen_opened', { src });
    ui.showToast('Modül yeni sekmede açıldı.');
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'progress') ui.setProgress(Number(msg.progress || 0));
  });
})();
