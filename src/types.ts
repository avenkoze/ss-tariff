export type Category =
  | 'shopping'
  | 'food'
  | 'places'
  | 'chats'
  | 'ideas'
  | 'documents'
  | 'social'
  | 'junk'
  | 'other';

export type ItemStatus = 'active' | 'kept' | 'trash';

export type JunkSignal =
  | 'near-black'
  | 'near-white'
  | 'uniform-frame'
  | 'duplicate'
  | 'expired'
  | 'temporary';

export interface VisualFingerprint {
  meanLuminance: number;
  luminanceDeviation: number;
  darkPixelRatio: number;
  brightPixelRatio: number;
}

export type PreviewKind =
  | 'product'
  | 'chat'
  | 'recipe'
  | 'map'
  | 'ticket'
  | 'note'
  | 'receipt'
  | 'social';

export interface PreviewData {
  kind: PreviewKind;
  eyebrow: string;
  title: string;
  lines?: string[];
  accent: string;
}

export interface ScreenshotItem {
  id: string;
  name: string;
  category: Category;
  confidence: number;
  tags: string[];
  extractedText: string;
  createdAt: string;
  addedAt: string;
  width: number;
  height: number;
  size: number;
  hash?: string;
  averageColor?: string;
  visualFingerprint?: VisualFingerprint;
  junkSignals?: JunkSignal[];
  duplicateGroup?: string;
  status: ItemStatus;
  analyzer: 'demo' | 'local-vision' | 'browser-ocr' | 'native-private-ai';
  blob?: Blob;
  blobUrl?: string;
  native?: boolean;
  sourceId?: string;
  sourceUri?: string;
  thumbnailPath?: string;
  preview?: PreviewData;
  analysisVersion?: number;
  lastAnalyzedAt?: string;
}

export type ViewId = 'recent' | 'library';

export interface AnalysisResult {
  category: Category;
  confidence: number;
  tags: string[];
  extractedText: string;
  width: number;
  height: number;
  hash?: string;
  averageColor?: string;
  visualFingerprint?: VisualFingerprint;
  junkSignals?: JunkSignal[];
  analyzer: 'local-vision' | 'browser-ocr';
}

export const CATEGORY_META: Record<
  Category,
  { label: string; shortLabel: string; color: string }
> = {
  shopping: { label: 'Alışveriş', shortLabel: 'Alışveriş', color: '#ef6a4c' },
  food: { label: 'Tarifler & Yemek', shortLabel: 'Tarifler', color: '#d89428' },
  places: { label: 'Mekanlar & Gezi', shortLabel: 'Mekanlar', color: '#3f6fd8' },
  chats: { label: 'Konuşmalar', shortLabel: 'Sohbetler', color: '#15a16f' },
  ideas: { label: 'Fikirler & Notlar', shortLabel: 'Fikirler', color: '#8d62c9' },
  documents: { label: 'Belgeler', shortLabel: 'Belgeler', color: '#53747b' },
  social: { label: 'Sosyal', shortLabel: 'Sosyal', color: '#d55075' },
  junk: { label: 'Muhtemel Çöp', shortLabel: 'Çöp', color: '#b85346' },
  other: { label: 'Diğer', shortLabel: 'Diğer', color: '#727975' },
};
