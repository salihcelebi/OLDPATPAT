(() => {
  const MODEL_OPTIONS = [
    'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-preview', 'o1-mini',
    'claude-3-5-sonnet', 'claude-3-5-haiku', 'gemini-1.5-pro', 'gemini-1.5-flash',
    'deepseek-v3', 'deepseek-r1', 'deepseek-coder'
  ];
  const PUTER_CDN = 'https://js.puter.com/v2/';
  const state = { model: 'gpt-4o', testMode: true };

  function doctorNote(source, payload) {
    try { window.PatpatPuterDoctor?.note?.(source, payload); } catch {}
  }

  async function loadStoredModel() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const data = await chrome.storage.local.get('patpat_puter_model');
        if (data.patpat_puter_model) state.model = data.patpat_puter_model;
        return;
      }
    } catch {}
    try { const v = localStorage.getItem('patpat_puter_model'); if (v) state.model = v; } catch {}
  }

  async function saveModel(model) {
    state.model = model || 'gpt-4o';
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({ patpat_puter_model: state.model });
        return;
      }
    } catch {}
    try { localStorage.setItem('patpat_puter_model', state.model); } catch {}
  }

  function injectPuterScriptIfNeeded() {
    let script = document.querySelector(`script[src="${PUTER_CDN}"]`);
    if (script) return script;
    script = document.createElement('script');
    script.src = PUTER_CDN;
    script.async = true;
    document.head.appendChild(script);
    doctorNote('inject_script', { message: 'Puter CDN script tag inject edildi.' });
    return script;
  }

  async function ensurePuterLoaded(timeoutMs = 15000) {
    if (window.puter?.ai) return window.puter;
    const script = injectPuterScriptIfNeeded();

    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; resolve(true); };
      script.addEventListener('load', finish, { once: true });
      script.addEventListener('error', () => { doctorNote('script_error', { message: 'Puter CDN script error' }); finish(); }, { once: true });
      setTimeout(finish, 1800);
    });

    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (window.puter?.ai) return window.puter;
      await new Promise((r) => setTimeout(r, 120));
    }

    doctorNote('ensure_failed', { message: 'Puter.js yüklenemedi. https://js.puter.com/v2/ scriptini doğrulayın.' });
    throw new Error('Puter.js yüklenemedi. https://js.puter.com/v2/ scriptini doğrulayın.');
  }

  async function chat(prompt, options = {}) {
    const puter = await ensurePuterLoaded();
    if (!puter?.ai?.chat) throw new Error('Puter.ai.chat bulunamadı.');
    const res = await puter.ai.chat(prompt, {
      model: options.model || state.model || 'gpt-4o',
      testMode: options.testMode ?? state.testMode,
      stream: false,
      tools: options.tools || []
    });
    return res?.message?.content || res?.content || String(res || '');
  }

  async function txt2img(prompt, options = {}) {
    const puter = await ensurePuterLoaded();
    if (!puter?.ai?.txt2img) throw new Error('Puter.js txt2img kullanılamıyor.');

    const requestedTestMode = options.testMode ?? state.testMode;
    const model = options.model || 'gpt-image-1.5';
    try {
      if (typeof requestedTestMode === 'boolean') {
        return await puter.ai.txt2img(prompt, requestedTestMode);
      }
    } catch (e) {
      doctorNote('txt2img_boolean_signature_failed', e);
    }

    try {
      return await puter.ai.txt2img(prompt, { model, testMode: requestedTestMode });
    } catch (e) {
      doctorNote('txt2img_object_signature_failed', e);
      throw e;
    }
  }

  function buildCard(page, enableImage = false) {
    const wrap = document.createElement('section');
    wrap.className = 'puter-card';
    wrap.innerHTML = `
      <h3>Puter AI • ${page}</h3>
      <div class="puter-row">
        <label>Model</label>
        <select class="puter-model"></select>
        <label><input class="puter-testmode" type="checkbox" ${state.testMode ? 'checked' : ''}/> testMode</label>
      </div>
      <textarea class="puter-prompt" placeholder="Puter AI için komut yazın..."></textarea>
      <div class="puter-row">
        <button class="puter-run" type="button">AI Yanıt Üret</button>
        ${enableImage ? '<button class="puter-image" type="button">Resim Oluştur</button>' : ''}
      </div>
      <pre class="puter-output">Hazır.</pre>
      ${enableImage ? '<div class="puter-image-wrap"></div>' : ''}
    `;

    const modelSel = wrap.querySelector('.puter-model');
    MODEL_OPTIONS.forEach((m) => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      if (m === state.model) opt.selected = true;
      modelSel.appendChild(opt);
    });

    modelSel.addEventListener('change', () => saveModel(modelSel.value));
    wrap.querySelector('.puter-testmode').addEventListener('change', (e) => { state.testMode = e.target.checked; });

    wrap.querySelector('.puter-run').addEventListener('click', async () => {
      const prompt = wrap.querySelector('.puter-prompt').value.trim();
      const out = wrap.querySelector('.puter-output');
      if (!prompt) { out.textContent = 'Lütfen bir prompt girin.'; return; }
      out.textContent = 'Yanıt bekleniyor...';
      try { out.textContent = await chat(prompt, { model: modelSel.value, testMode: state.testMode }); }
      catch (err) { out.textContent = `Hata: ${err.message || err}`; }
    });

    if (enableImage) {
      wrap.querySelector('.puter-image').addEventListener('click', async () => {
        const prompt = wrap.querySelector('.puter-prompt').value.trim();
        const out = wrap.querySelector('.puter-output');
        const host = wrap.querySelector('.puter-image-wrap');
        if (!prompt) { out.textContent = 'Önce görsel prompt girin.'; return; }
        out.textContent = 'Görsel üretiliyor...';
        host.innerHTML = '';
        try {
          const img = await txt2img(prompt, { testMode: state.testMode });
          img.className = 'puter-image-preview';
          host.appendChild(img);
          out.textContent = 'Görsel hazır.';
        } catch (err) {
          out.textContent = `Hata: ${err.message || err}`;
        }
      });
    }
    return wrap;
  }

  function autoMount({ page, rootSelector, enableImage = false }) {
    const root = document.querySelector(rootSelector);
    if (!root) return false;
    if (root.querySelector('.puter-card')) return true;
    root.appendChild(buildCard(page, enableImage));
    return true;
  }

  loadStoredModel();
  window.PatpatPuter = { autoMount, chat, txt2img, ensurePuterLoaded, getModel: () => state.model, setModel: saveModel, models: MODEL_OPTIONS };
})();
