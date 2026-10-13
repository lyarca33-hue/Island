/**
 * Où les cartes de la carte de test sont gardées : la base IndexedDB du navigateur (à part de la
 * partie, dont le stockage local a besoin de toute sa place). Deux rayons, tous deux rangés par id :
 * « cartes » (la carte entière) et « index » (sa ligne dans la liste, qui se lit vite). Une écriture
 * met à jour les deux d'un coup : une carte ratée n'abîme pas la liste.
 * La carte ouverte (id, nom, changée ou non) est notée dans le stockage local.
 * Sans IndexedDB (navigation privée de certains navigateurs…), rien ne casse : cartesDispo() est
 * faux, les listes sont vides et les écritures échouent ; il reste Exporter / Importer.
 */
import { type CarteCourante, type CarteInfo, type CarteSave, infoDe } from './cartes';

const DB_NAME = 'rp-island-cartes';
const CARTES = 'cartes';
const INDEX = 'index';
/** Clé de la carte ouverte dans le stockage local. */
const COURANTE_KEY = 'island-carte-courante';
/** Clé posée une fois les brouillons d'avant les cartes rangés en carte (atelierCartes.ts). */
const MIGRE_KEY = 'island-cartes-migre';

let db: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  db ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponible'));
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch (e) {
      return reject(e);
    }
    req.onupgradeneeded = () => {
      req.result.createObjectStore(CARTES, { keyPath: 'id' });
      req.result.createObjectStore(INDEX, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const d = req.result;
      // une autre version de la page veut la base : on la lâche, elle se rouvrira au besoin
      d.onversionchange = () => {
        d.close();
        db = null;
      };
      resolve(d);
    };
    req.onerror = () => reject(req.error);
  });
  db.catch(() => (db = null));
  return db;
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await open();
  return new Promise<T>((resolve, reject) => {
    const req = fn(d.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Une transaction sur les deux rayons, finie quand tout est écrit (ou tout annulé). */
async function both(fn: (cartes: IDBObjectStore, index: IDBObjectStore) => void): Promise<void> {
  const d = await open();
  return new Promise<void>((resolve, reject) => {
    const t = d.transaction([CARTES, INDEX], 'readwrite');
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('écriture annulée'));
    fn(t.objectStore(CARTES), t.objectStore(INDEX));
  });
}

/** Les cartes peuvent-elles être gardées dans ce navigateur ? */
export async function cartesDispo(): Promise<boolean> {
  try {
    await open();
    return true;
  } catch {
    return false;
  }
}

/** Les cartes gardées, de la plus récemment enregistrée à la plus ancienne. */
export async function listerCartes(): Promise<CarteInfo[]> {
  try {
    const all = await run<CarteInfo[]>(INDEX, 'readonly', (s) => s.getAll());
    return all.filter((c) => c && typeof c.id === 'string').sort((a, b) => b.modifieLe - a.modifieLe);
  } catch {
    return [];
  }
}

/** Une carte gardée, telle qu'écrite (à relire avec lireCarte), null si absente ou illisible. */
export async function lireCarteStockee(id: string): Promise<CarteSave | null> {
  try {
    return (await run<CarteSave | undefined>(CARTES, 'readonly', (s) => s.get(id))) ?? null;
  } catch {
    return null;
  }
}

/** Garde une carte (et sa ligne de la liste) ; faux si le navigateur refuse (plein, interdit). */
export async function ecrireCarte(c: CarteSave): Promise<boolean> {
  try {
    await both((cartes, index) => {
      cartes.put(c);
      index.put(infoDe(c));
    });
    return true;
  } catch (e) {
    console.warn('carte non enregistrée', e);
    return false;
  }
}

export async function supprimerCarte(id: string): Promise<void> {
  try {
    await both((cartes, index) => {
      cartes.delete(id);
      index.delete(id);
    });
  } catch (e) {
    console.warn('carte non supprimée', e);
  }
}

/** La carte ouverte à la dernière visite, null si rien de noté. */
export function lireCourante(): CarteCourante | null {
  try {
    const v = JSON.parse(localStorage.getItem(COURANTE_KEY) ?? 'null') as Partial<CarteCourante> | null;
    if (!v || typeof v !== 'object' || typeof v.nom !== 'string') return null;
    return { id: typeof v.id === 'string' && v.id ? v.id : null, nom: v.nom, modifiee: v.modifiee === true };
  } catch {
    return null;
  }
}

export function ecrireCourante(c: CarteCourante): void {
  try {
    localStorage.setItem(COURANTE_KEY, JSON.stringify({ id: c.id, nom: c.nom, modifiee: c.modifiee }));
  } catch {
    // stockage plein ou refusé : la carte ouverte est oubliée au rechargement, le brouillon reste
  }
}

/** Les brouillons d'avant les cartes ont-ils déjà été rangés en carte ? */
export function cartesMigrees(): boolean {
  try {
    return localStorage.getItem(MIGRE_KEY) === '1';
  } catch {
    return false;
  }
}

export function marquerCartesMigrees(): void {
  try {
    localStorage.setItem(MIGRE_KEY, '1');
  } catch {
    // stockage refusé : la migration se refera, elle ne fait qu'ajouter « Ma carte d'avant »
  }
}

/** Tout ce dont l'atelier a besoin pour garder les cartes (un faux le remplace dans les tests). */
export interface StockageCartes {
  dispo(): Promise<boolean>;
  lister(): Promise<CarteInfo[]>;
  lire(id: string): Promise<unknown>;
  ecrire(c: CarteSave): Promise<boolean>;
  supprimer(id: string): Promise<void>;
  lireCourante(): CarteCourante | null;
  ecrireCourante(c: CarteCourante): void;
  migree(): boolean;
  marquerMigree(): void;
}

/** Le stockage du navigateur (IndexedDB et stockage local). */
export const STOCKAGE_NAVIGATEUR: StockageCartes = {
  dispo: cartesDispo,
  lister: listerCartes,
  lire: lireCarteStockee,
  ecrire: ecrireCarte,
  supprimer: supprimerCarte,
  lireCourante,
  ecrireCourante,
  migree: cartesMigrees,
  marquerMigree: marquerCartesMigrees,
};
