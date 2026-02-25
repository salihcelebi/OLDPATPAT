(() => {
  const KEY_TEMPLATES = 'TEMPLATES_V1';
  const KEY_RULES = 'ASSISTANT_RULES_V1';
  const LEGACY_TEMPLATES_KEY = 'patpat_complaint_message_templates';

  const DEFAULT_RULES = [
    'Tüm mesajları müşteri mesajı gibi yorumla.',
    'Tek parça metin üret; JSON/madde/başlık üretme.',
    'Fiyat ve 4 haneli servis ID gösterme.',
    'Eksik veri varsa tek soru sor.',
    'Üslup saygılı ve hafif samimi olabilir.'
  ].join('\n');

  const DEFAULTS = {
    BEKLEMEDE: 'BİZDEN {SERVIS_ADI} HİZMETİNİ ALDINIZ. BAŞLANGIÇ: {BASLANGIC}, MİKTAR: {MIKTAR}.\nSİPARİŞ LİNKİ: {SIPARIS_LINKI}. TARİH: {TARIH}. DURUM: BEKLEMEDE.\nSİPARİŞİNİZ KUYRUKTA; İŞLEME ALININCA SİZE BİLGİ VERECEĞİZ.',
    'YÜKLENİYOR': 'BİZDEN {SERVIS_ADI} HİZMETİNİ ALDINIZ. BAŞLANGIÇ: {BASLANGIC}, MİKTAR: {MIKTAR}.\nSİPARİŞ LİNKİ: {SIPARIS_LINKI}. TARİH: {TARIH}. DURUM: YÜKLENİYOR.\nSİSTEM ŞU AN TESLİMATA DEVAM EDİYOR; KISA SÜRE İÇİNDE GÜNCELLENECEKTİR.',
    TAMAMLANDI: 'BİZDEN {SERVIS_ADI} HİZMETİNİ ALDINIZ. BAŞLANGIÇ: {BASLANGIC}, MİKTAR: {MIKTAR}.\nSİPARİŞ LİNKİ: {SIPARIS_LINKI}. TARİH: {TARIH}. DURUM: TAMAMLANMIŞ.\nBİZİM TARAFTA SİPARİŞ TAMAMLANMIŞ GÖRÜNÜYOR; KONTROL EDİP BİZE DÖNEBİLİRSİNİZ.',
    'KISMEN TAMAMLANDI': 'BİZDEN {SERVIS_ADI} HİZMETİNİ ALDINIZ. BAŞLANGIÇ: {BASLANGIC}, MİKTAR: {MIKTAR}.\nSİPARİŞ LİNKİ: {SIPARIS_LINKI}. TARİH: {TARIH}. DURUM: KISMEN TAMAMLANDI.\nTESLİMATIN BİR KISMI TAMAMLANDI; KALAN KISIM İŞLENMEYE DEVAM EDİYOR.',
    'İŞLEM SIRASINDA': 'BİZDEN {SERVIS_ADI} HİZMETİNİ ALDINIZ. BAŞLANGIÇ: {BASLANGIC}, MİKTAR: {MIKTAR}.\nSİPARİŞ LİNKİ: {SIPARIS_LINKI}. TARİH: {TARIH}. DURUM: İŞLEM SIRASINDA.\nSİPARİŞİNİZ ŞU AN AKTİF OLARAK İŞLENİYOR; TAMAMLANINCA OTOMATİK GÜNCELLENECEK.',
    'İPTAL EDİLDİ': 'BİZDEN {SERVIS_ADI} HİZMETİNİ ALDINIZ. BAŞLANGIÇ: {BASLANGIC}, MİKTAR: {MIKTAR}.\nSİPARİŞ LİNKİ: {SIPARIS_LINKI}. TARİH: {TARIH}. DURUM: İPTAL EDİLDİ.\nSİPARİŞ SİSTEMDE İPTAL GÖRÜNÜYOR; DETAY İÇİN LÜTFEN BİZE BİLGİ VERİNİZ.'
  };

  const map = {
    BEKLEMEDE: 'tpl_BEKLEMEDE',
    'YÜKLENİYOR': 'tpl_YUKLENIYOR',
    TAMAMLANDI: 'tpl_TAMAMLANDI',
    'KISMEN TAMAMLANDI': 'tpl_KISMEN_TAMAMLANDI',
    'İŞLEM SIRASINDA': 'tpl_ISLEM_SIRASINDA',
    'İPTAL EDİLDİ': 'tpl_IPTAL_EDILDI'
  };

  const byId = (id) => document.getElementById(id);
  const setStatus = (m) => { byId('ayarlarStatus').textContent = m; };

  function readForm() {
    const out = {};
    Object.entries(map).forEach(([k, id]) => { out[k] = byId(id).value.trim(); });
    return out;
  }

  function writeForm(data) {
    Object.entries(map).forEach(([k, id]) => { byId(id).value = data[k] || ''; });
  }

  async function load() {
    const store = await chrome.storage.local.get([KEY_TEMPLATES, KEY_RULES, LEGACY_TEMPLATES_KEY]);
    const templates = store[KEY_TEMPLATES] || store[LEGACY_TEMPLATES_KEY] || DEFAULTS;
    const rules = store[KEY_RULES] || DEFAULT_RULES;
    writeForm({ ...DEFAULTS, ...templates });
    byId('assistantRules').value = rules;

    if (!store[KEY_TEMPLATES]) await chrome.storage.local.set({ [KEY_TEMPLATES]: { ...DEFAULTS, ...templates } });
    if (!store[KEY_RULES]) await chrome.storage.local.set({ [KEY_RULES]: rules });
  }

  async function save() {
    await chrome.storage.local.set({
      [KEY_TEMPLATES]: readForm(),
      [KEY_RULES]: byId('assistantRules').value.trim() || DEFAULT_RULES
    });
    setStatus('Şablonlar ve kurallar kaydedildi.');
  }

  async function reset() {
    writeForm(DEFAULTS);
    byId('assistantRules').value = DEFAULT_RULES;
    await chrome.storage.local.set({ [KEY_TEMPLATES]: DEFAULTS, [KEY_RULES]: DEFAULT_RULES });
    setStatus('Varsayılanlar geri yüklendi.');
  }

  byId('btnSaveTemplates').addEventListener('click', save);
  byId('btnResetTemplates').addEventListener('click', reset);
  load().then(() => setStatus('Ayarlar yüklendi.'));
})();
