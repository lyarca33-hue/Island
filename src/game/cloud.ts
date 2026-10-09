/**
 * Compte Google et partie dans le cloud (Firebase : connexion Google + base Firestore). Sans
 * réglages Firebase, rien n'est chargé et la partie reste dans le navigateur (save.ts).
 *
 * Réglages : les variables VITE_FIREBASE_* de `.env.local`, ou la config collée dans
 * Menu → Partie (gardée dans ce navigateur). Voir docs/compte-google.md.
 *
 * Une partie par compte, dans `parties/{uid}`. Chaque appareil retient jusqu'à quelle sauvegarde
 * du cloud il est à jour : si le cloud a plus récent (joué ailleurs), on demande laquelle garder.
 */
import type { FirebaseApp } from 'firebase/app';
import type { Auth, User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { GameSave } from './save';
import { CARTE_SUFFIX } from './carte';

export interface FirebaseSettings {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

const SETTINGS_KEY = 'island-firebase';
const SYNC_KEY = `island-cloud-sync${CARTE_SUFFIX}`;
/** Champs du document : une partie par carte (carte.ts), dans le même document. */
const PARTIE = CARTE_SUFFIX ? 'partieCuisine' : 'partie';
const SAVED_AT = CARTE_SUFFIX ? 'savedAtCuisine' : 'savedAt';
/** Envoi au cloud au plus toutes les tant de secondes (et quand on quitte l'onglet). */
const PUSH_SECONDS = 60;

const FIELDS: Array<keyof FirebaseSettings> = ['apiKey', 'authDomain', 'projectId', 'appId'];

function fromEnv(): FirebaseSettings | null {
  const env = import.meta.env;
  const s = { apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID, appId: env.VITE_FIREBASE_APP_ID };
  return FIELDS.every((k) => typeof s[k] === 'string' && s[k]) ? (s as FirebaseSettings) : null;
}

/** Réglages collés dans le menu, ou null. */
export function pastedFirebaseSettings(): FirebaseSettings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const s = raw ? (JSON.parse(raw) as FirebaseSettings) : null;
    return s && FIELDS.every((k) => typeof s[k] === 'string' && s[k]) ? s : null;
  } catch {
    return null; // réglages illisibles : on passe à .env.local
  }
}

/** Réglages collés dans le menu (prioritaires), sinon ceux de `.env.local`, sinon null. */
export function firebaseSettings(): FirebaseSettings | null {
  return pastedFirebaseSettings() ?? fromEnv();
}

/**
 * Lit la config telle que Firebase la donne (« const firebaseConfig = { apiKey: "…", … } ») ;
 * null s'il manque un champ.
 */
export function parseFirebaseConfig(text: string): FirebaseSettings | null {
  const out: Partial<FirebaseSettings> = {};
  for (const k of FIELDS) {
    const m = text.match(new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']+)["']`));
    if (m) out[k] = m[1].trim();
  }
  return FIELDS.every((k) => out[k]) ? (out as FirebaseSettings) : null;
}

export function storeFirebaseSettings(s: FirebaseSettings | null): void {
  try {
    if (s) localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    else localStorage.removeItem(SETTINGS_KEY);
  } catch {
    // stockage indisponible
  }
}

export interface CloudState {
  /** Firebase réglé (sinon : pas de bouton de connexion). */
  configured: boolean;
  /** Connexion ou échange en cours. */
  busy: boolean;
  user: { name: string; email: string; photo: string | null } | null;
  /** Dernier envoi réussi au cloud (ms), ou null. */
  pushedAt: number | null;
  error: string | null;
  /** Le cloud a une partie plus récente que celle de cet appareil : laquelle garder ? */
  conflict: GameSave | null;
}

type Listener = (s: CloudState) => void;

interface Fb {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  authMod: typeof import('firebase/auth');
  storeMod: typeof import('firebase/firestore');
}

/** Message lisible pour une erreur Firebase. */
function explain(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Connexion annulée.';
  if (code === 'auth/popup-blocked') return 'Le navigateur a bloqué la fenêtre de connexion : autorise les fenêtres pour ce site.';
  if (code === 'auth/unauthorized-domain') return `Ce site (${location.hostname}) n’est pas autorisé : ajoute-le dans Firebase → Authentication → Paramètres → Domaines autorisés.`;
  if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') return 'La connexion Google n’est pas activée dans Firebase (Authentication → Méthode de connexion → Google).';
  if (code === 'auth/invalid-api-key' || code === 'auth/api-key-not-valid.-please-pass-a-valid-api-key.') return 'La clé Firebase (apiKey) n’est pas bonne.';
  if (code === 'permission-denied') return 'Firestore refuse l’accès : vérifie les règles (voir docs/compte-google.md).';
  if (code === 'unavailable') return 'Pas de connexion au cloud pour l’instant ; la partie reste gardée sur cet appareil.';
  return (e as Error)?.message || 'Erreur inconnue.';
}

/**
 * Le compte et l'envoi de la partie. `adopt` : appelé pour charger une partie du cloud (choisie
 * par le joueur, ou parce que cet appareil n'avait rien de nouveau).
 */
export class Cloud {
  private fb: Promise<Fb> | null = null;
  private listeners = new Set<Listener>();
  private pending: GameSave | null = null;
  private lastPush = 0;
  private uid: string | null = null;
  /** Le cloud a été lu après la connexion : on peut y écrire sans écraser une partie plus récente. */
  private checked = false;
  state: CloudState = { configured: false, busy: false, user: null, pushedAt: null, error: null, conflict: null };
  adopt: ((s: GameSave) => void) | null = null;
  /** La partie en cours, à envoyer quand on choisit de garder celle de cet appareil. */
  current: (() => GameSave | null) | null = null;

  constructor() {
    this.state.configured = !!firebaseSettings();
    if (this.state.configured) void this.init();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<CloudState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  /** Recharge Firebase avec de nouveaux réglages (collés dans le menu). */
  reconfigure(s: FirebaseSettings | null): void {
    storeFirebaseSettings(s);
    // une appli Firebase déjà lancée garde ses réglages : on recharge la page pour les prendre
    location.reload();
  }

  private init(): Promise<Fb> {
    if (this.fb) return this.fb;
    this.fb = (async () => {
      const settings = firebaseSettings()!;
      const [appMod, authMod, storeMod] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
      const app = appMod.initializeApp(settings);
      const auth = authMod.getAuth(app);
      auth.languageCode = 'fr';
      const db = storeMod.getFirestore(app);
      const fb = { app, auth, db, authMod, storeMod };
      authMod.onAuthStateChanged(auth, (user) => void this.onUser(fb, user));
      return fb;
    })();
    this.fb.catch((e) => this.set({ error: explain(e) }));
    return this.fb;
  }

  async signIn(): Promise<void> {
    if (!this.state.configured) return;
    this.set({ busy: true, error: null });
    try {
      const fb = await this.init();
      await fb.authMod.signInWithPopup(fb.auth, new fb.authMod.GoogleAuthProvider());
    } catch (e) {
      this.set({ error: explain(e) });
    } finally {
      this.set({ busy: false });
    }
  }

  async signOut(): Promise<void> {
    if (!this.fb) return;
    await this.flush();
    const fb = await this.fb;
    await fb.authMod.signOut(fb.auth);
  }

  private syncMark(): { uid: string; savedAt: number } | null {
    try {
      return JSON.parse(localStorage.getItem(SYNC_KEY) ?? 'null');
    } catch {
      return null;
    }
  }

  private setSyncMark(savedAt: number): void {
    try {
      localStorage.setItem(SYNC_KEY, JSON.stringify({ uid: this.uid, savedAt }));
    } catch {
      // stockage indisponible
    }
  }

  private async onUser(fb: Fb, user: User | null): Promise<void> {
    this.uid = user?.uid ?? null;
    this.checked = false;
    this.set({ user: user ? { name: user.displayName ?? user.email ?? 'Joueur', email: user.email ?? '', photo: user.photoURL } : null, conflict: null, pushedAt: null, error: null });
    if (!user) return;
    this.set({ busy: true });
    try {
      const snap = await fb.storeMod.getDoc(fb.storeMod.doc(fb.db, 'parties', user.uid));
      if (this.uid !== user.uid) return;
      const raw = snap.exists() ? (snap.data()[PARTIE] as string | undefined) : undefined;
      const remote = raw ? (JSON.parse(raw) as GameSave) : null;
      const mark = this.syncMark();
      const known = mark?.uid === user.uid ? mark.savedAt : 0;
      if (remote && remote.savedAt > known) {
        // joué ailleurs depuis : on demande (l'envoi attend la réponse)
        this.set({ conflict: remote });
        return;
      }
      this.checked = true;
      const now = this.current?.();
      if (now) {
        this.pending = now;
        await this.flush();
      }
    } catch (e) {
      this.set({ error: explain(e) });
    } finally {
      this.set({ busy: false });
    }
  }

  /** Réponse à la question : reprendre la partie du cloud, ou garder celle de cet appareil. */
  async resolve(keep: 'cloud' | 'local'): Promise<void> {
    const remote = this.state.conflict;
    if (!remote) return;
    this.checked = true;
    this.set({ conflict: null });
    if (keep === 'cloud') {
      this.setSyncMark(remote.savedAt);
      this.set({ pushedAt: remote.savedAt });
      this.adopt?.(remote);
      return;
    }
    const now = this.current?.();
    if (now) {
      this.pending = now;
      await this.flush();
    }
  }

  /**
   * Une sauvegarde de plus (toutes les quelques secondes) : envoyée au cloud de temps en temps,
   * ou tout de suite si `now` (on quitte l'onglet).
   */
  push(s: GameSave, now = false): void {
    this.pending = s;
    if (now || Date.now() - this.lastPush >= PUSH_SECONDS * 1000) void this.flush();
  }

  /** Envoie tout de suite la dernière sauvegarde. */
  async flush(): Promise<void> {
    const s = this.pending;
    if (!s || !this.uid || !this.checked || !this.fb) return;
    this.pending = null;
    this.lastPush = Date.now();
    try {
      const fb = await this.fb;
      await fb.storeMod.setDoc(fb.storeMod.doc(fb.db, 'parties', this.uid), { [PARTIE]: JSON.stringify(s), [SAVED_AT]: s.savedAt, maj: fb.storeMod.serverTimestamp() }, { merge: true });
      this.setSyncMark(s.savedAt);
      this.set({ pushedAt: s.savedAt, error: null });
    } catch (e) {
      this.pending ??= s;
      this.set({ error: explain(e) });
    }
  }
}

/** Le compte, partagé par tout le jeu (il survit au passage par le créateur de perso). */
export const cloud = new Cloud();
