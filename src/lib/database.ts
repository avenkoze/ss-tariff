import type { ScreenshotItem } from '../types';

const DATABASE_NAME = 'ss-tariff-private-library';
const DATABASE_VERSION = 1;
const STORE_NAME = 'screenshots';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadLocalItems(): Promise<ScreenshotItem[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const items = (request.result as ScreenshotItem[]).map((item) => ({
        ...item,
        blobUrl: item.blob ? URL.createObjectURL(item.blob) : undefined,
      }));
      resolve(items);
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function saveLocalItem(item: ScreenshotItem): Promise<void> {
  const database = await openDatabase();
  const { blobUrl: _blobUrl, ...storedItem } = item;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(storedItem);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function deleteLocalItem(id: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function clearLocalItems(): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}
