/**
 * Persos VRoid importés par le joueur : fichiers .vrm faits dans VRoid Studio (ou tout autre
 * modèle VRM humanoïde). Trop gros pour le stockage local (10 à 40 Mo), ils sont gardés dans la
 * base IndexedDB du navigateur ; la recette (et donc la partie) ne retient que leur identifiant
 * « perso:… ». Sur un autre appareil, le fichier manque : le perso de base le remplace.
 */

/** Préfixe des identifiants de modèles importés (les modèles du créateur n'en ont pas). */
export const IMPORTED_PREFIX = 'perso:';

export const isImportedId = (id: string): boolean => /^perso:[0-9a-f]{16}$/.test(id);

/** Taille maximale acceptée (Mo) : au-delà, le jeu ramerait et le navigateur risquerait de refuser. */
export const MAX_IMPORT_MB = 100;

export interface ImportedModel {
  id: string;
  /** Nom inscrit dans le fichier (ou nom du fichier). */
  label: string;
  /** Vignette (adresse data:) tirée du fichier, si elle existe. */
  thumb: string | null;
  addedAt: number;
}

interface StoredModel extends ImportedModel {
  data: ArrayBuffer;
}

const DB_NAME = 'rp-island-vrm';
const STORE = 'models';

let db: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  db ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponible'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.catch(() => (db = null));
  return db;
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await open();
  return new Promise<T>((resolve, reject) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Persos importés sur cet appareil, du plus récent au plus ancien (sans les fichiers). */
export async function listImported(): Promise<ImportedModel[]> {
  try {
    const all = await run<StoredModel[]>('readonly', (s) => s.getAll());
    return all.map(({ id, label, thumb, addedAt }) => ({ id, label, thumb, addedAt })).sort((a, b) => b.addedAt - a.addedAt);
  } catch {
    return [];
  }
}

/** Fichier .vrm d'un perso importé, null s'il n'est pas sur cet appareil. */
export async function importedData(id: string): Promise<ArrayBuffer | null> {
  try {
    const m = await run<StoredModel | undefined>('readonly', (s) => s.get(id));
    return m?.data ?? null;
  } catch {
    return null;
  }
}

export async function removeImported(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
}

/** Empreinte du fichier : le même perso importé deux fois n'est gardé qu'une fois. */
async function fingerprint(data: ArrayBuffer): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    return Array.from(h.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // pages hors https : FNV-1a sur 64 bits (deux moitiés de 32 bits)
  const bytes = new Uint8Array(data);
  let a = 0x811c9dc5, b = 0x050c5d1f;
  for (let i = 0; i < bytes.length; i++) {
    a = Math.imul(a ^ bytes[i], 0x01000193);
    b = Math.imul(b ^ bytes[i], 0x01000193) ^ (a >>> 7);
  }
  return [(a >>> 0).toString(16).padStart(8, '0'), (b >>> 0).toString(16).padStart(8, '0')].join('');
}

/** Garde un perso importé (déjà vérifié) ; renvoie sa fiche. */
export async function storeImported(data: ArrayBuffer, label: string, thumb: string | null): Promise<ImportedModel> {
  const id = IMPORTED_PREFIX + (await fingerprint(data));
  const model: ImportedModel = { id, label: label.slice(0, 32) || 'Perso VRoid', thumb, addedAt: Date.now() };
  await run('readwrite', (s) => s.put({ ...model, data } satisfies StoredModel));
  return model;
}
