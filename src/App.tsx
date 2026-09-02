import {
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  Clock3,
  Download,
  FileText,
  FolderOpen,
  Grid2X2,
  HardDrive,
  Heart,
  Images,
  Info,
  Layers3,
  Lightbulb,
  LockKeyhole,
  MapPin,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Upload,
  Utensils,
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
import {
  selectResurfaceItems,
  type SurfaceHistory,
} from './core/memoryEngine';
import { DEMO_ITEMS } from './data/demo';
import { ANALYSIS_VERSION, analyzeFile, findSimilarGroup } from './lib/analyzer';
import { clearLocalItems, deleteLocalItem, loadLocalItems, saveLocalItem } from './lib/database';
import {
  getNativeSnapshot,
  isNativeRuntime,
  moveNativeToSystemTrash,
  recordNativeResurface,
  scanNativeLibrary,
  searchNativeLibrary,
  selectAndScanFolder,
  updateNativeStatus,
  type NativeSettings,
} from './lib/native';
import {
  formatBytes,
  formatRelativeDate,
  getCleanupReason,
  getCleanupScore,
  searchItems,
} from './lib/search';
import {
  CATEGORY_META,
  type Category,
  type ScreenshotItem,
  type ViewId,
} from './types';

const VIEW_COPY: Record<ViewId, { title: string; subtitle: string }> = {
  recent: { title: 'Recent', subtitle: '' },
  library: { title: 'Gallery', subtitle: '' },
  cleaner: { title: 'Temizleyici', subtitle: 'Silmeden önce her öneri sende son kez durur.' },
  groups: { title: 'Gruplar', subtitle: 'Benzer niyetler, tek bir düzenli yerde.' },
  privacy: { title: 'Gizlilik', subtitle: 'Tüm analiz bu cihazda.' },
};

const NAV_ITEMS: Array<{ id: ViewId; label: string; icon: typeof Images }> = [
  { id: 'recent', label: 'Recent', icon: Clock3 },
  { id: 'library', label: 'Gallery', icon: Images },
];

const NATIVE_RUNTIME = isNativeRuntime();

const CATEGORY_ICONS: Record<Category, typeof Images> = {
  shopping: ShoppingBag,
  food: Utensils,
  places: MapPin,
  chats: MessageCircle,
  ideas: Lightbulb,
  documents: FileText,
  social: Heart,
  junk: Trash2,
  other: Grid2X2,
};

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

function Brand() {
  return (
    <div className="brand" aria-label="SS TARIFF">
      <span className="brand-mark">SS</span>
      <span className="brand-name">TARIFF</span>
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="confidence" aria-label={`Sınıflandırma güveni yüzde ${Math.round(value * 100)}`}>
      <span style={{ width: `${value * 100}%` }} />
    </div>
  );
}

function LibraryCard({ item, onOpen }: { item: ScreenshotItem; onOpen: () => void }) {
  return (
    <article className="library-card">
      <button className="card-preview-button" type="button" onClick={onOpen} aria-label={`${item.name} detayını aç`}>
        <ScreenshotPreview item={item} />
        {item.duplicateGroup && <span className="duplicate-chip"><Layers3 size={12} /> 2 benzer</span>}
      </button>
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

function CategoryGlyph({ categoryId, size = 18 }: { categoryId: Category; size?: number }) {
  const Icon = CATEGORY_ICONS[categoryId];
  return <Icon size={size} strokeWidth={1.8} />;
}

function GalleryCategory({
  categoryId,
  items,
  onOpen,
}: {
  categoryId: Category;
  items: ScreenshotItem[];
  onOpen: () => void;
}) {
  const previews = items.slice(0, 3);
  const meta = CATEGORY_META[categoryId];

  return (
    <button
      className="category-cover"
      type="button"
      onClick={onOpen}
      style={{ '--gallery-accent': meta.color } as CSSProperties}
      aria-label={`${meta.label} kategorisini aç, ${items.length} screenshot`}
    >
      <span className="category-cover-preview" data-count={previews.length} aria-hidden="true">
        {previews.map((item) => <ScreenshotPreview key={item.id} item={item} />)}
      </span>
      <span className="category-cover-meta">
        <span className="category-cover-icon"><CategoryGlyph categoryId={categoryId} /></span>
        <span><strong>{meta.label}</strong><small>{items.length} screenshot</small></span>
        <ArrowRight size={18} />
      </span>
    </button>
  );
}

function App() {
  const [view, setView] = useState<ViewId>('recent');
  const [items, setItems] = useState<ScreenshotItem[]>(NATIVE_RUNTIME ? [] : DEMO_ITEMS);
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<ScreenshotItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [toast, setToast] = useState<{ message: string; undoId?: string } | null>(null);
  const [deferredCleanerIds, setDeferredCleanerIds] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshSalt, setRefreshSalt] = useState(0);
  const [lastRefreshAt, setLastRefreshAt] = useState(() => new Date());
  const [surfaceHistory, setSurfaceHistory] = useState<SurfaceHistory>(loadSurfaceHistory);
  const [nativeSettings, setNativeSettings] = useState<NativeSettings | null>(null);
  const [nativeSearchItems, setNativeSearchItems] = useState<ScreenshotItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(NATIVE_RUNTIME);
  const [scanning, setScanning] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    if (NATIVE_RUNTIME) {
      getNativeSnapshot()
        .then((snapshot) => {
          if (!active) return;
          setItems(snapshot.assets);
          setNativeSettings(snapshot.settings);
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
      return searchItems(source, textQuery, category).sort(
        (first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
      );
    },
    [activeItems, nativeSearchItems, query, category],
  );
  const cleanupQueue = useMemo(
    () => {
      const candidates = items
        .filter((item) => item.status === 'active' && getCleanupScore(item) >= 20)
        .sort((first, second) => getCleanupScore(second) - getCleanupScore(first));
      const deferred = new Set(deferredCleanerIds);
      return [
        ...candidates.filter((item) => !deferred.has(item.id)),
        ...deferredCleanerIds
          .map((id) => candidates.find((item) => item.id === id))
          .filter((item): item is ScreenshotItem => Boolean(item)),
      ];
    },
    [items, deferredCleanerIds],
  );
  const trashItems = useMemo(() => items.filter((item) => item.status === 'trash'), [items]);
  const recentItems = useMemo(
    () => [...activeItems]
      .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
      .slice(0, 6),
    [activeItems],
  );
  const archivePicks = useMemo(
    () => {
      const recentIds = new Set(recentItems.map((item) => item.id));
      return selectResurfaceItems(
        activeItems.filter((item) => !recentIds.has(item.id)),
        lastRefreshAt,
        surfaceHistory,
        refreshSalt,
        3,
      );
    },
    [activeItems, lastRefreshAt, recentItems, refreshSalt, surfaceHistory],
  );

  async function reloadNativeLibrary() {
    const snapshot = await getNativeSnapshot();
    setItems(snapshot.assets);
    setNativeSettings(snapshot.settings);
    setLastRefreshAt(new Date());
  }

  async function refreshLibrary() {
    if (NATIVE_RUNTIME) {
      setScanning(true);
      try {
        const summary = await scanNativeLibrary();
        await reloadNativeLibrary();
        setToast({
          message: summary.analyzed > 0
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
    setToast({ message: 'Yerel galeri yeniden değerlendirildi.' });
  }

  async function chooseNativeFolder() {
    setScanning(true);
    try {
      const summary = await selectAndScanFolder();
      if (!summary) return;
      await reloadNativeLibrary();
      setToast({ message: `${summary.analyzed} screenshot cihazında analiz edildi.` });
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : String(error) });
    } finally {
      setScanning(false);
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
    setToast({ message: 'Temizleme kutusuna taşındı.', undoId: item.id });
  }

  async function undoTrash(id: string) {
    const item = items.find((candidate) => candidate.id === id);
    if (item) await updateStatus(item, 'active');
    setToast(null);
  }

  async function emptyTrash() {
    const prompt = NATIVE_RUNTIME
      ? `${trashItems.length} dosya Windows Geri Dönüşüm Kutusu'na taşınsın mı?`
      : `${trashItems.length} öğe kalıcı olarak silinsin mi? Bu işlem geri alınamaz.`;
    if (!window.confirm(prompt)) return;
    await Promise.all(trashItems.map((item) => {
      if (item.native) return moveNativeToSystemTrash(item.id);
      if (!item.id.startsWith('demo-')) return deleteLocalItem(item.id);
      return Promise.resolve();
    }));
    trashItems.forEach((item) => item.blobUrl && URL.revokeObjectURL(item.blobUrl));
    setItems((current) => current.filter((item) => item.status !== 'trash'));
    setToast({ message: NATIVE_RUNTIME ? `${trashItems.length} dosya Geri Dönüşüm Kutusu'na taşındı.` : `${trashItems.length} öğe kalıcı olarak silindi.` });
  }

  async function resetPrivateLibrary() {
    if (!window.confirm('İçe aktardığın tüm yerel dosyalar bu tarayıcıdan silinsin mi?')) return;
    await clearLocalItems();
    items.forEach((item) => item.blobUrl && URL.revokeObjectURL(item.blobUrl));
    setItems(DEMO_ITEMS);
    setSelectedItem(null);
    setToast({ message: 'Yerel galeri temizlendi. Demo kayıtları kaldı.' });
  }

  const currentCopy = VIEW_COPY[view];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-head">
          <Brand />
          <IconButton label="Menüyü kapat" className="sidebar-close" onClick={() => setSidebarOpen(false)}><X size={18} /></IconButton>
        </div>
        <nav className="primary-nav" aria-label="Ana menü">
          {NAV_ITEMS.map((navItem) => {
            const Icon = navItem.icon;
            return (
              <button
                type="button"
                key={navItem.id}
                className={view === navItem.id ? 'active' : ''}
                onClick={() => {
                  if (navItem.id === 'library') {
                    setCategory('all');
                    setQuery('');
                  }
                  setView(navItem.id);
                  setSidebarOpen(false);
                }}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{navItem.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-library-info">
          <div><HardDrive size={15} /><strong>{activeItems.length} öğe</strong></div>
          <div className="storage-meter"><span style={{ width: `${Math.min(100, (activeItems.length / 20) * 100)}%` }} /></div>
        </div>
        <div className="private-pill"><ShieldCheck size={16} /><span><strong>Cihazda</strong><small>Ağ aktarımı yok</small></span></div>
        <button className="help-link" type="button"><CircleHelp size={16} /> Yardım & geri bildirim</button>
      </aside>

      {sidebarOpen && <button className="sidebar-scrim" type="button" aria-label="Menüyü kapat" onClick={() => setSidebarOpen(false)} />}

      <main className="main-area">
        <header className="topbar">
          <IconButton label="Menüyü aç" className="menu-button" onClick={() => setSidebarOpen(true)}><Menu size={20} /></IconButton>
          <div className="page-heading">
            <h1>{currentCopy.title}</h1>
            {currentCopy.subtitle && <p>{currentCopy.subtitle}</p>}
          </div>
          <div className="topbar-actions">
            <button className="secondary-button refresh-button" type="button" disabled={scanning} onClick={() => void refreshLibrary()}><RefreshCw className={scanning ? 'spin' : ''} size={16} /><span>{scanning ? 'Taranıyor' : 'Yenile'}</span></button>
            <button className="primary-button" type="button" disabled={scanning} onClick={() => { if (NATIVE_RUNTIME) void chooseNativeFolder(); else setImportOpen(true); }}><Plus size={17} /> {NATIVE_RUNTIME ? (nativeSettings?.sourceFolder ? 'Klasör' : 'Klasör seç') : 'Screenshot ekle'}</button>
          </div>
        </header>

        {view === 'recent' && (
          <section className="page-content recent-page">
            <section className="recent-section" aria-labelledby="recent-title">
              <div className="recent-section-head">
                <h2 id="recent-title">En son</h2>
                <button type="button" onClick={() => { setCategory('all'); setQuery(''); setView('library'); }}>
                  Gallery <ArrowRight size={15} />
                </button>
              </div>
              {recentItems.length > 0 ? (
                <div className="library-grid recent-grid">
                  {recentItems.map((item) => <LibraryCard key={item.id} item={item} onOpen={() => setSelectedItem(item)} />)}
                </div>
              ) : (
                <div className="recent-empty"><Images size={24} /><strong>{libraryLoading ? 'Galeri açılıyor' : 'Henüz screenshot yok'}</strong>{NATIVE_RUNTIME && !libraryLoading && <button className="primary-button" type="button" onClick={() => void chooseNativeFolder()}><FolderOpen size={17} /> Klasör seç</button>}</div>
              )}
            </section>

            <section className="archive-section" aria-labelledby="archive-title">
              <div className="recent-section-head">
                <h2 id="archive-title">Geçmişten</h2>
                <IconButton label="Yeni arşiv seçkisi göster" onClick={() => setRefreshSalt((current) => current + 1)}><RefreshCw size={16} /></IconButton>
              </div>
              {archivePicks.length > 0 ? (
                <div className="archive-picks-grid">
                  {archivePicks.map((pick) => (
                    <button className="archive-pick" type="button" key={pick.item.id} onClick={() => openArchivePick(pick.item)}>
                      <span className="archive-pick-preview"><ScreenshotPreview item={pick.item} /></span>
                      <span className="archive-pick-copy">
                        <span className="archive-pick-meta"><i style={{ background: CATEGORY_META[pick.item.category].color }} />{formatRelativeDate(pick.item.createdAt)}</span>
                        <strong>{pick.item.preview?.title ?? pick.item.name}</strong>
                        <span className="archive-pick-reason">{pick.reason}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="recent-empty"><Clock3 size={24} /><strong>Eski kayıtlar burada görünecek</strong></div>
              )}
            </section>
          </section>
        )}

        {view === 'library' && (
          <section className="page-content library-page">
            {category !== 'all' && (
              <div className="gallery-detail-bar" style={{ '--gallery-accent': CATEGORY_META[category].color } as CSSProperties}>
                <IconButton label="Tüm kategorilere dön" className="gallery-back" onClick={() => { setCategory('all'); setQuery(''); }}><ArrowLeft size={18} /></IconButton>
                <span className="gallery-category-mark"><CategoryGlyph categoryId={category} size={22} /></span>
                <h2>{CATEGORY_META[category].label}</h2>
                <strong>{visibleItems.length}</strong>
              </div>
            )}

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
                  <GalleryCategory
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
                    {visibleItems.map((item) => <LibraryCard key={item.id} item={item} onOpen={() => setSelectedItem(item)} />)}
                  </div>
                ) : (
                  <div className="empty-state"><Search size={25} /><h2>Sonuç bulunamadı</h2><p>Aramayı kısalt veya kategorilere dön.</p><button className="secondary-button" type="button" onClick={() => { setQuery(''); setCategory('all'); }}>Galeriye dön</button></div>
                )}
              </>
            )}
          </section>
        )}

        {view === 'cleaner' && (
          <section className="page-content cleaner-page">
            <div className="cleaner-toolbar">
              <div><span className="eyebrow">İNCELEME KUYRUĞU</span><h2>{cleanupQueue.length} karar kaldı</h2><p>En güçlü öneriler önce gösterilir.</p></div>
              <div className="queue-progress" aria-label={`${cleanupQueue.length} temizleme önerisi`}><span style={{ width: `${Math.max(8, 100 - cleanupQueue.length * 8)}%` }} /></div>
              {trashItems.length > 0 && <button className="secondary-button danger-text" type="button" onClick={() => void emptyTrash()}><Trash2 size={16} /> Çöpü boşalt ({trashItems.length})</button>}
            </div>
            {cleanupQueue.length > 0 ? (
              <div className="cleaner-workspace">
                <div className="cleaner-stage">
                  <div className="cleaner-reason"><Info size={15} /><strong>{getCleanupReason(cleanupQueue[0])}</strong><span>%{Math.min(99, getCleanupScore(cleanupQueue[0]) + 30)} emin</span></div>
                  <ScreenshotPreview item={cleanupQueue[0]} className="cleaner-preview" />
                  <div className="cleaner-item-meta"><strong>{cleanupQueue[0].name}</strong><span>{formatRelativeDate(cleanupQueue[0].createdAt)} · {formatBytes(cleanupQueue[0].size)}</span></div>
                </div>
                <div className="cleaner-decisions">
                  <button className="decision-button keep" type="button" onClick={() => void updateStatus(cleanupQueue[0], 'kept')}><Check size={22} /><span><strong>Sakla</strong><small>Bir daha önerme</small></span></button>
                  <button className="decision-button later" type="button" onClick={() => setDeferredCleanerIds((current) => [...current.filter((id) => id !== cleanupQueue[0].id), cleanupQueue[0].id])}><Clock3 size={21} /><span><strong>Sonra</strong><small>Kuyruğun sonuna at</small></span></button>
                  <button className="decision-button delete" type="button" onClick={() => void sendToTrash(cleanupQueue[0])}><Trash2 size={22} /><span><strong>Temizle</strong><small>Önce çöp kutusuna</small></span></button>
                </div>
                <div className="cleaner-queue-list">
                  <span className="eyebrow">SIRADAKİLER</span>
                  {cleanupQueue.slice(1, 5).map((item) => (
                    <button type="button" key={item.id} onClick={() => setSelectedItem(item)}>
                      <ScreenshotPreview item={item} />
                      <span><strong>{getCleanupReason(item)}</strong><small>{CATEGORY_META[item.category].shortLabel} · {formatBytes(item.size)}</small></span>
                      <ArrowRight size={15} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-state cleaner-complete"><Check size={28} /><h2>Kuyruk tertemiz</h2><p>Şimdilik karar vermen gereken başka screenshot yok.</p><button className="primary-button" type="button" onClick={() => { setCategory('all'); setView('library'); }}>Galeriye dön</button></div>
            )}
          </section>
        )}

        {view === 'groups' && (
          <section className="page-content groups-page">
            <div className="groups-summary">
              <div><span className="eyebrow">OTOMATİK DÜZEN</span><h2>{Object.values(CATEGORY_META).filter((meta) => activeItems.some((item) => CATEGORY_META[item.category] === meta)).length} anlamlı grup</h2><p>Klasör açmadın. İsim vermedin. Yalnızca screenshot aldın.</p></div>
              <div className="group-orbit" aria-hidden="true"><span>SS</span>{(['shopping','food','places','chats'] as Category[]).map((id, index) => <i key={id} style={{ background: CATEGORY_META[id].color, '--orbit-index': index } as React.CSSProperties} />)}</div>
            </div>
            <div className="group-list">
              {(Object.keys(CATEGORY_META) as Category[]).map((categoryId) => {
                const groupedItems = activeItems.filter((item) => item.category === categoryId);
                if (groupedItems.length === 0) return null;
                return (
                  <article className="group-row" key={categoryId}>
                    <button className="group-copy" type="button" onClick={() => { setCategory(categoryId); setView('library'); }}>
                      <span className="group-icon" style={{ background: CATEGORY_META[categoryId].color }}><FolderOpen size={20} /></span>
                      <span><strong>{CATEGORY_META[categoryId].label}</strong><small>{groupedItems.length} screenshot</small></span>
                    </button>
                    <div className="group-thumbnails">{groupedItems.slice(0, 4).map((item) => <button type="button" key={item.id} onClick={() => setSelectedItem(item)}><ScreenshotPreview item={item} /></button>)}</div>
                    <button className="group-open" type="button" onClick={() => { setCategory(categoryId); setView('library'); }}>Grubu aç <ArrowRight size={15} /></button>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {view === 'privacy' && (
          <section className="page-content privacy-page">
            <div className="privacy-hero">
              <div className="privacy-lock"><LockKeyhole size={36} /></div>
              <div><span className="eyebrow">VERİ AKIŞI</span><h2>Screenshot’ların burada kalır.</h2><p>Analiz, benzerlik hesabı ve arama bu cihazda gerçekleşir. SS TARIFF sunucusuna görsel veya çıkarılan metin gönderilmez.</p></div>
              <div className="privacy-live"><span /><strong>KORUMA AKTİF</strong><small>Son kontrol: şimdi</small></div>
            </div>
            <div className="privacy-grid">
              <article className="privacy-flow">
                <div className="section-title-row"><div><h2>Bir screenshot’ın yolu</h2><span>Şeffaf veri akışı</span></div><Info size={18} /></div>
                <div className="flow-step"><span><Upload size={18} /></span><div><strong>1. Sen seçersin</strong><small>Uygulama galerinin tamamını kendiliğinden okuyamaz.</small></div><b>İZİNLİ</b></div>
                <div className="flow-line" />
                <div className="flow-step"><span><HardDrive size={18} /></span><div><strong>2. Cihazında analiz edilir</strong><small>Görsel hash’i ve sınıflandırma yerel olarak hesaplanır.</small></div><b>YEREL</b></div>
                <div className="flow-line" />
                <div className="flow-step"><span><HardDrive size={18} /></span><div><strong>3. Tarayıcıda saklanır</strong><small>Dosya ve metadata IndexedDB alanından çıkmaz.</small></div><b>ÖZEL</b></div>
                <div className="blocked-cloud"><X size={18} /><div><strong>Buluta upload</strong><small>Bu sürümde böyle bir veri yolu yok.</small></div><b>ENGELLİ</b></div>
              </article>
              <div className="privacy-controls">
                <article>
                  <div className="control-icon green"><ShieldCheck size={20} /></div>
                  <div><strong>Yerel analiz</strong><small>Dosyalar cihazında işlenir</small></div>
                  <span className="toggle on" aria-label="Yerel analiz açık"><i /></span>
                </article>
                <article>
                  <div className="control-icon blue"><Download size={20} /></div>
                  <div><strong>Model güncellemeleri</strong><small>Yalnızca model dosyası indirilir</small></div>
                  <span className="toggle on" aria-label="Model güncellemeleri açık"><i /></span>
                </article>
                <article>
                  <div className="control-icon yellow"><HardDrive size={20} /></div>
                  <div><strong>Yerel kullanım</strong><small>{items.filter((item) => !item.id.startsWith('demo-')).length} gerçek dosya · {formatBytes(items.filter((item) => !item.id.startsWith('demo-')).reduce((sum, item) => sum + item.size, 0))}</small></div>
                  <button type="button" onClick={() => void resetPrivateLibrary()}>Verileri sil</button>
                </article>
                <div className="privacy-proof"><span>BUGÜN</span><strong>0</strong><p>Screenshot veya OCR metni ağ üzerinden gönderildi.</p></div>
              </div>
            </div>
          </section>
        )}
      </main>

      <nav className="mobile-nav" aria-label="Mobil menü">
        {NAV_ITEMS.map((navItem) => {
          const Icon = navItem.icon;
          return <button type="button" key={navItem.id} className={view === navItem.id ? 'active' : ''} onClick={() => { if (navItem.id === 'library') { setCategory('all'); setQuery(''); } setView(navItem.id); }}><Icon size={19} /><span>{navItem.label}</span></button>;
        })}
      </nav>

      {selectedItem && (
        <div className="drawer-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedItem(null); }}>
          <aside className="detail-drawer" aria-label="Screenshot detayı">
            <div className="drawer-head"><div><span className="category-dot" style={{ background: CATEGORY_META[selectedItem.category].color }} /><strong>{CATEGORY_META[selectedItem.category].label}</strong></div><IconButton label="Detayı kapat" onClick={() => setSelectedItem(null)}><X size={18} /></IconButton></div>
            <ScreenshotPreview item={selectedItem} className="drawer-preview" />
            <div className="drawer-title"><div><span>{formatRelativeDate(selectedItem.createdAt)}</span><h2>{selectedItem.name}</h2></div><IconButton label="Diğer seçenekler"><MoreHorizontal size={18} /></IconButton></div>
            <div className="analysis-block"><div><span>YEREL ANALİZ</span><b>%{Math.round(selectedItem.confidence * 100)} güven</b></div><ConfidenceBar value={selectedItem.confidence} /><p>{selectedItem.extractedText || 'Bu görselde henüz metin bulunmadı.'}</p></div>
            <div className="tag-list">{selectedItem.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
            <dl className="file-facts"><div><dt>Boyut</dt><dd>{selectedItem.width} × {selectedItem.height}</dd></div><div><dt>Dosya</dt><dd>{formatBytes(selectedItem.size)}</dd></div><div><dt>İşleme</dt><dd>{selectedItem.analyzer === 'demo' ? 'Demo analizi' : 'Cihaz üzerinde'}</dd></div></dl>
            <div className="drawer-actions">
              {selectedItem.status === 'trash' ? <button className="primary-button" type="button" onClick={() => void updateStatus(selectedItem, 'active')}><ArchiveRestore size={17} /> Geri yükle</button> : <button className="secondary-button danger-text" type="button" onClick={() => void sendToTrash(selectedItem)}><Trash2 size={17} /> Temizlemeye gönder</button>}
            </div>
          </aside>
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

      <input ref={fileInput} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={handleFileInput} />

      {toast && <div className="toast" role="status"><Check size={17} /><span>{toast.message}</span>{toast.undoId && <button type="button" onClick={() => void undoTrash(toast.undoId!)}><RotateCcw size={14} /> Geri al</button>}</div>}
    </div>
  );
}

export default App;
