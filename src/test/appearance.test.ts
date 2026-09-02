import { describe, expect, it } from 'vitest';
import {
  chooseNextWallpaper,
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  type WallpaperId,
} from '../lib/appearance';

const ids: WallpaperId[] = [
  'verdant-glasshouse',
  'mist-lake',
  'coastal-dusk',
  'rain-stone',
];

describe('appearance', () => {
  it('does not immediately repeat a curated wallpaper', () => {
    expect(chooseNextWallpaper(ids, 'verdant-glasshouse', 0)).toBe('mist-lake');
    expect(chooseNextWallpaper(ids, 'mist-lake', 0.999)).toBe('rain-stone');
  });

  it('clamps random input and handles a one-item collection', () => {
    expect(chooseNextWallpaper(['coastal-dusk'], 'coastal-dusk', 5)).toBe('coastal-dusk');
    expect(chooseNextWallpaper(ids, undefined, -4)).toBe('verdant-glasshouse');
  });

  it('repairs invalid persisted appearance values', () => {
    expect(normalizeAppearance({
      backgroundMode: 'curated',
      backgroundId: 'missing' as WallpaperId,
      solidColor: 'red',
      customBackgroundLuminance: 3,
    })).toEqual({
      ...DEFAULT_APPEARANCE,
      customBackgroundLuminance: 1,
    });
  });
});

