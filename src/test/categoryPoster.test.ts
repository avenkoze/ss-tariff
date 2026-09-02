import { describe, expect, it } from 'vitest';
import { selectCategoryCover } from '../components/CategoryPoster';
import type { ScreenshotItem } from '../types';

function item(id: string, createdAt: string, junkSignals: ScreenshotItem['junkSignals'] = []): ScreenshotItem {
  return {
    id,
    name: `${id}.png`,
    category: 'shopping',
    confidence: 1,
    tags: [],
    extractedText: '',
    createdAt,
    addedAt: createdAt,
    width: 100,
    height: 200,
    size: 100,
    junkSignals,
    status: 'active',
    analyzer: 'demo',
  };
}

describe('category cover selection', () => {
  it('skips a blank newest image for regular categories', () => {
    const blank = item('blank', '2026-02-02T00:00:00.000Z', ['near-black']);
    const useful = item('useful', '2026-02-01T00:00:00.000Z');
    expect(selectCategoryCover([useful, blank], 'shopping').id).toBe('useful');
  });

  it('keeps the newest image for the junk category', () => {
    const blank = item('blank', '2026-02-02T00:00:00.000Z', ['near-black']);
    const useful = item('useful', '2026-02-01T00:00:00.000Z');
    expect(selectCategoryCover([useful, blank], 'junk').id).toBe('blank');
  });
});

