import { FolderOpen, Images, RefreshCw, Settings2, X } from 'lucide-react';
import type { ViewId } from '../types';

interface AppHeaderProps {
  view: ViewId;
  scanning: boolean;
  addLabel: string;
  onViewChange: (view: ViewId) => void;
  onRefresh: () => void;
  onAdd: () => void;
  onSettings: () => void;
}

export function AppHeader({
  view,
  scanning,
  addLabel,
  onViewChange,
  onRefresh,
  onAdd,
  onSettings,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <button className="wordmark" type="button" onClick={() => onViewChange('recent')}>SS TARIFF</button>
      <nav className="view-tabs" aria-label="Ana bölümler">
        <button type="button" className={view === 'recent' ? 'active' : ''} onClick={() => onViewChange('recent')}>Recent</button>
        <button type="button" className={view === 'library' ? 'active' : ''} onClick={() => onViewChange('library')}>Gallery</button>
      </nav>
      <div className="app-header-actions">
        <button className="header-command" type="button" onClick={onRefresh} aria-label={scanning ? 'Taramayı durdur' : 'Yenile'}>
          {scanning ? <X size={18} /> : <RefreshCw size={18} />}
          <span>{scanning ? 'Durdur' : 'Yenile'}</span>
        </button>
        <button className="header-command header-command-primary" type="button" onClick={onAdd} disabled={scanning} aria-label={addLabel} title={addLabel}>
          {addLabel === 'Ekle' ? <Images size={18} /> : <FolderOpen size={18} />}
          <span>{addLabel}</span>
        </button>
        <button className="header-icon-button" type="button" onClick={onSettings} aria-label="Ayarlar" title="Ayarlar">
          <Settings2 size={20} />
        </button>
      </div>
    </header>
  );
}
