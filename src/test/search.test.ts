import { describe, expect, it } from 'vitest';
import { DEMO_ITEMS } from '../data/demo';
import { getCleanupScore, searchItems } from '../lib/search';

describe('searchItems', () => {
  it('finds an item using Turkish-insensitive text', () => {
    const results = searchItems(DEMO_ITEMS, 'siyah ayakkabi');
    expect(results.map((item) => item.id)).toContain('demo-sneaker-1');
  });

  it('combines query and category filters', () => {
    const results = searchItems(DEMO_ITEMS, 'istanbul', 'places');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('demo-map-1');
  });
});

describe('getCleanupScore', () => {
  it('prioritizes duplicate items', () => {
    const duplicate = DEMO_ITEMS.find((item) => item.id === 'demo-social-1');
    const fresh = DEMO_ITEMS.find((item) => item.id === 'demo-sneaker-1');
    expect(duplicate).toBeDefined();
    expect(fresh).toBeDefined();
    expect(getCleanupScore(duplicate!, new Date('2026-08-31'))).toBeGreaterThan(
      getCleanupScore(fresh!, new Date('2026-08-31')),
    );
  });
});
