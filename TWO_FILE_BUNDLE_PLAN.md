## Hedef Mimari (2 Dosya)

- **`sw.js` kapsamı (yalnız MV3 service worker context):**
  - `background.js` içindeki queue/job/webhook/crawl orchestration
  - SW-safe ortak yardımcılar (`shared-core`): `safeTry`, `formatErr`, `postWithBackoff`, storage wrapper
  - `chrome.runtime.onMessage`, `chrome.alarms`, `chrome.storage`, `chrome.tabs` gibi API akışları
  - **YOK:** `window`, `document`, DOM, modal/render fonksiyonları
- **`bundle.js` kapsamı (tek fiziksel bundle):**
  - Sidepanel UI: `sidepanel.js`, `page-ops.js`, `page-support.js`, `page-tools.js`
  - Content: `content.js`, `content-crawler.js`
  - Options/Popup init kodları: `options.js`, `popup.js`
  - Ortak UI/AI: `ui-shared.js`, `ai-puter.js`
- **Entry-dispatch özeti:**
  - Aynı `bundle.js` farklı extension context’lerinde yüklenir.
  - Runtime guard ile doğru init çağrılır:
    - Sidepanel HTML’de `initSidepanel()`
    - Options HTML’de `initOptions()`
    - Popup HTML’de `initPopup()`
    - Content world’de `initContent()`

**Varsayım:** Hedef Chrome sürümü için content script tarafında ESM kısıtı/manifest karmaşıklığını azaltmak adına `bundle.js` IIFE formatında üretilecek.

## Modül Haritası → Import/Export Planı

- `background.js` → `src/sw/background-entry.js`
  - `import { safeTry, formatErr, postWithBackoff } from '../shared/shared-core.js'`
  - build çıktısı: `sw.js`
- `ui-shared.js` → `src/shared/ui-shared.js`
  - `export const Shared = {...}`
  - DOM/UI yardımcıları burada kalır
- `ai-puter.js` → `src/shared/ai-puter.js`
  - `export const AI = {...}`
  - `maskPII`, `sanitizeContextText`, `validatePatch`, fallback zinciri korunur
- `sidepanel.js` → `src/pages/sidepanel/sidepanel-core.js`
  - `export const UI = {...}`
  - `export function bootSidepanel(...)`
- `page-ops.js` → `src/pages/sidepanel/page-ops.js`
  - `export function initOps(UI, Shared)`
- `page-support.js` → `src/pages/sidepanel/page-support.js`
  - `export function initSupport(UI, Shared)`
- `page-tools.js` → `src/pages/sidepanel/page-tools.js`
  - `export function initTools(UI, Shared)`
- `content-crawler.js` → `src/content/content-crawler.js`
  - `export function crawlDom(...)`
- `content.js` → `src/content/content-entry.js`
  - `import { crawlDom } ...`
  - abort/cancel + selector highlight korunur
- `popup.js` → `src/pages/popup-entry.js`
- `options.js` → `src/pages/options-entry.js`

**Global temizliği:**
- `window.Patpat.Shared` ❌ → `import { Shared }`
- `window.Patpat.AI` ❌ → `import { AI }`
- `window.__PatpatUI` ❌ → sidepanel modül scope + init fonksiyon argümanları
- Gerekirse sadece boot guard için tek global flag: `globalThis.__PATPAT_SIDEPANEL_BOOTED` ✅

## Bundler Seçimi ve Minimal Konfigürasyon

### Rollup (önerilen)

```js
// rollup.config.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default [
  // 1) Service worker -> sw.js
  {
    input: path.resolve(__dirname, 'src/sw/background-entry.js'),
    output: {
      file: path.resolve(__dirname, 'sw.js'),
      format: 'iife',
      sourcemap: false,
      name: 'PatpatSW'
    },
    plugins: [nodeResolve(), commonjs()],
    treeshake: true
  },
  // 2) App contexts -> bundle.js
  {
    input: path.resolve(__dirname, 'src/entries/bundle-entry.js'),
    output: {
      file: path.resolve(__dirname, 'bundle.js'),
      format: 'iife',
      sourcemap: false,
      name: 'PatpatBundle',
      inlineDynamicImports: true
    },
    plugins: [nodeResolve(), commonjs()],
    treeshake: true
  }
];
```

### esbuild (alternatif)

```js
// build.mjs
import { build } from 'esbuild';

await build({
  entryPoints: ['src/sw/background-entry.js'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome114'],
  minify: false,
  sourcemap: false,
  outfile: 'sw.js'
});

await build({
  entryPoints: ['src/entries/bundle-entry.js'],
  bundle: true,
  splitting: false,
  format: 'iife',
  platform: 'browser',
  target: ['chrome114'],
  minify: false,
  sourcemap: false,
  outfile: 'bundle.js'
});
```

**Seçim:** Rollup. Sebep: çoklu konfig + çıktı stabilitesi, extension packaging’de deterministic output, `inlineDynamicImports` ile tek dosya hedefinin net kontrolü.

## Manifest ve HTML Değişiklikleri

```json
{
  "manifest_version": 3,
  "background": {
    "service_worker": "sw.js"
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["bundle.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html"
  },
  "options_ui": {
    "page": "options.html",
    "open_in_tab": true
  }
}
```

```html
<!-- sidepanel.html -->
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Patpat Sidepanel</title>
  </head>
  <body data-page="sidepanel">
    <!-- mevcut sidepanel DOM -->
    <script src="bundle.js"></script>
  </body>
</html>
```

**Not:** `popup.html` ve `options.html` de aynı şekilde yalnız `bundle.js` referansı kullanmalı (`data-page="popup"`, `data-page="options"`).

## Refactor Örnekleri

```js
// src/shared/ui-shared.js
export const Shared = {
  bindOnce(el, event, handler, key = '__bound') {
    if (!el) return;
    const k = `${key}_${event}`;
    if (el[k]) return;
    el.addEventListener(event, handler);
    el[k] = true;
  },
  formatErr(err) {
    return err?.message || String(err);
  },
  // ... storage, validate, modal, table, etc.
};

export default Shared;
```

```js
// src/shared/ai-puter.js
export const AI = {
  model: 'gpt-4.1-mini',
  setModel(next) {
    this.model = next || this.model;
  },
  maskPII(text = '') {
    return text.replace(/([\w.-]+@[\w.-]+\.[A-Za-z]{2,})/g, '[EMAIL]');
  },
  sanitizeContextText(text = '') {
    return text.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  },
  validatePatch(diffText = '') {
    return diffText.includes('@@') && !diffText.includes('/etc/passwd');
  },
  async run(payload, deps = {}) {
    try {
      if (deps?.puter?.ai?.chat) {
        return await deps.puter.ai.chat(payload, { model: this.model });
      }
      return { ok: true, mode: 'simulated', output: 'fallback-simulated' };
    } catch {
      return { ok: true, mode: 'simulated', output: 'fallback-simulated' };
    }
  }
};

export default AI;
```

```js
// src/entries/bundle-entry.js
import Shared from '../shared/ui-shared.js';
import AI from '../shared/ai-puter.js';
import { UI, bootSidepanel } from '../pages/sidepanel/sidepanel-core.js';
import { initOps } from '../pages/sidepanel/page-ops.js';
import { initSupport } from '../pages/sidepanel/page-support.js';
import { initTools } from '../pages/sidepanel/page-tools.js';
import { initContent } from '../content/content-entry.js';
import { initPopup } from '../pages/popup-entry.js';
import { initOptions } from '../pages/options-entry.js';

function isExtPage(page) {
  return document?.body?.dataset?.page === page;
}

(function dispatch() {
  // content world guard
  if (typeof chrome !== 'undefined' && chrome?.runtime?.id && !location.href.startsWith(`chrome-extension://${chrome.runtime.id}/`)) {
    initContent({ Shared, AI });
    return;
  }

  if (isExtPage('sidepanel')) {
    if (globalThis.__PATPAT_SIDEPANEL_BOOTED) return;
    globalThis.__PATPAT_SIDEPANEL_BOOTED = true;
    AI.setModel(UI.getModel?.() || AI.model);
    bootSidepanel({ Shared, AI, UI });
    initOps(UI, Shared);
    initSupport(UI, Shared);
    initTools(UI, Shared);
    return;
  }

  if (isExtPage('popup')) {
    initPopup({ Shared, AI });
    return;
  }

  if (isExtPage('options')) {
    initOptions({ Shared, AI });
  }
})();
```

```js
// src/content/content-entry.js
import { crawlDom } from './content-crawler.js';

let activeController = null;

export function initContent({ Shared }) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'PATPAT_SELECTOR_TEST') {
      // highlight/test logic
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === 'PATPAT_CRAWL_CANCEL') {
      activeController?.abort();
      sendResponse({ ok: true, cancelled: true });
      return;
    }

    if (msg?.type === 'PATPAT_CRAWL_START') {
      activeController = new AbortController();
      crawlDom({ ...msg.payload, signal: activeController.signal })
        .then((result) => sendResponse({ ok: true, result }))
        .catch((err) => sendResponse({ ok: false, error: Shared.formatErr(err) }));
      return true;
    }
  });
}
```

## Yedekleme ve Geçiş Planı

- **Yedek alma (önce):**
  - Seçenek A: `mkdir -p /backup/$(date +%Y%m%d_%H%M)` ve mevcut JS/HTML/manifest dosyalarını kopyala.
  - Seçenek B (önerilen): `git switch -c refactor/two-files` + “pre-refactor snapshot” commit.
- **Geçiş adımları:**
  1. `src/` altında SW, shared, content, pages klasörlerini oluştur.
  2. `ui-shared/ai-puter/sidepanel/page-*` dosyalarını export/import düzenine geçir.
  3. `shared-core` çıkarımı yap (SW-safe yardımcılar).
  4. `bundle-entry.js` içine dispatch ekle.
  5. Rollup build script ekle, `sw.js` + `bundle.js` üret.
  6. `manifest.json` + `sidepanel/popup/options` HTML script referanslarını tek bundle’a düşür.
  7. Eski dağınık script referanslarını kaldır; davranış regresyon testlerini çalıştır.

## Test Checklist

- [ ] Sidepanel açılıyor, sekmeler (`ops/support/tools`) doğru render ediliyor.
  - **Beklenen:** ilk açılışta tek boot, duplicate listener yok.
- [ ] Sipariş taraması dry-run başlatılabiliyor.
  - **Beklenen:** progress/log mesajları sidepanel’de akıyor.
- [ ] Market taraması önizleme tabloları basılıyor.
  - **Beklenen:** renderTable/modal fonksiyonları hatasız.
- [ ] Şikayet/Kurallar akışı `rule_approval` mesajlarını gönderiyor.
  - **Beklenen:** background yanıtları UI’da görünür.
- [ ] Workspace import/export çalışıyor (JSZip yoksa JSON fallback).
  - **Beklenen:** fallback sessiz kırılma yapmadan devreye girer.
- [ ] Content selector test/highlight + cancel çalışıyor.
  - **Beklenen:** `PATPAT_CRAWL_CANCEL` abort ediyor, dangling job yok.
- [ ] Webhook/queue background akışı stabil.
  - **Beklenen:** `sw.js` içinde DOM referans hatası yok, retry/backoff düzgün.
