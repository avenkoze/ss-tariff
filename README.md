# SS TARIFF

SS TARIFF, ekran görüntülerini cihazdan çıkarmadan tarayan, düzenleyen, aratan ve güvenli biçimde temizleten kişisel screenshot hafızasıdır.

Windows MVP gerçek bir Tauri uygulamasıdır. React arayüzünün altında Rust tarama motoru, Windows Media OCR, SQLite, yerel semantik indeks, kişisel kategori öğrenimi, klasör watcher'ı, zamanlama, bildirimler ve Windows Çöp Kutusu entegrasyonu çalışır.

## Çalışan ürün yüzeyi

- `Recent`: son screenshot'lar ve geçmişten kişiselleştirilmiş hatırlatmalar
- `Gallery`: otomatik kategorilere ayrılmış galeri ve artımlı yükleme
- Yerel OCR, renk/ton/yerleşim sinyalleri ve açıklanabilir çöp tespiti
- Metin aynı olmasa da ilişkili terimleri bulan yerel semantik arama
- Kullanıcının kategori düzeltmelerinden cihaz üzerinde öğrenme
- URL, alan adı, e-posta, kullanıcı adı, tarih ve fiyat bağlamı
- Haftalık ve aylık ölçülebilir raporlar
- Manuel, başlangıç, watcher ve seçilen saatlerde artımlı tarama
- Onaydan sonra Windows Çöp Kutusu'na taşıma
- NSIS installer, imzalı updater artifact'ı ve GitHub release kanalı

Screenshot dosyaları SQLite'a kopyalanmaz. Veritabanında yalnızca kaynak yolu, analiz, vektör ve küçük thumbnail tutulur. Ağ yüklemesi veya zorunlu hesap yoktur.

## Geliştirme

Gerekenler: Node.js 22+, Rust stable ve Windows'ta WebView2.

```powershell
npm ci
npm run desktop:dev
```

Yalnızca arayüzü hızlı geliştirmek için browser laboratuvarı:

```powershell
npm run dev
```

Browser modu IndexedDB ve demo/fallback analizini kullanır. Gerçek klasör tarama, Windows OCR, sistem çöpü, watcher ve SQLite için `desktop:dev` gerekir.

## Doğrulama

```powershell
npm test -- --run
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Windows installer:

```powershell
npm run desktop:bundle
```

Çıktı `src-tauri/target/release/bundle/nsis/` altında oluşur. Updater artifact'ı için `TAURI_SIGNING_PRIVATE_KEY` ve `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` gerekir. Güvenilir Windows yayıncı imzası için ayrıca bir Authenticode sertifikası gerekir.

## Platform durumu

| Hedef | Durum |
| --- | --- |
| Windows | Çalışan MVP ve installer |
| Android | Ortak çekirdek hazır; MediaStore/WorkManager adaptörü ve Android SDK kurulumu sırada |
| macOS/Linux | Masaüstü sınırları ayrıldı; platform QA ve paketleme sırada |
| iOS | PhotoKit/BGTask adaptörü ve Apple imzalama sırada |

Android başlangıç adımları ve izin modeli [docs/ANDROID.md](./docs/ANDROID.md), Windows yayın akışı [docs/RELEASE.md](./docs/RELEASE.md) içindedir.

## Belgeler

- [Ürün](./docs/PRODUCT.md)
- [Mimari](./docs/ARCHITECTURE.md)
- [Yerel AI ve hafıza](./docs/AI-SYSTEM.md)
- [Yol haritası](./docs/ROADMAP.md)
- [Doğrulama kaydı](./docs/VERIFICATION.md)
