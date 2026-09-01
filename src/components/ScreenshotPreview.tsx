import { MapPin, MoreHorizontal, QrCode, Search, ShoppingBag } from 'lucide-react';
import type { ScreenshotItem } from '../types';

interface ScreenshotPreviewProps {
  item: ScreenshotItem;
  className?: string;
}

function SyntheticPreview({ item }: { item: ScreenshotItem }) {
  const preview = item.preview;
  if (!preview) return null;

  if (preview.kind === 'chat') {
    return (
      <div className="mock-screen mock-chat" style={{ '--preview-accent': preview.accent } as React.CSSProperties}>
        <div className="mock-phone-bar"><span>9:41</span><span>● ● ▰</span></div>
        <div className="mock-chat-header">
          <span className="mock-avatar">A</span>
          <strong>{preview.eyebrow}</strong>
          <MoreHorizontal size={16} />
        </div>
        <div className="mock-chat-body">
          <p className="bubble bubble-in">{preview.title}</p>
          <p className="bubble bubble-out">{preview.lines?.[0]}</p>
          <small>{preview.lines?.[1]}</small>
        </div>
      </div>
    );
  }

  if (preview.kind === 'map') {
    return (
      <div className="mock-screen mock-map" style={{ '--preview-accent': preview.accent } as React.CSSProperties}>
        <div className="mock-map-search"><Search size={13} /> Kahvaltı</div>
        <div className="map-road road-one" />
        <div className="map-road road-two" />
        <div className="map-block block-one" />
        <div className="map-block block-two" />
        <MapPin className="map-pin" size={30} fill="currentColor" />
        <div className="mock-place-sheet">
          <small>{preview.eyebrow}</small>
          <strong>{preview.title}</strong>
          <span>{preview.lines?.[0]}</span>
          <span className="open-label">{preview.lines?.[1]}</span>
        </div>
      </div>
    );
  }

  if (preview.kind === 'product') {
    return (
      <div className="mock-screen mock-product" style={{ '--preview-accent': preview.accent } as React.CSSProperties}>
        <div className="mock-product-nav"><strong>NOVA</strong><ShoppingBag size={15} /></div>
        <div className="shoe-shape"><span /><i /></div>
        <div className="mock-product-copy">
          <small>{preview.eyebrow}</small>
          <strong>{preview.title}</strong>
          <span>{preview.lines?.[0]}</span>
          <span className="mock-product-action">SEPETE EKLE</span>
        </div>
      </div>
    );
  }

  if (preview.kind === 'recipe') {
    return (
      <div className="mock-screen mock-recipe" style={{ '--preview-accent': preview.accent } as React.CSSProperties}>
        <div className="recipe-photo">
          <span className="pasta pasta-one" />
          <span className="pasta pasta-two" />
          <span className="lemon" />
        </div>
        <div className="recipe-copy">
          <small>{preview.eyebrow}</small>
          <strong>{preview.title}</strong>
          <span>{preview.lines?.[0]}</span>
          <div className="recipe-lines"><i /><i /><i /></div>
        </div>
      </div>
    );
  }

  if (preview.kind === 'ticket') {
    return (
      <div className="mock-screen mock-ticket" style={{ '--preview-accent': preview.accent } as React.CSSProperties}>
        <div className="ticket-brand">{preview.eyebrow}</div>
        <strong>{preview.title}</strong>
        <span>{preview.lines?.[0]}</span>
        <div className="ticket-rule" />
        <QrCode size={64} strokeWidth={1.3} />
        <small>{preview.lines?.[1]}</small>
      </div>
    );
  }

  if (preview.kind === 'receipt') {
    return (
      <div className="mock-screen mock-receipt" style={{ '--preview-accent': preview.accent } as React.CSSProperties}>
        <div className="receipt-paper">
          <small>{preview.eyebrow}</small>
          <div className="receipt-lines"><i /><i /><i /><i /></div>
          <strong>{preview.title}</strong>
          <span>{preview.lines?.[0]}</span>
          <div className="barcode" />
          <small>{preview.lines?.[1]}</small>
        </div>
      </div>
    );
  }

  if (preview.kind === 'social') {
    return (
      <div className="mock-screen mock-social" style={{ '--preview-accent': preview.accent } as React.CSSProperties}>
        <div className="social-top"><span className="mock-avatar">M</span><strong>{preview.eyebrow}</strong></div>
        <blockquote>{preview.title}</blockquote>
        <div className="social-actions">♡　⌁　⌑</div>
        <small>{preview.lines?.[0]}</small>
      </div>
    );
  }

  return (
    <div className="mock-screen mock-note" style={{ '--preview-accent': preview.accent } as React.CSSProperties}>
      <small>{preview.eyebrow}</small>
      <strong>{preview.title}</strong>
      <span>{preview.lines?.[0]}</span>
      <div className="note-rule" />
      <div className="note-rule short" />
    </div>
  );
}

export function ScreenshotPreview({ item, className = '' }: ScreenshotPreviewProps) {
  return (
    <div
      className={`screenshot-preview ${className}`}
      style={{ '--item-color': item.averageColor ?? item.preview?.accent ?? '#6b7470' } as React.CSSProperties}
    >
      {item.blobUrl ? (
        <img src={item.blobUrl} alt={item.name} />
      ) : (
        <SyntheticPreview item={item} />
      )}
    </div>
  );
}
