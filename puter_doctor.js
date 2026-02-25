(() => {
  if (window.PatpatPuterDoctor) return;
  const errors = [];
  const state = { report: null };

  function safeMsg(x) { return String(x?.message || x?.reason || x || '').slice(0, 400); }
  function capture(type, err) {
    const msg = safeMsg(err);
    errors.push({ type, msg, at: new Date().toISOString() });
    if (errors.length > 20) errors.shift();
  }

  window.addEventListener('error', (e) => capture('error', e.message || e.error));
  window.addEventListener('unhandledrejection', (e) => capture('unhandledrejection', e.reason));

  function hasScriptTag() {
    return !!document.querySelector('script[src="https://js.puter.com/v2/"]');
  }
  function resourceSeen() {
    try {
      return performance.getEntriesByType('resource').some((x) => String(x.name || '').includes('js.puter.com/v2/'));
    } catch { return false; }
  }
  function classify(base) {
    const txt = errors.map((e) => e.msg).join(' | ');
    if (!base.scriptTagPresent || !base.resourceSeenInPerformance || /ERR_BLOCKED_BY_CLIENT|Refused to load|CSP/i.test(txt)) {
      return { code: 'A', recommendation: 'SCRIPT YÜKLENMİYOR: adblock/CSP/network kontrol et.' };
    }
    if (base.scriptTagPresent && base.resourceSeenInPerformance && !base.puterPresent) {
      return { code: 'B', recommendation: 'CONTEXT izolasyonu: page context injection veya local bundle kullan.' };
    }
    if (base.puterPresent && !base.txt2imgPresent) {
      return { code: 'C', recommendation: 'window.puter var ama ai/txt2img yok: sürüm/API/auth kontrol et.' };
    }
    if (base.txt2imgPresent && base.healthcheckTxt2img === false) {
      return { code: 'D', recommendation: 'txt2img çağrısı hata veriyor: signature fallback ve yetki kontrol et.' };
    }
    return { code: 'OK', recommendation: 'Puter hazır.' };
  }

  function renderOverlay(report) {
    let box = document.getElementById('puterDoctorOverlay');
    if (!box) {
      box = document.createElement('pre');
      box.id = 'puterDoctorOverlay';
      box.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:999999;max-width:420px;max-height:220px;overflow:auto;background:rgba(10,18,30,.95);color:#bdf7d6;border:1px solid rgba(255,255,255,.22);padding:8px;border-radius:10px;font:11px/1.35 ui-monospace,monospace;';
      document.documentElement.appendChild(box);
    }
    box.textContent = `Puter Doctor\n${JSON.stringify(report, null, 2)}`;
  }

  async function runHealthcheck() {
    const base = {
      timestamp: new Date().toISOString(),
      environment: location.protocol === 'chrome-extension:' ? 'extension' : 'web',
      scriptTagPresent: hasScriptTag(),
      resourceSeenInPerformance: resourceSeen(),
      puterPresent: !!window.puter,
      aiPresent: !!window.puter?.ai,
      txt2imgPresent: typeof window.puter?.ai?.txt2img === 'function',
      healthcheckTxt2img: null,
      lastErrors: errors.slice(-8)
    };

    try {
      if (typeof window.puter?.ai?.txt2img === 'function') {
        await window.puter.ai.txt2img('a simple icon of a cat', true);
        base.healthcheckTxt2img = true;
      } else {
        base.healthcheckTxt2img = false;
      }
    } catch (e) {
      base.healthcheckTxt2img = false;
      capture('healthcheck', e);
      base.lastErrors = errors.slice(-8);
    }

    const c = classify(base);
    base.recommendation = `Sınıf ${c.code} — ${c.recommendation}`;
    state.report = base;
    renderOverlay(base);
    console.log('[PuterDoctor]', base);
    return base;
  }

  function note(source, payload) {
    capture(source, payload?.message || payload);
  }

  window.PatpatPuterDoctor = { runHealthcheck, note, getReport: () => state.report };

  window.addEventListener('load', () => setTimeout(() => runHealthcheck(), 900));
})();
