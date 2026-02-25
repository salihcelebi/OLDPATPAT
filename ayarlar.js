(() => {

  const KEY = 'patpat_complaint_message_templates';
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
    const saved = (await chrome.storage.local.get(KEY))[KEY] || DEFAULTS;
    writeForm({ ...DEFAULTS, ...saved });
  }

  async function save() {
    const payload = readForm();
    await chrome.storage.local.set({ [KEY]: payload });
    setStatus('Şablonlar kaydedildi.');
  }

  async function reset() {
    writeForm(DEFAULTS);
    await chrome.storage.local.set({ [KEY]: DEFAULTS });
    setStatus('Varsayılan şablonlar yüklendi.');
  }

  byId('btnSaveTemplates').addEventListener('click', save);
  byId('btnResetTemplates').addEventListener('click', reset);
  load().then(() => setStatus('Ayarlar yüklendi.'));
=======
  async function loadAyarlar() {
    const settings = await window.PatpatStorage.readSettings();
    return settings;
  }
  window.PatpatAyarlar = { loadAyarlar };
 main
})();
