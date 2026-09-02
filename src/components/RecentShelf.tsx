import { ArrowLeft, ArrowRight } from 'lucide-react';
import useEmblaCarousel from 'embla-carousel-react';
import { useCallback, useEffect, useState } from 'react';
import { formatRelativeDate } from '../lib/search';
import { CATEGORY_META, type ScreenshotItem } from '../types';
import { ScreenshotPreview } from './ScreenshotPreview';

interface RecentShelfProps {
  items: ScreenshotItem[];
  loading: boolean;
  onOpen: (item: ScreenshotItem) => void;
  onChooseSource: () => void;
}

export function findInitialRecentIndex(items: ScreenshotItem[]): number {
  const meaningfulIndex = items.findIndex((item) => item.category !== 'junk');
  return Math.max(0, meaningfulIndex);
}

export function RecentShelf({ items, loading, onOpen, onChooseSource }: RecentShelfProps) {
  const [viewportRef, api] = useEmblaCarousel({
    align: 'center',
    containScroll: 'trimSnaps',
    loop: items.length > 4,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [canScrollPrevious, setCanScrollPrevious] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const syncCarousel = useCallback(() => {
    if (!api) return;
    setSelectedIndex(api.selectedScrollSnap());
    setCanScrollPrevious(api.canScrollPrev());
    setCanScrollNext(api.canScrollNext());
  }, [api]);

  useEffect(() => {
    if (!api) return undefined;
    syncCarousel();
    api.on('select', syncCarousel);
    api.on('reInit', syncCarousel);
    return () => {
      api.off('select', syncCarousel);
      api.off('reInit', syncCarousel);
    };
  }, [api, syncCarousel]);

  useEffect(() => {
    if (!api || items.length === 0) return;
    api.reInit();
    api.scrollTo(findInitialRecentIndex(items), true);
    syncCarousel();
  }, [api, items, syncCarousel]);

  if (items.length === 0) {
    return (
      <div className="recent-empty">
        <strong>{loading ? 'Galeri açılıyor' : 'Henüz ekran görüntüsü yok'}</strong>
        {!loading && <button className="primary-button" type="button" onClick={onChooseSource}>Klasör seç</button>}
      </div>
    );
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      api?.scrollPrev();
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      api?.scrollNext();
    }
  }

  return (
    <div className="recent-carousel" onKeyDown={handleKeyDown}>
      <button
        className="carousel-arrow carousel-arrow-previous"
        type="button"
        aria-label="Önceki ekran görüntüsü"
        disabled={!canScrollPrevious}
        onClick={() => api?.scrollPrev()}
      >
        <ArrowLeft size={22} />
      </button>
      <div className="recent-carousel-viewport" ref={viewportRef} tabIndex={0} aria-label="Son ekran görüntüleri">
        <div className="recent-carousel-track">
          {items.map((item, index) => (
            <article className={`recent-slide ${selectedIndex === index ? 'is-selected' : ''}`} key={item.id}>
              <button type="button" onClick={() => onOpen(item)} aria-label={`${item.name} detayını aç`} aria-current={selectedIndex === index ? 'true' : undefined}>
                <ScreenshotPreview item={item} />
                <span className="recent-card-scrim" />
                <span className="recent-card-copy">
                  <small>{CATEGORY_META[item.category].shortLabel}</small>
                  <strong>{item.preview?.title ?? item.name}</strong>
                  <span>{formatRelativeDate(item.createdAt)}</span>
                </span>
              </button>
            </article>
          ))}
        </div>
      </div>
      <button
        className="carousel-arrow carousel-arrow-next"
        type="button"
        aria-label="Sonraki ekran görüntüsü"
        disabled={!canScrollNext}
        onClick={() => api?.scrollNext()}
      >
        <ArrowRight size={22} />
      </button>
    </div>
  );
}
