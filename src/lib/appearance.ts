import coastalDusk from '../assets/wallpapers/coastal-dusk.jpg';
import mistLake from '../assets/wallpapers/mist-lake.jpg';
import rainStone from '../assets/wallpapers/rain-stone.jpg';
import verdantGlasshouse from '../assets/wallpapers/verdant-glasshouse.jpg';

export type BackgroundMode = 'curated' | 'custom' | 'solid';
export type WallpaperId = 'verdant-glasshouse' | 'mist-lake' | 'coastal-dusk' | 'rain-stone';

export interface AppearanceSettings {
  backgroundMode: BackgroundMode;
  backgroundId: WallpaperId;
  customBackgroundPath?: string;
  customBackgroundLuminance?: number;
  solidColor: string;
  shuffleBackgrounds: boolean;
}

export interface CuratedWallpaper {
  id: WallpaperId;
  name: string;
  src: string;
  luminance: number;
  position: string;
}

export const CURATED_WALLPAPERS: CuratedWallpaper[] = [
  {
    id: 'verdant-glasshouse',
    name: 'Cam sera',
    src: verdantGlasshouse,
    luminance: 0.31,
    position: 'center 54%',
  },
  {
    id: 'mist-lake',
    name: 'Sisli göl',
    src: mistLake,
    luminance: 0.38,
    position: 'center 52%',
  },
  {
    id: 'coastal-dusk',
    name: 'Kıyı evi',
    src: coastalDusk,
    luminance: 0.28,
    position: 'center 57%',
  },
  {
    id: 'rain-stone',
    name: 'Yağmur taşı',
    src: rainStone,
    luminance: 0.22,
    position: 'center 50%',
  },
];

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  backgroundMode: 'curated',
  backgroundId: 'verdant-glasshouse',
  solidColor: '#151918',
  shuffleBackgrounds: true,
};

const SETTINGS_KEY = 'ss-tariff-appearance';
const PREVIOUS_WALLPAPER_KEY = 'ss-tariff-previous-wallpaper';
const SESSION_WALLPAPER_KEY = 'ss-tariff-session-wallpaper';

export function isWallpaperId(value: unknown): value is WallpaperId {
  return CURATED_WALLPAPERS.some((wallpaper) => wallpaper.id === value);
}

export function normalizeAppearance(value?: Partial<AppearanceSettings> | null): AppearanceSettings {
  const mode = value?.backgroundMode;
  return {
    backgroundMode: mode === 'custom' || mode === 'solid' ? mode : 'curated',
    backgroundId: isWallpaperId(value?.backgroundId)
      ? value.backgroundId
      : DEFAULT_APPEARANCE.backgroundId,
    customBackgroundPath: value?.customBackgroundPath || undefined,
    customBackgroundLuminance: typeof value?.customBackgroundLuminance === 'number'
      ? Math.min(1, Math.max(0, value.customBackgroundLuminance))
      : undefined,
    solidColor: /^#[0-9a-f]{6}$/i.test(value?.solidColor ?? '')
      ? value!.solidColor!
      : DEFAULT_APPEARANCE.solidColor,
    shuffleBackgrounds: value?.shuffleBackgrounds ?? DEFAULT_APPEARANCE.shuffleBackgrounds,
  };
}

export function loadBrowserAppearance(): AppearanceSettings {
  try {
    return normalizeAppearance(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}'));
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveBrowserAppearance(settings: AppearanceSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeAppearance(settings)));
}

export function chooseNextWallpaper(
  wallpaperIds: WallpaperId[],
  previousId: WallpaperId | undefined,
  randomValue: number,
): WallpaperId {
  if (wallpaperIds.length === 0) return DEFAULT_APPEARANCE.backgroundId;
  const candidates = wallpaperIds.length > 1
    ? wallpaperIds.filter((id) => id !== previousId)
    : wallpaperIds;
  const safeRandom = Number.isFinite(randomValue)
    ? Math.min(0.999999, Math.max(0, randomValue))
    : 0;
  return candidates[Math.floor(safeRandom * candidates.length)] ?? candidates[0];
}

export function getLaunchWallpaper(settings: AppearanceSettings): CuratedWallpaper {
  const normalized = normalizeAppearance(settings);
  let selectedId = normalized.backgroundId;

  if (normalized.shuffleBackgrounds) {
    const sessionId = sessionStorage.getItem(SESSION_WALLPAPER_KEY);
    if (isWallpaperId(sessionId)) {
      selectedId = sessionId;
    } else {
      const previousId = localStorage.getItem(PREVIOUS_WALLPAPER_KEY);
      selectedId = chooseNextWallpaper(
        CURATED_WALLPAPERS.map((wallpaper) => wallpaper.id),
        isWallpaperId(previousId) ? previousId : undefined,
        Math.random(),
      );
      sessionStorage.setItem(SESSION_WALLPAPER_KEY, selectedId);
      localStorage.setItem(PREVIOUS_WALLPAPER_KEY, selectedId);
    }
  }

  return CURATED_WALLPAPERS.find((wallpaper) => wallpaper.id === selectedId)
    ?? CURATED_WALLPAPERS[0];
}

