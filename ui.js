(() => {
  function initUi() {
    const logBody = document.getElementById('consoleBody');
    const toast = document.getElementById('toast');
    const fill = document.getElementById('progressFill');

    const pushLog = (line) => {
      if (!logBody) return;
      logBody.textContent += `\n${line}`;
      logBody.scrollTop = logBody.scrollHeight;
    };

    window.addEventListener('patpat:log', (e) => pushLog(e.detail));

    document.getElementById('btnClear')?.addEventListener('click', () => {
      logBody.textContent = '[Bilgi] Log temizlendi.';
      fill.style.width = '0%';
      window.PatpatCommon.emit('ui:clear');
    });

    document.getElementById('btnStop')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'ui_stop' });
      window.PatpatCommon.emit('ui:stop');
      showToast('Tüm işlemler durduruldu.');
    });

    document.getElementById('btnHelp')?.addEventListener('click', () => {
      showToast('Sekmeye tıkla, modül açılır. Kırmızı butonla tam ekran gösterilir.');
      window.PatpatCommon.emit('ui:help');
    });

    function showToast(message) {
      if (!toast) return;
      toast.textContent = message;
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 2400);
    }

    return { showToast, pushLog, setProgress: (pct) => { fill.style.width = `${pct}%`; } };
  }

  window.PatpatUi = { initUi };
})();
