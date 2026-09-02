# Yol Haritası

Durum tarihi: 2 Eylül 2026.

## Windows MVP

Tamamlananlar:

- Tauri 2 masaüstü kabuğu ve Windows EXE
- NSIS current-user installer
- klasör seçimi, varsayılan Screenshots keşfi ve recursive tarama
- identity/model sürümlü artımlı analiz
- Windows Media OCR ve yerel 128D semantik indeks
- SQLite v4 migration, FTS5, thumbnail ve embedding cache
- benzer/kopya, siyah, beyaz ve tekdüze screenshot tespiti
- onaylı Windows Çöp Kutusu entegrasyonu
- watcher, tray, başlangıç taraması, kullanıcı saatleri ve bildirim
- Recent, Gallery, ayarlar, haftalık/aylık rapor ve kişisel resurface
- kategori düzeltmelerinden yerel öğrenme ve context entity indeksi
- kesinti/devam ve 10.000 kayıt performans testi
- GitHub CI, tag tabanlı release ve signed updater artifact akışı

Üretim yayını öncesi dış gereksinimler:

- Güvenilir yayıncı adına alınmış Windows Authenticode sertifikası
- GitHub Actions'a updater private key ve sertifika secret'larının eklenmesi
- Temiz Windows VM'de installer/uninstaller ve SmartScreen QA
- Küçük gerçek kullanıcı arşiviyle OCR/kategori kalite eşiğinin ölçülmesi

Updater paketleri Minisign anahtarıyla imzalanır. Bu, Windows'un yayıncı kimliğini gösteren Authenticode imzasının yerine geçmez.

## Android

Hazır temel:

- mobil uyumlu Tauri library entry point
- Android paket yapılandırması ve npm komutları
- masaüstü watcher/trash/updater bağımlılıklarının mobil binary'den ayrılması
- platform bağımsız source, scheduler ve notification sözleşmeleri
- aynı SQLite, analiz, hafıza ve rapor modelinin taşınabilir çekirdeği

Kalan uygulama:

- Android SDK/NDK bulunan bir geliştirme ortamında `npm run android:init`
- Kotlin Tauri plugin içinde MediaStore screenshot sorgusu
- content URI stream'i ve scoped photo permission akışı
- WorkManager ile yaklaşık periyodik artımlı tarama
- `MediaStore.createDeleteRequest` ile sistem onaylı toplu silme
- Android bildirim deep-link'i ve paylaş menüsünden ekleme
- orta segment cihazda ilk indeksleme, RAM, pil ve termal test
- Play App Signing, privacy form ve internal test release

Bu makinede Android SDK/NDK olmadığı doğrulandı; internet bütçesi nedeniyle otomatik indirme yapılmadı. Ayrıntı [ANDROID.md](./ANDROID.md) içindedir.

## Sonraki ürün derinliği

- Opsiyonel quantized görsel encoder ile OCR'sız nesne arama
- Tarihi geçmiş bilet/etkinlik için daha güçlü yapılandırılmış çıkarım
- Hassas içerik kasası ve biyometrik kilit
- Dışa aktarma ve kullanıcı tanımlı koleksiyonlar
- Sabit kalite veri seti, precision/recall ve yanlış silme eval'leri

## macOS, Linux ve iOS

Çekirdek ve DB korunur. macOS/Linux için source, launch-at-login, bildirim, updater ve trash QA gerekir. iOS için PhotoKit, BGTask, sistem silme onayı ve Apple signing ayrı adaptörlerdir. Hiçbir platforma Android/Windows zamanlama kesinliği kopyalanmaz.

## Yapılmayacaklar

- zorunlu bulut veya screenshot upload
- modelin kendi başına kalıcı silmesi
- genel amaçlı chatbot
- dosyaları varsayılan olarak fiziksel kategori klasörlerine taşıma
- tüm platformları tek release içinde aynı anda açma
