(() => {
  async function runSelfTest() {
    const manifest = chrome.runtime.getManifest();
    const perms = manifest.permissions || [];
    return {
      version: manifest.version,
      permissions: perms,
      ok: perms.includes('storage')
    };
  }
  window.PatpatDiagnostics = { runSelfTest };
})();

window.addEventListener('DOMContentLoaded', () => window.PatpatPuter?.autoMount?.({ page: 'Diagnostics', rootSelector: '#diagnosticsRoot', enableImage: false }));
