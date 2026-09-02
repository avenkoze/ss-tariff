# Yerel AI ve Hafıza

## Bugün çalışan model yığını

SS TARIFF tek bir sohbet modeli çağırmaz. Küçük, açıklanabilir ve cihaz içi aşamalar birlikte çalışır.

1. **Kimlik:** SHA-256 content hash ve 16x16 görsel fingerprint
2. **Kalite:** parlaklık ortalaması/sapması, koyu-açık piksel oranı ve tekdüze kare tespiti
3. **OCR:** Windows Media OCR; screenshot buluta gönderilmez
4. **Sınıflandırma:** OCR + dosya metni + kategori sözlüğü + kullanıcıdan öğrenilen özellik ağırlıkları
5. **Görsel sinyal:** açık/koyu, baskın renk ve yatay/dikey/kare etiketleri
6. **Semantik indeks:** kelime, ilişkili terim ve karakter üçlülerinden 128 boyutlu normalize feature-hash vektörü
7. **Bağlam:** URL/domain, e-posta, kullanıcı adı, tarih ve fiyat çıkarımı
8. **Hafıza:** eylem geçmişi, tekrar eden bağlam, cooldown ve dönem sorguları

Bu sürümde neural CLIP veya yerel LLM yoktur. “Embedding” alanı küçük ve deterministik `feature-hash-v2` indeksidir. Bu tercih indirme boyutunu ve inference maliyetini düşürür; görsel nesne tanıma kalitesi beklenmemelidir.

## Sürümler

- `analysis_version = 2`
- `embedding_model = feature-hash-v2`
- `schema user_version = 4`
- OCR engine Windows'ta `windows-media-ocr`

Model sürümü yükseldiğinde identity token aynı olsa bile yalnızca eski analizler yeniden hesaplanır. Kullanıcının kategori kararı `collection_items.source = user` ve action geçmişinde korunur.

## Kişisel öğrenme

Kullanıcı bir kategoriyi düzelttiğinde uygulama screenshot'tan şu genel özellikleri çıkarır:

- normalleştirilmiş kelime ve kısa kökler
- yatay/dikey/kare oranı
- açık/koyu/normal ton
- düşük/orta/yüksek görsel doku

Eski kategori özellikleri negatif, yeni kategori özellikleri pozitif ağırlık alır. Yeni bir screenshot'ta eşleşen ağırlık toplamı yeterliyse temel kategori tahmini cihaz üzerinde değişir ve `kişisel-model` etiketi eklenir. Ham görüntü veya eğitim verisi dışarı gönderilmez.

Bu çevrimiçi öğrenme basit ve denetlenebilirdir. Tek bir düzeltmenin bütün galeriyi ele geçirmemesi için skor eşiği kullanılır; kullanıcı düzeltmesi her zaman son sözdür.

## Semantik arama

Arama sorgusu ve her screenshot aynı deterministic vektör uzayına çevrilir. Türkçe/İngilizce küçük alias kümeleri örneğin `ayakkabı / shoe / sneaker` ve `siyah / black / dark / koyu` ilişkisini kurar. Karakter üçlüleri küçük yazım farklılıklarına tolerans ekler. Sonuçlar cosine similarity ile sıralanır.

Bu, “siyah ayakkabı” gibi günlük sorgular için ucuz bir başlangıç katmanıdır. Genel dünya bilgisi veya görüntüde OCR'sız nesne araması sağlamaz. Daha sonra eklenecek opsiyonel görsel model aynı `embeddings.model_version` sınırına yeni bir satır türü eklemelidir.

## Context hafızası

Hafıza bir prompt'a binlerce OCR satırı doldurmaz.

- **Kanıt:** her entity ve analiz bir `asset_id`ye bağlıdır.
- **Yapı:** kategori sayıları, tekrar eden bağlam, eylemler ve gösterim geçmişi SQLite'ta tutulur.
- **Retrieval:** Recent, arama ve rapor yalnızca gerekli satırları sorgular.

`Geçmişten` sıralaması en az 14 günlük, silinmemiş, hassas olmayan ve yakın zamanda gösterilmemiş kayıtları seçer. Kullanıcının açtığı/sakladığı içerik pozitif; reddettiği içerik negatif sinyal olur. Tekrar eden domain veya bağlam gerekçeye eklenebilir.

## Raporlar

Haftalık ve aylık rapor doğrudan ölçülen olaylardan oluşur:

- eklenen, saklanan ve temizleme kuyruğuna alınan kayıt
- gerçekten geri kazanılan byte
- yeniden gösterilen screenshot sayısı
- en yoğun kategoriler
- tekrar eden bağlamlar

Bir domain görülmesi “seyahat planlıyorsun” gibi spekülatif sonuca çevrilmez. Uygulama yalnızca kanıtlanan sayıyı ve etiketi gösterir.

## Güven kuralları

- Otomatik kalıcı silme yoktur.
- Sistem çöpü komutu explicit `confirmed` olmadan reddedilir.
- Sohbet ve belge kategorileri hassas kabul edilir; varsayılan resurface sorgusuna girmez.
- Düşük güvenli içerik `other` kalır.
- Kaynaktan dışarıdan silinme, kullanıcının temizlik başarısı sayılmaz.
- Güncelleme ve AI analizi birbirinden bağımsızdır; screenshot updater endpoint'ine gitmez.

## Sonraki model paketi

Gerçek OCR'sız nesne araması için opsiyonel, quantized bir mobil/masaüstü görsel encoder gerekir. Paket açık kullanıcı seçimiyle, sürüm ve checksum kontrolüyle indirilmeli; temel ürün bu paket olmadan çalışmaya devam etmelidir. Kalite kararı sabit bir test arşivinde precision/recall ve yanlış temizlik önerisi oranıyla verilmelidir.
