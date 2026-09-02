# Windows Release

## İki ayrı imza

SS TARIFF dağıtımında iki imza farklı işi yapar:

- **Tauri updater signature:** indirilen paketin proje anahtarıyla üretildiğini doğrular. Zorunludur.
- **Windows Authenticode:** EXE/MSI yayıncısının Windows tarafından tanınmasını ve SmartScreen itibarını sağlar. Güvenilir bir code-signing sertifikası gerektirir.

Updater imzası Authenticode yerine geçmez.

## GitHub secret'ları

Release workflow şu secret'ları bekler:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `WINDOWS_CERTIFICATE`: PFX dosyasının base64 içeriği, isteğe bağlı fakat production için gerekli
- `WINDOWS_CERTIFICATE_PASSWORD`: PFX parolası

Public updater key `src-tauri/tauri.conf.json` içindedir. Private updater key repoya, artifact'a veya loga girmemelidir.

## Sürüm çıkarma

1. `package.json`, `src-tauri/Cargo.toml` ve `src-tauri/tauri.conf.json` sürümlerini aynı semver'e getir.
2. Doğrulama komutlarını çalıştır.
3. Değişiklikleri `main`e gönder.
4. Tag oluşturup gönder:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

`.github/workflows/release.yml` Windows runner'da testleri çalıştırır, isteğe bağlı PFX'i CurrentUser certificate store'a alır, NSIS paketini ve updater JSON/signature dosyalarını üretir, ardından draft GitHub Release açar. `-beta`, `-rc` gibi tag'ler prerelease olur.

## Yerel paket

Updater anahtarı environment'ta hazırken:

```powershell
npm ci
npm test -- --run
cargo test --manifest-path src-tauri/Cargo.toml --lib
npm run desktop:bundle
```

Beklenen dosyalar:

```text
src-tauri/target/release/ss-tariff.exe
src-tauri/target/release/bundle/nsis/SS TARIFF_<version>_x64-setup.exe
src-tauri/target/release/bundle/nsis/SS TARIFF_<version>_x64-setup.exe.sig
```

Uygulama update'i `https://github.com/avenkoze/ss-tariff/releases/latest/download/latest.json` üzerinden kontrol eder. Stable kanal yalnız normal semver release'i yayımlamalıdır.

## Yayın kontrolü

- CI yeşil
- Installer temiz Windows kullanıcı hesabında kuruluyor
- Kurulum current-user ve yönetici istemiyor
- Uygulama ilk açılışta DB migration'ını tamamlıyor
- Klasör izni, OCR, arama, tray ve sistem çöpü gerçek dosyada deneniyor
- Uygulama kapat/gizle/yeniden aç davranışı doğrulanıyor
- Updater önceki sürümden test release'ine geçiyor
- Installer ve ana EXE Authenticode `Valid` gösteriyor
- Uninstall uygulama binary'sini kaldırıyor; kullanıcı verisi politikası release notunda açık
- `latest.json` URL'leri, signature ve mimari doğru

Gerçek publisher sertifikası yoksa paket test amaçlı dağıtılabilir fakat “imzalı production installer” diye yayınlanmamalıdır.
