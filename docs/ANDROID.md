# Android Uygulama Planı

## Mevcut sınır

Ortak React UI, Tauri library entry point, SQLite şeması, analiz/hafıza motoru ve Android ikonları repodadır. Masaüstü `notify`, `trash`, tray ve updater kodu mobil hedefte derlenmez. Android galerisi henüz bağlı değildir.

Bu makinedeki doğrulama sonucu:

```text
Java: var
ANDROID_HOME: yok
ANDROID_SDK_ROOT: yok
adb: yok
Tauri android init: Android SDK ve NDK bulunamadı
```

SDK/NDK büyük indirme olduğu için otomatik kurulmadı.

## Ortam kurulunca

Android Studio üzerinden güncel SDK Platform, Platform Tools, Build Tools, Command-line Tools ve uyumlu NDK kurulmalıdır. Sonra PowerShell oturumunda gerçek kurulum yolları tanımlanır:

```powershell
$env:ANDROID_HOME = '<Android SDK yolu>'
$env:NDK_HOME = '<Android NDK yolu>'
npm run android:init
npm run android:dev
```

Release adayı:

```powershell
npm test -- --run
cargo test --manifest-path src-tauri/Cargo.toml --lib
npm run android:build
```

Paket kimliği `com.sstariff.app`, minimum API seviyesi `24`, debug suffix `.debug` olarak `src-tauri/tauri.android.conf.json` içinde sabittir.

## Native kaynak adaptörü

Android'de `Pictures/Screenshots` dosya yolu taranmayacak. Kotlin Tauri plugin şu işlemleri sunmalıdır:

```text
listChangedScreenshots(cursor, limit) -> MediaAsset[]
openScreenshot(contentUri) -> stream/temp handle
requestDelete(contentUris) -> Android system confirmation
scheduleScans(windows) -> WorkManager configuration
```

`MediaAsset` ortak `SourceAsset` alanlarına şöyle çevrilir:

| Ortak alan | Android değeri |
| --- | --- |
| `sourceId` | MediaStore volume + `_ID` |
| `sourceUri` | `content://...` URI |
| `sourceName` | `MediaStore/Screenshots` |
| `fileName` | `DISPLAY_NAME` |
| `mimeType` | `MIME_TYPE` |
| `size` | `SIZE` |
| `createdAt` | `DATE_ADDED` |
| `modifiedAt` | `DATE_MODIFIED` |
| `identityToken` | generation/version + modified + size |

Screenshot filtresi yalnız klasör adına güvenmemelidir. `RELATIVE_PATH`, `DISPLAY_NAME`, medya tipi ve üretici varyasyonları birlikte değerlendirilir; kullanıcı isterse tüm görseller yerine bulunan screenshot kaynaklarını seçer.

## İzin ve veri akışı

1. Onboarding neden fotoğraf erişimi gerektiğini uygulama içinde kısa biçimde açıklar.
2. Sistem fotoğraf izni istenir; reddedilirse uygulama çalışır fakat galeri boş kalır.
3. MediaStore yalnız yeni/değişen satırları sayfalı döndürür.
4. `ContentResolver` stream'i analiz için açar. Gerekirse app cache'e geçici dosya yazılır ve transaction sonrası silinir.
5. Yalnız metadata, OCR, vektör ve thumbnail uygulama veritabanında kalır.
6. Screenshot hiçbir ağ isteğine eklenmez.

Android sürümüne göre seçili fotoğraf erişimi ve sınırlı izin durumu ayrı state olarak UI'a bildirilmelidir. Kullanıcı “tam arşiv tarandı” sanmamalıdır.

## Arka plan

WorkManager en az şu benzersiz işleri yönetmelidir:

- `incremental-scan`: kullanıcı zamanlarına yakın periyodik tarama
- `deep-analysis`: yalnız şarj/pil koşulları uygunsa eski belirsiz kayıtlar
- `weekly-report`: DB sorgusu ve bildirim

WorkManager tam dakika garantisi vermez. Cursor yalnız tamamlanan batch transaction'ından sonra ilerler. İş kesilirse bir sonraki çalışmada identity token'ı güncel kayıtlar atlanır.

## Silme

Mobil komut hiçbir zaman `std::fs::remove_file` veya masaüstü trash kütüphanesi kullanmaz.

1. Kullanıcı SS TARIFF içinde seçimi onaylar.
2. Plugin URI listesini `MediaStore.createDeleteRequest` ile sistem onay ekranına yollar.
3. Yalnız Android başarı sonucu döndürdüğü ID'ler DB'de deleted olur.
4. Reddedilenler aktif kalır.
5. Uygulama dışından kaybolan medya yalnız `external-missing` olayı alır; kazanılan alan metriğini şişirmez.

## Kabul testleri

- 1.000 gerçek screenshot ilk indekslemede UI thread'i bloklamıyor.
- 10 yeni kayıt taranırken eski 990 kayıt yeniden OCR edilmiyor.
- İzin sınırlanınca erişilemeyen kayıtlar kullanıcı silmiş gibi sayılmıyor.
- İşletim sistemi silme onayı reddedilince dosya ve DB aktif kalıyor.
- Uygulama işlem sırasında öldürülüp açıldığında tarama devam ediyor.
- Uçak modunda arama, kategori, rapor ve temizleme incelemesi çalışıyor.
- Orta segment cihazda RAM, pil ve sıcaklık ölçümü release eşiğini geçiyor.
