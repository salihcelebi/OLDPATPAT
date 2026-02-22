/* page-tools.js
 *
 * Amaç:
 * - "Raporlar ve Otomasyon" sekmesi: rapor üret + indir, planlı çalıştırma ayarları, playbook taslakları
 * - "Chrome Eklenti Dosyaları" sekmesi: ZIP içe/dışa aktar (JSZip varsa), manifest doğrula, geçmiş snapshot
 *
 * Önemli:
 * - ZIP için VARSAYIM: JSZip yüklenecek (window.JSZip). Yoksa güvenli uyarı ve JSON export fallback var.
 * - Kurulu eklenti dosyaları doğrudan “yerinde” değişmez; çalışma alanına yazılır.
 */

(() => {
  'use strict';

  const root = window;
  const Shared = root.Patpat?.Shared;
  if (!Shared) return;

  const KEYS = Object.freeze({
    workspace: 'workspace_files',
    workspaceHistory: 'workspace_history',
    scheduler: 'patpat_scheduler',
    playbooks: 'patpat_playbooks',
    offlineQueue: 'patpat_offline_queue',
    lastSentMap: 'patpat_last_sent_map',
    complaints: 'patpat_complaints',
    instruction: 'patpat_instruction'
  });

  function el(id) { return document.getElementById(id); }

  async function init() {
    bindReportsButtons();
    bindWorkspaceButtons();
  }

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Raporlar
  // ─────────────────────────────────────────────────────────────
  function bindReportsButtons() {
    const btnDaily = el('btnReportDaily');
    const btnWeekly = el('btnReportWeekly');
    const btnScheduler = el('btnScheduler');
    const btnPlaybooks = el('btnPlaybooks');

    btnDaily?.addEventListener('click', () => Shared.safeTry('Günlük rapor', async () => {
      const report = await buildReport('günlük');
      Shared.downloadText(`gunluk_rapor_${Date.now()}.json`, JSON.stringify(report, null, 2), 'application/json');
      Shared.toast('Günlük rapor indirildi (JSON).');
    }));

    btnWeekly?.addEventListener('click', () => Shared.safeTry('Haftalık rapor', async () => {
      const report = await buildReport('haftalık');
      Shared.downloadText(`haftalik_rapor_${Date.now()}.json`, JSON.stringify(report, null, 2), 'application/json');
      Shared.toast('Haftalık rapor indirildi (JSON).');
    }));

    btnScheduler?.addEventListener('click', () => Shared.safeTry('Planlı çalıştırma', async () => {
      // VARSAYIM: Alarm/planlama background tarafında daha sonra uygulanacak.
      const current = await Shared.getSync(KEYS.scheduler);
      const def = current?.time || '09:00';
      const t = prompt('Günlük çalıştırma saati (SS:DD):', def);
      if (!t) return;

      await Shared.setSync(KEYS.scheduler, { type: 'günlük', time: String(t).trim(), updatedAt: Date.now() });
      Shared.toast('Planlı çalıştırma ayarı kaydedildi.');
    }));

    btnPlaybooks?.addEventListener('click', () => Shared.safeTry('Otomasyon kuralları', async () => {
      const items = await Shared.getSync(KEYS.playbooks);
      const list = Array.isArray(items) ? items : [];

      Shared.openModal('Otomasyon Kuralları (Taslak)', `
        <div style="display:grid;gap:10px;">
          <div style="font-size:12px;color:rgba(169,180,230,.9);">
            Buradaki kurallar “taslak”tır. Etkinleştirme için ayrıca onay gerekir.
          </div>
          <button id="__patpat_pb_add__" style="height:40px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:linear-gradient(135deg, rgba(110,168,255,.24), rgba(155,123,255,.16));color:#e7ecff;cursor:pointer;">
            Yeni Kural Ekle
          </button>
          <div id="__patpat_pb_list__"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button id="__patpat_pb_ai__" style="height:40px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(18,28,58,.45);color:#e7ecff;cursor:pointer;">
              AI ile Kural Öner
            </button>
            <button id="__patpat_pb_save__" style="height:40px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(18,28,58,.45);color:#e7ecff;cursor:pointer;">
              Kaydet
            </button>
          </div>
        </div>
      `);

      setTimeout(() => {
        const listWrap = document.getElementById('__patpat_pb_list__');
        const addBtn = document.getElementById('__patpat_pb_add__');
        const aiBtn = document.getElementById('__patpat_pb_ai__');
        const saveBtn = document.getElementById('__patpat_pb_save__');

        if (!listWrap || !addBtn || !saveBtn) return;

        const localList = [...list];

        const render = () => {
          if (localList.length === 0) {
            listWrap.innerHTML = `<div style="border:1px dashed rgba(255,255,255,.18);border-radius:16px;padding:12px;color:rgba(169,180,230,.75);background:rgba(255,255,255,.03);font-size:12px;">Henüz kural yok.</div>`;
            return;
          }
          listWrap.innerHTML = localList.map((p, i) => `
            <div style="border:1px solid rgba(255,255,255,.10);border-radius:16px;padding:10px;background:rgba(0,0,0,.12);margin-bottom:8px;">
              <div style="font-size:12px;color:rgba(231,236,255,.92);"><b>${escapeHtml(p.ad || 'Kural')}</b></div>
              <div style="font-size:12px;color:rgba(169,180,230,.9);margin-top:4px;">Eğer: ${escapeHtml(p.eger || '—')}</div>
              <div style="font-size:12px;color:rgba(169,180,230,.9);margin-top:2px;">O zaman: ${escapeHtml(p.oZaman || '—')}</div>
              <button data-del="${i}" style="margin-top:8px;height:34px;border-radius:12px;border:1px solid rgba(255,92,119,.35);background:rgba(255,92,119,.06);color:rgba(255,92,119,.95);cursor:pointer;">Sil</button>
            </div>
          `).join('');

          listWrap.querySelectorAll('[data-del]').forEach((b) => {
            b.addEventListener('click', () => {
              const idx = Number(b.getAttribute('data-del'));
              localList.splice(idx, 1);
              render();
            });
          });
        };

        render();

        addBtn.addEventListener('click', () => {
          const ad = prompt('Kural adı:', 'Yeni kural');
          if (!ad) return;
          const eger = prompt('Eğer (kısa koşul):', 'pending > 48 saat');
          if (eger === null) return;
          const oZaman = prompt('O zaman (önerilen aksiyon):', 'Uyarı üret');
          if (oZaman === null) return;

          localList.push({
            id: `pb_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            ad, eger, oZaman,
            aktif: false,
            createdAt: Date.now()
          });
          render();
        });

        aiBtn?.addEventListener('click', () => {
          // AI sadece öneri verir; otomatik kaydetmez
          root.__PatpatUI?.runAiJob?.('Playbook: Otomasyon kuralı öner');
          Shared.toast('AI önerisi sağ panelde görünecek.');
        });

        saveBtn.addEventListener('click', async () => {
          await Shared.setSync(KEYS.playbooks, localList);
          Shared.toast('Otomasyon kuralları kaydedildi.');
          Shared.closeModal();
        });
      }, 0);
    }));
  }

  async function buildReport(type) {
    // Bu rapor “en iyi çaba” ile depolama metriklerini toplar.
    const offlineQueue = (await Shared.getLocal(KEYS.offlineQueue)) || [];
    const lastSentMap = (await Shared.getLocal(KEYS.lastSentMap)) || {};
    const complaints = (await Shared.getLocal(KEYS.complaints)) || [];
    const instruction = (await Shared.getLocal(KEYS.instruction)) || { learning_queue: [], mandatory: [] };

    const uiLogs = root.__PatpatUI?.UI?.state?.logs || [];
    const logs = Array.isArray(uiLogs) ? uiLogs.slice(-60) : [];

    return {
      tur: type,
      olusturmaZamani: new Date().toISOString(),
      metrikler: {
        offlineKuyruk: Array.isArray(offlineQueue) ? offlineQueue.length : 0,
        gonderilmisKayitAnahtari: Object.keys(lastSentMap || {}).length,
        sikayetSayisi: Array.isArray(complaints) ? complaints.length : 0,
        ogrenmeKuyrugu: Array.isArray(instruction.learning_queue) ? instruction.learning_queue.length : 0,
        zorunluKural: Array.isArray(instruction.mandatory) ? instruction.mandatory.length : 0
      },
      notlar: 'Bu rapor, arayüz ve depolama verilerinden “en iyi çaba” ile derlenmiştir.',
      sonLoglar: logs
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Çalışma alanı (ZIP içe/dışa aktar + manifest kontrol)
  // ─────────────────────────────────────────────────────────────
  function bindWorkspaceButtons() {
    const btnImport = el('btnWorkspaceImport');
    const btnExport = el('btnWorkspaceExport');
    const btnValidate = el('btnWorkspaceValidate');
    const btnHistory = el('btnWorkspaceHistory');

    btnImport?.addEventListener('click', () => Shared.safeTry('ZIP içe aktar', async () => {
      const file = await pickFile('.zip,.json');
      if (!file) return;

      if (file.name.toLowerCase().endsWith('.json')) {
        const txt = await Shared.readFileAsText(file);
        const parsed = JSON.parse(txt);
        await importWorkspaceFromJson(parsed);
        Shared.toast('Çalışma alanı içe aktarıldı (JSON).');
        return;
      }

      // ZIP ise JSZip gerekir
      if (!root.JSZip) {
        Shared.toast('ZIP içe aktarma için JSZip gerekli. Şimdilik JSON kullan.');
        return;
      }

      const buf = await Shared.readFileAsArrayBuffer(file);
      const zip = await root.JSZip.loadAsync(buf);

      const files = {};
      const order = [];

      const entries = Object.keys(zip.files);
      for (const path of entries) {
        const entry = zip.files[path];
        if (entry.dir) continue;

        order.push(path);

        // Basit tür tespiti: metin dosyaları string, ikonlar base64
        const isBinary = /\.(png|jpg|jpeg|webp|ico)$/i.test(path);
        if (isBinary) {
          const base64 = await entry.async('base64');
          files[path] = { path, content: base64, dirty: false, lastSavedAt: Date.now(), encoding: 'base64', binary: true };
        } else {
          const content = await entry.async('string');
          files[path] = { path, content, dirty: false, lastSavedAt: Date.now(), encoding: 'utf-8', binary: false };
        }
      }

      await snapshotWorkspace('İçe aktarma (ZIP)');
      await Shared.setLocal(KEYS.workspace, { files, order, savedAt: Date.now() });

      Shared.toast('Çalışma alanı içe aktarıldı (ZIP).');
    }));

    btnExport?.addEventListener('click', () => Shared.safeTry('ZIP dışa aktar', async () => {
      const ws = await Shared.getLocal(KEYS.workspace);
      if (!ws?.files || !ws?.order) {
        Shared.toast('Dışa aktarılacak çalışma alanı yok.');
        return;
      }

      // ZIP varsa üret, yoksa JSON indir
      if (!root.JSZip) {
        Shared.downloadText(`calisma_alani_${Date.now()}.json`, JSON.stringify(ws, null, 2), 'application/json');
        Shared.toast('JSZip yok: JSON olarak indirildi.');
        return;
      }

      const zip = new root.JSZip();
      for (const p of ws.order) {
        const f = ws.files[p];
        if (!f) continue;

        if (f.encoding === 'base64' || f.binary) {
          zip.file(p, String(f.content || ''), { base64: true });
        } else {
          zip.file(p, String(f.content || ''), { binary: false });
        }
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `patpat-agent_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1200);

      await snapshotWorkspace('Dışa aktarma (ZIP)');
      Shared.toast('ZIP dışa aktarıldı.');
    }));

    btnValidate?.addEventListener('click', () => Shared.safeTry('manifest doğrula', async () => {
      const ws = await Shared.getLocal(KEYS.workspace);
      const mf = ws?.files?.['manifest.json']?.content;

      if (!mf) {
        Shared.toast('manifest.json bulunamadı. Önce çalışma alanı içe aktar.');
        return;
      }

      let obj = null;
      try {
        obj = JSON.parse(String(mf));
      } catch (e) {
        Shared.openModal('manifest.json Doğrulama', `
          <div style="color:rgba(255,92,119,.95);font-size:12px;">
            manifest.json geçersiz. JSON biçimini kontrol et.
          </div>
          <pre style="white-space:pre-wrap;font-size:11px;line-height:1.45;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:10px;margin-top:10px;">${escapeHtml(Shared.formatErr(e))}</pre>
        `);
        return;
      }

      const res = Shared.validateManifestMinimum(obj);
      const warnHtml = (res.warnings || []).map(w => `<li style="margin-bottom:6px;">${escapeHtml(w)}</li>`).join('');
      const okText = res.ok ? 'Minimum izin yaklaşımıyla uyumlu görünüyor.' : 'Bazı iyileştirmeler öneriliyor.';

      Shared.openModal('manifest.json Doğrulama', `
        <div style="font-size:12px;color:rgba(231,236,255,.92);">${escapeHtml(okText)}</div>
        <div style="height:10px;"></div>
        <div style="font-size:12px;color:rgba(169,180,230,.9);">Uyarılar:</div>
        <ul style="margin:8px 0 0;padding-left:18px;color:rgba(231,236,255,.88);font-size:12px;">
          ${warnHtml || '<li>Uyarı yok.</li>'}
        </ul>
      `);
    }));

    btnHistory?.addEventListener('click', () => Shared.safeTry('Geçmiş', async () => {
      const hist = await Shared.getLocal(KEYS.workspaceHistory);
      const list = Array.isArray(hist) ? hist : [];

      Shared.openModal('Değişiklik Geçmişi (Snapshot)', `
        <div style="font-size:12px;color:rgba(169,180,230,.9);">
          Snapshot, çalışma alanının bir kopyasını saklar. “Geri yükle” manuel onay ister.
        </div>
        <div style="height:10px;"></div>
        <div id="__patpat_hist_list__"></div>
      `);

      setTimeout(() => {
        const wrap = document.getElementById('__patpat_hist_list__');
        if (!wrap) return;

        if (list.length === 0) {
          wrap.innerHTML = `<div style="border:1px dashed rgba(255,255,255,.18);border-radius:16px;padding:12px;color:rgba(169,180,230,.75);background:rgba(255,255,255,.03);font-size:12px;">Henüz snapshot yok.</div>`;
          return;
        }

        wrap.innerHTML = list.slice(-20).reverse().map((h) => `
          <div style="border:1px solid rgba(255,255,255,.10);border-radius:16px;padding:10px;background:rgba(0,0,0,.12);margin-bottom:8px;">
            <div style="font-size:12px;color:rgba(231,236,255,.92);"><b>${escapeHtml(h.label || 'Snapshot')}</b></div>
            <div style="font-size:12px;color:rgba(169,180,230,.9);margin-top:4px;">${escapeHtml(new Date(h.at).toLocaleString('tr-TR'))}</div>
            <button data-restore="${escapeAttr(h.id)}" style="margin-top:8px;height:34px;border-radius:12px;border:1px solid rgba(110,168,255,.35);background:rgba(110,168,255,.10);color:rgba(231,236,255,.92);cursor:pointer;">Geri Yükle</button>
          </div>
        `).join('');

        wrap.querySelectorAll('[data-restore]').forEach((b) => {
          b.addEventListener('click', async () => {
            const id = b.getAttribute('data-restore');
            const snap = list.find(x => x.id === id);
            if (!snap) return;

            const ok = confirm('Bu snapshot çalışma alanının üzerine yazılacak. Devam edilsin mi?');
            if (!ok) return;

            await Shared.setLocal(KEYS.workspace, snap.workspace);
            Shared.toast('Snapshot geri yüklendi.');
            Shared.closeModal();
          });
        });
      }, 0);
    }));
  }

  async function pickFile(accept) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept || '*/*';
      input.onchange = () => resolve(input.files?.[0] || null);
      input.click();
    });
  }

  async function importWorkspaceFromJson(parsed) {
    // Beklenen şema: { files, order, savedAt }
    if (!parsed || typeof parsed !== 'object') throw new Error('JSON formatı geçersiz.');
    if (!parsed.files || !parsed.order) throw new Error('JSON içinde files/order bulunamadı.');

    await snapshotWorkspace('İçe aktarma (JSON)');
    await Shared.setLocal(KEYS.workspace, parsed);
  }

  async function snapshotWorkspace(label) {
    const ws = await Shared.getLocal(KEYS.workspace);
    if (!ws) return;

    const hist = await Shared.getLocal(KEYS.workspaceHistory);
    const list = Array.isArray(hist) ? hist : [];

    list.push({
      id: `snap_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      label: label || 'Snapshot',
      at: Date.now(),
      workspace: ws
    });

    // Kaba limit (son 30)
    const trimmed = list.length > 30 ? list.slice(-30) : list;
    await Shared.setLocal(KEYS.workspaceHistory, trimmed);
  }

  function escapeHtml(s) {
    const str = String(s ?? '');
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

  Shared.waitFor(() => window.__PatpatUI?.UI).then(init).catch((e) => {
    Shared.log('Uyarı', `page-tools başlatılamadı: ${Shared.formatErr(e)}`);
  });
})();