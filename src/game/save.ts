/**
 * Sauvegarde de la partie : l'heure et la date, les besoins, l'humeur, la compétence cuisine, la
 * place du perso, et chaque objet de la maison (où il est, ce qu'il contient, sale, cuit, entamé,
 * usé…). La partie est gardée dans le navigateur (localStorage) toutes les quelques secondes et
 * quand on quitte ; connecté à un compte Google, elle part aussi dans le cloud (voir cloud.ts).
 *
 * Ce qui est en cours au moment de sauver (un feu allumé, une porte ouverte, un objet en main)
 * ne l'est pas : on retrouve les feux éteints, les portes fermées, et ce qu'on tenait posé à ses pieds.
 */
import * as THREE from 'three';
import type { Recipe } from '../creator/recipe';
import { type Argent, type ArgentSave, type Commande, readCommande } from './argent';
import type { WorldItem } from './items/carry';
import type { NeedKey } from './needs';
import { BODY_STATES } from './temperature';

/** Un objet de la maison. Les champs absents gardent leur valeur de départ. */
export interface ItemSave {
  id: string;
  /** Position et rotation (quaternion) dans le monde. */
  p: [number, number, number];
  q: [number, number, number, number];
  level?: number;
  contents?: string | null;
  condition?: number;
  portion?: number;
  dirty?: boolean;
  wet?: number;
  cooking?: number;
  age?: number;
  heat?: number;
  warmed?: boolean;
  stars?: number;
  /** États rangés à part par le jeu (pastilles qui restent, contenu d'un sac, lampe allumée…). */
  x?: Record<string, unknown>;
}

export interface GameSave {
  v: 1;
  /** Heure réelle de la sauvegarde (ms) : la plus récente gagne entre le navigateur et le cloud. */
  savedAt: number;
  clock: { minutes: number; speed: number };
  needs: Partial<Record<NeedKey, number>>;
  health: number;
  mood: number;
  skill: number;
  perso: { x: number; z: number; yaw: number };
  weather?: Record<string, unknown>;
  /** Température du corps (°C), trempé par la pluie (0 à 1), chaleur d'une boisson (°C de ressenti), état. */
  body?: { temp: number; soaked: number; inner: number; state: string };
  items: ItemSave[];
  /**
   * Ancienne liste des genres d'objets que le jeu connaissait : plus lue (elle prenait les meubles
   * ajoutés à la maison après la sauvegarde, d'un genre déjà connu, pour des objets cassés).
   */
  known?: string[];
  /**
   * La maison de départ de la version qui a sauvé : combien d'objets de chaque genre. Au
   * chargement, un objet de départ que la sauvegarde n'a plus (mangé, cassé, jeté) est retiré ;
   * ce qu'une mise à jour a ajouté à la maison depuis reste à sa place. Absent des anciennes
   * sauvegardes : rien n'est retiré.
   */
  placed?: Record<string, number>;
  /** Le perso du créateur, pour le retrouver sur un autre appareil. */
  recipe?: Recipe;
  /** Le porte-monnaie et les objets cassés à racheter. Absent des anciennes sauvegardes : l'argent de départ. */
  argent?: ArgentSave;
  /** La commande payée, pas encore livrée. */
  commande?: Commande;
}

/** Ce que le jeu ouvre à la sauvegarde (Game.saveAccess) : ses objets et de quoi les refaire. */
export interface SaveAccess {
  items: WorldItem[];
  /** La maison de départ : combien d'objets de chaque genre (avant de reprendre la partie). */
  placed: Record<string, number>;
  held: WorldItem[];
  add(id: string): WorldItem | null;
  remove(item: WorldItem): void;
  liquidColor(contents: string): THREE.ColorRepresentation;
  /** Remet l'aspect qui dépend de l'état (cuisson, moisissure). */
  refresh(item: WorldItem): void;
  /** États rangés à part par le jeu pour un objet, et leur retour. */
  extras(item: WorldItem): Record<string, unknown> | undefined;
  setExtras(item: WorldItem, x: Record<string, unknown>): void;
  /** `footing` : où il tient debout (la rive d'où il a plongé s'il nage). */
  perso: { position: THREE.Vector3; footing: THREE.Vector3; yaw: number; forward: THREE.Vector3; placeAt(pos: THREE.Vector3, yaw: number): void };
  clock: { minutes: number; speed: number };
  needs: { values: Record<NeedKey, number>; health: number };
  mood: number;
  skill: number;
  setMood(n: number): void;
  setSkill(n: number): void;
  weather: object;
  body: { temp: number; soaked: number; inner: number; state: string };
  argent: Argent;
  /** La commande en route (livrée par le sac de courses), et son retour. */
  delivery(): Commande | null;
  setDelivery(c: Commande | null): void;
  /** Après le chargement : chemins à refaire autour des meubles déplacés. */
  done(): void;
}

const round = (n: number, k = 1000) => Math.round(n * k) / k;
const pos = new THREE.Vector3();
const rot = new THREE.Quaternion();

/** Photo de la partie en cours. */
export function captureGame(a: SaveAccess): GameSave {
  const held = new Set(a.held);
  // ce qu'on tient : posé par terre devant le perso, les uns à côté des autres
  const feet = a.perso.position.clone().addScaledVector(a.perso.forward, 0.45);
  const side = new THREE.Vector3(a.perso.forward.z, 0, -a.perso.forward.x);
  let heldIndex = 0;
  const items = a.items.map((it): ItemSave => {
    if (held.has(it)) {
      rot.identity();
      pos.copy(feet).addScaledVector(side, (heldIndex++ - (held.size - 1) / 2) * 0.25).setY(it.restLift(rot));
    } else {
      it.object.updateMatrixWorld(true);
      it.object.getWorldPosition(pos);
      it.object.getWorldQuaternion(rot);
    }
    const s: ItemSave = { id: it.def.id, p: [round(pos.x), round(pos.y), round(pos.z)], q: [round(rot.x, 1e5), round(rot.y, 1e5), round(rot.z, 1e5), round(rot.w, 1e5)] };
    if (it.def.fill || it.def.tank || it.level) s.level = round(it.level);
    if (it.contents !== null) s.contents = it.contents;
    if (it.condition < 1) s.condition = round(it.condition);
    if (it.portion < 1) s.portion = round(it.portion);
    if (it.dirty) s.dirty = true;
    if (it.wet > 0) s.wet = round(it.wet);
    if (it.cooking > 0) s.cooking = round(it.cooking);
    if (it.age > 0) s.age = round(it.age);
    if (it.heat > 0) s.heat = round(it.heat);
    if (it.warmed) s.warmed = true;
    if (it.stars) s.stars = it.stars;
    const x = a.extras(it);
    if (x && Object.keys(x).length) s.x = x;
    return s;
  });
  const p = a.perso.footing;
  const weather: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a.weather)) if (typeof v === 'number' || typeof v === 'string' || v === null) weather[k] = v;
  return {
    v: 1,
    savedAt: Date.now(),
    clock: { minutes: a.clock.minutes, speed: a.clock.speed },
    needs: { ...a.needs.values },
    health: a.needs.health,
    mood: a.mood,
    skill: a.skill,
    perso: { x: round(p.x), z: round(p.z), yaw: round(a.perso.yaw) },
    weather,
    body: { temp: round(a.body.temp), soaked: round(a.body.soaked), inner: round(a.body.inner), state: a.body.state },
    items,
    placed: { ...a.placed },
    argent: a.argent.save(),
    ...(a.delivery() ? { commande: structuredClone(a.delivery()!) } : {}),
  };
}

/**
 * Remet la partie sauvée dans un jeu tout neuf (juste construit). Chaque objet sauvé reprend un
 * objet du même genre déjà là, dans l'ordre ; ceux qui manquent sont créés (plats cuisinés, sacs
 * livrés…), ceux de la maison de départ qui manquent à la sauvegarde retirés (mangés, cassés,
 * jetés) ; ce qu'une mise à jour a ajouté à la maison depuis reste à sa place (GameSave.placed).
 */
export function applyGame(a: SaveAccess, s: GameSave): void {
  const pool = new Map<string, WorldItem[]>();
  for (const it of a.items) {
    const list = pool.get(it.def.id) ?? [];
    list.push(it);
    pool.set(it.def.id, list);
  }
  for (const saved of s.items) {
    const it = pool.get(saved.id)?.shift() ?? a.add(saved.id);
    if (!it) continue; // objet disparu du jeu depuis la sauvegarde
    it.object.position.fromArray(saved.p);
    it.object.quaternion.fromArray(saved.q).normalize();
    if (saved.level !== undefined) {
      it.setLevel(saved.level);
      it.level = saved.level; // réservoir sans liquide dessiné (bouilloire) : le niveau seul
    }
    it.contents = saved.contents ?? null;
    if (it.contents) it.setLiquidColor(a.liquidColor(it.contents));
    it.setCondition(saved.condition ?? 1);
    if (saved.portion !== undefined) it.setPortion(saved.portion);
    if (it.def.dish || saved.dirty) it.setDirty(!!saved.dirty);
    if (saved.wet) it.setWet(saved.wet);
    it.cooking = saved.cooking ?? 0;
    it.age = saved.age ?? 0;
    it.heat = saved.heat ?? 0;
    it.warmed = !!saved.warmed;
    it.stars = saved.stars ?? 0;
    a.refresh(it);
    if (saved.x) a.setExtras(it, saved.x);
  }
  // objets de départ en trop : autant que la maison de départ de la sauvegarde en a perdu ; les
  // autres (meubles arrivés avec une mise à jour) restent. Sans la liste (ancienne sauvegarde) : tous restent.
  const kept = new Map<string, number>();
  for (const saved of s.items) kept.set(saved.id, (kept.get(saved.id) ?? 0) + 1);
  for (const [id, left] of pool) {
    const lost = Math.max(0, (s.placed?.[id] ?? 0) - (kept.get(id) ?? 0));
    for (const it of left.slice(0, lost)) a.remove(it);
  }

  a.clock.minutes = s.clock.minutes;
  a.clock.speed = s.clock.speed;
  for (const [k, v] of Object.entries(s.needs)) if (typeof v === 'number' && k in a.needs.values) a.needs.values[k as NeedKey] = v;
  a.needs.health = s.health;
  a.setMood(s.mood);
  a.setSkill(s.skill);
  if (s.weather) Object.assign(a.weather, s.weather);
  if (s.body && Number.isFinite(s.body.temp) && s.body.state in BODY_STATES) Object.assign(a.body, s.body);
  a.perso.placeAt(new THREE.Vector3(s.perso.x, 0, s.perso.z), s.perso.yaw);
  a.argent.load(s.argent);
  a.setDelivery(readCommande(s.commande));
  a.done();
}

// --- dans le navigateur -------------------------------------------------------------------

/** Une partie par carte (carte.ts) : la cuisine seule ne reprend pas la maison complète. */
/**
 * Clé de la partie dans le navigateur. Les parties d'avant le kit Tripo (`island-partie`, puis
 * `island-partie-cuisine`) gardaient des meubles qui n'existent plus : elles restent là, pas relues.
 */
const LOCAL_KEY = 'island-partie-kit';

/** La partie gardée dans ce navigateur, ou null. */
export function loadLocal(): GameSave | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameSave;
    return s && s.v === 1 && Array.isArray(s.items) ? s : null;
  } catch {
    return null;
  }
}

export function saveLocal(s: GameSave): boolean {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false; // navigation privée ou stockage plein : la partie n'est pas gardée
  }
}

/** Efface la partie de ce navigateur (nouvelle partie), compétence cuisine comprise (voir Game.ts). */
export function clearLocal(): void {
  try {
    localStorage.removeItem(LOCAL_KEY);
    localStorage.removeItem('island-cuisine-points');
  } catch {
    // rien à effacer
  }
}

/** Toutes les combien de secondes la partie est sauvée. */
export const AUTOSAVE_SECONDS = 20;

/**
 * Sauvegarde automatique : toutes les AUTOSAVE_SECONDS, quand l'onglet passe en arrière-plan,
 * quand on ferme la page, et à l'arrêt (passage au créateur de perso). `onSaved` : après chaque
 * sauvegarde (envoi au cloud, heure affichée).
 */
export class AutoSave {
  private timer = 0;
  private stopped = false;
  private readonly onHide = () => {
    if (document.visibilityState === 'hidden') this.save(true);
  };
  private readonly onUnload = () => this.save(true);

  constructor(private readonly capture: () => GameSave | null, private readonly onSaved?: (s: GameSave, leaving: boolean) => void) {
    this.timer = window.setInterval(() => this.save(), AUTOSAVE_SECONDS * 1000);
    document.addEventListener('visibilitychange', this.onHide);
    window.addEventListener('pagehide', this.onUnload);
  }

  /** Sauve maintenant (`leaving` : on quitte, à envoyer sans attendre) ; null si arrêtée ou jeu pas prêt. */
  save(leaving = false): GameSave | null {
    if (this.stopped) return null;
    const s = this.capture();
    if (!s) return null;
    saveLocal(s);
    this.onSaved?.(s, leaving);
    return s;
  }

  /** Arrête sans sauver (on va charger une autre partie, ou repartir de zéro). */
  cancel(): void {
    this.stopped = true;
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onHide);
    window.removeEventListener('pagehide', this.onUnload);
  }

  /** Dernière sauvegarde, puis arrêt. */
  stop(): void {
    this.save(true);
    this.cancel();
  }
}
