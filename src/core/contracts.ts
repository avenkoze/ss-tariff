import type { AnalysisResult, ScreenshotItem } from '../types';

export type PlatformKind = 'windows' | 'android' | 'ios' | 'macos' | 'linux' | 'browser';
export type ScanTrigger = 'manual' | 'scheduled' | 'startup' | 'watch-event';

export interface SourceAsset {
  sourceId: string;
  sourceUri: string;
  sourceName: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  modifiedAt: string;
  identityToken: string;
}

export interface SourceCursor {
  sourceName: string;
  value?: string;
  scannedAt?: string;
}

export interface ScanRequest {
  trigger: ScanTrigger;
  requestedAt: string;
  cursor?: SourceCursor;
  analysisVersion: number;
  maxItems?: number;
}

export interface ScanProgress {
  discovered: number;
  analyzed: number;
  skipped: number;
  failed: number;
  currentFileName?: string;
}

export interface ScanResult extends ScanProgress {
  startedAt: string;
  completedAt: string;
  nextCursor?: SourceCursor;
  errors: Array<{ sourceId: string; message: string }>;
}

export interface ScreenshotSourcePort {
  readonly platform: PlatformKind;
  readonly sourceName: string;
  listChangedAssets(cursor?: SourceCursor, limit?: number): Promise<{
    assets: SourceAsset[];
    nextCursor?: SourceCursor;
  }>;
  openAsset(asset: SourceAsset): Promise<Blob>;
  requestDelete(assets: SourceAsset[]): Promise<{
    deletedIds: string[];
    rejectedIds: string[];
    requiresUserConfirmation: boolean;
  }>;
}

export interface AssetIndexRecord {
  sourceId: string;
  identityToken: string;
  analysisVersion: number;
  screenshotId: string;
}

export interface ScreenshotRepositoryPort {
  getAssetIndex(sourceId: string): Promise<AssetIndexRecord | undefined>;
  saveAnalyzedAsset(
    asset: SourceAsset,
    blob: Blob,
    analysis: AnalysisResult,
    analysisVersion: number,
  ): Promise<ScreenshotItem>;
  saveCursor(cursor: SourceCursor): Promise<void>;
}

export interface ScreenshotAnalyzerPort {
  analyze(blob: Blob, fileName: string): Promise<AnalysisResult>;
}

export interface ScheduleWindow {
  id: string;
  localTime: string;
  days: Array<0 | 1 | 2 | 3 | 4 | 5 | 6>;
  enabled: boolean;
}

export interface ScanSchedulePort {
  readonly platform: PlatformKind;
  configure(windows: ScheduleWindow[]): Promise<void>;
  getConfiguredWindows(): Promise<ScheduleWindow[]>;
  getNextExpectedRun(now: Date): Promise<Date | undefined>;
}

export interface NotificationPort {
  showLocalNotification(input: {
    id: string;
    title: string;
    body: string;
    deepLink?: string;
  }): Promise<void>;
}

export interface ScanDependencies {
  source: ScreenshotSourcePort;
  repository: ScreenshotRepositoryPort;
  analyzer: ScreenshotAnalyzerPort;
  onProgress?: (progress: ScanProgress) => void;
  isCancelled?: () => boolean;
}
