'use strict';

/**
 * Patpat Agent — Yan Panel Yönlendirme ve İskelet Denetimi
 * Bu dosya yalnızca:
 * 1) Sekme geçişleri (6 sekme),
 * 2) Global durum/progress/log yönetimi,
 * 3) Puter AI model seçimi (UI seviyesi) ve komut şablonları
 * işlerini yapar.
 *
 * Not: Puter AI çağrısını “gerçekten” yapmak için puter.js gerekir.
 * Bu sürümde çağrı güvenli bir şekilde “hazır” tutulur ve çökmez.
 */

(function () {
  // ───────────────────────────────────────────────────────────────
  // Bölüm 0: Güvenli Çalışma Yardımcıları (try/catch standardı)
  // ───────────────────────────────────────────────────────────────
  function safeTry(label, fn) {
    try { return fn(); }
    catch (err) {
      UI.log('Hata', `${label}: ${UI.formatErr(err)}`);
      UI.toast(`Hata: ${label}`);
      return undefined;
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Bölüm 1: Basit UI Yardımcısı (tek dosya, kolay iz sürme)
  // ───────────────────────────────────────────────────────────────
  const UI = {
    els: {},
    state: {
      activeTab: 'orders',
      online: 'bilinmiyor',
      site: '—',
      aiModel: '',
      jobName: '—',
      progress: 0,
      step: 'Beklemede',
      queue: 0,
      lastAiSuggestion: '',
      // Çalışma alanı (dosyalar sekmesi)
      workspace: {
        ready: false,
        activePath: '',
        useSelection: true,
        files: {},
        order: [],
        dirtyCount: 0,
        undo: {},
        redo: {}
      },
      logs: ['[Bilgi] Yan panel hazırlanıyor...']
    },

    init() {
      this.els = {
        subtitle: byId('subtitle'),
        dotOnline: byId('dot-online'),
        pillOnline: byId('pill-online'),
        pillSite: byId('pill-site'),
        dotAi: byId('dot-ai'),
        pillAi: byId('pill-ai'),

        globalSearch: byId('globalSearch'),
        btnStop: byId('btnStop'),

        progressLabel: byId('progressLabel'),
        jobLabel: byId('jobLabel'),
        progressFill: byId('progressFill'),
        stepText: byId('stepText'),
        queueText: byId('queueText'),

        tabTitle: byId('tabTitle'),
        tabDesc: byId('tabDesc'),
        btnHelp: byId('btnHelp'),

        consoleBody: byId('consoleBody'),
        btnCopyLogs: byId('btnCopyLogs'),
        btnClearLogs: byId('btnClearLogs'),

        modelSelect: byId('modelSelect'),
        modelHint: byId('modelHint'),

        cmdFix: byId('cmdFix'),
        cmdRefactor: byId('cmdRefactor'),
        cmdI18n: byId('cmdI18n'),
        cmdPerf: byId('cmdPerf'),
        cmdSecurity: byId('cmdSecurity'),
        cmdManifest: byId('cmdManifest'),
        cmdExplain: byId('cmdExplain'),

        aiPrompt: byId('aiPrompt'),
        btnAiAnalyze: byId('btnAiAnalyze'),
        btnAiPreviewPatch: byId('btnAiPreviewPatch'),
        btnAiApplyPatch: byId('btnAiApplyPatch'),
        btnAiCopy: byId('btnAiCopy'),
        aiResultHint: byId('aiResultHint'),

        btnUseSelection: byId('btnUseSelection'),
        btnUseWholeFile: byId('btnUseWholeFile'),
        aiContextInfo: byId('aiContextInfo'),

        patchModal: byId('patchModal'),
        patchBody: byId('patchBody'),
        btnClosePatch: byId('btnClosePatch'),

        // Çalışma alanı (dosyalar sekmesi)
        fileFilter: byId('fileFilter'),
        fileQuickFilter: byId('fileQuickFilter'),
        fileList: byId('fileList'),
        activeFileName: byId('activeFileName'),
        activeFileBadge: byId('activeFileBadge'),
        codeEditor: byId('codeEditor'),
        btnSaveFile: byId('btnSaveFile'),
        btnSaveAll: byId('btnSaveAll'),
        btnUndo: byId('btnUndo'),
        btnRedo: byId('btnRedo'),
        btnFind: byId('btnFind'),
        btnReplace: byId('btnReplace'),
        btnFormat: byId('btnFormat'),
        btnJsonValidate: byId('btnJsonValidate'),
        btnCopySelection: byId('btnCopySelection'),
        editorHint: byId('editorHint'),

        toast: byId('toast'),
      };

      // İlk render
      this.renderAll();
    },

    renderAll() {
      this.renderTop();
      this.renderProgress();
      this.renderTabs();
      this.renderAi();
      this.renderLogs();
    },

    renderTop() {
      this.els.subtitle.textContent = `Durum: Hazır • Son senkron: —`;
      this.setOnline(this.state.online);
      this.setSite(this.state.site);
      this.setAiPill(this.state.aiModel ? 'Açık' : 'Kapalı');
    },

    renderProgress() {
      const p = clamp(this.state.progress, 0, 100);
      this.els.progressLabel.textContent = `İlerleme: ${p}%`;
      this.els.jobLabel.textContent = `İş: ${this.state.jobName || '—'}`;
      this.els.progressFill.style.width = `${p}%`;
      this.els.stepText.textContent = `Adım: ${this.state.step || 'Beklemede'}`;
      this.els.queueText.textContent = `Kuyruk: ${this.state.queue || 0}`;
    },

    renderTabs() {
      // Sekme başlık + açıklama
      const info = TAB_MAP[this.state.activeTab] || TAB_MAP.orders;
      this.els.tabTitle.textContent = info.title;
      this.els.tabDesc.textContent = info.desc;

      // Üst sekmeler
      document.querySelectorAll('.tab').forEach((btn) => {
        const isActive = btn.dataset.tab === this.state.activeTab;
        btn.setAttribute('aria-selected', String(isActive));
      });

      // Panel içerikleri
      document.querySelectorAll('.tabpanel').forEach((panel) => {
        const shouldShow = panel.dataset.tabpanel === this.state.activeTab;
        panel.hidden = !shouldShow;
      });
    },

    renderAi() {
      // Model seçimi
      if (this.els.modelSelect.value !== this.state.aiModel) {
        this.els.modelSelect.value = this.state.aiModel || '';
      }

      const enabled = Boolean(this.state.aiModel);
      this.els.btnAiAnalyze.disabled = !enabled;
      this.els.btnAiCopy.disabled = !enabled;
      this.els.cmdFix.disabled = !enabled;
      this.els.cmdRefactor.disabled = !enabled;
      this.els.cmdI18n.disabled = !enabled;
      this.els.cmdPerf.disabled = !enabled;
      this.els.cmdSecurity.disabled = !enabled;
      this.els.cmdManifest.disabled = !enabled;
      this.els.cmdExplain.disabled = !enabled;

      this.els.modelHint.textContent = enabled
        ? `Seçili model: ${this.state.aiModel} • Bu modelle devam etmek istiyor musun?`
        : 'Model seçince AI butonları açılır.';

      // Dosyalar sekmesi: kod bağlamı butonları
      const filesTab = (this.state.activeTab === 'files');
      const hasActiveFile = Boolean(this.state.workspace.activePath);
      const allowContext = enabled && filesTab && hasActiveFile;

      this.els.btnUseSelection.disabled = !allowContext;
      this.els.btnUseWholeFile.disabled = !allowContext;

      this.els.aiContextInfo.textContent = hasActiveFile
        ? `Aktif dosya: ${this.state.workspace.activePath}`
        : 'Aktif dosya: —';

      // Patch önizleme / uygulama sadece “öneri var” ise aktif olur
      const hasSuggestion = Boolean((this.state.lastAiSuggestion || '').trim());
      const allowPatch = enabled && filesTab && hasActiveFile && hasSuggestion;

      this.els.btnAiPreviewPatch.disabled = !allowPatch;
      this.els.btnAiApplyPatch.disabled = !allowPatch;

      this.setAiPill(enabled ? 'Açık' : 'Kapalı');
    },

    renderLogs() {
      // En son 220 satırı tut (şişmeyi önlemek için)
      const max = 220;
      if (this.state.logs.length > max) this.state.logs = this.state.logs.slice(-max);

      this.els.consoleBody.textContent = this.state.logs.join('\n');
      // En alta kaydır
      this.els.consoleBody.scrollTop = this.els.consoleBody.scrollHeight;
    },

    log(level, message) {
      const ts = new Date().toLocaleTimeString('tr-TR', { hour12: false });
      const line = `[${level}] ${ts} • ${message}`;
      this.state.logs.push(line);
      this.renderLogs();
    },

    toast(message) {
      const el = this.els.toast;
      el.textContent = message;
      el.style.display = 'block';
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2600);
    },

    setOnline(mode) {
      // mode: 'online' | 'offline' | 'bilinmiyor'
      this.state.online = mode;

      if (mode === 'online') {
        this.els.dotOnline.className = 'dot good';
        this.els.pillOnline.textContent = 'Bağlantı: Online';
      } else if (mode === 'offline') {
        this.els.dotOnline.className = 'dot bad';
        this.els.pillOnline.textContent = 'Bağlantı: Offline';
      } else {
        this.els.dotOnline.className = 'dot';
        this.els.pillOnline.textContent = 'Bağlantı: Bilinmiyor';
      }
    },

    setSite(site) {
      this.state.site = site || '—';
      this.els.pillSite.textContent = `Site: ${this.state.site}`;
    },

    setAiPill(mode) {
      const enabled = (mode === 'Açık');
      this.els.pillAi.textContent = `Puter AI: ${mode}`;
      this.els.dotAi.className = enabled ? 'dot good' : 'dot';
    },

    setProgress({ jobName, progress, step, queue }) {
      if (typeof jobName === 'string') this.state.jobName = jobName;
      if (typeof progress === 'number') this.state.progress = progress;
      if (typeof step === 'string') this.state.step = step;
      if (typeof queue === 'number') this.state.queue = queue;
      this.renderProgress();
    },

    setActiveTab(tabId) {
      // Kaydetmeden çıkma uyarısı (dosyalar sekmesinden ayrılırken)
      const leavingFiles = (this.state.activeTab === 'files' && tabId !== 'files');
      if (leavingFiles && this.state.workspace.dirtyCount > 0) {
        const ok = confirm('Kaydedilmemiş değişikliklerin var. Çıkmak istiyor musun?');
        if (!ok) return;
      }

      this.state.activeTab = tabId;
      this.renderTabs();
      this.renderAi(); // sekme değişince AI bağlamı güncellenir
      Storage.setSync('ui_active_tab', tabId).catch(() => {});
    },

    setModel(modelId) {
      const isFirstSelection = !this.state.aiModel && Boolean(modelId);
      this.state.aiModel = modelId || '';
      this.renderAi();
      Storage.setSync('puter_model_id', this.state.aiModel).catch(() => {});
      if (isFirstSelection) this.toast(`Seçili model: ${this.state.aiModel}. Bu modelle devam etmek istiyor musun?`);
      this.log('Bilgi', this.state.aiModel ? `Model seçildi: ${this.state.aiModel}` : 'Model seçimi kaldırıldı.');
    },

    formatErr(err) {
      if (!err) return 'Bilinmeyen hata';
      if (typeof err === 'string') return err;
      const msg = err.message || String(err);
      return msg.length > 500 ? msg.slice(0, 500) + '…' : msg;
    }
  };

  // ───────────────────────────────────────────────────────────────
  // Bölüm 2: Sekme Metinleri (tamamı Türkçe)
  // ───────────────────────────────────────────────────────────────
  const TAB_MAP = {
    orders: {
      title: 'Sipariş Yönetimi',
      desc: 'Siparişleri tara, standartlaştır, kuyruğa al ve güvenli senkronla.'
    },
    market: {
      title: 'Rakip ve Pazar Analizi',
      desc: 'Rakipleri tara, fiyat dağılımını gör ve fırsatları çıkar.'
    },
    complaints: {
      title: 'Müşteri Şikayet Yönetimi',
      desc: 'Şikayetleri sınıflandır, SLA takip et ve yanıt taslakları üret.'
    },
    rules: {
      title: 'Kurallar ve Öğrenme Merkezi',
      desc: 'Öğrenme kuyruğunu yönet, test et ve kalıcı kuralları düzenle.'
    },
    reports: {
      title: 'Raporlar ve Otomasyon',
      desc: 'Metrikleri özetle, planlı çalıştırma ve otomasyon kuralları oluştur.'
    },
    files: {
      title: 'Chrome Eklenti Dosyaları',
      desc: 'Çalışma alanı olarak dosyaları içe aktar, düzenle ve dışa aktar.'
    }
  };

  // ───────────────────────────────────────────────────────────────
  // Bölüm 3: Depolama Yardımcısı (sync öncelikli, local fallback)
  // ───────────────────────────────────────────────────────────────
  const Storage = {
    async getSync(key) {
      // chrome.storage.sync varsa kullan, yoksa localStorage
      if (chrome?.storage?.sync) {
        const obj = await chrome.storage.sync.get(key);
        return obj[key];
      }
      return JSON.parse(localStorage.getItem(key) || 'null');
    },
    async setSync(key, value) {
      if (chrome?.storage?.sync) {
        await chrome.storage.sync.set({ [key]: value });
        return;
      }
      localStorage.setItem(key, JSON.stringify(value));
    }
  };

  // ───────────────────────────────────────────────────────────────
  // Bölüm 3.1: Çalışma Alanı (Dosyalar Sekmesi) — Basit Dosya Adaptörü
  // ───────────────────────────────────────────────────────────────
  const Workspace = {
    // Varsayılan dosya listesi (içe aktarma gelene kadar)
    DEFAULTS: [
      { path: 'manifest.json', content: '{\n  "manifest_version": 3\n}\n' },
      { path: 'background.js', content: '// background.js\n' },
      { path: 'content.js', content: '// content.js\n' },
      { path: 'content-crawler.js', content: '// content-crawler.js\n' },
      { path: 'sidepanel.html', content: '<!-- sidepanel.html -->\n' },
      { path: 'sidepanel.js', content: '// sidepanel.js\n' },
      { path: 'popup.html', content: '<!-- popup.html -->\n' },
      { path: 'popup.js', content: '// popup.js\n' },
      { path: 'options.html', content: '<!-- options.html -->\n' },
      { path: 'options.js', content: '// options.js\n' },
      { path: 'kod.gs', content: '// kod.gs\n' }
    ],

    async load() {
      // chrome.storage.local varsa kullan, yoksa localStorage
      const data = await this._getLocal('workspace_files');
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        UI.state.workspace.files = data.files || {};
        UI.state.workspace.order = data.order || Object.keys(UI.state.workspace.files);
        UI.state.workspace.ready = true;
      } else {
        // İlk kurulum: varsayılanları yükle
        const files = {};
        const order = [];
        for (const f of this.DEFAULTS) {
          files[f.path] = {
            path: f.path,
            content: f.content,
            dirty: false,
            lastSavedAt: Date.now()
          };
          order.push(f.path);
        }
        UI.state.workspace.files = files;
        UI.state.workspace.order = order;
        UI.state.workspace.ready = true;
        await this.saveAll(true); // silent
      }

      this._recountDirty();
      this.renderFileList();
    },

    renderFileList() {
      const wrap = UI.els.fileList;
      const q = (UI.els.fileFilter?.value || '').trim().toLowerCase();
      const quick = UI.els.fileQuickFilter?.value || 'all';
      const items = UI.state.workspace.order
        .filter((p) => !q || p.toLowerCase().includes(q))
        .map((p) => UI.state.workspace.files[p])
        .filter(Boolean)
        .filter((f) => {
          if (quick === 'dirty') return Boolean(f.dirty);
          if (quick === 'error') return Boolean(f.error);
          if (quick === 'suggestion') return Boolean(f.hasSuggestion);
          return true;
        });

      if (!UI.state.workspace.ready || items.length === 0) {
        wrap.innerHTML = '<div class="empty">Henüz çalışma alanı yok. “İçe Aktar (ZIP)” ile başlayabilirsin.</div>';
        return;
      }

      const active = UI.state.workspace.activePath;
      wrap.innerHTML = items.map((f) => {
        const badges = [];
        if (f.dirty) badges.push('<span class="badge dirty">Değişti</span>');
        if (f.error) badges.push('<span class="badge err">Hata</span>');
        if (f.hasSuggestion) badges.push('<span class="badge">Öneri var</span>');
        return `
          <div class="fileitem ${escapeHtml(active) === escapeHtml(f.path) ? 'active' : ''}" data-path="${escapeAttr(f.path)}">
            <span style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(f.path)}</span>
            <span style="display:flex; gap:6px; align-items:center;">${badges.join('')}</span>
          </div>
        `;
      }).join('');
    },

    open(path) {
      const f = UI.state.workspace.files[path];
      if (!f) return;

      UI.state.workspace.activePath = path;
      UI.els.activeFileName.textContent = `Aktif dosya: ${path}`;

      UI.els.activeFileBadge.hidden = true;
      if (f.dirty) {
        UI.els.activeFileBadge.hidden = false;
        UI.els.activeFileBadge.className = 'badge dirty';
        UI.els.activeFileBadge.textContent = 'Değişti';
      } else if (f.error) {
        UI.els.activeFileBadge.hidden = false;
        UI.els.activeFileBadge.className = 'badge err';
        UI.els.activeFileBadge.textContent = 'Hata';
      } else if (f.hasSuggestion) {
        UI.els.activeFileBadge.hidden = false;
        UI.els.activeFileBadge.className = 'badge';
        UI.els.activeFileBadge.textContent = 'Öneri var';
      }

      UI.els.codeEditor.value = f.content || '';
      UI.renderAi();
      this.renderFileList();
      UI.log('Bilgi', `Dosya açıldı: ${path}`);
    },

    setContent(path, content) {
      const f = UI.state.workspace.files[path];
      if (!f) return;

      // Undo stack
      this._pushUndo(path, f.content || '');

      f.content = content;
      if (!f.dirty) {
        f.dirty = true;
        this._recountDirty();
      }
      this._updateBadge(path);
    },

    async saveFile(path, silent=false) {
      const f = UI.state.workspace.files[path];
      if (!f) return;

      // Hızlı doğrulama: manifest.json ise JSON kontrolü
      if (path === 'manifest.json') {
        const ok = this.validateJson(path, true);
        if (!ok) {
          UI.toast('manifest.json geçersiz. JSON biçimini kontrol et.');
          if (!silent) return;
        }
      }

      f.dirty = false;
      f.lastSavedAt = Date.now();
      f.error = '';
      await this._persist();
      this._recountDirty();
      this._updateBadge(path);
      if (!silent) UI.toast('Dosya kaydedildi.');
      UI.log('Bilgi', `Dosya kaydedildi: ${path}`);
    },

    async saveAll(silent=false) {
      // Tüm dosyaları kaydetmeden önce manifest.json kontrolü
      if (UI.state.workspace.files['manifest.json']?.dirty) {
        const ok = this.validateJson('manifest.json', true);
        if (!ok && !silent) {
          UI.toast('manifest.json geçersiz. Önce düzeltmelisin.');
          return;
        }
      }

      for (const p of UI.state.workspace.order) {
        const f = UI.state.workspace.files[p];
        if (f?.dirty) {
          f.dirty = false;
          f.lastSavedAt = Date.now();
          f.error = '';
        }
      }
      await this._persist();
      this._recountDirty();
      this._updateActiveBadge();
      if (!silent) UI.toast('Tüm dosyalar kaydedildi.');
      UI.log('Bilgi', 'Tüm dosyalar kaydedildi.');
    },

    undo(path) {
      const stack = UI.state.workspace.undo[path] || [];
      if (stack.length === 0) return UI.toast('Geri alınacak bir şey yok.');

      const f = UI.state.workspace.files[path];
      if (!f) return;

      const prev = stack.pop();
      this._pushRedo(path, f.content || '');
      f.content = prev;

      UI.els.codeEditor.value = f.content || '';
      f.dirty = true;
      this._recountDirty();
      this._updateBadge(path);
      UI.toast('Geri alındı.');
    },

    redo(path) {
      const stack = UI.state.workspace.redo[path] || [];
      if (stack.length === 0) return UI.toast('İleri alınacak bir şey yok.');

      const f = UI.state.workspace.files[path];
      if (!f) return;

      const next = stack.pop();
      this._pushUndo(path, f.content || '');
      f.content = next;

      UI.els.codeEditor.value = f.content || '';
      f.dirty = true;
      this._recountDirty();
      this._updateBadge(path);
      UI.toast('İleri alındı.');
    },

    validateJson(path, silent=false) {
      const f = UI.state.workspace.files[path];
      if (!f) return false;

      try {
        JSON.parse(f.content || '');
        f.error = '';
        this._updateBadge(path);
        if (!silent) UI.toast('JSON geçerli.');
        return true;
      } catch (e) {
        f.error = 'JSON hatası';
        this._updateBadge(path);
        if (!silent) UI.toast('JSON geçersiz. Biçimi kontrol et.');
        UI.log('Hata', `JSON doğrulama: ${path} • ${UI.formatErr(e)}`);
        return false;
      }
    },

    formatJson(path) {
      const f = UI.state.workspace.files[path];
      if (!f) return;

      try {
        const obj = JSON.parse(f.content || '');
        const pretty = JSON.stringify(obj, null, 2) + '\n';
        this.setContent(path, pretty);
        UI.els.codeEditor.value = pretty;
        UI.toast('Biçimlendirildi.');
      } catch (e) {
        UI.toast('Biçimlendirilemedi. JSON geçersiz.');
        UI.log('Hata', `JSON biçimlendirme: ${path} • ${UI.formatErr(e)}`);
      }
    },

    _updateBadge(path) {
      // Aktif dosya rozeti
      this._updateActiveBadge();
      // Listeyi de güncelle
      this.renderFileList();
    },

    _updateActiveBadge() {
      const path = UI.state.workspace.activePath;
      const f = UI.state.workspace.files[path];
      if (!path || !f) {
        UI.els.activeFileBadge.hidden = true;
        return;
      }

      UI.els.activeFileBadge.hidden = true;
      if (f.dirty) {
        UI.els.activeFileBadge.hidden = false;
        UI.els.activeFileBadge.className = 'badge dirty';
        UI.els.activeFileBadge.textContent = 'Değişti';
      } else if (f.error) {
        UI.els.activeFileBadge.hidden = false;
        UI.els.activeFileBadge.className = 'badge err';
        UI.els.activeFileBadge.textContent = 'Hata';
      } else if (f.hasSuggestion) {
        UI.els.activeFileBadge.hidden = false;
        UI.els.activeFileBadge.className = 'badge';
        UI.els.activeFileBadge.textContent = 'Öneri var';
      }
    },

    _recountDirty() {
      const files = UI.state.workspace.files;
      UI.state.workspace.dirtyCount = Object.values(files).filter((f) => f?.dirty).length;
    },

    _pushUndo(path, content) {
      UI.state.workspace.undo[path] = UI.state.workspace.undo[path] || [];
      UI.state.workspace.undo[path].push(content);
      // redo temizle
      UI.state.workspace.redo[path] = [];
      // sınırlama
      if (UI.state.workspace.undo[path].length > 30) UI.state.workspace.undo[path] = UI.state.workspace.undo[path].slice(-30);
    },

    _pushRedo(path, content) {
      UI.state.workspace.redo[path] = UI.state.workspace.redo[path] || [];
      UI.state.workspace.redo[path].push(content);
      if (UI.state.workspace.redo[path].length > 30) UI.state.workspace.redo[path] = UI.state.workspace.redo[path].slice(-30);
    },

    async _persist() {
      await this._setLocal('workspace_files', {
        files: UI.state.workspace.files,
        order: UI.state.workspace.order,
        savedAt: Date.now()
      });
    },

    async _getLocal(key) {
      if (chrome?.storage?.local) {
        const obj = await chrome.storage.local.get(key);
        return obj[key];
      }
      return JSON.parse(localStorage.getItem(key) || 'null');
    },

    async _setLocal(key, value) {
      if (chrome?.storage?.local) {
        await chrome.storage.local.set({ [key]: value });
        return;
      }
      localStorage.setItem(key, JSON.stringify(value));
    }
  };

  // ───────────────────────────────────────────────────────────────
  // Bölüm 4: Mesajlaşma (background ilerleme yayınlarsa dinler)
  // ───────────────────────────────────────────────────────────────
  function connectToBackground() {
    if (!chrome?.runtime?.connect) return null;

    return safeTry('Background bağlantısı', () => {
      const port = chrome.runtime.connect({ name: 'patpat_sidepanel' });

      port.onMessage.addListener((msg) => safeTry('port mesajı', () => {
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'progress') {
          UI.setProgress({
            jobName: msg.jobName,
            progress: msg.progress,
            step: msg.step,
            queue: msg.queue
          });
        }

        if (msg.type === 'status') {
          if (msg.online) UI.setOnline(msg.online);
          if (msg.site) UI.setSite(msg.site);
        }

        if (msg.type === 'log') {
          UI.log(msg.level || 'Bilgi', msg.message || '—');
        }
      }));

      port.onDisconnect.addListener(() => {
        UI.log('Uyarı', 'Arka plan bağlantısı kapandı.');
      });

      return port;
    });
  }

  // ───────────────────────────────────────────────────────────────
  // Bölüm 5: Puter AI “Devreye Girme” (UI seviyesi, güvenli taslak)
  // ───────────────────────────────────────────────────────────────
  async function runAiJob(commandLabel) {
    // Bu fonksiyon çağrı mantığını hazır tutar; puter.js yoksa nazikçe uyarır.
    const model = UI.state.aiModel;
    if (!model) {
      UI.toast('Devam etmek için bir model seçmelisin.');
      return;
    }

    const userNote = (UI.els.aiPrompt.value || '').trim();
    const context = {
      sekme: UI.state.activeTab,
      sekmeBasligi: (TAB_MAP[UI.state.activeTab] || {}).title,
      hedef: commandLabel || 'Analiz',
      not: userNote,
      kisitlar: [
        'Tüm arayüz metinleri Türkçe kalacak',
        'MV3 yapısını bozma',
        'Gereksiz izin ekleme (minimum izin)',
        'Sadece öneri üret; kritik işlemleri otomatik yapma'
      ]
    };

    const filesTab = (UI.state.activeTab === 'files');

    const systemText = filesTab
      ? 'Sadece unified diff/patch üret. Açıklama, risk ve geri alma planı ekle. ' +
        'Kritik işlemleri otomatik yapma. Tüm metinler Türkçe olsun.'
      : 'Sadece öneri üret. Kritik işlemleri otomatik yapma. ' +
        'Çıktıyı kısa, maddeli ve Türkçe ver.';

    // Dosyalar sekmesinde: dosya yolu + kod bağlamı ekle
    if (filesTab) {
      const path = UI.state.workspace.activePath;
      const full = UI.els.codeEditor?.value || '';
      const selText = getEditorSelectionText();
      const useSel = UI.state.workspace.useSelection && selText && selText.length > 0;

      context.dosyaYolu = path || '';
      context.kodBaglami = useSel ? 'secim' : 'tum_dosya';
      context.seciliKod = useSel ? selText : '';
      context.dosyaIcerigi = useSel ? '' : full;
      context.hatirlatma = 'Çıktıyı tek dosya için unified diff/patch olarak üret.';
    }

    UI.log('Bilgi', `AI isteği hazırlandı: ${commandLabel || 'Analiz'} (model: ${model})`);

    // puter.js yoksa: simülasyon (boş bırakma yerine anlaşılır mesaj)
    const hasPuter = typeof window.puter === 'object' && window.puter?.ai?.chat;
    if (!hasPuter) {
      const simulated = filesTab
        ? '```diff\n--- a/' + (context.dosyaYolu || 'dosya') + '\n+++ b/' + (context.dosyaYolu || 'dosya') + '\n@@ -1,1 +1,2 @@\n-// örnek\n+// örnek\n+// (simülasyon) Patch burada görünür.\n```'
        : 'Öneri (simülasyon):\n' +
          '- Adım adım ilerleme metinlerini sadeleştir.\n' +
          '- Hata mesajlarını tek bir “Hata Konsolu”nda topla.\n' +
          '- Sekme bazlı ana CTA butonlarını daha belirgin yap.\n' +
          '- Kritik aksiyonlarda mutlaka onay penceresi kullan.';
      UI.state.lastAiSuggestion = simulated;
      const activePath = UI.state.workspace.activePath;
      if (activePath && UI.state.workspace.files[activePath]) UI.state.workspace.files[activePath].hasSuggestion = true;
      UI.els.aiResultHint.textContent = simulated;
      UI.renderAi();
      UI.toast('Puter AI hazır değil. Simülasyon önerisi gösterildi.');
      UI.setAiPill('Açık');
      return;
    }

    // Gerçek çağrı (puter.js mevcutsa)
    try {
      UI.toast('AI çalışıyor…');
      const resp = await window.puter.ai.chat({
        model,
        messages: [
          { role: 'system', content: systemText },
          { role: 'user', content: JSON.stringify(context) }
        ]
      });

      // Puter yanıt formatı değişebilir; güvenli okuma
      const text = resp?.message?.content || resp?.content || resp?.text || JSON.stringify(resp);
      UI.state.lastAiSuggestion = String(text);
      const activePath = UI.state.workspace.activePath;
      if (activePath && UI.state.workspace.files[activePath]) UI.state.workspace.files[activePath].hasSuggestion = true;
      UI.els.aiResultHint.textContent = UI.state.lastAiSuggestion;
      UI.renderAi();
      UI.toast('AI önerisi hazır.');
      UI.log('Bilgi', 'AI önerisi alındı.');
    } catch (err) {
      UI.log('Hata', `AI çağrısı başarısız: ${UI.formatErr(err)}`);
      UI.toast('AI çağrısı başarısız.');
    }
  }

  // ───────────────────────────────────────────────────────────────
  // Bölüm 5.1: Editör Seçimi + Patch (unified diff) Yardımcıları
  // ───────────────────────────────────────────────────────────────
  function getEditorSelectionText() {
    const ed = UI.els.codeEditor;
    if (!ed) return '';
    const start = ed.selectionStart || 0;
    const end = ed.selectionEnd || 0;
    if (end <= start) return '';
    return ed.value.slice(start, end);
  }

  function showPatchModal(text) {
    UI.els.patchBody.textContent = text || 'Henüz patch yok.';
    UI.els.patchModal.style.display = 'flex';
  }

  function hidePatchModal() {
    UI.els.patchModal.style.display = 'none';
  }

  function extractUnifiedDiff(text) {
    const raw = String(text || '');
    // ```diff ... ``` desteği
    const fenced = raw.match(/```diff\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) return fenced[1].trim();

    // Kaba arama: --- / +++ / @@
    const hasMarkers = raw.includes('@@') && raw.includes('---') && raw.includes('+++');
    if (hasMarkers) return raw.slice(raw.indexOf('---')).trim();

    return '';
  }

  function applyUnifiedDiff(originalText, diffText) {
    const originalLines = String(originalText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const diffLines = String(diffText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    // Başlıkları bul
    let i = 0;
    while (i < diffLines.length && !diffLines[i].startsWith('@@')) i++;
    if (i >= diffLines.length) throw new Error('Patch bulunamadı: hunk başlığı yok.');

    let out = originalLines.slice();
    let offset = 0;

    // Hunks
    while (i < diffLines.length) {
      const line = diffLines[i];
      if (!line.startsWith('@@')) { i++; continue; }

      const m = line.match(/^@@\s*-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s*@@/);
      if (!m) throw new Error('Patch başlığı okunamadı.');

      const oldStart = parseInt(m[1], 10);
      i++;

      const hunk = [];
      while (i < diffLines.length && !diffLines[i].startsWith('@@')) {
        const l = diffLines[i];
        // diff meta satırlarını atla
        if (l.startsWith('---') || l.startsWith('+++')) { i++; continue; }
        hunk.push(l);
        i++;
      }

      // Uygula
      const startIdx = (oldStart - 1) + offset;
      if (startIdx < 0 || startIdx > out.length) throw new Error('Patch satır aralığı geçersiz.');

      const before = out.slice(0, startIdx);
      let cursor = startIdx;
      const mid = [];

      for (const hl of hunk) {
        const kind = hl[0];
        const text = hl.slice(1);

        if (kind === ' ') {
          if (out[cursor] !== text) {
            throw new Error('Patch bağlamı uyuşmadı (context satırı eşleşmedi).');
          }
          mid.push(out[cursor]);
          cursor++;
        } else if (kind === '-') {
          if (out[cursor] !== text) {
            throw new Error('Patch bağlamı uyuşmadı (silme satırı eşleşmedi).');
          }
          cursor++;
        } else if (kind === '+') {
          mid.push(text);
        } else if (kind === '\\') {
          // "No newline" satırı — yok say
        } else if (hl.trim() === '') {
          // Güvenli geç
        } else {
          throw new Error('Patch satırı tanınmadı.');
        }
      }

      const after = out.slice(cursor);
      out = before.concat(mid, after);

      // Offset güncelle
      const removed = hunk.filter((x) => x.startsWith('-')).length;
      const added = hunk.filter((x) => x.startsWith('+')).length;
      offset += (added - removed);
    }

    return out.join('\n');
  }

  // ───────────────────────────────────────────────────────────────
  // Bölüm 6: Event Bağlama (tüm handler’lar safeTry ile sarılı)
  // ───────────────────────────────────────────────────────────────
  function bindEvents() {
    // Sekmeler
    document.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => safeTry('Sekme değişimi', () => {
        const tabId = btn.dataset.tab;
        if (!TAB_MAP[tabId]) return;
        UI.setActiveTab(tabId);
        UI.log('Bilgi', `Sekme açıldı: ${TAB_MAP[tabId].title}`);
      }));
    });

    // Global arama (şimdilik filtreleme yok; sadece log)
    UI.els.globalSearch.addEventListener('input', () => safeTry('Arama', () => {
      const q = UI.els.globalSearch.value.trim();
      if (q.length === 0) return;
      UI.log('Bilgi', `Arama: "${q}"`);
    }));

    // STOP (şimdilik sadece UI; background iptal mesajı sonra eklenecek)
    UI.els.btnStop.addEventListener('click', () => safeTry('Durdur', () => {
      UI.setProgress({ jobName: 'İptal', progress: 0, step: 'İş iptal edildi', queue: UI.state.queue });
      UI.log('Uyarı', 'Kullanıcı işlemi durdurdu.');
      UI.toast('Tüm işlemler durduruldu.');
    }));

    // Yardım
    UI.els.btnHelp.addEventListener('click', () => safeTry('Yardım', () => {
      UI.toast('İpucu: Sekme seç, ana butonlarla işlemi başlat.');
      UI.log('Bilgi', 'Yardım gösterildi.');
    }));

    // Loglar
    UI.els.btnClearLogs.addEventListener('click', () => safeTry('Log temizle', () => {
      UI.state.logs = ['[Bilgi] Log temizlendi.'];
      UI.renderLogs();
      UI.toast('Log temizlendi.');
    }));

    UI.els.btnCopyLogs.addEventListener('click', () => safeTry('Log kopyala', async () => {
      const text = UI.state.logs.join('\n');
      await navigator.clipboard.writeText(text);
      UI.toast('Loglar kopyalandı.');
    }));

    // Model seçimi
    UI.els.modelSelect.addEventListener('change', () => safeTry('Model seçimi', () => {
      const val = UI.els.modelSelect.value || '';
      UI.setModel(val);
    }));

    // AI komutları
    UI.els.cmdFix.addEventListener('click', () => safeTry('AI: Hata Düzelt', () => runAiJob('Hata düzelt')));
    UI.els.cmdRefactor.addEventListener('click', () => safeTry('AI: Düzenle', () => runAiJob('Kod düzenini iyileştir')));
    UI.els.cmdI18n.addEventListener('click', () => safeTry('AI: Türkçeleştir', () => runAiJob('Türkçeleştir (metinler)')));
    UI.els.cmdPerf.addEventListener('click', () => safeTry('AI: Hızlandır', () => runAiJob('Performansı iyileştir')));
    UI.els.cmdSecurity.addEventListener('click', () => safeTry('AI: Güvenlik', () => runAiJob('Güvenlik kontrolü')));
    UI.els.cmdManifest.addEventListener('click', () => safeTry('AI: Manifest', () => runAiJob('manifest.json doğrula')));
    UI.els.cmdExplain.addEventListener('click', () => safeTry('AI: Kod Açıklaması', () => runAiJob('Kod açıklaması çıkar')));

    UI.els.btnAiAnalyze.addEventListener('click', () => safeTry('AI Analiz', () => runAiJob('Analiz ve öneri')));
    UI.els.btnAiCopy.addEventListener('click', () => safeTry('AI Öneri Kopyala', async () => {
      const text = UI.state.lastAiSuggestion || UI.els.aiResultHint.textContent || '';
      await navigator.clipboard.writeText(text);
      UI.toast('AI önerisi kopyalandı.');
    }));

    // Patch önizleme penceresi
    UI.els.btnClosePatch.addEventListener('click', () => safeTry('Patch kapat', () => hidePatchModal()));
    UI.els.patchModal.addEventListener('click', (e) => safeTry('Patch arkaplan', () => {
      if (e.target === UI.els.patchModal) hidePatchModal();
    }));

    // Kod bağlamı seçimi
    UI.els.btnUseSelection.addEventListener('click', () => safeTry('Kod bağlamı: seçim', () => {
      UI.state.workspace.useSelection = true;
      UI.toast('Kod bağlamı: seçili kod.');
    }));
    UI.els.btnUseWholeFile.addEventListener('click', () => safeTry('Kod bağlamı: tüm dosya', () => {
      UI.state.workspace.useSelection = false;
      UI.toast('Kod bağlamı: tüm dosya.');
    }));

    // Patch önizle / uygula (sadece dosyalar sekmesi)
    UI.els.btnAiPreviewPatch.addEventListener('click', () => safeTry('Patch önizle', () => {
      const diff = extractUnifiedDiff(UI.state.lastAiSuggestion);
      if (!diff) return UI.toast('Patch bulunamadı.');
      showPatchModal(diff);
    }));

    UI.els.btnAiApplyPatch.addEventListener('click', () => safeTry('Patch uygula', () => {
      const path = UI.state.workspace.activePath;
      if (!path) return UI.toast('Önce bir dosya seçmelisin.');
      const diff = extractUnifiedDiff(UI.state.lastAiSuggestion);
      if (!diff) return UI.toast('Patch bulunamadı.');

      const current = UI.els.codeEditor.value || '';
      const next = applyUnifiedDiff(current, diff);
      Workspace.setContent(path, next);
      if (UI.state.workspace.files[path]) UI.state.workspace.files[path].hasSuggestion = false;
      UI.els.codeEditor.value = next;
      UI.toast('Patch uygulandı (kaydetmeyi unutma).');
      UI.log('Bilgi', `Patch uygulandı: ${path}`);
      UI.renderAi();
    }));

    // Çalışma alanı: dosya filtreleme
    UI.els.fileFilter.addEventListener('input', () => safeTry('Dosya filtre', () => Workspace.renderFileList()));
    UI.els.fileQuickFilter.addEventListener('change', () => safeTry('Hızlı filtre', () => Workspace.renderFileList()));

    // Çalışma alanı: dosya seçimi (delegation)
    UI.els.fileList.addEventListener('click', (e) => safeTry('Dosya seçimi', () => {
      const item = e.target.closest('.fileitem');
      if (!item) return;
      const path = item.getAttribute('data-path') || '';
      Workspace.open(path);
    }));

    // Editör değişikliği
    UI.els.codeEditor.addEventListener('input', () => safeTry('Editör değişikliği', () => {
      const path = UI.state.workspace.activePath;
      if (!path) return;
      Workspace.setContent(path, UI.els.codeEditor.value || '');
      UI.renderAi();
    }));

    // Kaydet / Tümünü kaydet
    UI.els.btnSaveFile.addEventListener('click', () => safeTry('Dosya kaydet', async () => {
      const path = UI.state.workspace.activePath;
      if (!path) return UI.toast('Kaydetmek için dosya seçmelisin.');
      await Workspace.saveFile(path);
    }));

    UI.els.btnSaveAll.addEventListener('click', () => safeTry('Tümünü kaydet', async () => {
      await Workspace.saveAll();
    }));

    // Geri al / ileri al
    UI.els.btnUndo.addEventListener('click', () => safeTry('Geri al', () => {
      const path = UI.state.workspace.activePath;
      if (!path) return UI.toast('Önce bir dosya seçmelisin.');
      Workspace.undo(path);
      UI.renderAi();
    }));

    UI.els.btnRedo.addEventListener('click', () => safeTry('İleri al', () => {
      const path = UI.state.workspace.activePath;
      if (!path) return UI.toast('Önce bir dosya seçmelisin.');
      Workspace.redo(path);
      UI.renderAi();
    }));

    // Bul / Değiştir (basit)
    UI.els.btnFind.addEventListener('click', () => safeTry('Bul', () => {
      const q = prompt('Bulunacak metni yaz:');
      if (!q) return;
      const text = UI.els.codeEditor.value || '';
      const idx = text.indexOf(q);
      if (idx < 0) return UI.toast('Bulunamadı.');
      UI.els.codeEditor.focus();
      UI.els.codeEditor.selectionStart = idx;
      UI.els.codeEditor.selectionEnd = idx + q.length;
      UI.toast('Bulundu ve seçildi.');
    }));

    UI.els.btnReplace.addEventListener('click', () => safeTry('Değiştir', () => {
      const q = prompt('Değiştirilecek metni yaz:');
      if (!q) return;
      const r = prompt('Yeni metni yaz:');
      if (r === null) return;

      const path = UI.state.workspace.activePath;
      if (!path) return UI.toast('Önce bir dosya seçmelisin.');

      const text = UI.els.codeEditor.value || '';
      const next = text.split(q).join(r);
      Workspace.setContent(path, next);
      if (UI.state.workspace.files[path]) UI.state.workspace.files[path].hasSuggestion = false;
      UI.els.codeEditor.value = next;
      UI.toast('Değiştirildi (kaydetmeyi unutma).');
    }));


    UI.els.btnCopySelection.addEventListener('click', () => safeTry('Seçimi kopyala', async () => {
      const selected = getEditorSelectionText();
      if (!selected) return UI.toast('Önce editörden bir seçim yapmalısın.');
      await navigator.clipboard.writeText(selected);
      UI.toast('Seçili satırlar kopyalandı.');
    }));

    // Biçimlendir / JSON doğrula
    UI.els.btnFormat.addEventListener('click', () => safeTry('Biçimlendir', () => {
      const path = UI.state.workspace.activePath;
      if (!path) return UI.toast('Önce bir dosya seçmelisin.');
      if (path !== 'manifest.json') return UI.toast('Bu sürümde sadece manifest.json biçimlendirilir.');
      Workspace.formatJson(path);
    }));

    UI.els.btnJsonValidate.addEventListener('click', () => safeTry('JSON doğrula', () => {
      const path = UI.state.workspace.activePath;
      if (!path) return UI.toast('Önce bir dosya seçmelisin.');
      if (path !== 'manifest.json') return UI.toast('Bu sürümde sadece manifest.json doğrulanır.');
      Workspace.validateJson(path);
    }));

    // Ctrl+Enter: AI Analiz
    window.addEventListener('keydown', (e) => safeTry('Kısayol', () => {
      const isCtrlEnter = (e.ctrlKey || e.metaKey) && e.key === 'Enter';
      if (!isCtrlEnter) return;
      if (UI.els.btnAiAnalyze.disabled) return;
      runAiJob('Analiz ve öneri');
    }));

    window.addEventListener('beforeunload', (e) => {
      if (UI.state.workspace.dirtyCount > 0) {
        e.preventDefault();
        e.returnValue = 'Kaydedilmemiş değişikliklerin var. Çıkmak istiyor musun?';
      }
    });
  }
  // ───────────────────────────────────────────────────────────────
  // Bölüm 7: Başlatma (ilk yükleme, ayarları geri çağırma)
  // ───────────────────────────────────────────────────────────────
  async function boot() {
    UI.init();
    bindEvents();

    UI.log('Bilgi', 'Yan panel hazır.');

    // Online/offline göstergesi (tarayıcı sinyali)
    const updateOnline = () => {
      UI.setOnline(navigator.onLine ? 'online' : 'offline');
      UI.renderTop();
    };
    updateOnline();
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);

    // Çalışma alanını yükle (dosyalar sekmesi)
    await Workspace.load();

    // Kayıtlı UI durumunu yükle
    safeTry('Ayar yükleme', async () => {
      const savedTab = await Storage.getSync('ui_active_tab');
      const savedModel = await Storage.getSync('puter_model_id');

      if (savedTab && TAB_MAP[savedTab]) UI.state.activeTab = savedTab;
      if (typeof savedModel === 'string') UI.state.aiModel = savedModel;

      UI.renderAll();
      UI.log('Bilgi', 'Kayıtlı ayarlar yüklendi.');
    });

    // Background bağlantısı (varsa)
    const port = connectToBackground();
    if (port) UI.log('Bilgi', 'Arka plan bağlantısı kuruldu.');
    else UI.log('Uyarı', 'Arka plan bağlantısı yok (normal olabilir).');

    // Dışa açık debug (isteğe bağlı)
    window.__PatpatUI = { UI, TAB_MAP, runAiJob };
  }

  // Yardımcı
  function byId(id) { return document.getElementById(id); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function escapeHtml(s) {
    const str = String(s || '');
    return str.replace(/[&<>"']/g, (c) => {
      switch (c) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return c;
      }
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // Başlat
  boot();
})();