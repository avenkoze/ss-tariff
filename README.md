# SS TARIFF

Ekran goruntulerini cihazdan disari cikarmadan siniflandiran, gruplandiran ve temizleme kuyruguna alan privacy-first bir urun prototipi.

## Calistirma

```bash
npm install
npm run dev
```

Kontroller:

```bash
npm run test
npm run build
```

## Bu surumde calisanlar

- Ekran goruntusu dosyalarini surukle-birak veya dosya secici ile ice aktarma
- Dosya adindan yerel siniflandirma ve etiketleme
- Gorsel perceptual hash ile benzer ekran goruntulerini bulma
- IndexedDB uzerinde yerel metadata ve Blob saklama
- Kategori, arama, gruplar ve temizleme kuyrugu
- Silme oncesi inceleme, geri alma ve kalici temizleme
- Veri akisinin aciklandigi Private AI merkezi
- `Bugun` ekrani: 30 gunluk ozet, kaynakli ilgi hafizasi ve eski kaydi yeniden gosterme
- Siyah, beyaz ve tek renk kareler icin aciklanabilir cop sinyalleri
- Platformdan bagimsiz incremental scan engine ve scheduler/source kontratlari

Demo kayitlari ilk acilista arayuzu doldurur. Gercek dosyalar eklendiginde yalnizca bu tarayicinin IndexedDB alaninda tutulur.

## Sonraki teknik adim

`LocalAnalyzer` arayuzunun arkasina WebGPU tabanli OCR/embedding modeli eklenmeli. Mevcut kod bu modele gecis icin analiz sonucunu `category`, `confidence`, `tags`, `extractedText` ve `hash` alanlariyla ayirir.

Detaylar:

- [Urun temeli](./docs/PRODUCT.md)
- [Windows-first platform mimarisi](./docs/ARCHITECTURE.md)
- [AI hedefleri ve context hafizasi](./docs/AI-SYSTEM.md)
- [Windows ve mobil yol haritasi](./docs/ROADMAP.md)

UI/framework karari bilerek cekirdekten ayrilmistir. Mevcut React arayuzu urun laboratuvaridir; uretim platform adaptoru daha sonra secilecek kabuk uzerinden `src/core` kontratlarina baglanir.
