import { CATEGORY_META, type Category, type ScreenshotItem } from '../types';
import { getCleanupScore } from '../lib/search';

export interface MemoryRecord {
  id: string;
  kind: 'interest' | 'place' | 'product' | 'idea' | 'activity';
  label: string;
  category: Category;
  evidenceIds: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  confidence: number;
}

export interface SurfaceHistory {
  [screenshotId: string]: string;
}

export interface ResurfaceSuggestion {
  item: ScreenshotItem;
  reason: string;
  daysAgo: number;
}

export interface PeriodBrief {
  periodDays: number;
  captured: number;
  previousCaptured: number;
  topCategory?: Category;
  topCategoryCount: number;
  cleanupCandidates: number;
  likelyJunk: number;
  recurringInterests: MemoryRecord[];
  resurface?: ResurfaceSuggestion;
}

function dayDifference(now: Date, value: string): number {
  return Math.floor((now.getTime() - new Date(value).getTime()) / 86_400_000);
}

function seededFraction(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4_294_967_295;
}

export function shouldNotifyResurface(
  now: Date,
  localProfileId = 'default',
  targetDaysPerWeek = 3,
): boolean {
  const boundedTarget = Math.min(7, Math.max(0, targetDaysPerWeek));
  const dayKey = now.toISOString().slice(0, 10);
  return seededFraction(`${localProfileId}:${dayKey}:resurface-notification`) < boundedTarget / 7;
}

function memoryKind(category: Category): MemoryRecord['kind'] {
  if (category === 'shopping') return 'product';
  if (category === 'places') return 'place';
  if (category === 'ideas') return 'idea';
  return 'interest';
}

export function deriveMemories(items: ScreenshotItem[]): MemoryRecord[] {
  const groups = new Map<string, ScreenshotItem[]>();

  for (const item of items) {
    if (item.status === 'trash' || ['junk', 'other', 'documents', 'chats'].includes(item.category)) {
      continue;
    }
    const meaningfulTags = item.tags.filter(
      (tag) => !['yeni', 'geçmiş', 'geçici', 'tekrar', 'muhtemel çöp'].includes(tag),
    );
    for (const tag of meaningfulTags) {
      const key = `${item.category}:${tag.toLocaleLowerCase('tr-TR')}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
  }

  return [...groups.entries()]
    .map(([id, evidence]) => {
      const ordered = [...evidence].sort(
        (first, second) =>
          new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime(),
      );
      return {
        id,
        kind: memoryKind(ordered[0].category),
        label: id.slice(id.indexOf(':') + 1),
        category: ordered[0].category,
        evidenceIds: ordered.map((item) => item.id),
        firstSeenAt: ordered[0].createdAt,
        lastSeenAt: ordered[ordered.length - 1].createdAt,
        occurrenceCount: ordered.length,
        confidence: Math.min(0.98, 0.55 + ordered.length * 0.12),
      } satisfies MemoryRecord;
    })
    .sort((first, second) => second.occurrenceCount - first.occurrenceCount);
}

export function selectResurfaceItem(
  items: ScreenshotItem[],
  now: Date,
  history: SurfaceHistory = {},
  refreshSalt = 0,
): ResurfaceSuggestion | undefined {
  const dayKey = now.toISOString().slice(0, 10);
  const candidates = items
    .filter((item) => {
      const age = dayDifference(now, item.createdAt);
      const lastSurface = history[item.id];
      const cooldownPassed = !lastSurface || dayDifference(now, lastSurface) >= 21;
      return (
        item.status === 'active' &&
        age >= 14 &&
        age <= 540 &&
        cooldownPassed &&
        ['shopping', 'food', 'places', 'ideas', 'social'].includes(item.category) &&
        !item.tags.some((tag) => ['geçmiş', 'geçici', 'tekrar'].includes(tag))
      );
    })
    .map((item) => {
      const age = dayDifference(now, item.createdAt);
      const intentBoost = ['shopping', 'places', 'ideas'].includes(item.category) ? 0.18 : 0;
      const score = seededFraction(`${dayKey}:${refreshSalt}:${item.id}`) + intentBoost + Math.min(age / 900, 0.3);
      return { item, age, score };
    })
    .sort((first, second) => second.score - first.score);

  const selected = candidates[0];
  if (!selected) return undefined;

  const reasons: Partial<Record<Category, string>> = {
    shopping: `${selected.age} gün önce buna bakmıştın. Hâlâ ilgini çekiyor mu?`,
    places: `${selected.age} gün önce bu mekanı kaydetmiştin. Planına eklemek ister misin?`,
    ideas: `${selected.age} gün önce bu fikri saklamıştın. Yeniden düşünmeye değer olabilir.`,
    food: `${selected.age} gün önce bu tarifi kaydetmiştin. Bu hafta denemek ister misin?`,
    social: `${selected.age} gün önce bunu önemli bulmuştun. Şimdi hâlâ anlamlı mı?`,
  };

  return {
    item: selected.item,
    daysAgo: selected.age,
    reason: reasons[selected.item.category] ?? `${selected.age} gün önce kaydetmiştin.`,
  };
}

export function buildPeriodBrief(
  items: ScreenshotItem[],
  now: Date,
  periodDays = 30,
  history: SurfaceHistory = {},
  refreshSalt = 0,
): PeriodBrief {
  const active = items.filter((item) => item.status !== 'trash');
  const current = active.filter((item) => {
    const age = dayDifference(now, item.createdAt);
    return age >= 0 && age < periodDays;
  });
  const previous = active.filter((item) => {
    const age = dayDifference(now, item.createdAt);
    return age >= periodDays && age < periodDays * 2;
  });
  const categoryCounts = current.reduce<Partial<Record<Category, number>>>((counts, item) => {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
    return counts;
  }, {});
  const topCategoryEntry = (Object.entries(categoryCounts) as Array<[Category, number]>).sort(
    (first, second) => second[1] - first[1],
  )[0];
  const recurringInterests = deriveMemories(active).filter((memory) => memory.occurrenceCount >= 2).slice(0, 3);

  return {
    periodDays,
    captured: current.length,
    previousCaptured: previous.length,
    topCategory: topCategoryEntry?.[0],
    topCategoryCount: topCategoryEntry?.[1] ?? 0,
    cleanupCandidates: active.filter((item) => getCleanupScore(item, now) >= 20).length,
    likelyJunk: active.filter((item) => item.category === 'junk').length,
    recurringInterests,
    resurface: selectResurfaceItem(active, now, history, refreshSalt),
  };
}

export function describePeriod(brief: PeriodBrief): string {
  if (!brief.topCategory) return 'Bu dönemde henüz yeterli screenshot yok.';
  const direction = brief.captured >= brief.previousCaptured ? 'daha fazla' : 'daha az';
  return `Son ${brief.periodDays} günde ${brief.captured} screenshot aldın. Önceki döneme göre ${direction}; en çok ${CATEGORY_META[brief.topCategory].shortLabel.toLocaleLowerCase('tr-TR')} kaydettin.`;
}
