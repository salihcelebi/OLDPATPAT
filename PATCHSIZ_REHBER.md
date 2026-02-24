# Hızlı Çözüm (1 Dakika)
- GitHub’da `salihcelebi/PATPAT` sayfasını aç.
- Yeşil **Code** butonuna tıkla.
- **Download ZIP** seç ve indirip aç.

# İhtiyacı Netleştir (Kısa)
- A) Sadece dosyaları indirip kullanmak istiyorum.
- B) Repo içinde bazı dosyaları değiştireceğiz.

# Diffsiz İndirme Seçenekleri
## 1) Tüm Repo (ZIP)
- Adımlar:
  1. `https://github.com/salihcelebi/PATPAT` aç.
  2. **Code** → **Download ZIP** seç.
  3. ZIP dosyasını aç, doğrudan kullan.
- Not:
  - En kolay ve yeni başlayan için en güvenli yöntem budur.

## 2) Tek Dosya (Raw)
- Adımlar:
  1. İndirmek istediğin dosyayı aç.
  2. Sağ üstten **Raw** butonuna tıkla.
  3. Açılan ham içeriği **Farklı Kaydet** ile indir.
- (Varsa) Komut:
```bash
curl -L "https://raw.githubusercontent.com/salihcelebi/PATPAT/main/manifest.json" -o manifest.json
```
* Mini açıklama: Tek bir dosyanın ham içeriğini indirir ve aynı isimle bilgisayarına kaydeder.

## 3) Tek Klasör (svn export)
- Adımlar:
  1. Klasör yolunu repo içinden netleştir (ör. `icons`).
  2. Aşağıdaki komutu tek satır çalıştır.
  3. Klasör, geçmişsiz şekilde bulunduğun dizine iner.

```bash
svn export https://github.com/salihcelebi/PATPAT/trunk/icons
```
* Mini açıklama: Sadece seçtiğin klasörü indirir; tüm repoyu çekmeden temiz kopya alırsın.

## 4) GitHub CLI (`gh`) ile İndirme (İstersen)
- Adımlar:
  1. Bilgisayarında `gh` kuruluysa terminal aç.
  2. Aşağıdaki komutu çalıştır.

```bash
gh repo clone salihcelebi/PATPAT
```
* Mini açıklama: PATPAT deposunu tek komutla bilgisayarına indirir, sonra dosyaları normal düzenlersin.

# Eğer Değişiklik İstiyorsan (Patch Yok)
## Teslim Formatı
- Değişen **her dosya** için şu 3 şeyi ver:
  1. Repo içi dosya yolu (`path/to/file`).
  2. Dosyanın **tam yeni içeriği** (tek parça).
  3. GitHub web kaydetme adımı:
     - Dosyayı aç → kalem (Edit) → tamamını değiştir → **Commit changes**.

## Örnek Dosya Listesi
- `manifest.json`
- `popup.html`

## Örnek Sunum Biçimi
### Dosya: `manifest.json`
```text
[TAM DOSYA İÇERİĞİ BURAYA]
```

### Dosya: `popup.html`
```text
[TAM DOSYA İÇERİĞİ BURAYA]
```

# İleri Seviye (İstersen): Token/SSH ile Otomatik Güncelleme
- Uyarı: Gerçek token veya SSH anahtarını kimseyle paylaşma.
- Değişken isimleri belli değilse placeholder kullan:
  - `GITHUB_TOKEN_VAR=<KULLANICININ_TOKEN_DEĞİŞKENİ>`
  - `SSH_KEY_VAR=<KULLANICININ_SSH_DEĞİŞKENİ>`

```bash
OWNER="salihcelebi"
REPO="PATPAT"
FILE_PATH="manifest.json"
BRANCH="main"
TOKEN="$GITHUB_TOKEN_VAR"
API="https://api.github.com/repos/$OWNER/$REPO/contents/$FILE_PATH"

SHA=$(curl -s -H "Authorization: Bearer $TOKEN" "$API?ref=$BRANCH" | jq -r '.sha')
NEW_CONTENT_BASE64=$(base64 -w 0 manifest.json)

curl -s -X PUT "$API" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -d "{\"message\":\"manifest guncelle\",\"content\":\"$NEW_CONTENT_BASE64\",\"sha\":\"$SHA\",\"branch\":\"$BRANCH\"}"
```
* Mini açıklama: Önce dosya kimliğini alır, sonra yeni tam içeriği API üzerinden günceller.
