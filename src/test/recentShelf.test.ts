import { describe, expect, it } from 'vitest';
import { findInitialRecentIndex } from '../components/RecentShelf';
import type { ScreenshotItem } from '../types';

function item(id: string, category: ScreenshotItem['category']): ScreenshotItem {
  return {
    id,
    name: `${id}.png`,
    category,
    confidence: 1,
    tags: [],
    extractedText: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    addedAt: '2026-01-01T00:00:00.000Z',
    width: 100,
    height: 200,
    size: 100,
    status: 'active',
    analyzer: 'demo',
  };
}

describe('recent shelf focus', () => {
  it('starts on the first meaningful screenshot', () => {
    expect(findInitialRecentIndex([item('blank', 'junk'), item('shoe', 'shopping')])).toBe(1);
  });

  it('falls back to the first card when every screenshot is junk', () => {
    expect(findInitialRecentIndex([item('blank', 'junk')])).toBe(0);
    expect(findInitialRecentIndex([])).toBe(0);
  });
});

