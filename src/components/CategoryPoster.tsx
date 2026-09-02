import { ArrowRight } from 'lucide-react';
import { CATEGORY_META, type Category, type ScreenshotItem } from '../types';
import { ScreenshotPreview } from './ScreenshotPreview';

interface CategoryPosterProps {
  categoryId: Category;
  items: ScreenshotItem[];
  onOpen: () => void;
}

export function selectCategoryCover(items: ScreenshotItem[], categoryId: Category): ScreenshotItem {
  const newestFirst = [...items].sort(
    (first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
  );
  if (categoryId === 'junk') return newestFirst[0];

  return newestFirst.find((item) => {
    const luminance = item.visualFingerprint?.meanLuminance;
    const signals = item.junkSignals ?? [];
    return !signals.some((signal) => ['near-black', 'near-white', 'uniform-frame'].includes(signal))
      && (luminance === undefined || (luminance > 12 && luminance < 244));
  }) ?? newestFirst[0];
}

export function CategoryPoster({ categoryId, items, onOpen }: CategoryPosterProps) {
  const meta = CATEGORY_META[categoryId];
  const cover = selectCategoryCover(items, categoryId);

  return (
    <button className="category-poster" type="button" onClick={onOpen} aria-label={`${meta.label}, ${items.length} ekran görüntüsü`}>
      <ScreenshotPreview item={cover} />
      <span className="category-poster-scrim" />
      <span className="category-poster-copy">
        <span><strong>{meta.label}</strong><small>{items.length} ekran görüntüsü</small></span>
        <ArrowRight size={21} />
      </span>
    </button>
  );
}

