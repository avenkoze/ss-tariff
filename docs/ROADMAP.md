# SS TARIFF - Windows ve Mobil Yol Haritası

## Aşama 0 - Ürün laboratuvarı

Mevcut React prototipi burada kalır. Amaç UI, sıralama, temizleme kararları ve hafıza kartlarını gerçek kullanıcılarla hızlı test etmektir. Browser Blob saklama üretim mimarisi değildir.

Çıkış ölçütü: kullanıcı eski bir screenshot'ı buluyor, en az bir temizleme kararı veriyor ve Today kartını anlıyor.

## Aşama 1 - Ortak çekirdek

- platform portları ve artımlı scan engine
- sürümlü analiz şeması
- SQLite migration'ları
- memory graph ve resurface history
- kural tabanlı siyah/boş/kopya/geçici tespiti
- offline test dataset ve kalite metrikleri

Çıkış ölçütü: 10.000 kayıtlık sahte arşivde değişmeyen dosyalar yeniden analiz edilmiyor; scan yarıda kesilse veri bozulmuyor.

## Aşama 2 - Windows MVP

- kullanıcının seçtiği screenshot klasörü
- incremental scan ve manuel yenileme
- uygulama açıkken watcher
- kullanıcı seçerse yaklaşık zamanlı OS görevi
- yerel OCR + embedding Lite paketi
- SQLite ve thumbnail cache
- Windows çöp kutusuna güvenli silme
- Today, dönem özeti ve yerel bildirim
- imzalı installer ve otomatik güncelleme kanalı

Çıkış ölçütü: internet kapalıyken import, arama, gruplama, hatırlatma ve silme çalışıyor; orijinal dosya yanlışlıkla kalıcı silinemiyor.

## Aşama 3 - Android

- MediaStore screenshot sorgusu ve scoped permission
- background job ile yaklaşık tarama
- cihaz gücü/bataryaya göre Lite/Full pipeline
- toplu silmede sistem onayı
- bildirim deep-link'i ve paylaş menüsünden ekleme
- Android'e özel performans ve termal test

Çıkış ölçütü: orta segment telefonda ilk indeksleme uygulamayı kilitlemiyor; günlük tarama yalnızca yeni kayıtları işliyor.

## Aşama 4 - Ürün derinliği

- semantik arama
- ürün/mekan/tarif/etkinlik yapılandırması
- açıklanabilir haftalık/aylık raporlar
- kişisel resurface ranking
- hassas içerik kasası
- kategori düzeltmelerinden cihaz içi kişiselleştirme

## Aşama 5 - iOS, macOS ve Linux

Ortak çekirdek korunur. Her platform için source, scheduler, trash, notification ve secure storage adaptörleri tamamlanır. iOS arka plan ve silme izinleri ürün metninde açıkça farklılaştırılır.

## Şimdilik yapılmayacaklar

- genel amaçlı chatbot
- bulut zorunluluğu
- otomatik kalıcı silme
- dosyaları varsayılan olarak fiziksel klasörlere taşıma
- sosyal ağ
- framework'e özgü iş mantığı
- tüm platformları aynı anda bitirmeye çalışma
