# SS TARIFF Mimarisi

## Karar

Windows ilk üretim hedefi, Android ikinci hedeftir. Ürün bir web wrapper değildir: React yalnızca görünüm katmanıdır; tarama, analiz, hafıza, zamanlama ve veri ömrü Rust/Tauri tarafında çalışır.

```text
React UI: Recent, Gallery, Search, Settings, Reports
                         |
                  Tauri commands/events
                         |
     scan orchestration | local intelligence | services
                         |
       SQLite v4 + FTS5 + embedding/thumbnail cache
                         |
     Windows folder/OCR/trash | Android MediaStore (next)
```

## Kaynak modüller

- `src/App.tsx`: ekranlar, kullanıcı kararları ve native/browser ayrımı
- `src/lib/native.ts`: tipli Tauri komut ve olay istemcisi
- `src-tauri/src/commands.rs`: UI ile yerel use-case sınırı
- `src-tauri/src/scanner.rs`: artımlı tarama, iptal/devam, kaynak uzlaştırma ve cache temizliği
- `src-tauri/src/analysis.rs`: Windows OCR, görsel fingerprint, çöp sinyalleri ve semantik vektör
- `src-tauri/src/intelligence.rs`: bağlam çıkarımı ve kişisel öğrenme özellikleri
- `src-tauri/src/db.rs`: migration, transaction, arama, rapor ve hafıza sorguları
- `src-tauri/src/services.rs`: watcher, tray, zamanlayıcı ve yerel bildirim
- `src-tauri/src/platform.rs`: başlangıçta çalıştırma gibi işletim sistemi işlemleri
- `src/core/contracts.ts`: Android/iOS kaynak ve scheduler adaptörleri için platform bağımsız sözleşmeler

## Artımlı tarama

Her dosya normalize edilmiş `source_id` ve `size:modified_time` biçiminde `identity_token` alır. Tarama öncesi tüm mevcut analiz kimlikleri tek sorguda belleğe alınır.

1. Klasör recursive fakat symlink izlemeden listelenir.
2. Aynı identity token ve güncel `analysis_version` varsa analiz atlanır.
3. Değişen dosya okunur; hash, thumbnail, OCR, görsel sinyaller ve embedding üretilir.
4. Kişisel kategori ağırlıkları sonucu gerekirse düzeltir.
5. Asset, analiz, FTS, embedding, entity ve memory kayıtları tek transaction'da güncellenir.
6. Başarılı tam taramada kaynaktan kaybolan dosyalar pasifleştirilir ve orphan thumbnail'lar silinir.
7. İptal edilen tarama cursor'u bozmaz; sonraki tarama tamamlanan kayıtları atlayarak devam eder.

Dosya geri gelirse aynı `source_id` üzerinden eski asset yeniden etkinleşir; geçmiş ve kullanıcı kararları parçalanmaz.

## SQLite v4

- `assets`: kaynak, identity, boyut, tarih ve yaşam döngüsü
- `analyses`: sürümlü kategori, OCR, fingerprint ve çöp sinyalleri
- `embeddings`: model sürümüne bağlı yerel 128 boyutlu vektör
- `asset_search`: FTS5 metin indeksi
- `collections`, `collection_items`: sanal kategoriler
- `entities`, `entity_evidence`: bağlam ve screenshot kanıtı
- `memories`, `surface_history`: dönem ve yeniden gösterme hafızası
- `learning_weights`: kullanıcı kategori düzeltmelerinden öğrenilen yerel ağırlıklar
- `actions`: sakla, temizle, düzelt ve gösterim kararları
- `scan_runs`, `settings`: kesinti kaydı ve çalışma ayarları

Bağlantılar WAL, foreign key ve busy timeout ile açılır. Screenshot binary'si veritabanına yazılmaz. Silinen veya kaybolan dosyaya ait kullanılmayan thumbnail cache'i tarama sonunda temizlenir.

## Zamanlama

Windows uygulaması tray'de açık kaldığı sürece klasör watcher'ı ve saat kontrolü çalışır. `Başlangıçta çalıştır` seçeneği HKCU Run kaydına `--hidden` komutu ekler; böylece oturum açıldığında süreç tray'de başlayabilir. Uygulama tamamen kapatılırsa tarama çalışmaz; ayrı Windows Task Scheduler görevi kurulmaz.

Android'de bu mekanizma kullanılmayacak. Yaklaşık zamanlı işler WorkManager'a, medya değişiklikleri MediaStore sorgusuna bırakılacaktır. Doze nedeniyle kesin dakika vaat edilmez.

## Platform sınırı

`notify`, sistem çöpü, tray ve updater Android/iOS derlemelerinden koşullu olarak çıkarılır. Mobilde klasör yolu komutları bilerek hata verir; çünkü content URI'yi normal path gibi işlemek izin ve silme güvenliğini bozar. Android adaptörü `MediaStore ID + generation/date_modified` kimliğini ortak `SourceAsset` sözleşmesine çevirecektir.

## Güvenli silme

- Model yalnızca öneri üretir.
- Kullanıcı açıkça onaylamadan native silme komutu çalışmaz.
- Windows dosyayı sistem Çöp Kutusu'na taşır ve ancak başarıdan sonra DB durumunu değiştirir.
- Android `MediaStore.createDeleteRequest`, iOS PhotoKit değişiklik onayı kullanmalıdır.
- Kaynaktan uygulama dışında silinen dosya kullanıcı temizleme metriğine yazılmaz.

## Ölçek ilkeleri

- Değişmeyen dosya tekrar OCR edilmez.
- Galeri aynı anda en fazla 120 yeni kart render eder.
- Vektörler küçük ve sürümlüdür; eski model satırı yeniden analizde temizlenir.
- Belirsiz sınıflandırma `other` kalır; kullanıcı düzeltmesi tahminden üstündür.
- Ağ, hesap ve telemetri temel çalışma yolunda yoktur.
