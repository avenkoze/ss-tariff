import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';

export async function checkForUpdate(): Promise<Update | null> {
  return check({ timeout: 12_000 });
}

export async function installUpdate(update: Update): Promise<void> {
  await update.downloadAndInstall();
  await relaunch();
}

export type { Update };
