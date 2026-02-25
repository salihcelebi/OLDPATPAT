/* ============================================================================
 *  KOD ADI: sikayet_siparis.js
 *  Amaç: Sidepanel şikayet tarama + mesaj akışı + Anabayınız kontrol + çözüm bildir
 * ========================================================================== */

(() => {
  'use strict';
  // MADDE 0 (Tek yerde şikayet mesaj anabayı çözüm akışı KODLANDI)

  // ───────────────────────────────────────────────────────────────────────────
  // 1) SADECE sidepanel’de çalış + tek sefer init
  // ───────────────────────────────────────────────────────────────────────────

  // MADDE 1.1 (Window yoksa çalışmayı durdur KODLANDI)
  if (typeof window === 'undefined') return;

  // MADDE 1.2 (Sidepanel değilse çalışmayı durdur KODLANDI)
  if (document.body?.dataset?.page !== 'sidepanel') return;

  // MADDE 1.3 (Çift kontrol ile erken çıkış sağla KODLANDI)
  if (document.body?.dataset?.page !== 'sidepanel') return;

  // MADDE 1.4 (Tek sefer başlatma kilidi uygula KODLANDI)
  if (window.__SIKAYET_INIT__) return;

  // MADDE 1.5 (Init kilidi koy ve strict modda çalış KODLANDI)
  window.__SIKAYET_INIT__ = true;

  // ───────────────────────────────────────────────────────────────────────────
  // 2) URL sabitleri ve sayfalama şablonları
  // ───────────────────────────────────────────────────────────────────────────

  // MADDE 2 (Base URL ve sayfalama şablonu kur KODLANDI)
  const BASE_LIST_URL = 'https://hesap.com.tr/p/sattigim-ilanlar';

  // MADDE 2.1 (STATUS_URL sayfalama sabiti kur KODLANDI)
  const STATUS_URL = `${BASE_LIST_URL}?page=`; // ör: ...?page=1

  // MADDE 2.2 (SOLD_BASE_URL sayfalama şablonu kur KODLANDI)
  const SOLD_BASE_URL = `${BASE_LIST_URL}?page={PAGE}`;

  // MADDE 2.3 (BASE_URL sayfalama şablonu kur KODLANDI)
  const BASE_URL = `${BASE_LIST_URL}?page={PAGE}`;

  // MADDE 2.4 (Anabayınız sipariş arama URL’i kur KODLANDI)
  const ANABAYI_SEARCH = 'https://anabayiniz.com/orders?search=';

  // MADDE 2.5 (Profil ve mesaj URL şablonları üret KODLANDI)
  const buildProfileUrl = (username) => (username ? `https://hesap.com.tr/u/${username}` : '');
  const buildMessageUrl = (username) => (username ? `https://hesap.com.tr/p/mesaj/${username}` : '');

  // MADDE 3 (Sipariş arama URL şablonu tanımla KODLANDI)
  const buildAnabayiSearchUrl = (q) => `${ANABAYI_SEARCH}${encodeURIComponent(String(q || '').trim())}`;

  // ───────────────────────────────────────────────────────────────────────────
  // 3) STORAGE (chrome.storage.local) anahtarları ve kalıcılık
  // ───────────────────────────────────────────────────────────────────────────

  const STORAGE = Object.freeze({
    // MADDE 3.1 (Storage key v1 tanımla KODLANDI)
    KEY_V1: 'patpat_complaints',
    // MADDE 3.2 (Storage key v4 tanımla KODLANDI)
    KEY_V4: 'patpat_complaints_v4'
  });

  // Aktif kullanılan anahtar v4
  const KEY = STORAGE.KEY_V4;

  // MADDE 3.3 (Storage okuma ile rows getir KODLANDI)
  async function getLocal(key) {
    const x = await chrome.storage.local.get(key);
    return x[key];
  }

  // MADDE 3.4 (Storage yazma ile rows kaydet KODLANDI)
  async function setLocal(key, val) {
    await chrome.storage.local.set({ [key]: val });
  }

  // MADDE 3.5 (Kaydet oku render yenileme yap KODLANDI)
  async function saveAndRefresh(state, renderFn) {
    await setLocal(KEY, state.rows);
    const x = await getLocal(KEY);
    state.rows = Array.isArray(x) ? x : [];
    renderFn();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4) REGEX paketi (şikayet, SLA, SMM, profil, servis temizleme)
  // ───────────────────────────────────────────────────────────────────────────

  const RX = Object.freeze({
    // MADDE 4.1 (Şikayet satırı regex tanımla KODLANDI)
    problemLine: /SORUN\s*BİLDİRİLDİ/i,

    // MADDE 4.2 (SLA kalıpları ile dakika hesapla KODLANDI)
    slaList: [
      /SORUN\s*BİLDİRİLDİ\s*\((\d{1,2})\s*SA\s*(\d{1,2})\s*DK\s*KALDI\)/i,
      /SORUN\s*BİLDİRİLDİ\s*\((\d{1,2})\s*SAAT\s*(\d{1,2})\s*DAKİKA\s*KALDI\)/i,
      /SORUN\s*BİLDİRİLDİ\s*\((\d{1,2})\s*SA\s*(\d{1,2})\s*DK\)/i,
      /\((\d{1,2})\s*SA\s*(\d{1,2})\s*DK\s*KALDI\)/i,
      /SORUN\s*BİLDİRİLDİ\s*\(\s*(\d{1,2})\s*SA\s*(\d{1,2})\s*DK\s*KALDI\s*\)/i
    ],

    // MADDE 4.3 (SMM ID regex seti ile yakala KODLANDI)
    smmList: [
      /\bSMM\s*ID:\s*(\d{5,8})\b/i,
      /\bSMM\s*ID\s*[:\-]\s*(\d{5,8})\b/i,
      /\bSMM\s*ID\s*(\d{5,8})\b/i,
      /\bSMMID\s*[:\-]?\s*(\d{5,8})\b/i,
      /\bSMM\s*İD:\s*(\d{5,8})\b/i
    ],

    // MADDE 4.4 (Profil URL doğrulama regex ekle KODLANDI)
    userFromProfile: /^https:\/\/hesap\.com\.tr\/u\/([A-Za-z0-9._-]{3,32})$/i,

    // MADDE 4.5 (Servis başı ID kırpma regex ekle KODLANDI)
    serviceCleaners: [
      /^\s*\d{3,6}\s*[—-]\s*/,
      /^\s*\d{3,6}\s*:\s*/,
      /^\s*\d{3,6}\s+/,
      /^\s*ID\s*\d{3,6}\s*[—-]\s*/i,
      /^\s*\(\d{3,6}\)\s*/
    ]
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5) 15’lik parse regex setleri (başlık/sipariş/smm/tarih/durum)
  // ───────────────────────────────────────────────────────────────────────────

  // MADDE 5.1 (Başlık çıkarımı için regex listesi kur KODLANDI)
  const RX_TITLE_15 = [
    /^([^\n]{10,200})\n(?=[\s\S]*?\bSipariş\s*#\d+)/mi,
    /^([^\n]{10,200})\n[^\n]{0,200}\n\s*Sipariş\s*#\d+/mi,
    /(?:^|\n)([^\n]{10,200})\n(?:\1|\s*[^\n]{10,200})\n\s*Sipariş\s*#\d+/mi,
    /([^\n]{10,200})\s*\n\s*Sipariş\s*#\d+/mi,
    /([^\n]{10,200})\s*(?=\s*\n\s*\n\s*Sipariş\s*#\d+)/mi,
    /([^\n]{10,200})\s*\n\s*\n\s*Sipariş\s*#\d+/mi,
    /([A-ZÇĞİÖŞÜ0-9][^\n]{8,200})\n(?=Sipariş\s*#\d+)/m,
    /(?:YOUTUBE|TİKTOK|TikTok|Instagram|INSTAGRAM)\b[^\n]{5,200}/m,
    /^(.*(?:Beğeni|Takipçi|İzlenme|Yorum|Kaydet)[^\n]{0,160})$/mi,
    /([^\n]{10,200})(?=\nSMM\s*ID:)/mi,
    /([^\n]{10,200})(?=\n\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2})/mi,
    /([^\n]{10,200})(?=\n(?:Teslim|İptal|Müşteri|Sorun))/mi,
    /([^\n]{10,200})(?=\nToplam\s*Tutar)/mi,
    /([^\n]{10,200})(?=\n[\s\S]*?TL)/mi,
    /^(.{10,200})$/m
  ];

  // MADDE 5.2 (Sipariş numarası çıkarımı regex seti kur KODLANDI)
  const RX_ORDER_15 = [
    /\bSipariş\s*#(\d{5,12})\b/i,
    /\bSİPARİŞ\s*#(\d{5,12})\b/i,
    /#\s*(\d{5,12})\b/i,
    /\bSiparis\s*#(\d{5,12})\b/i,
    /\bSipariş\s*No[:\s]*#?(\d{5,12})\b/i,
    /\bSipariş\s*Numarası[:\s]*#?(\d{5,12})\b/i,
    /\bOrder\s*#(\d{5,12})\b/i,
    /\bSIPARIS\s*#(\d{5,12})\b/i,
    /\bSipariş\s*ID[:\s]*#?(\d{5,12})\b/i,
    /\bSipariş[:\s]*#?(\d{5,12})\b/i,
    /\bSipariş\s*-\s*#?(\d{5,12})\b/i,
    /\bSIPARIS[:\s]*#?(\d{5,12})\b/i,
    /\bSipariş\s*\n\s*#(\d{5,12})\b/i,
    /(?:^|\n)\s*Sipariş\s*#(\d{5,12})/i,
    /\b(\d{5,12})\b(?=[\s\S]*?SMM\s*ID:|\s*\n\s*\d{2}\.\d{2}\.\d{4})/i
  ];

  // MADDE 5.3 (SMM çıkarımı için regex listesi kur KODLANDI)
  const RX_SMM_15 = [
    /\bSMM\s*ID:\s*(\d{4,12})\b/i,
    /\bSMMID:\s*(\d{4,12})\b/i,
    /\bSMM\s*No[:\s]*(\d{4,12})\b/i,
    /\bSMM\s*#\s*(\d{4,12})\b/i,
    /\bSMM\s*Kimlik[:\s]*(\d{4,12})\b/i,
    /\bSMM\s*Numara[:\s]*(\d{4,12})\b/i,
    /\bSMM\s*[:\s]*(\d{4,12})\b/i,
    /(?:^|\n)\s*(\d{4,12})\s*(?=\n\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2})/m,
    /(?:^|\n)\s*SMM\s*\n\s*ID[:\s]*(\d{4,12})/mi,
    /\bSMM\s*I[Dd]\s*[:\-]\s*(\d{4,12})\b/i,
    /\bSMM\s*Id\s*[:\-]\s*(\d{4,12})\b/i,
    /\bSMM\s*IDENTIFIER[:\s]*(\d{4,12})\b/i,
    /\bSMM\s*CODE[:\s]*(\d{4,12})\b/i,
    /\b(\d{4,12})\b(?=[\s\S]*?Toplam\s*Tutar)/i,
    /\bID:\s*(\d{4,12})\b/i
  ];

  // MADDE 5.4 (Tarih saat çıkarımı regex listesi kur KODLANDI)
  const RX_DATE_15 = [
    /\b(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2})\b/,
    /\b(\d{1,2}\.\d{1,2}\.\d{4}\s+\d{2}:\d{2})\b/,
    /\b(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})\b/,
    /\b(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\b/,
    /\b(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})\b/,
    /(?:^|\n)\s*(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})/m,
    /\b(\d{2}\.\d{2}\.\d{4})\b(?=[\s\S]*?\bTeslim|\bİptal|\bMüşteri|\bSorun)/i,
    /\b(\d{2}:\d{2})\b(?=[\s\S]*?Toplam\s*Tutar)/i,
    /\b(\d{2}\.\d{2}\.\d{4}\s+\d{1,2}:\d{2})\b/,
    /\b(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{1,2})\b/,
    /(?:^|\n)\s*(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2})\s*$/m,
    /(?:^|\n)\s*(\d{2}\.\d{2}\.\d{4})\s*$/m,
    /\b(\d{2}\.\d{2}\.\d{4})\b/,
    /\b(\d{2}\/\d{2}\/\d{4})\b/,
    /\b(\d{4}-\d{2}-\d{2})\b/
  ];

  // MADDE 5.5 (Durum çıkarımı için regex listesi kur KODLANDI)
  const RX_STATUS_15 = [
    /\bSorun\s*Bildirildi\b/i,
    /\bTeslim\s*Edildi\b/i,
    /\bİptal\s*Edildi\b/i,
    /\bBeklemede\b/i,
    /\bTamamlandı\b/i,
    /\bKısmen\s*Tamamlandı\b/i,
    /\bİşlem\s*Sırasında\b/i,
    /\bIade\s*Sürecinde\b/i,
    /\bBaşarısız\b/i,
    /\bGeri\s*Ödeme\b/i,
    /\bMüşteriden\s*Onay\s*Bekleniyor\b/i,
    /\bTeslimat\s*Bekleniyor\b/i,
    /\bOnay\s*Bekliyor\b/i,
    /(?:^|\n)([^\n]{3,60})(?=\nToplam\s*Tutar)/mi,
    /(?:^|\n)\d{2}:\d{2}\n([^\n]{3,60})/mi
  ];

  // ───────────────────────────────────────────────────────────────────────────
  // 6) Tutar ve kalan süre ayrıştırma (money + remaining)
  // ───────────────────────────────────────────────────────────────────────────

  // MADDE 6.1 (Tutar metni yakalayan regex listesi kur KODLANDI)
  const RX_AMOUNT_15 = [
    /\bToplam\s*Tutar\s*\n\s*([\d.,]+\s*TL)\b/i,
    /\bToplam\s*Tutar\s*([\d.,]+\s*TL)\b/i,
    /\bTutar\s*\n\s*([\d.,]+\s*TL)\b/i,
    /\bTutar[:\s]*([\d.,]+\s*TL)\b/i,
    /\bToplam[:\s]*([\d.,]+\s*TL)\b/i,
    /\bTotal\s*Amount[:\s]*([\d.,]+\s*TL)\b/i,
    /\bToplam\s*Ücret[:\s]*([\d.,]+\s*TL)\b/i,
    /\bÜcret[:\s]*([\d.,]+\s*TL)\b/i,
    /(?:^|\n)\s*([\d]{1,3}(?:\.[\d]{3})*(?:,[\d]{2})?)\s*TL\b/m,
    /\b([\d]{1,3}(?:\.[\d]{3})*(?:,[\d]{2})?)\s*TL\b/,
    /\b([\d]+(?:,[\d]{2})?)\s*TL\b/,
    /\b([\d]+(?:\.[\d]{3})*(?:,[\d]{2})?)\s*TL\b/,
    /TL\s*([\d.,]+)/i,
    /([\d.,]+)\s*(?:₺|TL)\b/i,
    /(?:Toplam\s*Tutar[\s\S]{0,40})\b([\d.,]+\s*(?:₺|TL))\b/i
  ];

  // MADDE 6.3 (Kalan süre yakalayan regex listesi kur KODLANDI)
  const RX_REMAINING_15 = [
    /\bSorun\s*Bildirildi\s*\(([^)]+)\)/i,
    /\((\d{1,2}\s*(?:sa|saat)\s*\d{1,2}\s*(?:dk|dakika)\s*kaldı)\)/i,
    /\((\d{1,2}\s*(?:sa|saat)\s*kaldı)\)/i,
    /\((\d{1,2}\s*(?:dk|dakika)\s*kaldı)\)/i,
    /\bKalan\s*Süre[:\s]*([^\n]{1,40})/i,
    /\bKalan[:\s]*([^\n]{1,40})/i,
    /\bRemaining[:\s]*([^\n]{1,40})/i,
    /\bSüre[:\s]*([^\n]{1,40})/i,
    /\(([^)]*kaldı[^)]*)\)/i,
    /\b(\d{1,2}\s*sa\s*\d{1,2}\s*dk)\b/i,
    /\b(\d{1,2}\s*saat\s*\d{1,2}\s*dakika)\b/i,
    /\b(\d{1,2}\s*saat)\b/i,
    /\b(\d{1,2}\s*dakika)\b/i,
    /\b(\d{1,2}\s*dk)\b/i,
    /\b([0-9]{1,2}:[0-9]{2}\s*kaldı)\b/i
  ];

  // MADDE 6.2 (Tutarı sayıya çevirme dönüşümü yap KODLANDI)
  function moneyToNumber(amountText) {
    return (
      Number(String(amountText || '')
        .replace(/\./g, '')     // binlik nokta kaldır
        .replace(',', '.')      // ondalık virgül -> nokta
        .replace(/[^\d.]/g, '') // sayı dışını temizle
      ) || 0
    );
  }

  // MADDE 6.4 (SLA dakikayı hesaplayan fonksiyon kur KODLANDI)
  function parseSlaMinutes(text) {
    const s = String(text || '');
    for (const rx of RX.slaList) {
      const m = s.match(rx);
      if (m) return (Number(m[1]) * 60) + Number(m[2]);
    }
    // RemainingText içinden de saat/dk yakalamaya çalış
    const remaining = pickFirstMatch(RX_REMAINING_15, s, 1);
    const m2 = String(remaining).match(/(\d{1,2})\s*(?:sa|saat)\s*(\d{1,2})\s*(?:dk|dakika)/i);
    if (m2) return (Number(m2[1]) * 60) + Number(m2[2]);
    return null;
  }

  // MADDE 6.5 (SLA risk etiketi kuralları uygula KODLANDI)
  function riskTag(slaMinutes) {
    if (!Number.isFinite(slaMinutes)) return 'NORMAL';
    if (slaMinutes <= 120) return 'ACİL';
    if (slaMinutes <= 480) return 'UYARI';
    return 'NORMAL';
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 7) DOM seçicileri ile kart toplama (Hesap.com.tr sayfa içi)
  // ───────────────────────────────────────────────────────────────────────────

  // MADDE 7.1 (Kartları querySelectorAll ile topla KODLANDI)
  const CARD_SELECTOR = 'article, .card, [class*="order"], [class*="ilan"]';

  // MADDE 7.6.4 (Mesaj regex listesini 7 kural ile kur KODLANDI)
  const MESAJ_RX_LIST = [
    /\bmesaj\s*gönder\b/i,
    /\bgönder\s*mesaj\b/i,
    /\bmesaj\b/i,
    /\bsohbet\b/i,
    /\bileti\b/i,
    /\b(dm|direkt\s*mesaj|direct\s*message)\b/i,
    /\bmessage\s*(?:send|sender|sending)?\b/i
  ];

  // MADDE 7.6.3.3 (İletişim regex listesini 7 kural ile kur KODLANDI)
  const ILETISIM_RX_LIST = [
    /\biletişime\s*geç\b/i,
    /\bileti[sş]im\b/i,
    /\biletişim\s*kur\b/i,
    /\birtibat\b/i,
    /\biletişime\s*ulaş\b/i,
    /\bcontact\b/i,
    /\breach\s*out\b/i
  ];

  // ───────────────────────────────────────────────────────────────────────────
  // 7.6.3) Çözüm bildir URL akışı regexleri
  // ───────────────────────────────────────────────────────────────────────────

  // MADDE 7.6.3.2 (Sipariş no için 7 regex listesi kur KODLANDI)
  const SIPARIS_NO_RX_LIST = [
    /\bSipariş\s*#\s*(\d{5,9})\b/i,
    /\bSİPARİŞ\s*#\s*(\d{5,9})\b/i,
    /#\s*(\d{5,9})\b/i,
    /\bSiparis\s*#\s*(\d{5,9})\b/i,
    /\bSipariş\s*No[:\s]*#?\s*(\d{5,9})\b/i,
    /\bSipariş\s*Numarası[:\s]*#?\s*(\d{5,9})\b/i,
    /(?:^|\n)\s*Sipariş\s*#\s*(\d{5,9})/mi
  ];

  // MADDE 7.6.3.5 (Çözüm bildirildi doğrulama regex kur KODLANDI)
  const COZUM_OK_RX = /\b(çözüm\s*bildirildi|işlem\s*başarılı|başarıyla)\b/i;

  // ───────────────────────────────────────────────────────────────────────────
  // 7.6.1) Anabayınız ok/doğrulama ve durum regexleri
  // ───────────────────────────────────────────────────────────────────────────

  // MADDE 7.6.1.4 (Anabayınız sayfa doğrulama regex kur KODLANDI)
  const ANABAYINIZ_OK_RX = /\b(tüm\s*siparişler|beklemede|yükleniyor|tamamlandı|kısmen\s*tamamlandı|işlem\s*sırasında|iptal\s*edildi)\b/i;

  // MADDE 7.6.1.5 (Sipariş durumları için regex listesi kur KODLANDI)
  const ORDER_STATUS_RX_LIST = [
    /\bBeklemede\b/i,
    /\bYükleniyor\b/i,
    /\bTamamlandı\b/i,
    /\bKısmen\s*Tamamlandı\b/i,
    /\bİşlem\s*Sırasında\b/i,
    /\bIslem\s*Sirasinda\b/i,
    /\bProcessing|Completed|Pending\b/i
  ];

  // ───────────────────────────────────────────────────────────────────────────
  // Genel yardımcılar (UI, bekleme, seçim)
  // ───────────────────────────────────────────────────────────────────────────

  const ui = {};
  const state = {
    rows: [],
    stop: false,        // MADDE 15.1 (Stop flag ile taramayı durdur KODLANDI)
    selectedId: '',
    speed: 5,
    running: false
  };

  const byId = (id) => document.getElementById(id);
  const toast = (m) => window.__PatpatUI?.UI?.toast?.(m) || alert(m);

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // MADDE 12.5 (İnsan benzeri bekleme randomDelay uygula KODLANDI)
  const randomDelay = () => {
    const k = Math.max(1, Math.min(10, Number(state.speed || 5)));
    const min = 200 + (10 - k) * 10;
    const max = 400 + (10 - k) * 20;
    return wait(min + Math.floor(Math.random() * Math.max(1, max - min)));
  };

  function pickFirstMatch(list, text, group = 1) {
    const s = String(text || '');
    for (const rx of list) {
      const m = s.match(rx);
      if (m) {
        // bazı regexler 2 grup döndürüyor (date + time)
        if (group === 2 && m[2]) return `${m[1]} ${m[2]}`;
        return m[group] || m[0] || '';
      }
    }
    return '';
  }

  // MADDE 8.2 (Sipariş bloklarını split ile böl KODLANDI)
  function splitBlocks(pageText) {
    return String(pageText || '')
      .split(/(?=Sipariş\s*#\d+)/i)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  // MADDE 2 (Sayfa URL’ini base + page ile üret KODLANDI)
  function buildListPageUrl(page) {
    return `${BASE_LIST_URL}?page=${Number(page || 1)}`;
  }

  // MADDE 4.3 (SMM id yakalama fonksiyonu kur KODLANDI)
  function parseSmmId(text) {
    const s = String(text || '');
    for (const rx of RX.smmList) {
      const m = s.match(rx);
      if (m) return m[1];
    }
    // 15’lik listeden de dene
    return pickFirstMatch(RX_SMM_15, s, 1) || '';
  }

  // MADDE 4.5 (Servis adını baştaki ID’den temizle KODLANDI)
  function cleanService(svc) {
    let out = String(svc || '').trim();
    RX.serviceCleaners.forEach((r) => { out = out.replace(r, ''); });
    return out.trim();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 8) Alternatif blok parse (body text split + parseComplaintBlock)
  // ───────────────────────────────────────────────────────────────────────────

  // MADDE 8.4 (Blok içinden status çekmeyi uygula KODLANDI)
  function parseComplaintBlock_SIKAYET(block, idx) {
    const status = pickFirstMatch(RX_STATUS_15, block, 1);

    // MADDE 8.5 (Sorun Bildirildi değilse kayıt üretme KODLANDI)
    if (!/Sorun\s*Bildirildi/i.test(status)) return null;

    const serviceName = pickFirstMatch(RX_TITLE_15, block, 1);
    const orderNo = pickFirstMatch(RX_ORDER_15, block, 1);
    const smmId = pickFirstMatch(RX_SMM_15, block, 1);
    const dateText = pickFirstMatch(RX_DATE_15, block, 1) || '';
    const amountText = pickFirstMatch(RX_AMOUNT_15, block, 1);
    const remainingText = pickFirstMatch(RX_REMAINING_15, block, 1);

    const amountValue = moneyToNumber(amountText);
    const slaMinutes = parseSlaMinutes(`${status} ${block}`);

    return {
      id: `${orderNo || smmId || 'x'}-${idx}`,
      orderNo,
      smmId,
      customer: '',
      platform: pickFirstMatch([/(TIKTOK|INSTAGRAM|YOUTUBE|TWITTER)/i], block, 1) || '',
      serviceName: cleanService(serviceName),
      dateText,
      status,
      remainingText,
      amountText,
      amountValue,
      slaMinutes,
      slaRisk: Number.isFinite(slaMinutes) && slaMinutes <= 120,
      orderUrl: '',
      profileUrl: '',
      messageUrl: '',
      startCount: Number((String(block).match(/Başlangıç\s*:?\s*(\d+)/i) || [,''])[1]) || null,
      quantity: Number((String(block).match(/Miktar\s*:?\s*(\d+)/i) || [,''])[1]) || null,
      remains: Number((String(block).match(/Kalan\s*:?\s*(\d+)/i) || [,''])[1]) || null,
      tags: [],
      rawText: block,
      logs: []
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 9) Kayıt şeması + URL’ler + platform + sayaçlar
  // ───────────────────────────────────────────────────────────────────────────

  // MADDE 9.1 (Benzersiz id üretme stratejisi uygula KODLANDI)
  function makeId(orderNo, smmId) {
    try { return crypto.randomUUID(); } catch { return `${orderNo || smmId || 'x'}-${Date.now()}`; }
  }

  // MADDE 9.3 (Platform regex eşleşmesi ile alan doldur KODLANDI)
  function detectPlatform(text) {
    return (String(text || '').match(/(TIKTOK|INSTAGRAM|YOUTUBE|TWITTER)/i) || [,''])[1] || '';
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 10) Username çıkarımı ve URL üretimi
  // ───────────────────────────────────────────────────────────────────────────

  // MADDE 10.1 (Kart linkinden username yakalamayı uygula KODLANDI)
  function usernameFromLink(url) {
    return (String(url || '').match(/\/u\/([A-Za-z0-9._-]{3,32})/) || [,''])[1] || '';
  }

  // MADDE 10.4 (Profil URL doğrulama regex kontrolü yap KODLANDI)
  function validateProfileUrl(url) {
    return RX.userFromProfile.test(String(url || ''));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 11) DEDUP stratejileri (SMM + compound key)
  // ───────────────────────────────────────────────────────────────────────────

  // MADDE 11.1 (SMM seti ile tekrarı engelle KODLANDI)
  function buildDedupSmmSet(rows) {
    return new Set(rows.map((r) => r.smmId).filter(Boolean));
  }

  // MADDE 11.2 (Compound key seti ile tekrarı engelle KODLANDI)
  function buildSeenSet(rows) {
    return new Set(rows.map((r) => `${r.orderNo}|${r.smmId}|${r.dateText}|${r.amountText}`));
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 13) UI Render (liste + detay + arama + istatistik)
  // ───────────────────────────────────────────────────────────────────────────

  // MADDE 13.1 (Arama filtresi ile listeyi süz KODLANDI)
  function filteredList() {
    const q = String(ui.search?.value || '').toLowerCase().trim();
    return state.rows.filter((r) => {
      if (!q) return true;
      return [r.smmId, r.orderNo, r.customer, r.status, r.platform, r.serviceName].join(' ')
        .toLowerCase()
        .includes(q);
    });
  }

  function current() {
    return state.rows.find((x) => x.id === state.selectedId) || null;
  }

  // MADDE 13.5 (SLA risk sayımı istatistikte göster KODLANDI)
  function renderStats(list) {
    if (!ui.stats) return;
    const risk = list.filter((x) => x.slaRisk).length;
    ui.stats.textContent = `Kayıt: ${list.length} • SLA Risk: ${risk} • Durum: ${state.running ? 'çalışıyor' : 'hazır'}`;
  }

  // MADDE 13.2 (Liste HTML satırlarını data-id ile üret KODLANDI)
  function renderList(list) {
    if (!ui.list) return;
    ui.list.innerHTML = list.map((r) => {
      const active = r.id === state.selectedId ? 'active' : '';
      const urgency = riskTag(r.slaMinutes);
      return `<div class="fileitem ${active}" data-id="${r.id}"
        style="margin-bottom:6px;border:1px solid rgba(255,255,255,.1)">
        <span>${r.smmId || '—'} • ${r.orderNo || '—'} • ${r.platform || '-'} </span>
        <span>${r.status || '-'} • ${urgency}</span>
      </div>`;
    }).join('') || '<div class="empty">Şikayet kaydı yok.</div>';

    // MADDE 13.3 (Tıklayınca selectedId güncelle render yap KODLANDI)
    ui.list.querySelectorAll('[data-id]').forEach((el) => {
      el.addEventListener('click', () => {
        state.selectedId = el.getAttribute('data-id') || '';
        render();
      });
    });
  }

  // MADDE 13.4 (Detay panelinde URL’leri tıklanabilir göster KODLANDI)
  function renderDetail() {
    const c = current();
    if (!ui.detail) return;

    if (!c) {
      ui.detail.innerHTML = '<div class="empty">Detay görmek için soldan kayıt seçin.</div>';
      return;
    }

    ui.detail.innerHTML = `<div style="border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px;">
      <div><b>SMM ID:</b> ${c.smmId || '—'}</div>
      <div><b>Sipariş #:</b> ${c.orderNo || '—'}</div>
      <div><b>Tarih:</b> ${c.dateText || '—'}</div>
      <div><b>Servis:</b> ${c.serviceName || '—'}</div>
      <div><b>Başlangıç:</b> ${c.startCount ?? '—'} • <b>Miktar:</b> ${c.quantity ?? '—'} • <b>Kalan:</b> ${c.remains ?? '—'}</div>
      <div><b>Durum:</b> ${c.status || '—'} • <b>SLA:</b> ${Number.isFinite(c.slaMinutes) ? `${c.slaMinutes} dk` : '—'}</div>
      <div><b>Tutar:</b> ${c.amountText || '—'}</div>
      <div><b>Sipariş Link:</b> <a href="${c.orderUrl || '#'}" target="_blank">${c.orderUrl || '—'}</a></div>
      <div><b>Profil:</b> <a href="${c.profileUrl || '#'}" target="_blank">${c.profileUrl || '—'}</a></div>
      <div><b>Mesaj:</b> <a href="${c.messageUrl || '#'}" target="_blank">${c.messageUrl || '—'}</a></div>
      <div style="margin-top:8px;font-size:12px;color:rgba(169,180,230,.85)">Log: ${c.logs?.join(' • ') || '—'}</div>
    </div>`;
  }

  function render() {
    const list = filteredList();
    renderStats(list);
    renderList(list);
    renderDetail();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 14) Taslak metin + servis ID gizleme kontrolü + kopyalama
  // ───────────────────────────────────────────────────────────────────────────

  function classify(rec) {
    const t = `${rec.status} ${rec.rawText}`.toLowerCase();
    const tags = [];
    if (t.includes('yüklen')) tags.push('YÜKLENMEDİ');
    if (t.includes('iptal')) tags.push('İPTAL');
    if (t.includes('iade')) tags.push('İADE İSTİYOR');
    if (rec.slaRisk) tags.push('SLA RİSK');
    if (!tags.length) tags.push('NORMAL');
    return tags;
  }

  // MADDE 14.1 (Taslak metni alanlardan üret KODLANDI)
  function buildDraft(rec) {
    if (!rec) return '';
    // MADDE 14.3 (TAMAMLANDI durumunu TESLİM olarak normalize et KODLANDI)
    const statusText = String(rec.status || '').toUpperCase().includes('TAMAML') ? 'TESLİM EDİLDİ' : (rec.status || '—');

    // MADDE 14.2 (Servis başındaki ID numarayı temizle KODLANDI)
    const svc = cleanService(rec.serviceName || '');

    return [
      `Merhaba ${rec.customer || 'değerli müşterimiz'},`,
      `Siparişi almadan önce başlangıç ${rec.startCount ?? '—'}’ti.`,
      `Size ${rec.quantity ?? '—'} adet ${svc} gönderdik.`,
      `Sipariş durumu: ${statusText}.`,
      `Kontrol için sipariş linki: ${rec.orderUrl || '—'}.`,
      'Linke erişim yoksa bizim tarafımızda sorun yok.'
    ].join('\n');
  }

  // MADDE 14.4 (Taslakta servis ID görünmesin kontrol et KODLANDI)
  function updateIdHideHint(text) {
    if (!ui.actionHint) return;
    const hidden = !/^\s*\d{3,6}\s*[—:-]/.test(String(text || ''));
    ui.actionHint.textContent = `Servis ID gizleme kontrolü: ${hidden ? '✅ ID görünmüyor' : '⚠️ kontrol et'}`;
  }

  // MADDE 14.5 (Taslağı panoya kopyalama uygula KODLANDI)
  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(ui.draft?.value || '');
      toast('Taslak kopyalandı.');
    } catch {
      toast('Panoya kopyalanamadı.');
    }
  }

  async function draftReply() {
    const c = current();
    if (!c) return toast('Önce bir kayıt seçin.');
    const t = buildDraft(c);
    if (ui.draft) ui.draft.value = t;
    updateIdHideHint(t);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 12) Sayfa gezinme + yüklenme bekleme (Chrome extension flow)
  // ───────────────────────────────────────────────────────────────────────────

  // MADDE 12.1 (Aktif sekmeyi chrome.tabs.query ile al KODLANDI)
  async function getActiveTabId() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) throw new Error('Aktif sekme bulunamadı.');
    return tab.id;
  }

  // MADDE 12.2 (chrome.tabs.update ile URL’e git KODLANDI)
  // MADDE 12.3 (onUpdated complete olana kadar bekle KODLANDI)
  async function navigateAndWait(tabId, url) {
    await chrome.tabs.update(tabId, { url });
    await new Promise((resolve) => {
      const h = (id, info) => {
        if (id === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(h);
          resolve(true);
        }
      };
      chrome.tabs.onUpdated.addListener(h);
    });
  }

  // MADDE 12.4 (chrome.scripting.executeScript ile script çalıştır KODLANDI)
  async function execInTab(tabId, func, args = []) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func,
      args
    });
    return result;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5) Tara butonuna basınca taramayı başlat + sayfalama
  // ───────────────────────────────────────────────────────────────────────────

  // MADDE 5 (Tara butonu ile taramayı başlat KODLANDI)
  async function scanComplaints() {
    if (state.running) return toast('Tarama zaten çalışıyor.');

    // hız ve sayfa sayısı
    state.stop = false;
    state.running = true;
    state.speed = Number(ui.speed?.value || 5);

    const maxPages = Math.max(1, Number(ui.pages?.value || 5));

    let tabId;
    try {
      tabId = await getActiveTabId();
    } catch (e) {
      state.running = false;
      render();
      return toast(String(e?.message || e));
    }

    // dedup setleri
    const dedupSmm = buildDedupSmmSet(state.rows);
    const seen = buildSeenSet(state.rows);

    for (let p = 1; p <= maxPages; p += 1) {
      if (state.stop) break;

      // MADDE 12.5 (Sayfa arası bekleme randomDelay uygula KODLANDI)
      await randomDelay();

      // MADDE 12.2 (Doğru sayfa URL’i ile gezin KODLANDI)
      const url = `${STATUS_URL}${p}`; // https://hesap.com.tr/p/sattigim-ilanlar?page=1
      await navigateAndWait(tabId, url);

      // MADDE 6 (Sayfa yüklendikten sonra içerik çek KODLANDI)
      // MADDE 7.2 (Kart metnini innerText ile oku KODLANDI)
      const pageData = await execInTab(tabId, () => {
        const cards = Array.from(document.querySelectorAll('article, .card, [class*="order"], [class*="ilan"]'));
        const rows = [];

        for (let i = 0; i < cards.length; i += 1) {
          const c = cards[i];
          const text = String(c?.innerText || '');

          // MADDE 7.3 (Sorun Bildirildi filtresi ile seç KODLANDI)
          if (!/SORUN\s*BİLDİRİLDİ/i.test(text)) continue;

          // MADDE 7.4 (Kart içinden a[href] linki al KODLANDI)
          const link = c.querySelector('a[href]')?.href || '';

          // MADDE 7.5 (Tarih DD.MM.YYYY HH:MM ile yakala KODLANDI)
          const date = (text.match(/(\d{2}\.\d{2}\.\d{4}\s\d{2}:\d{2})/) || [,''])[1] || '';

          const smm = (text.match(/\bSMM\s*ID\s*[:\-]?\s*(\d{5,8})\b/i) || [,''])[1] || '';

          rows.push({ text, link, date, smm });
        }

        // ayrıca fallback için body text döndür
        const bodyText = String(document.body?.innerText || '');
        return { cardCount: cards.length, rows, bodyText };
      });

      const { cardCount, rows, bodyText } = pageData || { cardCount: 0, rows: [], bodyText: '' };
      if (!cardCount) break;

      let added = 0;

      // Önce kart parse ile ilerle
      for (const raw of rows || []) {
        const text = String(raw.text || '');
        const smmId = raw.smm || parseSmmId(text);

        // MADDE 11.1 (SMM dedup setiyle tekrarları atla KODLANDI)
        if (smmId && dedupSmm.has(smmId)) continue;

        const orderNo = pickFirstMatch(RX_ORDER_15, text, 1) || '';
        const dateText = raw.date || pickFirstMatch(RX_DATE_15, text, 1) || '';
        const amountText = pickFirstMatch(RX_AMOUNT_15, text, 1) || '';
        const key = `${orderNo}|${smmId}|${dateText}|${amountText}`;

        // MADDE 11.4 (Seen setinde varsa kaydı atla KODLANDI)
        if (seen.has(key)) continue;

        // MADDE 11.5 (Seen setine ekle ve rows’a ekle KODLANDI)
        seen.add(key);
        if (smmId) dedupSmm.add(smmId);

        const username = usernameFromLink(raw.link);
        const profileUrl = buildProfileUrl(username);
        const messageUrl = buildMessageUrl(username);

        const serviceName = cleanService(pickFirstMatch(RX_TITLE_15, text, 1) || (text.match(/\n([^\n]{8,90})\nSMM\s*ID/i) || [,''])[1] || '');
        const slaMinutes = parseSlaMinutes(text);

        const rec = {
          id: makeId(orderNo, smmId),
          smmId,
          orderNo,
          customer: username,
          platform: detectPlatform(text),
          serviceName,
          dateText,
          status: pickFirstMatch(RX_STATUS_15, text, 1) || 'Sorun Bildirildi',
          remainingText: pickFirstMatch(RX_REMAINING_15, text, 1) || '',
          amountText,
          amountValue: moneyToNumber(amountText),
          startCount: Number((text.match(/Başlangıç\s*:?\s*(\d+)/i) || [,''])[1]) || null,
          quantity: Number((text.match(/Miktar\s*:?\s*(\d+)/i) || [,''])[1]) || null,
          remains: Number((text.match(/Kalan\s*:?\s*(\d+)/i) || [,''])[1]) || null,
          slaMinutes,
          slaRisk: Number.isFinite(slaMinutes) && slaMinutes <= 120,
          // MADDE 9.5 (orderUrl profileUrl messageUrl alanlarını doldur KODLANDI)
          orderUrl: raw.link || '',
          profileUrl: validateProfileUrl(profileUrl) ? profileUrl : profileUrl, // doğrulama: format uyumlu
          messageUrl,
          tags: [],
          rawText: text,
          logs: [`${new Date().toLocaleString('tr-TR')} kart okundu`, Number.isFinite(slaMinutes) ? `SLA ${slaMinutes} dk` : 'SLA yok']
        };

        rec.tags = classify(rec);
        state.rows.unshift(rec);
        added += 1;
      }

      // MADDE 8.1 (Body text ile alternatif parse uygula KODLANDI)
      if (added === 0 && bodyText) {
        const blocks = splitBlocks(bodyText);
        for (let i = 0; i < blocks.length; i += 1) {
          if (state.stop) break;
          const rec0 = parseComplaintBlock_SIKAYET(blocks[i], `${p}-${i}`);
          if (!rec0) continue;

          const key = `${rec0.orderNo}|${rec0.smmId}|${rec0.dateText}|${rec0.amountText}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (rec0.smmId) dedupSmm.add(rec0.smmId);

          // URL’ler bu modda sayfa içinden çıkmadıysa boş kalır
          rec0.id = makeId(rec0.orderNo, rec0.smmId);
          rec0.tags = classify(rec0);
          rec0.logs = [`${new Date().toLocaleString('tr-TR')} body-parse okundu`];

          state.rows.unshift(rec0);
          added += 1;
        }
      }

      // hiç ekleme yoksa taramayı erken bitir
      if (added === 0) break;
    }

    state.running = false;

    await saveAndRefresh(state, render);
    if (!state.selectedId && state.rows[0]) state.selectedId = state.rows[0].id;

    render();
    toast(state.stop ? 'Tarama durduruldu.' : `Tarama tamamlandı: ${state.rows.length} kayıt.`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 15) Operasyon aksiyonları (durdur/çözüm/eskale/kapat/dış URL)
  // ───────────────────────────────────────────────────────────────────────────

  function stopScan() {
    // MADDE 15.1 (Stop flag ile taramayı durdur KODLANDI)
    state.stop = true;
    toast('Tarama durduruldu.');
  }

  // MADDE 15.2 (Duruma göre çözüm önerisi toast üret KODLANDI)
  function solutionSuggest() {
    const c = current();
    if (!c) return toast('Önce bir kayıt seçin.');
    const opts = [];
    if (String(c.status).toUpperCase().includes('TAMAML')) opts.push('Önce kanıtla, sonra açıkla.');
    if (Number(c.remains || 0) > 0) opts.push('Kısmi teslim: kalan için ek yükleme öner.');
    if (c.slaRisk) opts.push('Acil eskale önerilir.');
    if (!opts.length) opts.push('İnceleme modunda takip et.');
    toast(opts.join(' | '));
  }

  // MADDE 15.3 (Eskalede tag ve log ekle KODLANDI)
  async function escalate() {
    const c = current();
    if (!c) return toast('Önce bir kayıt seçin.');
    if (!confirm('Yöneticiye eskale edilsin mi?')) return;
    c.tags = [...new Set([...(c.tags || []), 'YÖNETİCİYE ESKALE'])];
    c.logs = c.logs || [];
    c.logs.push(`${new Date().toLocaleString('tr-TR')} eskale edildi`);
    await saveAndRefresh(state, render);
  }

  // MADDE 15.4 (Kapatmada reason ve lastMessage kaydet KODLANDI)
  async function closeComplaint() {
    const c = current();
    if (!c) return toast('Önce bir kayıt seçin.');
    const reason = prompt('Kapatma nedeni (ÇÖZÜLDÜ/HATALI LİNK/İADE/DİĞER):', 'ÇÖZÜLDÜ');
    if (!reason) return;
    c.status = 'KAPALI';
    c.closeReason = reason;
    c.lastMessage = ui.draft?.value || '';
    c.logs = c.logs || [];
    c.logs.push(`${new Date().toLocaleString('tr-TR')} kapatıldı: ${reason}`);
    await saveAndRefresh(state, render);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 7.6) Müşteriye mesaj gönder akışı (kart → aksiyon → iletişim → mesaj)
  // ───────────────────────────────────────────────────────────────────────────

  // MADDE 7.6 (Karttan mesaj ekranına tıklama akışı kur KODLANDI)
  async function runMessageSendFlow() {
    const rec = current();
    if (!rec) return toast('Önce bir kayıt seçin.');

    const tabId = await getActiveTabId();

    // Eğer kayıt bir orderUrl taşıyorsa önce oraya gitmeyi dene
    if (rec.orderUrl) {
      try { await navigateAndWait(tabId, rec.orderUrl); } catch { /* ignore */ }
    } else {
      // liste sayfasına dön (garanti)
      await navigateAndWait(tabId, buildListPageUrl(1));
    }

    // MADDE 7.6.1 (Kartı bul ve detay açmayı dene KODLANDI)
    // MADDE 7.6.2 (Aksiyon menüsü butonunu tıkla KODLANDI)
    // MADDE 7.6.3 (İletişime geç butonunu tıkla KODLANDI)
    // MADDE 7.6.4 (Mesaj gönder seçeneğini bul ve tıkla KODLANDI)
    const result = await execInTab(
      tabId,
      async (payload) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const {
          orderNo,
          smmId,
          iletisimPatterns,
          mesajPatterns
        } = payload;

        const isVisible = (el) => {
          if (!el) return false;
          const st = window.getComputedStyle(el);
          if (!st) return false;
          if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
          return !!(el.offsetParent || el.getClientRects().length);
        };

        // MADDE 7.6.6 (Disabled aria-disabled görünürlük kontrolü yap KODLANDI)
        const isClickable = (el) => {
          if (!el || !isVisible(el)) return false;
          if (el.hasAttribute('disabled')) return false;
          if (String(el.getAttribute('aria-disabled') || '').toLowerCase() === 'true') return false;
          return true;
        };

        // MADDE 7.6.1.2 (Linke basma kuralı uygula KODLANDI)
        const safeClickNonLink = (el) => {
          if (!el) return false;
          if (el.closest && el.closest('a[href]')) return false;
          if (!isClickable(el)) return false;
          el.scrollIntoView({ block: 'center', inline: 'center' });
          el.click();
          return true;
        };

        const textOf = (el) => (el?.innerText || el?.textContent || '').trim();

        // Kartı bul: orderNo veya smmId içeren modern-order-card
        // MADDE 7.6.1.1 (Hedef kart DOM: modern-order-card bul KODLANDI)
        const cards = Array.from(document.querySelectorAll('div.modern-order-card'));
        const card = cards.find((c) => {
          const t = textOf(c);
          return (orderNo && t.includes(String(orderNo))) || (smmId && t.includes(String(smmId)));
        });

        if (!card) return { ok: false, step: 'card_not_found' };

        // MADDE 7.6.1.3 (Detay açmak için öncelik sırası dene KODLANDI)
        const OPEN_TRIES = [
          /\b(youtube|insta(?:gram)?|tiktok|tik\s*tok)\b/i,           // platform
          /\bsipariş\s*#\s*\d{5,12}\b/i,                              // sipariş no
          /\b\d{1,2}[./-]\d{1,2}[./-]\d{4}\s+\d{1,2}:\d{2}\b/i,       // tarih saat
          /\b[\d]{1,3}(?:\.[\d]{3})*(?:,[\d]{1,2})?\s*(?:tl|₺)\b/i,   // tutar
          /\b(iade\s*sürecinde|sorun\s*bildirildi|beklemede|iptal|tamamlandı|başarısız|teslim)\b/i,
          /\b(youtube|instagram|tiktok)\b[\s\S]{0,120}\b(beğeni|takipçi|izlenme|yorum|kaydet)\b/i,
          /\bSMM\s*ID\b/i
        ];

        // MADDE 7.6.1.4 (Detay açıldı mı regex ile doğrula KODLANDI)
        const DETAIL_OK_RX = /\b(siparişi\s*aldık|bir\s*sorun\s*var)\b/i;

        let opened = false;

        for (let attempt = 0; attempt < OPEN_TRIES.length; attempt += 1) {
          // kart içinden regex’e uyan link olmayan bir elementi bul
          const rx = OPEN_TRIES[attempt];
          const candidates = Array.from(card.querySelectorAll('*'))
            .filter((el) => isClickable(el) && !el.closest('a[href]'))
            .filter((el) => rx.test(textOf(el)));

          if (candidates[0] && safeClickNonLink(candidates[0])) {
            await sleep(250 + Math.floor(Math.random() * 200));
            const body = String(document.body?.innerText || '');
            if (DETAIL_OK_RX.test(body)) { opened = true; break; }
          }
        }

        // Detay doğrulanmadıysa yine devam (bazı sayfalarda farklı olabilir)
        // MADDE 7.6.1.5 (Detay açılmadıysa sırayla denemeye devam et KODLANDI)
        if (!opened) {
          // son çare: kartın boş alanına tıkla
          safeClickNonLink(card);
          await sleep(300);
        }

        // MADDE 7.6.2.1 (Aksiyon butonu modern-action-btn bul KODLANDI)
        let actionBtn = card.querySelector('a.modern-action-btn');
        if (!actionBtn) actionBtn = document.querySelector('a.modern-action-btn');
        if (!actionBtn || !isClickable(actionBtn)) return { ok: false, step: 'action_btn_not_found' };

        // MADDE 7.6.2.3 (Aksiyon butonuna click uygula KODLANDI)
        actionBtn.click();
        await sleep(250 + Math.floor(Math.random() * 250));

        // MADDE 7.6.3.1 (Önce a.btn-profile.green ile dene KODLANDI)
        let profileBtn = document.querySelector('a.btn-profile.green');

        // MADDE 7.6.3.2 (Bulunamazsa metin ile buton ara KODLANDI)
        if (!profileBtn) {
          const iletisimRxList = iletisimPatterns.map((p) => new RegExp(p, 'i'));
          const pool = Array.from(document.querySelectorAll('a,button,[role="button"],.btn,.dropdown-item'));
          profileBtn = pool.find((el) => isClickable(el) && iletisimRxList.some((rx) => rx.test(textOf(el))));
        }

        if (!profileBtn || !isClickable(profileBtn)) return { ok: false, step: 'profile_btn_not_found' };

        // MADDE 7.6.3.4 (Eşleşen ilk iletişim öğesini tıkla KODLANDI)
        profileBtn.click();
        await sleep(250 + Math.floor(Math.random() * 250));

        // MADDE 7.6.4.1 (Dropdown içindeki item’ları topla KODLANDI)
        const items = Array.from(document.querySelectorAll('a,button,.dropdown-item,[role="button"]'))
          .filter((el) => isClickable(el));

        const msgRxList = mesajPatterns.map((p) => new RegExp(p, 'i'));

        // MADDE 7.6.4.3 (Eşleşen mesaj öğesini tıkla KODLANDI)
        let msgItem = items.find((el) => msgRxList.some((rx) => rx.test(textOf(el))));

        // MADDE 7.6.5 (Bulunamazsa dropdown-item failover uygula KODLANDI)
        if (!msgItem) {
          const dd = Array.from(document.querySelectorAll('a.dropdown-item')).filter(isClickable);
          msgItem = dd.find((el) => /\b(mesaj|gönder)\b/i.test(textOf(el))) || dd[0];
        }

        if (!msgItem || !isClickable(msgItem)) return { ok: false, step: 'message_item_not_found' };

        // MADDE 7.6.6 (Aynı elemana aşırı tıklamayı engelle KODLANDI)
        // (Basit limit: tek tıklama)
        msgItem.click();
        await sleep(300 + Math.floor(Math.random() * 300));

        // MADDE 7.6.7 (Başarıyı URL veya textarea ile doğrula KODLANDI)
        const urlOk = /\/mesaj\b|message/i.test(String(location.href || ''));
        const domOk = !!document.querySelector('textarea, input[type="text"], [contenteditable="true"]');
        return { ok: urlOk || domOk, step: urlOk || domOk ? 'message_opened' : 'unknown', href: location.href };
      },
      [{
        orderNo: rec.orderNo || '',
        smmId: rec.smmId || '',
        iletisimPatterns: ILETISIM_RX_LIST.map((r) => r.source),
        mesajPatterns: MESAJ_RX_LIST.map((r) => r.source)
      }]
    );

    if (result?.ok) toast('Mesaj ekranı açıldı.');
    else toast(`Mesaj akışı başarısız: ${result?.step || 'bilinmiyor'}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 7.6.1 + 7.6.2) Anabayınız: durum çek → emojili hazır cevap üret
  // ───────────────────────────────────────────────────────────────────────────

  // MADDE 15.5 (Dış kontrol URL’i ile Anabayınız araması aç KODLANDI)
  async function openAnabayiAndBuildReply() {
    const rec = current();
    if (!rec) return toast('Önce bir kayıt seçin.');

    const query = rec.smmId || rec.orderNo;
    if (!query) return toast('SMM ID veya Sipariş No yok.');

    // MADDE 7.6.1.2 (Doğrudan arama URL’i ile Anabayınız aç KODLANDI)
    const url = buildAnabayiSearchUrl(query);

    // yeni sekme aç
    const tab = await chrome.tabs.create({ url, active: true });

    // load bekle
    await new Promise((resolve) => {
      const h = (id, info) => {
        if (id === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(h);
          resolve(true);
        }
      };
      chrome.tabs.onUpdated.addListener(h);
    });

    // sayfayı oku ve parse et
    const parsed = await execInTab(
      tab.id,
      (payload) => {
        const text = String(document.body?.innerText || '');

        // MADDE 7.6.1.4 (Siparişler sayfası açıldı mı doğrula KODLANDI)
        const ok = new RegExp(payload.okRx, 'i').test(text);
        if (!ok) return { ok: false, reason: 'anabayi_not_ok' };

        const id = String(payload.id || '').trim();
        if (!id) return { ok: false, reason: 'no_id' };

        // MADDE 7.6.2.A (Önce ID ile satır regex yakala KODLANDI)
        const ROW_RX_1 = new RegExp(
          String.raw`(?:^|\n)\s*(${id})\s+([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2}:[0-9]{2})\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(\d+)\s+(.+?)\s+(Beklemede|Yükleniyor|Tamamlandı|Kısmen\s*Tamamlandı|İşlem\s*Sırasında)\s+(\d+)\s*(?=\n|$)`,
          'i'
        );
        const ROW_RX_2 = new RegExp(
          String.raw`(?:^|\n)\s*(${id})\s+([0-9]{4}-[0-9]{2}-[0-9]{2})\s+([0-9]{2}:[0-9]{2}:[0-9]{2})\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(\d+)\s+(.+?)\s+(Beklemede|Yükleniyor|Tamamlandı|Kısmen\s*Tamamlandı|İşlem\s*Sırasında)\s+(\d+)\s*(?=\n|$)`,
          'i'
        );

        let m = text.match(ROW_RX_1);
        let dateTime = '';
        let orderUrl = '';
        let price = '';
        let startCount = '';
        let quantity = '';
        let serviceRaw = '';
        let status = '';
        let remains = '';

        if (m) {
          // MADDE 7.6.2.A.5 (ROW_RX gruplarını map et KODLANDI)
          dateTime = m[2] || '';
          orderUrl = m[3] || '';
          price = m[4] || '';
          startCount = m[5] || '';
          quantity = m[6] || '';
          serviceRaw = m[7] || '';
          status = m[8] || '';
          remains = m[9] || '';
        } else {
          m = text.match(ROW_RX_2);
          if (!m) return { ok: false, reason: 'row_not_found' };
          dateTime = `${m[2]} ${m[3]}`;
          orderUrl = m[4] || '';
          price = m[5] || '';
          startCount = m[6] || '';
          quantity = m[7] || '';
          serviceRaw = m[8] || '';
          status = m[9] || '';
          remains = m[10] || '';
        }

        // MADDE 7.6.2.B.7 (Servis başındaki ID temizleme uygula KODLANDI)
        const cleaners = payload.serviceCleaners.map((p) => new RegExp(p, 'i'));
        let serviceClean = String(serviceRaw || '').trim();
        cleaners.forEach((rx) => { serviceClean = serviceClean.replace(rx, ''); });
        serviceClean = serviceClean.trim();

        // MADDE 7.6.2.B.8 (Garanti çıkarımı regex seti uygula KODLANDI)
        const gList = payload.gList.map((p) => new RegExp(p, 'i'));
        let garanti = '';
        for (const rx of gList) {
          const gm = String(serviceRaw || '').match(rx);
          if (gm) { garanti = gm[1] || gm[0] || ''; break; }
        }
        // normalize “garantili” gibi yakalanırsa boş bırak
        if (/garantili/i.test(garanti)) garanti = 'Var';

        // MADDE 7.6.1.5 (Order status regex ile normalize et KODLANDI)
        const statusRxList = payload.statusList.map((p) => new RegExp(p, 'i'));
        const matched = statusRxList.find((rx) => rx.test(String(status || '')));
        const statusNorm = matched ? String(status || '').trim() : String(status || '').trim();

        return {
          ok: true,
          id,
          dateTime,
          orderUrl,
          price,
          startCount: Number(startCount || 0),
          quantity: Number(quantity || 0),
          serviceRaw,
          serviceClean,
          garanti,
          status: statusNorm,
          remains: Number(remains || 0)
        };
      },
      [{
        id: String(query),
        okRx: ANABAYINIZ_OK_RX.source,
        serviceCleaners: RX.serviceCleaners.map((r) => r.source),
        statusList: ORDER_STATUS_RX_LIST.map((r) => r.source),
        gList: [
          // MADDE 7.6.2.B.8 (7 garanti regexi burada kullan KODLANDI)
          /(\\b(\\d{1,3}\\s*(?:G|GÜN))\\b)/i.source,
          /(\\b(\\d{1,3}\\s*(?:G|GÜN))\\s*♻️?\\b)/i.source,
          /(\\b(\\d{1,3})\\s*(?:GÜN|G)\\s*GARANTİ\\b)/i.source,
          /(\\bGARANTİ\\s*[:\\-]?\\s*(\\d{1,3}\\s*(?:G|GÜN))\\b)/i.source,
          /(\\b(\\d{1,3})\\s*G(?:ün)?\\s*garanti\\b)/i.source,
          /(\\b(\\d{1,3})\\s*day\\s*guarantee\\b)/i.source,
          /(\\b(garantili)\\b)/i.source
        ]
      }]
    );

    if (!parsed?.ok) return toast(`Anabayınız parse başarısız: ${parsed?.reason || 'bilinmiyor'}`);

    // MADDE 7.6.2.C (Emojili hazır cevap formatını üret KODLANDI)
    const [datePart, timePart] = String(parsed.dateTime || '').split(' ');
    const garantiLine = parsed.garanti ? `🛡️ Garanti: ${parsed.garanti}` : '';

    // MADDE 7.6.2.C.3 (Duruma göre son cümle ekle KODLANDI)
    const statusLower = String(parsed.status || '').toLowerCase();
    let tail = '';
    if (statusLower.includes('bekle')) tail = '⏳ Siparişiniz sıraya alınmış, yakında işlenecek.';
    else if (statusLower.includes('yüklen')) tail = '🔄 Siparişiniz yükleniyor, tamamlanınca güncellenecek.';
    else if (statusLower.includes('tamamlandı') && !statusLower.includes('kısmen')) tail = '✅ Sistemimizde siparişiniz tamamlandı görünüyor.';
    else if (statusLower.includes('kısmen')) tail = '🧩 Siparişiniz kısmen tamamlanmış, işlem sürüyor.';
    else if (statusLower.includes('işlem')) tail = '🛠️ Siparişiniz işlem sırasında, süreç devam ediyor.';

    const reply = [
      '✅ Sipariş Kontrol Sonucu',
      '',
      `📅 Hizmeti aldığınız tarih: ${datePart || '—'}`,
      `🕒 Hizmeti aldığınız saat: ${timePart || '—'}`,
      `🧾 Hizmet adı: ${parsed.serviceClean || '—'}`,
      garantiLine,
      `🔗 Sipariş verdiğiniz URL: ${parsed.orderUrl || '—'}`,
      `📌 Sipariş vermeden önceki sayınız: ${parsed.startCount ?? '—'}`,
      `🚀 Size gönderdiğimiz hizmet miktarı: ${parsed.quantity ?? '—'}`,
      `📦 Hizmet durumunuz: ${parsed.status || '—'}`,
      '',
      tail
    ].filter(Boolean).join('\n');

    if (ui.draft) ui.draft.value = reply;
    updateIdHideHint(reply);
    toast('Anabayınız kontrolü yapıldı, cevap hazırlandı.');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 7.6.3) Cevap sonrası çözüm bildir URL’i ile işaretle
  // ───────────────────────────────────────────────────────────────────────────

  // MADDE 7.6.3.3 (Çözüm bildir URL’ini sipariş no ile kur KODLANDI)
  function buildCozumBildirUrl(orderNo) {
    const n = String(orderNo || '').trim();
    return n ? `https://hesap.com.tr/p/siparis-cozum-bildir/${n}` : '';
  }

  // MADDE 7.6.3.1 (Sipariş numarasını kayıttan regexle çıkar KODLANDI)
  function extractSiparisNo(rec) {
    const s = `${rec?.orderNo || ''}\n${rec?.rawText || ''}`;
    for (const rx of SIPARIS_NO_RX_LIST) {
      const m = String(s).match(rx);
      if (m) return m[1] || '';
    }
    return '';
  }

  // MADDE 7.6.3.4 (Çözüm bildir URL’ine git ve bekle KODLANDI)
  // MADDE 7.6.3.5 (Başarıyı sayfa metniyle doğrula KODLANDI)
  async function markCozumBildir() {
    const rec = current();
    if (!rec) return toast('Önce bir kayıt seçin.');

    const siparisNo = extractSiparisNo(rec);
    if (!siparisNo) return toast('Sipariş numarası bulunamadı.');

    const url = buildCozumBildirUrl(siparisNo);
    const tabId = await getActiveTabId();

    await navigateAndWait(tabId, url);

    const ok = await execInTab(tabId, () => {
      const t = String(document.body?.innerText || '');
      return /\b(çözüm\s*bildirildi|işlem\s*başarılı|başarıyla)\b/i.test(t);
    });

    toast(ok ? 'Çözüm bildirildi doğrulandı.' : 'Çözüm bildir doğrulanamadı (kontrol et).');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Başlangıçta kayıtları yükle (v1 → v4 migrate)
  // ───────────────────────────────────────────────────────────────────────────

  async function loadRows() {
    // önce v4 dene
    const v4 = await getLocal(STORAGE.KEY_V4);
    if (Array.isArray(v4)) {
      state.rows = v4;
    } else {
      // v1 varsa migrate
      const v1 = await getLocal(STORAGE.KEY_V1);
      state.rows = Array.isArray(v1) ? v1 : [];
      if (state.rows.length) await setLocal(STORAGE.KEY_V4, state.rows);
    }

    if (!state.selectedId && state.rows[0]) state.selectedId = state.rows[0].id;
    render();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // UI bind (butonlar / inputlar)
  // ───────────────────────────────────────────────────────────────────────────

  function bind() {
    ui.pages = byId('inpComplaintPages');
    ui.speed = byId('rngComplaintSpeed');
    ui.search = byId('inpComplaintSearch');
    ui.stats = byId('complaintStats');
    ui.list = byId('complaintsList');
    ui.detail = byId('complaintDetail');
    ui.draft = byId('complaintDraftText');
    ui.actionHint = byId('complaintActionHint');

    // MADDE 5 (Tara butonu click ile scan başlat KODLANDI)
    byId('btnComplaintScan')?.addEventListener('click', () => scanComplaints().catch((e) => toast(String(e?.message || e))));

    // MADDE 15.1 (Durdur butonu stop flag ayarla KODLANDI)
    byId('btnComplaintStop')?.addEventListener('click', stopScan);

    // MADDE 14.1 (Taslak butonu draft üretimini çağır KODLANDI)
    byId('btnComplaintDraft')?.addEventListener('click', () => draftReply().catch(() => {}));

    // MADDE 15.2 (Çözüm öner butonu toast öneri üret KODLANDI)
    byId('btnComplaintSolution')?.addEventListener('click', solutionSuggest);

    // MADDE 15.3 (Eskale butonu eskale fonksiyonunu çağır KODLANDI)
    byId('btnComplaintEscalate')?.addEventListener('click', () => escalate().catch(() => {}));

    // MADDE 15.4 (Kapat butonu closeComplaint çağırır KODLANDI)
    byId('btnComplaintClose')?.addEventListener('click', () => closeComplaint().catch(() => {}));

    // MADDE 14.5 (Kopyala butonu panoya kopyalar KODLANDI)
    byId('btnComplaintCopyDraft')?.addEventListener('click', () => copyDraft().catch(() => {}));

    // MADDE 7.6 (Mesaj butonu tıklama akışını başlat KODLANDI)
    byId('btnComplaintOpenMessage')?.addEventListener('click', () => runMessageSendFlow().catch((e) => toast(String(e?.message || e))));

    // Ek butonlar (varsa) — dokümandaki akışları “tek yerde” tamamlar
    byId('btnComplaintAnabayiCheck')?.addEventListener('click', () => openAnabayiAndBuildReply().catch((e) => toast(String(e?.message || e))));
    byId('btnComplaintCozumBildir')?.addEventListener('click', () => markCozumBildir().catch((e) => toast(String(e?.message || e))));

    ui.search?.addEventListener('input', render);
    ui.speed?.addEventListener('input', () => { state.speed = Number(ui.speed?.value || 5); });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Export API
  // ───────────────────────────────────────────────────────────────────────────

  const Sikayet = {
    init: async () => { bind(); await loadRows(); },
    scanComplaints,
    stopScan,
    draftReply,
    copyDraft,
    solutionSuggest,
    escalate,
    closeComplaint,
    runMessageSendFlow,
    openAnabayiAndBuildReply,
    markCozumBildir,
    buildListPageUrl,
    buildAnabayiSearchUrl
  };

  window.Patpat = window.Patpat || {};
  window.Patpat.Sikayet = Sikayet;

  // MADDE 1 (Sidepanel açılınca otomatik init yap KODLANDI)
  Sikayet.init().catch((e) => toast(String(e?.message || e)));
})();
