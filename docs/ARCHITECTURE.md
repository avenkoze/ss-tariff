# SS TARIFF - Platform Mimarisi

## Ana karar

Windows ilk dağıtım platformudur; Android ikinci platformdur. Ancak ürün çekirdeği hiçbir platformun dosya sistemi, izin modeli veya UI framework'üne doğrudan bağlanmaz. Windows sürümünde öğrenilen analiz, hafıza ve sıralama davranışı Android'e aynı çekirdek kurallarla taşınır.

Web prototipi yalnızca UI ve davranış laboratuvarıdır. Üretim sürümü bir web sitesinin paketlenmiş hali değil; yerel kaynak adaptörleri, artımlı tarama motoru, SQLite veri katmanı, cihaz içi modeller ve işletim sistemi görevleri olan normal bir uygulamadır.

## Katmanlar

```text
Windows / Android / iOS / macOS / Linux
                 |
       Platform adapter layer
   files, gallery, schedule, trash,
       notifications, permissions
                 |
          Application core
  incremental scan, analysis pipeline,
  memory graph, ranking, cleanup policy
                 |
            Local storage
 SQLite metadata + vector index + cache
                 |
                UI
 Today, Library, Groups, Cleaner, Search
```

UI yalnızca use-case çağırır. `Pictures/Screenshots`, Android MediaStore veya iOS PhotoKit ayrıntılarını bilmez. Çekirdek de Windows path'i ya da Android content URI'si bilmez; sadece `ScreenshotSourcePort` sözleşmesini kullanır.

Kod karşılıkları:

- `src/core/contracts.ts`: platform, kaynak, zamanlama, bildirim ve repository sınırları
- `src/core/scanEngine.ts`: yalnızca yeni/değişen dosyaları analiz eden orkestratör
- `src/core/memoryEngine.ts`: dönem özeti, ilgi hafızası ve yeniden gösterme sıralaması
- `src/lib/analyzer.ts`: bugün hafif görsel analiz; daha sonra yerel OCR/embedding adaptörü
- `src/lib/database.ts`: web prototipi için IndexedDB; üretimde SQLite adaptörü

## Dosyaları taşımama ilkesi

Kategoriler varsayılan olarak sanaldır. Uygulama screenshot'ı fiziksel olarak başka klasöre taşımaz, yeniden adlandırmaz veya kopyalamaz. Veritabanında `asset -> collection` ilişkisi kurar. Bunun faydaları:

- Galeri ve diğer uygulamaların dosya bağlantıları bozulmaz.
- Android/iOS izin modeliyle çatışmaz.
- Yanlış kategori tek metadata değişikliğiyle düzeltilir.
- Aynı screenshot birden çok akıllı grupta bulunabilir.
- Diskte ikinci kopya oluşmaz.

Kullanıcı isterse daha sonra açık bir `Dışa aktar` komutuyla gerçek klasör üretebilir.

## Artımlı tarama

Her platform adaptörü dosyaya kararlı bir `sourceId`, değişiklikleri gösteren bir `identityToken` ve tarama cursor'u üretir.

- Windows: file ID/path + size + modified time
- Android: MediaStore ID + generation/date modified
- iOS: PhotoKit local identifier + modification date
- macOS/Linux: inode/path + size + modified time

Tarama algoritması:

1. Son cursor'dan sonra eklenen/değişen adayları listele.
2. `identityToken` ve `analysisVersion` güncelse atla.
3. Değişen dosyada ucuz analiz aşamalarını çalıştır.
4. Sonucu transaction içinde yaz.
5. Başarılı batch sonunda cursor'u ilerlet.

10.000 görsel her yenilemede yeniden işlenmez. Model yükseltildiğinde yalnızca o modelin ürettiği alanlar eski sürüm numarasına sahipse yeniden hesaplanır.

## Yenileme ve zamanlama

Tetikleyiciler `manual`, `scheduled`, `startup` ve platform destekliyorsa `watch-event` olarak kaydedilir.

- Manuel yenileme her platformda hemen çalışır.
- Windows uygulama açıkken klasör değişikliklerini hafif watcher ile izler; kapalıyken kullanıcı isterse işletim sistemi görevi yaklaşık seçilen saatlerde uygulamayı uyandırır.
- Android periyodik işi işletim sistemi kuyruğuna bırakır; pil ve Doze nedeniyle tam dakika garantisi verilmez.
- iOS arka plan zamanı tamamen sistemin takdirindedir. Kullanıcıya "yaklaşık" zaman gösterilir; sahte kesin saat vaadi verilmez.

Varsayılan öneri: günde iki hafif tarama (öğlen/akşam), şarjdayken derin OCR/embedding bakımı ve her zaman manuel yenileme.

## Üretim veri modeli

SQLite tabloları:

- `assets`: kaynak kimliği, URI/path, tarih, boyut, content hash, durum
- `analyses`: pipeline/model sürümleri, kategori, güven, OCR, kalite sinyalleri
- `embeddings`: görsel ve metin vektörleri; model sürümüyle ayrılmış
- `collections`: sanal kategori ve kullanıcı koleksiyonları
- `collection_items`: çoktan çoğa üyelik
- `entities`: ürün, mekan, konu, etkinlik ve kavramlar
- `entity_evidence`: hangi screenshot hangi bilgiyi destekliyor
- `memories`: dönem, ilgi ve karar hafızaları
- `surface_history`: ne zaman ne gösterildi, cooldown ve kullanıcı tepkisi
- `scan_runs`: trigger, süre, bulunan/atlanan/hatalı sayıları
- `actions`: sakla, sil, geri al, kategori düzeltme gibi eğitim sinyalleri
- `settings`: tarama saatleri, izinler ve gizlilik tercihleri

Screenshot'ın kendisi masaüstünde tekrar veritabanına kopyalanmaz; orijinal path referanslanır ve küçük thumbnail cache tutulur. Mobilde content URI/PhotoKit kimliği kullanılır. Web prototipindeki Blob saklama üretim davranışı değildir.

## Güvenli silme

Model hiçbir zaman tek başına kalıcı silme yapmaz.

1. `Muhtemel Çöp` sanal koleksiyonuna önerir.
2. Nedenini ve güven skorunu gösterir.
3. Kullanıcı seçimi işletim sistemi adaptörüne gider.
4. Windows/macOS/Linux sistem çöpüne yollar.
5. Android/iOS sistem silme onayını kullanıcıya gösterir.
6. Uygulama yalnızca işletim sistemi başarı bildirdikten sonra kaydı silinmiş işaretler.

## Dağıtım sırası

### 1. Windows MVP

- Screenshots klasörünü seçme ve kalıcı izin
- başlangıç/manual/scheduled artımlı tarama
- yerel OCR, perceptual hash, siyah/boş görüntü tespiti
- SQLite + thumbnail cache
- sistem çöpü ve geri alınabilir inceleme
- Today, Library, Groups, Cleaner ve yerel arama
- tray ve yerel bildirim

### 2. Android

- MediaStore screenshot koleksiyonu ve scoped permission
- yaklaşık periyodik tarama
- cihaz performans sınıfına göre Lite/Full analiz
- sistem onaylı toplu silme
- yerel bildirim ve Today widget adayı

### 3. iOS, macOS, Linux

Çekirdek değişmez; kaynak, scheduler, trash ve notification adaptörleri eklenir. iOS izin ve arka plan kısıtları nedeniyle Windows/Android davranışı birebir vaat edilmez.

## Kaynak ve internet bütçesi

- Aynı dosya ve aynı model sürümü ikinci kez işlenmez.
- Thumbnail ve embedding cache boyutu sınırlandırılır.
- Modeller tek parça dev paket yerine özellik paketleri olarak sürümlenir.
- Temel sınıflandırma çevrimdışı ve küçük kalır.
- İleri model paketi Wi-Fi/şarj koşuluyla, açık kullanıcı seçimiyle indirilir.
- Telemetri varsayılan kapalıdır ve screenshot/OCR/embedding içeremez.
