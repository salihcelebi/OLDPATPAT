/* page-support.js
 *
 * Amaç:
 * - "Müşteri Şikayet Yönetimi" + "Kurallar ve Öğrenme Merkezi" sekmeleri
 * - Şikayetlerde SLA hesaplama, taslak yanıt, eskale/kapat akışı
 * - Kurallarda learning_queue, mandatory, 3 onay ve manual override yönetimi
 * - AI önerileri: yapılandırılmış (taslak) yaklaşım; kritik aksiyonlar onaysız olmaz
 */

(() => {
  'use strict';

  const root = window;
  const Shared = root.Patpat?.Shared;
  if (!Shared) return;

  const KEYS = Object.freeze({
    complaints: 'patpat_complaints',
    instruction: 'patpat_instruction',
    aiAuto: 'patpat_ai_auto' // VARSAYIM: kullanıcı açarsa otomatik öneri üretir
  });

  const state = {
    selectedComplaintId: '',
    selectedRuleId: ''
  };

  function q(sel) { return document.querySelector(sel); }
  function el(id) { return document.getElementById(id); }

  async function init() {
    // Şikayet paneline liste/detay alanı ekle
    mountComplaintsUI();
    await refreshComplaints();

    // Kurallar paneline liste alanı ekle
    mountRulesUI();
    await refreshRules();

    // Butonlar
    bindComplaintButtons();
    bindRuleButtons();

    // Depolama değişimlerinde yenile
    if (chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[KEYS.complaints]) refreshComplaints();
        if (changes[KEYS.instruction]) refreshRules();
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Şikayet UI
  // ─────────────────────────────────────────────────────────────
  function mountComplaintsUI() {
    const panel = q('.tabpanel[data-tabpanel="complaints"]');
    if (!panel) return;

    // İkinci kartı “liste + detay” olarak dönüştürelim
    const cards = panel.querySelectorAll('.card');
    const target = cards?.[1] || null;
    if (!target) return;

    target.innerHTML = `
      <h3>Şikayet Listesi</h3>
      <p>Bir şikayeti seçince detay ve SLA bilgisi görünür.</p>
      <div id="complaintsList"></div>
      <div style="height:10px;"></div>
      <h3>Seçili Şikayet</h3>
      <div id="complaintDetail"></div>
    `;
  }

  async function refreshComplaints() {
    const listWrap = el('complaintsList');
    const detailWrap = el('complaintDetail');
    if (!listWrap || !detailWrap) return;

    const items = (await Shared.getLocal(KEYS.complaints)) || [];
    const complaints = Array.isArray(items) ? items : [];

    if (complaints.length === 0) {
      listWrap.innerHTML = `<div style="border:1px dashed rgba(255,255,255,.18);border-radius:16px;padding:12px;color:rgba(169,180,230,.75);background:rgba(255,255,255,.03);font-size:12px;">Henüz şikayet kaydı yok. Yeni kayıt gelince burada görünür.</div>`;
      detailWrap.innerHTML = `<div style="border:1px dashed rgba(255,255,255,.18);border-radius:16px;padding:12px;color:rgba(169,180,230,.75);background:rgba(255,255,255,.03);font-size:12px;">Detay görmek için bir şikayet seç.</div>`;
      state.selectedComplaintId = '';
      return;
    }

    // SLA hesap: “ilk yanıt” ve “çözüm” alanları yoksa best-effort
    const now = Date.now();
    const enhanced = complaints.map((c) => {
      const createdAt = Number(c.createdAt || now);
      const firstResponseAt = Number(c.firstResponseAt || 0);
      const closedAt = Number(c.closedAt || 0);

      const firstResponseSlaMs = 30 * 60 * 1000; // VARSAYIM: 30 dk
      const resolveSlaMs = 24 * 60 * 60 * 1000;  // VARSAYIM: 24 saat

      const firstRisk = !firstResponseAt && (now - createdAt > firstResponseSlaMs);
      const resolveRisk = !closedAt && (now - createdAt > resolveSlaMs);

      return { ...c, __slaFirstRisk: firstRisk, __slaResolveRisk: resolveRisk };
    });

    // Listeyi çiz
    listWrap.innerHTML = enhanced.slice(0, 50).map((c) => {
      const sel = (c.id === state.selectedComplaintId);
      const risk = (c.__slaFirstRisk || c.__slaResolveRisk);
      const badge = risk
        ? `<span style="font-size:10px;padding:2px 6px;border-radius:999px;border:1px solid rgba(255,92,119,.35);color:rgba(255,92,119,.95);background:rgba(255,92,119,.06);white-space:nowrap;">SLA RİSKİ</span>`
        : `<span style="font-size:10px;padding:2px 6px;border-radius:999px;border:1px solid rgba(61,220,151,.35);color:rgba(61,220,151,.95);background:rgba(61,220,151,.06);white-space:nowrap;">NORMAL</span>`;

      return `
        <div class="fileitem ${sel ? 'active' : ''}" data-complaint-id="${escapeAttr(c.id)}" style="border:1px solid rgba(255,255,255,.10);margin-bottom:8px;">
          <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${escapeHtml(c.konu || 'Konu yok')} • ${escapeHtml(c.musteri || 'Müşteri')}
            ${c.smmId ? `• ID:${escapeHtml(c.smmId)}` : ''}
          </span>
          <span style="display:flex;gap:6px;align-items:center;">${badge}</span>
        </div>
      `;
    }).join('');

    // Seçim tıklama
    listWrap.querySelectorAll('[data-complaint-id]').forEach((row) => {
      row.addEventListener('click', () => {
        state.selectedComplaintId = row.getAttribute('data-complaint-id') || '';
        refreshComplaints();
        maybeAutoAiForComplaint();
      });
    });

    // Detay çiz
    const selected = enhanced.find(x => x.id === state.selectedComplaintId) || enhanced[0];
    state.selectedComplaintId = selected.id;

    detailWrap.innerHTML = renderComplaintDetail(selected);
  }

  function renderComplaintDetail(c) {
    const riskText = (c.__slaFirstRisk || c.__slaResolveRisk)
      ? 'SLA riski var. Öncelik yükselt.'
      : 'SLA normal görünüyor.';

    const status = String(c.durum || 'açık');
    const urgency = String(c.aciliyet || 'normal');

    return `
      <div style="border:1px solid rgba(255,255,255,.10);border-radius:16px;padding:12px;background:rgba(0,0,0,.12);">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;">
          <div style="min-width:0;">
            <div style="font-size:12px;color:rgba(169,180,230,.9);">Durum</div>
            <div style="font-size:13px;color:rgba(231,236,255,.92);">${escapeHtml(status)} • Aciliyet: ${escapeHtml(urgency)}</div>
          </div>
          <div style="font-size:12px;color:rgba(169,180,230,.9);">${escapeHtml(riskText)}</div>
        </div>

        <div style="height:10px;"></div>

        <div style="display:grid;gap:6px;">
          <div><span style="color:rgba(169,180,230,.9);font-size:12px;">Müşteri:</span> <span style="font-size:12px;">${escapeHtml(c.musteri || '')}</span></div>
          <div><span style="color:rgba(169,180,230,.9);font-size:12px;">Konu:</span> <span style="font-size:12px;">${escapeHtml(c.konu || '')}</span></div>
          <div><span style="color:rgba(169,180,230,.9);font-size:12px;">Kanal:</span> <span style="font-size:12px;">${escapeHtml(c.kanal || '—')}</span></div>
          <div><span style="color:rgba(169,180,230,.9);font-size:12px;">SMM ID:</span> <span style="font-size:12px;">${escapeHtml(c.smmId || '—')}</span></div>
        </div>

        <div style="height:10px;"></div>

        <div style="color:rgba(169,180,230,.9);font-size:12px;">Mesaj</div>
        <div style="white-space:pre-wrap;font-size:12px;line-height:1.45;background:rgba(18,28,58,.40);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:10px;">
          ${escapeHtml(String(c.mesaj || ''))}
        </div>
      </div>
    `;
  }

  function bindComplaintButtons() {
    const btnDraft = el('btnComplaintDraft');
    const btnSolution = el('btnComplaintSolution');
    const btnEscalate = el('btnComplaintEscalate');
    const btnClose = el('btnComplaintClose');

    btnDraft?.addEventListener('click', () => Shared.safeTry('Yanıt taslağı', async () => {
      const c = await getSelectedComplaint();
      if (!c) return Shared.toast('Önce bir şikayet seçmelisin.');

      // AI devreye girme: şikayet bağlamıyla “taslak”
      // Not: runAiJob sağ panelde öneri üretir; otomatik “kapat” yapmaz.
      root.__PatpatUI?.runAiJob?.('Şikayet: Yanıt taslağı oluştur');
      Shared.toast('Yanıt taslağı için AI önerisi hazırlanıyor.');
    }));

    btnSolution?.addEventListener('click', () => Shared.safeTry('Çözüm öner', async () => {
      const c = await getSelectedComplaint();
      if (!c) return Shared.toast('Önce bir şikayet seçmelisin.');
      root.__PatpatUI?.runAiJob?.('Şikayet: Çözüm seçenekleri öner');
      Shared.toast('Çözüm önerileri için AI önerisi hazırlanıyor.');
    }));

    btnEscalate?.addEventListener('click', () => Shared.safeTry('Eskale', async () => {
      const c = await getSelectedComplaint();
      if (!c) return Shared.toast('Önce bir şikayet seçmelisin.');

      const ok = confirm('Bu şikayeti yöneticiye eskale etmek istiyor musun?');
      if (!ok) return;

      await updateComplaint(c.id, { durum: 'eskale', lastUpdatedAt: Date.now() });
      Shared.toast('Şikayet eskale edildi.');
    }));

    btnClose?.addEventListener('click', () => Shared.safeTry('Şikayeti kapat', async () => {
      const c = await getSelectedComplaint();
      if (!c) return Shared.toast('Önce bir şikayet seçmelisin.');

      const ok = confirm('Şikayeti “çözüldü” olarak kapatmak istiyor musun?');
      if (!ok) return;

      await updateComplaint(c.id, { durum: 'çözüldü', closedAt: Date.now(), lastUpdatedAt: Date.now() });
      Shared.toast('Şikayet kapatıldı.');
    }));
  }

  async function getSelectedComplaint() {
    const items = (await Shared.getLocal(KEYS.complaints)) || [];
    const complaints = Array.isArray(items) ? items : [];
    return complaints.find(x => x.id === state.selectedComplaintId) || null;
  }

  async function updateComplaint(id, patch) {
    const items = (await Shared.getLocal(KEYS.complaints)) || [];
    const complaints = Array.isArray(items) ? items : [];

    const idx = complaints.findIndex(x => x.id === id);
    if (idx < 0) return;

    complaints[idx] = { ...complaints[idx], ...patch };
    await Shared.setLocal(KEYS.complaints, complaints);
  }

  async function maybeAutoAiForComplaint() {
    const auto = await Shared.getSync(KEYS.aiAuto);
    if (!auto) return; // varsayılan kapalı

    const c = await getSelectedComplaint();
    if (!c) return;

    // Kural tabanlı tetik: SLA riski veya “yüksek aciliyet”
    const urgency = String(c.aciliyet || '').toLowerCase();
    const risk = Boolean(c.__slaFirstRisk || c.__slaResolveRisk);
    const should = risk || urgency.includes('yüksek');

    if (!should) return;

    const modelSelected = Boolean(root.__PatpatUI?.UI?.state?.aiModel);
    if (!modelSelected) {
      Shared.toast('AI otomatik öneri için önce model seçmelisin.');
      return;
    }

    root.__PatpatUI?.runAiJob?.('Şikayet: Hızlı analiz ve sınıflandırma');
    Shared.toast('AI otomatik analiz başlatıldı (şikayet).');
  }

  // ─────────────────────────────────────────────────────────────
  // Bölüm: Kurallar UI
  // ─────────────────────────────────────────────────────────────
  function mountRulesUI() {
    const panel = q('.tabpanel[data-tabpanel="rules"]');
    if (!panel) return;

    const cards = panel.querySelectorAll('.card');
    const target = cards?.[1] || null;
    if (!target) return;

    target.innerHTML = `
      <h3>Öğrenme Kuyruğu ve Zorunlu Kurallar</h3>
      <p>Bir kuralı seçip onaylayabilir, reddedebilir veya manuel değiştirebilirsin.</p>
      <div id="rulesSummary"></div>
      <div style="height:10px;"></div>
      <div id="rulesList"></div>
      <div style="height:10px;"></div>
      <h3>Seçili Kural</h3>
      <div id="ruleDetail"></div>
    `;
  }

  async function refreshRules() {
    const summary = el('rulesSummary');
    const listWrap = el('rulesList');
    const detailWrap = el('ruleDetail');
    if (!summary || !listWrap || !detailWrap) return;

    const instruction = (await Shared.getLocal(KEYS.instruction)) || { learning_queue: [], mandatory: [], overrides: [] };
    const qItems = Array.isArray(instruction.learning_queue) ? instruction.learning_queue : [];
    const mandatory = Array.isArray(instruction.mandatory) ? instruction.mandatory : [];

    summary.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <div style="border:1px solid rgba(255,255,255,.10);border-radius:16px;padding:10px;background:rgba(0,0,0,.12);font-size:12px;">
          Öğrenme kuyruğu: <b>${qItems.length}</b>
        </div>
        <div style="border:1px solid rgba(255,255,255,.10);border-radius:16px;padding:10px;background:rgba(0,0,0,.12);font-size:12px;">
          Zorunlu kurallar: <b>${mandatory.length}</b>
        </div>
      </div>
    `;

    if (qItems.length === 0 && mandatory.length === 0) {
      listWrap.innerHTML = `<div style="border:1px dashed rgba(255,255,255,.18);border-radius:16px;padding:12px;color:rgba(169,180,230,.75);background:rgba(255,255,255,.03);font-size:12px;">Henüz kural yok. Yeni desen bulununca burada görünür.</div>`;
      detailWrap.innerHTML = `<div style="border:1px dashed rgba(255,255,255,.18);border-radius:16px;padding:12px;color:rgba(169,180,230,.75);background:rgba(255,255,255,.03);font-size:12px;">Detay görmek için bir kural seç.</div>`;
      state.selectedRuleId = '';
      return;
    }

    const merged = [
      ...qItems.map(x => ({ ...x, __bucket: 'Kuyruk' })),
      ...mandatory.map(x => ({ ...x, __bucket: 'Zorunlu' }))
    ];

    if (!state.selectedRuleId && merged[0]) state.selectedRuleId = merged[0].id || '';

    listWrap.innerHTML = merged.slice(0, 60).map((r) => {
      const sel = (String(r.id || '') === String(state.selectedRuleId || ''));
      const count = Number(r.match_count || 0);
      const badge = (r.__bucket === 'Kuyruk')
        ? `<span style="font-size:10px;padding:2px 6px;border-radius:999px;border:1px solid rgba(255,209,102,.35);color:rgba(255,209,102,.95);background:rgba(255,209,102,.06);white-space:nowrap;">${count}/3</span>`
        : `<span style="font-size:10px;padding:2px 6px;border-radius:999px;border:1px solid rgba(61,220,151,.35);color:rgba(61,220,151,.95);background:rgba(61,220,151,.06);white-space:nowrap;">AKTİF</span>`;

      return `
        <div class="fileitem ${sel ? 'active' : ''}" data-rule-id="${escapeAttr(r.id || '')}" style="border:1px solid rgba(255,255,255,.10);margin-bottom:8px;">
          <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${escapeHtml(r.field || 'Alan')} • ${escapeHtml(r.__bucket)}
          </span>
          <span style="display:flex;gap:6px;align-items:center;">${badge}</span>
        </div>
      `;
    }).join('');

    listWrap.querySelectorAll('[data-rule-id]').forEach((row) => {
      row.addEventListener('click', () => {
        state.selectedRuleId = row.getAttribute('data-rule-id') || '';
        refreshRules();
      });
    });

    const selected = merged.find(x => String(x.id || '') === String(state.selectedRuleId || '')) || merged[0];
    detailWrap.innerHTML = renderRuleDetail(selected);
  }

  function renderRuleDetail(r) {
    return `
      <div style="border:1px solid rgba(255,255,255,.10);border-radius:16px;padding:12px;background:rgba(0,0,0,.12);">
        <div style="display:grid;gap:6px;">
          <div><span style="color:rgba(169,180,230,.9);font-size:12px;">Alan:</span> <span style="font-size:12px;">${escapeHtml(r.field || '—')}</span></div>
          <div><span style="color:rgba(169,180,230,.9);font-size:12px;">Kimlik:</span> <span style="font-size:12px;">${escapeHtml(r.id || '—')}</span></div>
          <div><span style="color:rgba(169,180,230,.9);font-size:12px;">Eşleşme:</span> <span style="font-size:12px;">${escapeHtml(r.pattern || '—')}</span></div>
          <div><span style="color:rgba(169,180,230,.9);font-size:12px;">Kaynak:</span> <span style="font-size:12px;">${escapeHtml(r.source || '—')}</span></div>
          <div><span style="color:rgba(169,180,230,.9);font-size:12px;">Sayaç:</span> <span style="font-size:12px;">${escapeHtml(String(r.match_count ?? '—'))}</span></div>
        </div>
      </div>
    `;
  }

  function bindRuleButtons() {
    const btnApprove = el('btnRuleApprove');
    const btnReject = el('btnRuleReject');
    const btnOverride = el('btnRuleOverride');
    const btnTest = el('btnRuleTest');

    btnApprove?.addEventListener('click', () => Shared.safeTry('Kural onayla', async () => {
      const rule = await getSelectedRuleFromStorage();
      if (!rule) return Shared.toast('Önce bir kural seçmelisin.');

      await Shared.sendToBackground('rule_approval', { approved: true, rule });
      Shared.toast('Kural onayı gönderildi.');
    }));

    btnReject?.addEventListener('click', () => Shared.safeTry('Kural reddet', async () => {
      const rule = await getSelectedRuleFromStorage();
      if (!rule) return Shared.toast('Önce bir kural seçmelisin.');

      await Shared.sendToBackground('rule_approval', { approved: false, rule });
      Shared.toast('Kural reddi gönderildi.');
    }));

    btnOverride?.addEventListener('click', () => Shared.safeTry('Manuel değiştir', async () => {
      const rule = await getSelectedRuleFromStorage();
      if (!rule) return Shared.toast('Önce bir kural seçmelisin.');

      const ok = confirm('Manuel değişiklik, bu kuralı anında zorunlu yapar. Devam edilsin mi?');
      if (!ok) return;

      // VARSAYIM: Kullanıcı yeni pattern girer
      const newPattern = prompt('Yeni eşleşme metnini/pattern bilgisini yaz:', String(rule.pattern || ''));
      if (newPattern === null) return;

      const patched = { ...rule, pattern: String(newPattern), match_count: 999 };
      await Shared.sendToBackground('rule_approval', { manualOverride: true, approved: true, rule: patched });
      Shared.toast('Manuel değişiklik gönderildi.');
    }));

    btnTest?.addEventListener('click', () => Shared.safeTry('Kural test', async () => {
      const rule = await getSelectedRuleFromStorage();
      if (!rule) return Shared.toast('Önce bir kural seçmelisin.');

      Shared.openModal('Kural Test', `
        <div style="display:grid;gap:10px;">
          <div style="font-size:12px;color:rgba(169,180,230,.9);">
            Bu araç “en iyi çaba” ile test eder. Pattern regex değilse sadece gösterir.
          </div>
          <div style="font-size:12px;color:rgba(231,236,255,.92);">
            Seçili pattern: <span style="font-family:ui-monospace;">${escapeHtml(String(rule.pattern || '—'))}</span>
          </div>
          <textarea id="__patpat_rule_text__" style="width:100%;min-height:160px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(18,28,58,.40);color:#e7ecff;padding:10px;font-family:ui-monospace;font-size:12px;"></textarea>
          <button id="__patpat_rule_run__" style="height:40px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:linear-gradient(135deg, rgba(110,168,255,.24), rgba(155,123,255,.16));color:#e7ecff;cursor:pointer;">
            Test Et
          </button>
          <pre id="__patpat_rule_out__" style="white-space:pre-wrap;font-size:11px;line-height:1.45;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:10px;margin:0;"></pre>
        </div>
      `);

      setTimeout(() => {
        const t = document.getElementById('__patpat_rule_text__');
        const b = document.getElementById('__patpat_rule_run__');
        const o = document.getElementById('__patpat_rule_out__');
        if (!t || !b || !o) return;

        b.addEventListener('click', () => {
          const sample = String(t.value || '');
          const pat = String(rule.pattern || '').trim();

          // VARSAYIM: pat bir regex string'i olabilir; değilse sadece arama yaparız.
          let out = '';
          try {
            // /.../i formatı gelirse onu parse etmeye çalış
            const m = pat.match(/^\/(.+)\/([gimsuy]*)$/);
            const rx = m ? new RegExp(m[1], m[2] || '') : new RegExp(pat, 'i');
            const mm = sample.match(rx);
            out = mm ? `Eşleşme bulundu:\n${mm[0]}` : 'Eşleşme bulunamadı.';
          } catch {
            out = sample.includes(pat) ? 'Basit arama: metin içeriyor.' : 'Basit arama: metin içermiyor.';
          }
          o.textContent = out;
        });
      }, 0);
    }));
  }

  async function getSelectedRuleFromStorage() {
    const instruction = (await Shared.getLocal(KEYS.instruction)) || { learning_queue: [], mandatory: [], overrides: [] };
    const qItems = Array.isArray(instruction.learning_queue) ? instruction.learning_queue : [];
    const mandatory = Array.isArray(instruction.mandatory) ? instruction.mandatory : [];
    const merged = [...qItems, ...mandatory];

    const id = String(state.selectedRuleId || '');
    return merged.find(x => String(x.id || '') === id) || null;
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
    Shared.log('Uyarı', `page-support başlatılamadı: ${Shared.formatErr(e)}`);
  });
})();