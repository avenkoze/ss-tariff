import { describe, expect, it, vi } from 'vitest';
import type {
  AssetIndexRecord,
  ScanDependencies,
  SourceAsset,
  SourceCursor,
} from '../core/contracts';
import {
  buildPeriodBrief,
  selectResurfaceItem,
  shouldNotifyResurface,
} from '../core/memoryEngine';
import { runIncrementalScan } from '../core/scanEngine';
import { DEMO_ITEMS } from '../data/demo';
import { detectJunkSignals } from '../lib/analyzer';

describe('visual junk detection', () => {
  it('marks an almost entirely black frame as likely junk', () => {
    expect(
      detectJunkSignals({
        meanLuminance: 2,
        luminanceDeviation: 1.4,
        darkPixelRatio: 0.99,
        brightPixelRatio: 0,
      }),
    ).toContain('near-black');
  });

  it('does not mark a normal contrasty image as junk', () => {
    expect(
      detectJunkSignals({
        meanLuminance: 121,
        luminanceDeviation: 48,
        darkPixelRatio: 0.08,
        brightPixelRatio: 0.04,
      }),
    ).toEqual([]);
  });
});

describe('memory engine', () => {
  it('keeps the daily resurfaced item stable until refresh is requested', () => {
    const now = new Date('2026-08-31T12:00:00.000Z');
    const first = selectResurfaceItem(DEMO_ITEMS, now, {}, 0);
    const second = selectResurfaceItem(DEMO_ITEMS, now, {}, 0);
    const refreshed = selectResurfaceItem(DEMO_ITEMS, now, {}, 1);

    expect(first?.item.id).toBe(second?.item.id);
    expect(first).toBeDefined();
    expect(refreshed).toBeDefined();
  });

  it('builds a sourced period summary', () => {
    const brief = buildPeriodBrief(DEMO_ITEMS, new Date('2026-08-31T12:00:00.000Z'));
    expect(brief.captured).toBeGreaterThan(0);
    expect(brief.cleanupCandidates).toBeGreaterThan(0);
    expect(brief.resurface?.item).toBeDefined();
  });

  it('makes notification cadence deterministic for a given day', () => {
    const now = new Date('2026-08-31T12:00:00.000Z');
    expect(shouldNotifyResurface(now, 'local-profile')).toBe(
      shouldNotifyResurface(now, 'local-profile'),
    );
  });
});

describe('incremental scan engine', () => {
  it('skips unchanged assets and analyzes only changed assets', async () => {
    const assets: SourceAsset[] = [
      {
        sourceId: 'same',
        sourceUri: 'file:///same.png',
        sourceName: 'screenshots',
        fileName: 'same.png',
        mimeType: 'image/png',
        size: 100,
        createdAt: '2026-08-30T00:00:00.000Z',
        modifiedAt: '2026-08-30T00:00:00.000Z',
        identityToken: 'token-1',
      },
      {
        sourceId: 'new',
        sourceUri: 'file:///new.png',
        sourceName: 'screenshots',
        fileName: 'new.png',
        mimeType: 'image/png',
        size: 200,
        createdAt: '2026-08-31T00:00:00.000Z',
        modifiedAt: '2026-08-31T00:00:00.000Z',
        identityToken: 'token-2',
      },
    ];
    const indexes = new Map<string, AssetIndexRecord>([
      ['same', { sourceId: 'same', identityToken: 'token-1', analysisVersion: 2, screenshotId: 'ss-1' }],
    ]);
    const saveCursor = vi.fn(async (_cursor: SourceCursor) => undefined);
    const saveAnalyzedAsset = vi.fn(async () => DEMO_ITEMS[0]);
    const analyze = vi.fn(async () => ({
      category: 'other' as const,
      confidence: 0.5,
      tags: [],
      extractedText: '',
      width: 100,
      height: 200,
      analyzer: 'local-vision' as const,
    }));
    const dependencies: ScanDependencies = {
      source: {
        platform: 'windows',
        sourceName: 'screenshots',
        listChangedAssets: async () => ({
          assets,
          nextCursor: { sourceName: 'screenshots', value: 'cursor-2' },
        }),
        openAsset: async () => new Blob(['image']),
        requestDelete: async () => ({
          deletedIds: [],
          rejectedIds: [],
          requiresUserConfirmation: false,
        }),
      },
      repository: {
        getAssetIndex: async (sourceId) => indexes.get(sourceId),
        saveAnalyzedAsset,
        saveCursor,
      },
      analyzer: { analyze },
    };

    const result = await runIncrementalScan(dependencies, {
      trigger: 'manual',
      requestedAt: '2026-08-31T12:00:00.000Z',
      analysisVersion: 2,
    });

    expect(result.skipped).toBe(1);
    expect(result.analyzed).toBe(1);
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(saveAnalyzedAsset).toHaveBeenCalledTimes(1);
    expect(saveCursor).toHaveBeenCalledTimes(1);
  });
});
