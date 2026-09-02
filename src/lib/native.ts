import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import type { Category, ItemStatus, JunkSignal, ScreenshotItem } from '../types';

const CATEGORIES = new Set<Category>([
  'shopping',
  'food',
  'places',
  'chats',
  'ideas',
  'documents',
  'social',
  'junk',
  'other',
]);
const STATUSES = new Set<ItemStatus>(['active', 'kept', 'trash']);
const JUNK_SIGNALS = new Set<JunkSignal>([
  'near-black',
  'near-white',
  'uniform-frame',
  'duplicate',
  'expired',
  'temporary',
]);

export interface NativeSettings {
  sourceFolder?: string;
  scanOnStartup: boolean;
  watchFolder: boolean;
  notificationsEnabled: boolean;
  scheduleTimes: string[];
  lastScanAt?: string;
}

interface NativeAssetDto extends Omit<ScreenshotItem, 'analyzer' | 'category' | 'status' | 'junkSignals'> {
  sourceId: string;
  sourceUri: string;
  category: string;
  status: string;
  analyzer: string;
  junkSignals: string[];
  thumbnailPath?: string;
}

interface NativeSnapshotDto {
  assets: NativeAssetDto[];
  settings: NativeSettings;
  databasePath: string;
  platform: string;
}

export interface NativeSnapshot {
  assets: ScreenshotItem[];
  settings: NativeSettings;
  databasePath: string;
  platform: string;
}

export interface NativeScanSummary {
  runId: string;
  sourcePath: string;
  discovered: number;
  analyzed: number;
  skipped: number;
  failed: number;
  completedAt: string;
  errors: string[];
}

interface SemanticResultDto {
  item: NativeAssetDto;
  score: number;
}

export function isNativeRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function mapNativeAsset(asset: NativeAssetDto): ScreenshotItem {
  const category = CATEGORIES.has(asset.category as Category)
    ? (asset.category as Category)
    : 'other';
  const status = STATUSES.has(asset.status as ItemStatus)
    ? (asset.status as ItemStatus)
    : 'active';

  return {
    ...asset,
    category,
    status,
    analyzer: 'native-private-ai',
    junkSignals: asset.junkSignals.filter((signal): signal is JunkSignal =>
      JUNK_SIGNALS.has(signal as JunkSignal),
    ),
    blobUrl: asset.thumbnailPath ? convertFileSrc(asset.thumbnailPath) : undefined,
    native: true,
  };
}

export async function getNativeSnapshot(): Promise<NativeSnapshot> {
  const snapshot = await invoke<NativeSnapshotDto>('get_app_snapshot');
  return { ...snapshot, assets: snapshot.assets.map(mapNativeAsset) };
}

export async function selectAndScanFolder(): Promise<NativeScanSummary | undefined> {
  const folder = await open({ directory: true, multiple: false, title: 'Screenshot klasörünü seç' });
  if (typeof folder !== 'string') return undefined;
  return invoke<NativeScanSummary>('scan_selected_folder', { folder, trigger: 'manual' });
}

export function scanNativeLibrary(trigger = 'manual'): Promise<NativeScanSummary> {
  return invoke<NativeScanSummary>('scan_configured_folder', { trigger });
}

export function saveNativeSettings(settings: NativeSettings): Promise<void> {
  return invoke('save_native_settings', { settings });
}

export function updateNativeStatus(id: string, status: ItemStatus): Promise<void> {
  return invoke('update_native_status', { id, status });
}

export function moveNativeToSystemTrash(id: string): Promise<void> {
  return invoke('move_native_to_system_trash', { id, confirmed: true });
}

export async function searchNativeLibrary(query: string, limit = 100): Promise<ScreenshotItem[]> {
  const results = await invoke<SemanticResultDto[]>('semantic_search', { query, limit });
  return results.map((result) => mapNativeAsset(result.item));
}

export function recordNativeResurface(id: string, response?: string): Promise<void> {
  return invoke('record_resurface_response', { id, response });
}

export function onNativeLibraryChanged(
  listener: (summary: NativeScanSummary) => void,
): Promise<UnlistenFn> {
  return listen<NativeScanSummary>('native-library-changed', (event) => listener(event.payload));
}

export function onNativeScanError(listener: (message: string) => void): Promise<UnlistenFn> {
  return listen<string>('native-scan-error', (event) => listener(event.payload));
}
