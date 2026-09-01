import { CATEGORY_META, type Category, type ScreenshotItem } from '../types';

const TR_MAP: Record<string, string> = {
  ayakkabi: 'ayakkabı',
  alisveris: 'alışveriş',
  mekan: 'mekan',
  kahvalti: 'kahvaltı',
  konusma: 'konuşma',
  sohbet: 'mesaj',
  fis: 'fiş',
  ucus: 'uçuş',
};

export function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchItems(
  items: ScreenshotItem[],
  query: string,
  category: Category | 'all' = 'all',
): ScreenshotItem[] {
  const normalizedQuery = normalizeText(query);
  const tokens = normalizedQuery
    ? normalizedQuery.split(' ').map((token) => normalizeText(TR_MAP[token] ?? token))
    : [];

  return items.filter((item) => {
    if (item.status === 'trash') return false;
    if (category !== 'all' && item.category !== category) return false;
    if (tokens.length === 0) return true;

    const haystack = normalizeText(
      [
        item.name,
        item.extractedText,
        item.tags.join(' '),
        CATEGORY_META[item.category].label,
      ].join(' '),
    );

    return tokens.every((token) => haystack.includes(token));
  });
}

export function getCleanupScore(item: ScreenshotItem, now = new Date()): number {
  let score = 0;
  const ageInDays = Math.floor(
    (now.getTime() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );

  if (item.duplicateGroup) score += 55;
  if (item.category === 'junk') score += 80;
  if ((item.junkSignals?.length ?? 0) > 0) score += 15;
  if (ageInDays > 120) score += 20;
  else if (ageInDays > 45) score += 10;
  if (item.tags.some((tag) => ['geçmiş', 'geçici', 'tekrar'].includes(tag))) score += 25;
  if (item.category === 'social') score += 8;
  if (item.status === 'kept') score -= 100;

  return Math.max(0, score);
}

export function getCleanupReason(item: ScreenshotItem): string {
  if (item.junkSignals?.includes('near-black')) return 'Neredeyse tamamen siyah görüntü';
  if (item.junkSignals?.includes('near-white')) return 'Neredeyse tamamen boş görüntü';
  if (item.junkSignals?.includes('uniform-frame')) return 'İçerik taşımayan tek renk görüntü';
  if (item.duplicateGroup) return 'Benzer bir kopyası daha var';
  if (item.tags.includes('geçmiş')) return 'Tarihi geçmiş içerik';
  if (item.tags.includes('geçici')) return 'Geçici bilgi artık eski';
  if (item.category === 'social') return 'Uzun süredir açılmamış kayıt';
  return 'Eski ve düşük öncelikli';
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toLocaleString('tr-TR', {
    maximumFractionDigits: index > 1 ? 1 : 0,
  })} ${units[index]}`;
}

export function formatRelativeDate(value: string, now = new Date()): string {
  const date = new Date(value);
  const days = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (days <= 0) return 'Bugün';
  if (days === 1) return 'Dün';
  if (days < 7) return `${days} gün önce`;
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}
