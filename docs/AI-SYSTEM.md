# SS TARIFF - AI Sistemi ve Hafıza

## Ürünün AI hedefleri

AI tek bir chat kutusu değildir. Sekiz ayrı iş hedefi vardır:

1. **Anla:** OCR, görsel içerik, uygulama kaynağı ve zamanı birleştir.
2. **Düzenle:** Screenshot'ı bir veya birden fazla sanal koleksiyona yerleştir.
3. **Temizlet:** kopya, siyah/boş, süresi geçmiş ve geçici içeriği gerekçeli öner.
4. **Bul:** kelime aynı olmasa bile niyet ve anlamla arama yap.
5. **Hatırlat:** unutulmuş ama hâlâ anlamlı bir kaydı uygun zamanda yeniden göster.
6. **Özetle:** haftalık/aylık ilgileri, değişimleri ve açık işleri anlat.
7. **Eyleme dönüştür:** ürün, mekan, tarif, etkinlik ve görev için yapılandırılmış öneri üret.
8. **Koru:** hassas içerik riskini tanı, indeksleme ve gösterme politikasını uygula.

## Ucuzdan pahalıya analiz hattı

Her dosyada büyük model çalışmaz.

```text
0. Metadata + content identity
1. Görsel kalite + exact/perceptual duplicate
2. Yerel OCR
3. Hafif görsel/text embedding
4. Kural tabanlı zaman ve çöp sinyalleri
5. Yalnızca belirsiz/değerli kayıtta küçük yerel dil modeli
6. Memory graph güncellemesi
```

Örnek: tamamen siyah kareyi tespit etmek için LLM gerekmez. Ortalama parlaklık, sapma ve koyu piksel oranı yeterlidir. OCR metni güçlü biçimde `boarding pass` diyorsa görsel dil modeli tekrar çalıştırılmaz. Bu kademeli yaklaşım pil, RAM, tarama süresi ve model boyutunu düşürür.

## AI çıktısı

Her analiz açıklanabilir ve sürümlüdür:

- kategori ve alternatif kategoriler
- güven skoru
- OCR metni ve dil
- görsel/text embedding sürümü
- çıkarılan varlıklar: ürün, marka, fiyat, mekan, tarih, etkinlik
- zaman geçerliliği
- çöp sinyalleri ve gerekçeleri
- önerilen eylemler
- hassasiyet seviyesi

Model güncellemesi eski sonucu sessizce ezmez; yeni sürüm kayıt edilir ve gerekirse kullanıcı kararı korunur.

## Context hafızası

Hafıza, binlerce OCR metnini bir prompt'a doldurmak değildir. Üç katmandır:

### Kanıt katmanı

Ham screenshot ve analiz sonucu. Her iddianın hangi screenshot'tan geldiği bellidir.

### Yapılandırılmış hafıza

- tekrar eden ilgi: siyah ayakkabı, kahve ekipmanı, belirli seyahat rotası
- varlık: ürün, marka, mekan, kişi, konu
- olay: bilet tarihi, teslimat, etkinlik, rezervasyon
- karar: saklandı, silindi, kategori düzeltildi, hatırlatma kapatıldı
- dönem: bu hafta/ay hangi kategori arttı

### Retrieval context

Bir arama, özet veya hatırlatma anında yalnızca ilgili hafıza kayıtları ve kanıtları seçilir. Modelin göreceği context küçük, kaynaklı ve amaca özeldir.

## Yeniden hatırlatma motoru

"Rastgele" tamamen rastgele değildir. Sıralama şu sinyalleri kullanır:

- en az 14 gün önce kaydedilmiş olma
- ürün/mekan/fikir gibi tekrar bakılması değerli kategori
- benzer ilginin birden fazla görülmesi
- süresi geçmemiş olma
- son 21 günde gösterilmemiş olma
- kullanıcı tarafından daha önce reddedilmemiş olma
- çeşitlilik: aynı kategori art arda gösterilmez

Günlük seed sayesinde aynı gün kart kendi kendine değişmez. Manuel yenileme yeni bir aday seçebilir. Kart her zaman gerekçe gösterir: `47 gün önce bu ayakkabıya bakmıştın`.

## Dönemsel içgörü

Haftalık ve aylık özetler yalnızca ölçülebilen olaylardan üretilir:

- kaç screenshot alındı
- önceki döneme göre artış/azalış
- en çok kaydedilen kategoriler
- tekrar eden ürün/konu/mekanlar
- süresi geçen kayıtlar
- temizlenebilir alan
- saklanan ve silinen önerilerin doğruluk oranı

"Bu ay seyahat planlıyorsun" gibi yorum ancak birden çok kanıt ve yeterli güven varsa gösterilir; aksi halde `Seyahat içerikleri arttı` denir.

## Değer hendeği

SS TARIFF'i genel bir AI'a yazılan tek prompttan ayıran parçalar:

- işletim sistemi galerisiyle güvenli ve artımlı entegrasyon
- yıllara yayılan yerel screenshot indeksi
- kullanıcı kararlarından öğrenen kişisel sıralama
- kaynaklı entity/interest memory graph
- sürümlü multimodal embedding ve OCR indeksi
- yanlış silmeyi engelleyen politika ve sistem çöpü entegrasyonu
- zamanlama, cooldown, çeşitlilik ve dönem analizi
- cihaz kapasitesine göre kademeli inference

Tek bir özellik kolay kopyalanabilir. Birlikte çalışan indeks + hafıza + güvenli yaşam döngüsü ürünün asıl değeridir.

## Güven kuralları

- Otomatik kalıcı silme yok.
- Düşük güvenli sınıflandırma `Diğer`e gider; kesin etiket gibi gösterilmez.
- Hassas sohbet/belge varsayılan olarak yeniden hatırlatma kartına çıkmaz.
- Her içgörünün kanıt screenshot'larına geçişi vardır.
- Kullanıcı düzeltmesi model tahmininden üstündür.
- Özel veri bulut modeline gönderilmez; ileride opsiyon eklenirse ayrı ve açık izin ister.
