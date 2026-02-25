(() => {
  async function loadAyarlar() {
    const settings = await window.PatpatStorage.readSettings();
    return settings;
  }
  window.PatpatAyarlar = { loadAyarlar };
})();
