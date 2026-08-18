/**
 * Sheet persistence: one saved painting in IndexedDB (localStorage cannot
 * hold a float layer this size). The dried layer plus the paper's identity
 * is the whole document — wet state dies with the tab, like real water.
 */

import type { PaperKind } from "../engine/paper";

export interface SavedSheet {
  width: number;
  height: number;
  paperKind: PaperKind;
  paperSeed: number;
  /** The dried reflectance layer, RGBA float32. */
  dried: Float32Array;
  savedAt: number;
}

const DB_NAME = "watercolor-lab";
const STORE = "sheets";
const KEY = "current";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSheet(sheet: SavedSheet): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    // Store the buffer, not the typed array, so structured clone stays lean.
    tx.objectStore(STORE).put({ ...sheet, dried: sheet.dried.buffer }, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadSheet(): Promise<SavedSheet | null> {
  try {
    const db = await openDB();
    const record = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!record || typeof record !== "object") return null;
    const raw = record as Omit<SavedSheet, "dried"> & { dried: ArrayBuffer };
    return { ...raw, dried: new Float32Array(raw.dried) };
  } catch {
    return null;
  }
}
