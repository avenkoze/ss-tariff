# Doğrulama Kaydı

Son tam doğrulama: 2 Eylül 2026, Windows x64.

## Otomatik kontroller

| Kontrol | Sonuç |
| --- | --- |
| `npm test -- --run` | 2 dosya, 10 test geçti |
| `npm run build` | TypeScript ve Vite production build geçti |
| `cargo clippy --all-targets -- -D warnings` | Sıfır uyarı |
| `cargo test --lib` | 13 test geçti, 1 explicit performans testi normal koşuda atlandı |
| SQLite migration idempotency | `user_version = 4` |
| Kurulu DB integrity | `PRAGMA integrity_check = ok` |

Rust testleri şu kritik davranışları kapsar:

- aynı dosyayı atlama, değişeni yeniden analiz etme
- iptal edilen taramaya tekrar işlem yapmadan devam etme
- dışarıdan silinen dosyayı pasifleştirme ve thumbnail temizleme
- geri gelen dosyada aynı asset kimliğini yeniden etkinleştirme
- kategori düzeltmesinden sonraki benzer screenshot'ı kişiselleştirme
- migration'ları tekrar güvenle çalıştırma
- schedule slot'unu yalnız bir kez çalıştırma
- watcher event filtresi, semantic alias ve görsel etiketler

## 10.000 kayıt testi

Explicit test:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml scanner::tests::unchanged_10k_archive_uses_the_bulk_index -- --ignored --nocapture
```

Ölçüm:

- Bulunan: 10.000
- Yeniden analiz: 0
- Atlanan: 10.000
- Değişmemiş arşiv taraması: 3,087 sn
- SQLite dosyası: 21.147.648 byte
- Belleğe alınan identity indeks yükü: 1.300.000 byte
- Test eşikleri: 20 sn, 64 MB DB, 8 MB indeks

## Windows artifact

```text
Dosya: SS TARIFF_0.1.0_x64-setup.exe
Boyut: 4.700.328 byte
SHA-256: 3CB13A34C453BB7AA7EDFC3B173C77B676CD76D5F7932B93137662FF31A9E01F
Updater signature: üretildi, 420 byte
Authenticode: NotSigned
```

Installer `/S` ile current-user dizinine kuruldu. Kurulu `ss-tariff.exe` ürün ve dosya sürümü `0.1.0` olarak okundu; `--hidden` ile başlatıldı ve altı saniyelik smoke test sonunda süreç çalışıyordu. Ardından kontrollü biçimde kapatıldı.

`NotSigned`, kod hatası değildir; güvenilir Windows publisher sertifikası bu makinede bulunmadığı için beklenen dış release gereksinimidir. GitHub workflow PFX secret'ı sağlandığında Authenticode yapılandırmasını uygular.

## Android ortam kontrolü

`npx tauri android init --ci --skip-targets-install` hiçbir şey indirmeden çalıştırıldı ve Android SDK/NDK bulunmadığı için durdu. `ANDROID_HOME`, `ANDROID_SDK_ROOT` ve `adb` yok; Java mevcut. Bu nedenle Android binary/device testi yapılmış sayılmaz.

## Elle release QA

Otomasyon; OCR anlam kalitesi, farklı Windows dilleri, SmartScreen itibarı, updater'ın iki gerçek release arasında geçişi ve Android izin ekranını kanıtlamaz. Bunlar production release kontrol listesindeki cihaz/sertifika testleridir.
