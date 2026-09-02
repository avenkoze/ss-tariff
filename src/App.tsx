import {
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  Download,
  FolderOpen,
  Image,
  Images,
  Layers3,
  LockKeyhole,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ScreenshotPreview } from './components/ScreenshotPreview';
import { AppHeader } from './components/AppHeader';
import { CategoryPoster } from './components/CategoryPoster';
import { RecentShelf } from './components/RecentShelf';
import {
  selectResurfaceItems,
  type SurfaceHistory,
} from './core/memoryEngine';
import { DEMO_ITEMS } from './data/demo';
import { ANALYSIS_VERSION, analyzeFile, findSimilarGroup } from './lib/analyzer';
import { deleteLocalItem, loadLocalItems, saveLocalItem } from './lib/database';
import {
  CURATED_WALLPAPERS,
  getLaunchWallpaper,
  loadBrowserAppearance,
  normalizeAppearance,
  saveBrowserAppearance,
  type AppearanceSettings,
} from './lib/appearance';
import { loadBrowserBackground, saveBrowserBackground } from './lib/appearanceStorage';
import {
  getNativeSnapshot,
  cancelNativeScan,
  getNativePeriodReport,
  getNativeResurfaceCandidates,
  getNativeFileUrl,
  isNativeRuntime,
  moveNativeToSystemTrash,
  onNativeLibraryChanged,
  onNativeScanError,
  recordNativeResurface,
  scanNativeLibrary,
  searchNativeLibrary,
  selectAndScanFolder,
  saveNativeSettings,
  selectCustomBackground,
  updateNativeCategory,
  updateNativeStatus,
  type NativePeriodReport,
  type NativeResurfaceCandidate,
  type NativeSettings,
} from './lib/native';
import {
  formatBytes,
  formatRelativeDate,
  searchItems,
} from './lib/search';
import { checkForUpdate, installUpdate, type Update } from './lib/updater';
import {
  CATEGORY_META,
  type Category,
  type ScreenshotItem,
  type ViewId,
} from './types';

const NATIVE_RUNTIME = isNativeRuntime();

function loadSurfaceHistory(): SurfaceHistory {
  try {
    return JSON.parse(localStorage.getItem('ss-tariff-surface-history') ?? '{}') as SurfaceHistory;
  } catch {
    return {};
  }
}

function IconButton({
  label,
  children,
  onClick,
  className = '',
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button className={`icon-button ${className}`} type="button" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="confidence" aria-label={`Sınıflandırma güveni yüzde ${Math.round(value * 100)}`}>
      <span style={{ width: `${value * 100}%` }} />
    </div>
  );
}

function LibraryCard({
  item,
  onOpen,
  onTrash,
}: {
  item: ScreenshotItem;
  onOpen: () => void;
  onTrash?: () => void;
}) {
  return (
    <article className="library-card">
      <button className="card-preview-button" type="button" onClick={onOpen} aria-label={`${item.name} detayını aç`}>
        <ScreenshotPreview item={item} />
        {item.duplicateGroup && <span className="duplicate-chip"><Layers3 size={12} /> 2 benzer</span>}
      </button>
      {onTrash && <button className="tile-trash-button" type="button" onClick={onTrash} aria-label={`${item.name} öğesini sil`} title="Sil"><Trash2 size={17} /></button>}
      <div className="card-meta">
        <div>
          <span className="category-dot" style={{ background: CATEGORY_META[item.category].color }} />
          <strong>{CATEGORY_META[item.category].shortLabel}</strong>
        </div>
        <span>{formatRelativeDate(item.createdAt)}</span>
      </div>
    </article>
  );
}


async function measureImageLuminance(file: Blob): Promise<number> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return 0.4;
  context.drawImage(bitmap, 0, 0, 32, 32);
  bitmap.close();
  const pixels = context.getImageData(0, 0, 32, 32).data;
  let luminance = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    luminance += (pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722) / 255;
  }
  return luminance / (pixels.length / 4);
}

function App() {
  const [view, setView] = useState<ViewId>('recent');
  const [items, setItems] = useState<ScreenshotItem[]>(NATIVE_RUNTIME ? [] : DEMO_ITEMS);
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<ScreenshotItem | null>(null);
  const [selectedFromArchive, setSelectedFromArchive] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; undoId?: string } | null>(null);
  const [refreshSalt, setRefreshSalt] = useState(0);
  const [lastRefreshAt, setLastRefreshAt] = useState(() => new Date());
  const [surfaceHistory, setSurfaceHistory] = useState<SurfaceHistory>(loadSurfaceHistory);
  const [nativeSettings, setNativeSettings] = useState<NativeSettings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<NativeSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'appearance' | 'settings' | 'report'>('appearance');
  const [reportDays, setReportDays] = useState<7 | 30>(7);
  const [periodReport, setPeriodReport] = useState<NativePeriodReport | null>(null);
  const [nativeResurface, setNativeResurface] = useState<NativeResurfaceCandidate[]>([]);
  const [nativeSearchItems, setNativeSearchItems] = useState<ScreenshotItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(NATIVE_RUNTIME);
  const [scanning, setScanning] = useState(false);
  const [galleryLimit, setGalleryLimit] = useState(120);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [appearance, setAppearance] = useState<AppearanceSettings>(loadBrowserAppearance);
  const [appearanceDraft, setAppearanceDraft] = useState<AppearanceSettings>(appearance);
  const [launchWallpaper, setLaunchWallpaper] = useState(() => getLaunchWallpaper(appearance));
  const [browserBackgroundUrl, setBrowserBackgroundUrl] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const backgroundInput = useRef<HTMLInputElement>(null);
  const browserBackgroundUrlRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    if (NATIVE_RUNTIME) {
      Promise.all([getNativeSnapshot(), getNativeResurfaceCandidates()])
        .then(([snapshot, resurface]) => {
          if (!active) return;
          setItems(snapshot.assets);
          setNativeSettings(snapshot.settings);
          setSettingsDraft(snapshot.settings);
          const nextAppearance = normalizeAppearance(snapshot.settings.appearance);
          setAppearance(nextAppearance);
          setAppearanceDraft(nextAppearance);
          setLaunchWallpaper(getLaunchWallpaper(nextAppearance));
          setNativeResurface(resurface);
          if (!snapshot.settings.sourceFolder) {
            setSettingsTab('settings');
            setSettingsOpen(true);
          }
        })
        .catch((error) => {
          if (active) setToast({ message: error instanceof Error ? error.message : String(error) });
        })
        .finally(() => {
          if (active) setLibraryLoading(false);
        });
    } else {
      loadLocalItems()
        .then((localItems) => {
          if (active && localItems.length > 0) setItems((current) => [...localItems, ...current]);
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (NATIVE_RUNTIME || appearance.backgroundMode !== 'custom') return undefined;
    let active = true;
    loadBrowserBackground()
      .then((blob) => {
        if (!active || !blob) return;
        const url = URL.createObjectURL(blob);
        if (browserBackgroundUrlRef.current) URL.revokeObjectURL(browserBackgroundUrlRef.current);
        browserBackgroundUrlRef.current = url;
        setBrowserBackgroundUrl(url);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => () => {
    if (browserBackgroundUrlRef.current) URL.revokeObjectURL(browserBackgroundUrlRef.current);
  }, []);

  useEffect(() => {
    if (!NATIVE_RUNTIME) return undefined;
    const timer = window.setTimeout(() => {
      checkForUpdate().then(setAvailableUpdate).catch(() => undefined);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!NATIVE_RUNTIME || !query.trim()) {
      setNativeSearchItems([]);
      return undefined;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      searchNativeLibrary(query)
        .then((results) => {
          if (active) setNativeSearchItems(results.filter((item) => item.status !== 'trash'));
        })
        .catch(() => {
          if (active) setNativeSearchItems([]);
        });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    setGalleryLimit(120);
  }, [category, query]);

  useEffect(() => {
    if (!NATIVE_RUNTIME || !settingsOpen || settingsTab !== 'report') return undefined;
    let active = true;
    setPeriodReport(null);
    getNativePeriodReport(reportDays)
      .then((report) => {
        if (active) setPeriodReport(report);
      })
      .catch((error) => {
        if (active) setToast({ message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      active = false;
    };
  }, [settingsOpen, settingsTab, reportDays]);

  useEffect(() => {
    if (!NATIVE_RUNTIME) return undefined;
    let active = true;
    let stopLibraryListener: (() => void) | undefined;
    let stopErrorListener: (() => void) | undefined;
    void onNativeLibraryChanged(async (summary) => {
      if (!active) return;
      try {
        await reloadNativeLibrary();
        if (summary.analyzed > 0) {
          setToast({ message: `${summary.analyzed} screenshot arka planda düzenlendi.` });
        }
      } catch {
        // The next manual refresh retries the snapshot without interrupting the UI.
      }
    }).then((unlisten) => {
      if (active) stopLibraryListener = unlisten;
      else unlisten();
    });
    void onNativeScanError((message) => {
      if (active) setToast({ message });
    }).then((unlisten) => {
      if (active) stopErrorListener = unlisten;
      else unlisten();
    });
    return () => {
      active = false;
      stopLibraryListener?.();
      stopErrorListener?.();
    };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeItems = useMemo(() => items.filter((item) => item.status !== 'trash'), [items]);
  const galleryCategories = useMemo(
    () => (Object.keys(CATEGORY_META) as Category[])
      .map((categoryId) => ({
        categoryId,
        items: activeItems
          .filter((item) => item.category === categoryId)
          .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()),
      }))
      .filter((group) => group.items.length > 0),
    [activeItems],
  );
  const visibleItems = useMemo(
    () => {
      const source = NATIVE_RUNTIME && query.trim() ? nativeSearchItems : activeItems;
      const textQuery = NATIVE_RUNTIME && query.trim() ? '' : query;
      const matches = searchItems(source, textQuery, category);
      if (NATIVE_RUNTIME && query.trim()) return matches;
      return matches.sort(
        (first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
      );
    },
    [activeItems, nativeSearchItems, query, category],
  );
  const renderedVisibleItems = useMemo(
    () => visibleItems.slice(0, galleryLimit),
    [visibleItems, galleryLimit],
  );
  const recentItems = useMemo(
    () => [...activeItems]
      .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
      .slice(0, 6),
    [activeItems],
  );
  const archivePicks = useMemo(
    () => {
      if (NATIVE_RUNTIME) return nativeResurface;
      const recentIds = new Set(recentItems.map((item) => item.id));
      return selectResurfaceItems(
        activeItems.filter((item) => !recentIds.has(item.id)),
        lastRefreshAt,
        surfaceHistory,
        refreshSalt,
        3,
      );
    },
    [activeItems, lastRefreshAt, nativeResurface, recentItems, refreshSalt, surfaceHistory],
  );

  async function reloadNativeLibrary() {
    const [snapshot, resurface] = await Promise.all([
      getNativeSnapshot(),
      getNativeResurfaceCandidates(),
    ]);
    setItems(snapshot.assets);
    setNativeSettings(snapshot.settings);
    setSettingsDraft(snapshot.settings);
    setNativeResurface(resurface);
    setLastRefreshAt(new Date());
  }

  async function refreshLibrary() {
    if (NATIVE_RUNTIME) {
      setScanning(true);
      try {
        const summary = await scanNativeLibrary();
        await reloadNativeLibrary();
        setToast({
          message: summary.cancelled
            ? `Tarama durduruldu. ${summary.analyzed} dosya tamamlandı.`
            : summary.analyzed > 0
            ? `${summary.analyzed} yeni veya değişen screenshot analiz edildi.`
            : 'Klasör güncel.',
        });
      } catch (error) {
        setToast({ message: error instanceof Error ? error.message : String(error) });
      } finally {
        setScanning(false);
      }
      return;
    }
    setRefreshSalt((current) => current + 1);
    setLastRefreshAt(new Date());
    setToast({ message: 'Galeri güncellendi.' });
  }

  async function chooseNativeFolder() {
    setScanning(true);
    try {
      const summary = await selectAndScanFolder();
      if (!summary) return;
      await reloadNativeLibrary();
      setToast({ message: summary.cancelled ? `Tarama durduruldu. ${summary.analyzed} dosya tamamlandı.` : `${summary.analyzed} screenshot cihazında analiz edildi.` });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : String(error) });
    } finally {
      setScanning(false);
    }
  }

  async function stopNativeScan() {
    await cancelNativeScan();
    setToast({ message: 'Tarama mevcut dosyadan sonra duracak.' });
  }

  function openSettings(tab: 'appearance' | 'settings' | 'report' = 'appearance') {
    setSettingsDraft(nativeSettings ? { ...nativeSettings, scheduleTimes: [...nativeSettings.scheduleTimes] } : null);
    setAppearanceDraft({ ...appearance });
    setSettingsTab(tab);
    setSettingsOpen(true);
  }

  async function persistSettings() {
    const nextAppearance = normalizeAppearance(appearanceDraft);
    try {
      if (NATIVE_RUNTIME && settingsDraft) {
        const nextSettings = { ...settingsDraft, appearance: nextAppearance };
        await saveNativeSettings(nextSettings);
        setNativeSettings(nextSettings);
        setSettingsDraft(nextSettings);
      } else {
        saveBrowserAppearance(nextAppearance);
      }
      setAppearance(nextAppearance);
      const selectedWallpaper = CURATED_WALLPAPERS.find((wallpaper) => wallpaper.id === nextAppearance.backgroundId);
      if (selectedWallpaper) setLaunchWallpaper(selectedWallpaper);
      setSettingsOpen(false);
      setToast({ message: 'Ayarlar kaydedildi.' });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function chooseCustomBackground() {
    if (!NATIVE_RUNTIME) {
      backgroundInput.current?.click();
      return;
    }
    try {
      const prepared = await selectCustomBackground();
      if (!prepared) return;
      setAppearanceDraft((current) => ({
        ...current,
        backgroundMode: 'custom',
        customBackgroundPath: prepared.path,
        customBackgroundLuminance: prepared.luminance,
      }));
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function handleBackgroundInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setToast({ message: 'PNG, JPG veya WebP bir görsel seç.' });
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setToast({ message: 'Arka plan 50 MB’den küçük olmalı.' });
      return;
    }
    try {
      const [luminance] = await Promise.all([
        measureImageLuminance(file),
        saveBrowserBackground(file),
      ]);
      const url = URL.createObjectURL(file);
      if (browserBackgroundUrlRef.current) URL.revokeObjectURL(browserBackgroundUrlRef.current);
      browserBackgroundUrlRef.current = url;
      setBrowserBackgroundUrl(url);
      setAppearanceDraft((current) => ({
        ...current,
        backgroundMode: 'custom',
        customBackgroundLuminance: luminance,
      }));
    } catch {
      setToast({ message: 'Bu görsel arka plan olarak hazırlanamadı.' });
    }
  }

  async function changeItemCategory(item: ScreenshotItem, nextCategory: Category) {
    if (item.native) await updateNativeCategory(item.id, nextCategory);
    const updated = { ...item, category: nextCategory, confidence: 1 };
    setItems((current) => current.map((candidate) => candidate.id === item.id ? updated : candidate));
    setSelectedItem(updated);
    if (!item.native && !item.id.startsWith('demo-')) await saveLocalItem(updated);
    setToast({ message: `${CATEGORY_META[nextCategory].shortLabel} olarak düzeltildi.` });
  }

  async function dismissArchivePick(item: ScreenshotItem) {
    if (item.native) await recordNativeResurface(item.id, 'dismissed');
    setNativeResurface((current) => current.filter((candidate) => candidate.item.id !== item.id));
    setSelectedItem(null);
    setSelectedFromArchive(false);
    setToast({ message: 'Bu kayıt yakın zamanda yeniden gösterilmeyecek.' });
  }

  async function applyAvailableUpdate() {
    if (!availableUpdate || updateInstalling) return;
    setUpdateInstalling(true);
    try {
      await installUpdate(availableUpdate);
    } catch (error) {
      setUpdateInstalling(false);
      setToast({ message: error instanceof Error ? error.message : String(error) });
    }
  }

  function openArchivePick(item: ScreenshotItem) {
    const nextHistory = {
      ...surfaceHistory,
      [item.id]: new Date().toISOString(),
    };
    setSurfaceHistory(nextHistory);
    localStorage.setItem('ss-tariff-surface-history', JSON.stringify(nextHistory));
    if (item.native) void recordNativeResurface(item.id, 'opened');
    setSelectedFromArchive(true);
    setSelectedItem(item);
  }

  function openItem(item: ScreenshotItem) {
    setSelectedFromArchive(false);
    setSelectedItem(item);
  }

  async function updateStatus(item: ScreenshotItem, status: ScreenshotItem['status']) {
    if (item.native) await updateNativeStatus(item.id, status);
    const updated = { ...item, status };
    setItems((current) => current.map((candidate) => (candidate.id === item.id ? updated : candidate)));
    if (selectedItem?.id === item.id) setSelectedItem(updated);
    if (!item.native && !item.id.startsWith('demo-')) await saveLocalItem(updated);
  }

  async function importFiles(files: File[]) {
    const validFiles = files.filter((file) => file.type.startsWith('image/'));
    if (validFiles.length === 0) {
      setToast({ message: 'PNG, JPG veya WebP bir ekran görüntüsü seç.' });
      return;
    }

    setImportProgress({ current: 0, total: validFiles.length });
    let workingItems = [...items];
    let imported = 0;

    for (const file of validFiles) {
      try {
        const analysis = await analyzeFile(file);
        const similar = findSimilarGroup(workingItems, analysis.hash);
        const id = crypto.randomUUID();
        const item: ScreenshotItem = {
          id,
          name: file.name,
          ...analysis,
          tags: [...new Set([...analysis.tags, similar ? 'tekrar' : ''])].filter(Boolean),
          createdAt: new Date(file.lastModified || Date.now()).toISOString(),
          addedAt: new Date().toISOString(),
          size: file.size,
          duplicateGroup: similar?.groupId,
          junkSignals: [
            ...(analysis.junkSignals ?? []),
            ...(similar ? (['duplicate'] as const) : []),
          ],
          status: 'active',
          blob: file,
          blobUrl: URL.createObjectURL(file),
          analysisVersion: ANALYSIS_VERSION,
          lastAnalyzedAt: new Date().toISOString(),
        };

        const matchedItem = similar
          ? workingItems.find((candidate) => candidate.id === similar.matchedId)
          : undefined;
        if (matchedItem && !matchedItem.duplicateGroup) {
          const updatedMatch = { ...matchedItem, duplicateGroup: similar!.groupId };
          workingItems = workingItems.map((candidate) =>
            candidate.id === updatedMatch.id ? updatedMatch : candidate,
          );
          if (!updatedMatch.id.startsWith('demo-')) await saveLocalItem(updatedMatch);
        }
        workingItems = [item, ...workingItems];
        await saveLocalItem(item);
        imported += 1;
      } catch (error) {
        setToast({ message: error instanceof Error ? error.message : 'Bir dosya analiz edilemedi.' });
      }
      setImportProgress({ current: imported, total: validFiles.length });
    }

    setItems(workingItems);
    setImportProgress(null);
    setImportOpen(false);
    setView('library');
    setCategory('all');
    setToast({ message: `${imported} screenshot cihazında analiz edildi.` });
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    void importFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void importFiles(Array.from(event.dataTransfer.files));
  }

  async function sendToTrash(item: ScreenshotItem) {
    await updateStatus(item, 'trash');
    setToast({ message: 'Çöpe taşındı.', undoId: item.id });
  }

  async function deleteJunk(item: ScreenshotItem) {
    if (!window.confirm(`${item.name} silinsin mi?`)) return;
    try {
      if (item.native) {
        await moveNativeToSystemTrash(item.id);
      } else if (!item.id.startsWith('demo-')) {
        await deleteLocalItem(item.id);
      }
      if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setToast({ message: 'Silindi.' });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function undoTrash(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (item) await updateStatus(item, 'active');
    setToast(null);
  }

  const nativeCustomBackgroundUrl = appearance.customBackgroundPath
    ? getNativeFileUrl(appearance.customBackgroundPath)
    : undefined;
  const customBackgroundUrl = NATIVE_RUNTIME ? nativeCustomBackgroundUrl : browserBackgroundUrl;
  const backgroundUrl = appearance.backgroundMode === 'custom' && customBackgroundUrl
    ? customBackgroundUrl
    : appearance.backgroundMode === 'curated'
      ? launchWallpaper.src
      : undefined;
  const backgroundLuminance = appearance.backgroundMode === 'custom'
    ? appearance.customBackgroundLuminance ?? 0.4
    : launchWallpaper.luminance;
  const shellStyle = {
    '--wallpaper-dim': `${Math.round((0.44 + backgroundLuminance * 0.2) * 100)}%`,
    '--wallpaper-position': launchWallpaper.position,
    '--solid-background': appearance.solidColor,
  } as CSSProperties;
  const draftCustomBackgroundUrl = NATIVE_RUNTIME && appearanceDraft.customBackgroundPath
    ? getNativeFileUrl(appearanceDraft.customBackgroundPath)
    : browserBackgroundUrl;

  function changeView(nextView: ViewId) {
    if (nextView === 'library') {
      setCategory('all');
      setQuery('');
    }
    setView(nextView);
  }

  return (
    <div className={`app-shell background-${appearance.backgroundMode}`} style={shellStyle}>
      {backgroundUrl && <div className="app-wallpaper" style={{ backgroundImage: `url(${JSON.stringify(backgroundUrl)})` }} />}
      <div className="app-wallpaper-veil" />
      <main className="main-area">
        <AppHeader
          view={view}
          scanning={scanning}
          addLabel={NATIVE_RUNTIME ? (nativeSettings?.sourceFolder ? 'Klasör' : 'Klasör seç') : 'Ekle'}
          onViewChange={changeView}
          onRefresh={() => { if (scanning && NATIVE_RUNTIME) void stopNativeScan(); else void refreshLibrary(); }}
          onAdd={() => { if (NATIVE_RUNTIME) void chooseNativeFolder(); else setImportOpen(true); }}
          onSettings={() => openSettings()}
        />

        {view === 'recent' && (
          <section className="page-content recent-page">
            <section className="recent-section" aria-labelledby="recent-title">
              <div className="page-title-row">
                <h1 id="recent-title">Recent</h1>
                <button type="button" onClick={() => changeView('library')}>Tümünü gör <ArrowRight size={18} /></button>
              </div>
              <RecentShelf
                items={recentItems}
                loading={libraryLoading}
                onOpen={openItem}
                onChooseSource={() => { if (NATIVE_RUNTIME) void chooseNativeFolder(); else setImportOpen(true); }}
              />
            </section>

            <section className="archive-section" aria-labelledby="archive-title">
              <div className="recent-section-head">
                <h2 id="archive-title">Geçmişten</h2>
                <IconButton label="Yeni arşiv seçkisi göster" onClick={() => { if (NATIVE_RUNTIME) void reloadNativeLibrary(); else setRefreshSalt((current) => current + 1); }}><RefreshCw size={16} /></IconButton>
              </div>
              {archivePicks.length > 0 ? (
                <div className="archive-picks-grid">
                  {archivePicks.map((pick) => (
                    <button className="archive-pick" type="button" key={pick.item.id} onClick={() => openArchivePick(pick.item)}>
                      <span className="archive-pick-preview"><ScreenshotPreview item={pick.item} /></span>
                      <span className="archive-pick-copy">
                        <span className="archive-pick-meta">{CATEGORY_META[pick.item.category].shortLabel} · {formatRelativeDate(pick.item.createdAt)}</span>
                        <strong>{pick.item.preview?.title ?? pick.item.name}</strong>
                        <span className="archive-pick-reason">{pick.reason}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="recent-empty"><strong>Eski kayıtlar burada görünecek</strong></div>
              )}
            </section>
          </section>
        )}

        {view === 'library' && (
          <section className="page-content library-page">
            {category !== 'all' && (
              <div className="gallery-detail-bar" style={{ '--gallery-accent': CATEGORY_META[category].color } as CSSProperties}>
                <IconButton label="Tüm kategorilere dön" className="gallery-back" onClick={() => { setCategory('all'); setQuery(''); }}><ArrowLeft size={18} /></IconButton>
                <h1>{CATEGORY_META[category].label}</h1>
                <strong>{visibleItems.length}</strong>
              </div>
            )}

            {category === 'all' && !query.trim() && <div className="page-title-row"><h1>Gallery</h1></div>}

            <div className="gallery-search-row">
              <label className="smart-search">
                <Search size={19} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={category === 'all' ? 'Galeride ara' : `${CATEGORY_META[category].shortLabel} içinde ara`}
                />
              </label>
              {query && <IconButton label="Aramayı temizle" onClick={() => setQuery('')}><X size={18} /></IconButton>}
            </div>

            {category === 'all' && !query.trim() ? (
              <div className="category-gallery">
                {galleryCategories.map((group) => (
                  <CategoryPoster
                    key={group.categoryId}
                    categoryId={group.categoryId}
                    items={group.items}
                    onOpen={() => { setCategory(group.categoryId); setQuery(''); }}
                  />
                ))}
              </div>
            ) : (
              <>
                {query && <div className="gallery-results-head"><h3>“{query}”</h3><span>{visibleItems.length} sonuç</span></div>}
                {visibleItems.length > 0 ? (
                  <div className="library-grid gallery-items-grid">
                    {renderedVisibleItems.map((item) => <LibraryCard key={item.id} item={item} onOpen={() => openItem(item)} onTrash={category === 'junk' ? () => void deleteJunk(item) : undefined} />)}
                  </div>
                ) : (
                  <div className="empty-state"><Search size={25} /><h2>Sonuç bulunamadı</h2><p>Aramayı kısalt veya kategorilere dön.</p><button className="secondary-button" type="button" onClick={() => { setQuery(''); setCategory('all'); }}>Galeriye dön</button></div>
                )}
                {visibleItems.length > renderedVisibleItems.length && <button className="load-more-button" type="button" onClick={() => setGalleryLimit((current) => current + 120)}>Daha fazla ({visibleItems.length - renderedVisibleItems.length})</button>}
              </>
            )}
          </section>
        )}

      </main>

      {selectedItem && (
        <div className="drawer-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setSelectedItem(null); setSelectedFromArchive(false); } }}>
          <aside className="detail-drawer" aria-label="Screenshot detayı">
            <div className="drawer-head"><label className="category-editor"><span className="category-dot" style={{ background: CATEGORY_META[selectedItem.category].color }} /><select value={selectedItem.category} aria-label="Kategori" onChange={(event) => void changeItemCategory(selectedItem, event.target.value as Category)}>{(Object.keys(CATEGORY_META) as Category[]).map((categoryId) => <option key={categoryId} value={categoryId}>{CATEGORY_META[categoryId].label}</option>)}</select></label><IconButton label="Detayı kapat" onClick={() => { setSelectedItem(null); setSelectedFromArchive(false); }}><X size={18} /></IconButton></div>
            <ScreenshotPreview item={selectedItem} className="drawer-preview" />
            <div className="drawer-title"><div><span>{formatRelativeDate(selectedItem.createdAt)}</span><h2>{selectedItem.name}</h2></div></div>
            <div className="analysis-block"><div><span>Görüntüde bulunan metin</span><b>%{Math.round(selectedItem.confidence * 100)}</b></div><ConfidenceBar value={selectedItem.confidence} /><p>{selectedItem.extractedText || 'Metin bulunamadı.'}</p></div>
            <div className="tag-list">{selectedItem.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
            <dl className="file-facts"><div><dt>Boyut</dt><dd>{selectedItem.width} × {selectedItem.height}</dd></div><div><dt>Dosya</dt><dd>{formatBytes(selectedItem.size)}</dd></div><div><dt>İşleme</dt><dd>{selectedItem.analyzer === 'demo' ? 'Demo analizi' : 'Cihaz üzerinde'}</dd></div></dl>
            <div className="drawer-actions">
              {selectedItem.status === 'trash' ? <button className="primary-button" type="button" onClick={() => void updateStatus(selectedItem, 'active')}><ArchiveRestore size={17} /> Geri yükle</button> : <button className="secondary-button danger-text" type="button" onClick={() => void sendToTrash(selectedItem)}><Trash2 size={17} /> Çöpe taşı</button>}
              {selectedItem.native && selectedFromArchive && <button className="secondary-button" type="button" onClick={() => void dismissArchivePick(selectedItem)}>Yakında gösterme</button>}
            </div>
          </aside>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="modal-head">
              <div><div><h2 id="settings-title">Ayarlar</h2></div></div>
              <IconButton label="Pencereyi kapat" onClick={() => setSettingsOpen(false)}><X size={18} /></IconButton>
            </div>
            <div className="settings-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={settingsTab === 'appearance'} className={settingsTab === 'appearance' ? 'active' : ''} onClick={() => setSettingsTab('appearance')}><Palette size={17} /> Görünüm</button>
              {NATIVE_RUNTIME && <button type="button" role="tab" aria-selected={settingsTab === 'settings'} className={settingsTab === 'settings' ? 'active' : ''} onClick={() => setSettingsTab('settings')}><Settings2 size={17} /> Tarama</button>}
              {NATIVE_RUNTIME && <button type="button" role="tab" aria-selected={settingsTab === 'report'} className={settingsTab === 'report' ? 'active' : ''} onClick={() => setSettingsTab('report')}><BarChart3 size={17} /> Rapor</button>}
            </div>

            {settingsTab === 'appearance' ? (
              <div className="appearance-settings">
                <div className="background-mode" role="group" aria-label="Arka plan türü">
                  <button type="button" className={appearanceDraft.backgroundMode === 'curated' ? 'active' : ''} onClick={() => setAppearanceDraft({ ...appearanceDraft, backgroundMode: 'curated' })}><Image size={18} /> Yerleşik</button>
                  <button type="button" className={appearanceDraft.backgroundMode === 'custom' ? 'active' : ''} onClick={() => { if (draftCustomBackgroundUrl) setAppearanceDraft({ ...appearanceDraft, backgroundMode: 'custom' }); else void chooseCustomBackground(); }}><Upload size={18} /> Kendi görselim</button>
                  <button type="button" className={appearanceDraft.backgroundMode === 'solid' ? 'active' : ''} onClick={() => setAppearanceDraft({ ...appearanceDraft, backgroundMode: 'solid' })}><Palette size={18} /> Düz renk</button>
                </div>

                {appearanceDraft.backgroundMode === 'curated' && (
                  <div className="wallpaper-grid">
                    {CURATED_WALLPAPERS.map((wallpaper) => (
                      <button
                        type="button"
                        key={wallpaper.id}
                        className={appearanceDraft.backgroundId === wallpaper.id ? 'active' : ''}
                        onClick={() => setAppearanceDraft({ ...appearanceDraft, backgroundId: wallpaper.id })}
                        aria-label={`${wallpaper.name} arka planını seç`}
                      >
                        <img src={wallpaper.src} alt="" />
                        <span>{wallpaper.name}</span>
                        {appearanceDraft.backgroundId === wallpaper.id && <Check size={18} />}
                      </button>
                    ))}
                  </div>
                )}

                {appearanceDraft.backgroundMode === 'custom' && (
                  <div className="custom-background-setting">
                    {draftCustomBackgroundUrl ? <img src={draftCustomBackgroundUrl} alt="Seçili arka plan" /> : <div className="custom-background-empty"><Image size={28} /></div>}
                    <button className="secondary-button" type="button" onClick={() => void chooseCustomBackground()}><Upload size={17} /> Görsel seç</button>
                  </div>
                )}

                {appearanceDraft.backgroundMode === 'solid' && (
                  <label className="solid-color-setting">
                    <span>Arka plan rengi</span>
                    <input type="color" value={appearanceDraft.solidColor} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, solidColor: event.target.value })} />
                  </label>
                )}

                {appearanceDraft.backgroundMode === 'curated' && (
                  <label className="setting-row appearance-shuffle">
                    <span><strong>Her açılışta değiştir</strong><small>Aynı arka plan art arda gösterilmez.</small></span>
                    <input type="checkbox" checked={appearanceDraft.shuffleBackgrounds} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, shuffleBackgrounds: event.target.checked })} />
                  </label>
                )}
                <div className="settings-actions"><button className="secondary-button" type="button" onClick={() => setSettingsOpen(false)}>Vazgeç</button><button className="primary-button" type="button" onClick={() => void persistSettings()}>Kaydet</button></div>
              </div>
            ) : settingsTab === 'settings' && settingsDraft ? (
              <div className="settings-body">
                <div className="source-setting">
                  <div><span>SCREENSHOT KLASÖRÜ</span><strong title={settingsDraft.sourceFolder}>{settingsDraft.sourceFolder ?? 'Seçilmedi'}</strong></div>
                  <button className="secondary-button" type="button" onClick={() => void chooseNativeFolder()}><FolderOpen size={16} /> Değiştir</button>
                </div>
                <label className="setting-row"><span><strong>Başlangıçta tara</strong><small>Uygulama açıldığında değişen dosyaları bulur.</small></span><input type="checkbox" checked={settingsDraft.scanOnStartup} onChange={(event) => setSettingsDraft({ ...settingsDraft, scanOnStartup: event.target.checked })} /></label>
                <label className="setting-row"><span><strong>Windows ile başlat</strong><small>Sessizce sistem tepsisinde hazır olur.</small></span><input type="checkbox" checked={settingsDraft.launchAtLogin} onChange={(event) => setSettingsDraft({ ...settingsDraft, launchAtLogin: event.target.checked })} /></label>
                <label className="setting-row"><span><strong>Klasörü izle</strong><small>Yeni screenshot geldiğinde otomatik düzenler.</small></span><input type="checkbox" checked={settingsDraft.watchFolder} onChange={(event) => setSettingsDraft({ ...settingsDraft, watchFolder: event.target.checked })} /></label>
                <label className="setting-row"><span><strong>Bildirimler</strong><small>Arka planda yeni kayıt işlendiğinde haber verir.</small></span><input type="checkbox" checked={settingsDraft.notificationsEnabled} onChange={(event) => setSettingsDraft({ ...settingsDraft, notificationsEnabled: event.target.checked })} /></label>
                <div className="schedule-setting">
                  <div className="setting-label"><strong>Tarama saatleri</strong><small>Cihazın yerel saatine göre.</small></div>
                  <div className="schedule-times">
                    {settingsDraft.scheduleTimes.map((time, index) => (
                      <label key={`${index}-${time}`}><input type="time" value={time} onChange={(event) => setSettingsDraft({ ...settingsDraft, scheduleTimes: settingsDraft.scheduleTimes.map((current, currentIndex) => currentIndex === index ? event.target.value : current) })} /><IconButton label="Saati kaldır" onClick={() => setSettingsDraft({ ...settingsDraft, scheduleTimes: settingsDraft.scheduleTimes.filter((_, currentIndex) => currentIndex !== index) })}><X size={15} /></IconButton></label>
                    ))}
                    {settingsDraft.scheduleTimes.length < 4 && <button type="button" onClick={() => setSettingsDraft({ ...settingsDraft, scheduleTimes: [...settingsDraft.scheduleTimes, '18:00'] })}><Plus size={15} /> Saat ekle</button>}
                  </div>
                </div>
                <div className="settings-actions"><button className="secondary-button" type="button" onClick={() => setSettingsOpen(false)}>Vazgeç</button><button className="primary-button" type="button" onClick={() => void persistSettings()}>Kaydet</button></div>
              </div>
            ) : settingsTab === 'report' ? (
              <div className="report-body">
                <div className="report-period"><button type="button" className={reportDays === 7 ? 'active' : ''} onClick={() => setReportDays(7)}>7 gün</button><button type="button" className={reportDays === 30 ? 'active' : ''} onClick={() => setReportDays(30)}>30 gün</button></div>
                {periodReport ? (
                  <>
                    <div className="report-stats"><div><strong>{periodReport.added}</strong><span>Yeni</span></div><div><strong>{periodReport.kept}</strong><span>Saklandı</span></div><div><strong>{periodReport.queuedForCleanup}</strong><span>Temizlendi</span></div><div><strong>{formatBytes(periodReport.reclaimedBytes)}</strong><span>Kazanıldı</span></div></div>
                    <div className="report-detail"><span><b>{periodReport.junkCandidates}</b> çöp adayı</span><span><b>{periodReport.duplicateCandidates}</b> benzer kayıt</span><span><b>{periodReport.resurfaced}</b> hatırlatma</span></div>
                    <div className="report-categories">{periodReport.categories.map((entry) => { const categoryId = (Object.keys(CATEGORY_META) as Category[]).includes(entry.category as Category) ? entry.category as Category : 'other'; const max = Math.max(...periodReport.categories.map((candidate) => candidate.count), 1); return <div key={entry.category}><span><i style={{ background: CATEGORY_META[categoryId].color }} />{CATEGORY_META[categoryId].shortLabel}</span><b>{entry.count}</b><div><i style={{ width: `${(entry.count / max) * 100}%`, background: CATEGORY_META[categoryId].color }} /></div></div>; })}</div>
                    {periodReport.contexts.length > 0 && <div className="report-contexts">{periodReport.contexts.map((context) => <span key={`${context.kind}-${context.label}`}>{context.label}<b>{context.count}</b></span>)}</div>}
                  </>
                ) : <div className="report-loading"><RefreshCw className="spin" size={21} /></div>}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {importOpen && !NATIVE_RUNTIME && (
        <div className="modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !importProgress) setImportOpen(false); }}>
          <div className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
            <div className="modal-head"><div><span className="modal-icon"><Upload size={20} /></span><div><h2 id="import-title">Screenshot ekle</h2><p>Analiz tarayıcıdan çıkmadan başlar.</p></div></div><IconButton label="Pencereyi kapat" onClick={() => !importProgress && setImportOpen(false)}><X size={18} /></IconButton></div>
            <div className={`drop-zone ${dragging ? 'dragging' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
              {importProgress ? (
                <div className="importing-state"><RefreshCw size={28} /><h3>Analiz ediliyor</h3><p>{importProgress.current} / {importProgress.total} dosya analiz edildi</p><div className="import-progress"><span style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }} /></div></div>
              ) : (
                <><div className="drop-illustration"><Images size={34} /><span><LockKeyhole size={14} /></span></div><h3>Screenshot’ları buraya bırak</h3><p>PNG, JPG veya WebP · Dosya başına en fazla 25 MB</p><button className="primary-button" type="button" onClick={() => fileInput.current?.click()}><FolderOpen size={17} /> Dosya seç</button></>
              )}
            </div>
            <div className="import-privacy"><ShieldCheck size={17} /><p><strong>Gizli kalır.</strong><span>Bu dosyalar bir sunucuya yüklenmez; yalnızca bu tarayıcıda saklanır.</span></p></div>
          </div>
        </div>
      )}

      <input ref={fileInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" multiple tabIndex={-1} aria-hidden="true" onChange={handleFileInput} />
      <input ref={backgroundInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" tabIndex={-1} aria-hidden="true" onChange={(event) => void handleBackgroundInput(event)} />

      {availableUpdate && <div className="update-toast" role="status"><Download size={17} /><span>v{availableUpdate.version} hazır</span><button type="button" disabled={updateInstalling} onClick={() => void applyAvailableUpdate()}>{updateInstalling ? 'Kuruluyor' : 'Güncelle'}</button><IconButton label="Güncellemeyi kapat" onClick={() => setAvailableUpdate(null)}><X size={15} /></IconButton></div>}
      {toast && <div className="toast" role="status"><Check size={17} /><span>{toast.message}</span>{toast.undoId && <button type="button" onClick={() => void undoTrash(toast.undoId!)}><RotateCcw size={14} /> Geri al</button>}</div>}
    </div>
  );
}

export default App;
