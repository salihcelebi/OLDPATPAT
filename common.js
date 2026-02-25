(() => {
  const listeners = new Map();

  const common = {
    logger(level, message) {
      const line = `[${level}] ${message}`;
      console[level === 'Hata' ? 'error' : 'log'](line);
      window.dispatchEvent(new CustomEvent('patpat:log', { detail: line }));
    },
    debounce(fn, wait = 200) {
      let t;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
      };
    },
    dom: {
      q: (s, r = document) => r.querySelector(s),
      qa: (s, r = document) => Array.from(r.querySelectorAll(s)),
      ce: (t, c) => Object.assign(document.createElement(t), c || {})
    },
    on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(cb);
      return () => listeners.get(event)?.delete(cb);
    },
    emit(event, payload) {
      (listeners.get(event) || []).forEach((cb) => cb(payload));
    },
    postMessage(targetWindow, type, payload = {}) {
      targetWindow?.postMessage({ type, payload, source: 'patpat-sidepanel' }, '*');
    }
  };

  window.addEventListener('error', (e) => common.logger('Hata', e.message));
  window.addEventListener('unhandledrejection', (e) => common.logger('Hata', String(e.reason || 'Promise hatası')));
  window.PatpatCommon = common;
})();
