import type {
  ScanDependencies,
  ScanProgress,
  ScanRequest,
  ScanResult,
} from './contracts';

export async function runIncrementalScan(
  dependencies: ScanDependencies,
  request: ScanRequest,
): Promise<ScanResult> {
  const startedAt = new Date().toISOString();
  const listing = await dependencies.source.listChangedAssets(request.cursor, request.maxItems);
  const progress: ScanProgress = {
    discovered: listing.assets.length,
    analyzed: 0,
    skipped: 0,
    failed: 0,
  };
  const errors: ScanResult['errors'] = [];

  dependencies.onProgress?.(progress);

  for (const asset of listing.assets) {
    if (dependencies.isCancelled?.()) break;
    progress.currentFileName = asset.fileName;

    try {
      const existing = await dependencies.repository.getAssetIndex(asset.sourceId);
      const isCurrent =
        existing?.identityToken === asset.identityToken &&
        existing.analysisVersion >= request.analysisVersion;

      if (isCurrent) {
        progress.skipped += 1;
      } else {
        const blob = await dependencies.source.openAsset(asset);
        const analysis = await dependencies.analyzer.analyze(blob, asset.fileName);
        await dependencies.repository.saveAnalyzedAsset(
          asset,
          blob,
          analysis,
          request.analysisVersion,
        );
        progress.analyzed += 1;
      }
    } catch (error) {
      progress.failed += 1;
      errors.push({
        sourceId: asset.sourceId,
        message: error instanceof Error ? error.message : 'Bilinmeyen tarama hatası',
      });
    }

    dependencies.onProgress?.({ ...progress });
  }

  if (listing.nextCursor) await dependencies.repository.saveCursor(listing.nextCursor);

  return {
    ...progress,
    currentFileName: undefined,
    startedAt,
    completedAt: new Date().toISOString(),
    nextCursor: listing.nextCursor,
    errors,
  };
}
