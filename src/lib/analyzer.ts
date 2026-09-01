import type {
  AnalysisResult,
  Category,
  JunkSignal,
  ScreenshotItem,
  VisualFingerprint,
} from '../types';

export const ANALYSIS_VERSION = 2;

export function detectJunkSignals(fingerprint: VisualFingerprint): JunkSignal[] {
  const signals: JunkSignal[] = [];
  if (fingerprint.darkPixelRatio >= 0.96 && fingerprint.luminanceDeviation <= 10) {
    signals.push('near-black');
  }
  if (fingerprint.brightPixelRatio >= 0.98 && fingerprint.luminanceDeviation <= 6) {
    signals.push('near-white');
  }
  if (fingerprint.luminanceDeviation <= 2.5 && signals.length === 0) {
    signals.push('uniform-frame');
  }
  return signals;
}

const CATEGORY_KEYWORDS: Array<{ category: Category; words: string[] }> = [
  {
    category: 'shopping',
    words: ['shop', 'urun', 'ürün', 'siparis', 'sipariş', 'ayakkabi', 'ayakkabı', 'fiyat', 'sepet'],
  },
  {
    category: 'food',
    words: ['recipe', 'tarif', 'yemek', 'makarna', 'kahve', 'kahvalti', 'kahvaltı'],
  },
  {
    category: 'places',
    words: ['map', 'maps', 'mekan', 'hotel', 'otel', 'rota', 'konum', 'istanbul'],
  },
  {
    category: 'chats',
    words: ['chat', 'whatsapp', 'message', 'mesaj', 'telegram', 'dm', 'konusma', 'konuşma'],
  },
  {
    category: 'ideas',
    words: ['note', 'not', 'idea', 'fikir', 'book', 'kitap', 'liste'],
  },
  {
    category: 'documents',
    words: ['receipt', 'fis', 'fiş', 'invoice', 'fatura', 'ticket', 'bilet', 'qr', 'boarding'],
  },
  {
    category: 'social',
    words: ['instagram', 'reddit', 'tweet', 'x com', 'tiktok', 'post', 'story'],
  },
];

function tokenizeFilename(filename: string): string[] {
  return filename
    .replace(/\.[^/.]+$/, '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[_\-.]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function classify(text: string): { category: Category; confidence: number; tags: string[] } {
  const normalized = text.toLocaleLowerCase('tr-TR');
  let best: { category: Category; hits: string[] } = { category: 'other', hits: [] };

  for (const candidate of CATEGORY_KEYWORDS) {
    const hits = candidate.words.filter((word) => normalized.includes(word));
    if (hits.length > best.hits.length) best = { category: candidate.category, hits };
  }

  return {
    category: best.category,
    confidence: best.hits.length > 0 ? Math.min(0.96, 0.68 + best.hits.length * 0.09) : 0.51,
    tags: [...new Set(best.hits)].slice(0, 5),
  };
}

async function inspectImage(file: File): Promise<{
  width: number;
  height: number;
  hash?: string;
  averageColor?: string;
  visualFingerprint?: VisualFingerprint;
  junkSignals?: JunkSignal[];
}> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    return { width: bitmap.width, height: bitmap.height };
  }

  context.drawImage(bitmap, 0, 0, 8, 8);
  const pixels = context.getImageData(0, 0, 8, 8).data;
  const luminance: number[] = [];
  let red = 0;
  let green = 0;
  let blue = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    red += pixels[index];
    green += pixels[index + 1];
    blue += pixels[index + 2];
    luminance.push(
      pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114,
    );
  }

  const average = luminance.reduce((sum, value) => sum + value, 0) / luminance.length;
  const hash = luminance.map((value) => (value >= average ? '1' : '0')).join('');
  const count = luminance.length;
  const averageColor = `rgb(${Math.round(red / count)}, ${Math.round(green / count)}, ${Math.round(
    blue / count,
  )})`;
  const variance = luminance.reduce((sum, value) => sum + (value - average) ** 2, 0) / count;
  const visualFingerprint: VisualFingerprint = {
    meanLuminance: average,
    luminanceDeviation: Math.sqrt(variance),
    darkPixelRatio: luminance.filter((value) => value <= 12).length / count,
    brightPixelRatio: luminance.filter((value) => value >= 245).length / count,
  };
  const junkSignals = detectJunkSignals(visualFingerprint);
  const dimensions = {
    width: bitmap.width,
    height: bitmap.height,
    hash,
    averageColor,
    visualFingerprint,
    junkSignals,
  };
  bitmap.close();
  return dimensions;
}

export async function analyzeFile(file: File): Promise<AnalysisResult> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} bir görsel değil.`);
  if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} 25 MB sınırını aşıyor.`);

  const tokens = tokenizeFilename(file.name);
  const extractedText = tokens.join(' ');
  const classification = classify(extractedText);
  const dimensions = await inspectImage(file);
  const isLikelyJunk = (dimensions.junkSignals?.length ?? 0) > 0;

  return {
    ...classification,
    category: isLikelyJunk ? 'junk' : classification.category,
    confidence: isLikelyJunk ? 0.97 : classification.confidence,
    ...dimensions,
    tags: isLikelyJunk
      ? ['muhtemel çöp', ...(dimensions.junkSignals ?? [])]
      : classification.tags.length > 0
        ? classification.tags
        : ['yeni'],
    extractedText,
    analyzer: 'local-vision',
  };
}

export function hammingDistance(first: string, second: string): number {
  if (first.length !== second.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) distance += 1;
  }
  return distance;
}

export function findSimilarGroup(
  items: ScreenshotItem[],
  hash?: string,
): { groupId: string; matchedId: string } | undefined {
  if (!hash) return undefined;
  const match = items.find((item) => item.hash && hammingDistance(item.hash, hash) <= 5);
  if (!match) return undefined;
  return {
    groupId: match.duplicateGroup ?? `similar-${match.id}`,
    matchedId: match.id,
  };
}
