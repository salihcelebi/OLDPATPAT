(() => {
  const cache = new Map();
  const KEY = 'patpat_sidepanel_settings';

  async function readSettings() {
    if (cache.has(KEY)) return cache.get(KEY);
    const data = await chrome.storage.local.get(KEY);
    const val = data[KEY] || { defaultTab: 'smm', model: '', logLevel: 'Bilgi', masking: true, theme: 'dark' };
    cache.set(KEY, val);
    return val;
  }

  async function writeSettings(next) {
    cache.set(KEY, next);
    await chrome.storage.local.set({ [KEY]: next });
    return next;
  }

  window.PatpatStorage = { readSettings, writeSettings };
})();
