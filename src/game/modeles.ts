/**
 * Mode « Modèles » de la carte de test : on fait apparaître n'importe quel modèle du catalogue
 * (modelesCatalogue.ts : objets du jeu et décor des packs) et on le pose où on veut, autant de fois
 * qu'on veut. Les modèles posés sont du décor : des Object3D fixes, hors de Game.items (on ne les
 * prend pas, ils ne s'usent pas, ne s'ouvrent pas).
 *
 * Un modèle en main : un aperçu translucide suit la souris, vert, ou rouge là où on ne peut pas
 * poser (trop loin, ou un meuble sur le perso). Il se pose sur le dessus d'un modèle posé ou d'une
 * pièce de construction (une face tournée vers le haut), sinon au sol. Chaque clic en pose une
 * copie ; R / F tournent (45°, ou 15°), Pg↑ / Pg↓ le lèvent (0 à 3 m). Échap ou clic droit le lâche.
 * Rien en main : un clic sur un modèle posé le choisit (cadre miel), le glisser le déplace ; on le
 * tourne, le lève, le duplique ou l'enlève de même. Ctrl+Z annule (200 gestes).
 *
 * Même contrat que Construction (on, listen, pressed, aim, press, release, update) ; la sauvegarde
 * est une liste de poses [clé, x, y, z, lacet] au millimètre (voir encodePoses).
 */
import * as THREE from 'three';
import { LAY_FLAT, WorldItem } from './items/carry';
import { forgetGhosts, SHADOW_ONLY } from './items/merge';
import { loadPack, packModel, packReady, packRig, packSize } from './packs/assets';
import type { ModelName } from './packs/manifest';
import { packRigOf } from './packs/rigs';
import { entree, type ModeleEntry, type ModeleKey } from './modelesCatalogue';

/** Une pose sauvée : clé du modèle, position du dessous (m, au mm près), lacet (rad, au millième). */
export type ModelePose = [key: string, x: number, y: number, z: number, yaw: number];

export interface ModelesHost {
  /** Hauteur du sol en (x, z). */
  ground(x: number, z: number): number;
  /** Ce sur quoi on peut aussi poser (les pièces de construction). */
  surfaces(): THREE.Object3D[];
  /** Où est le perso. */
  perso(): THREE.Vector3;
  /** Un modèle posé, enlevé, déplacé : chemins, brouillon, carte modifiée (jamais à chaque image). */
  changed(): void;
  notice(t: string): void;
}

/** Le modèle en main ou choisi, pour le panneau. `uid` : 0 pour celui en main. */
export interface PoseInfo {
  uid: number;
  entry: ModeleEntry;
  lift: number;
  yaw: number;
}

/** Le perso marche dans [-BORNE, BORNE] (Game : WALK_BOUND de la carte de test) : on pose dedans. */
const BORNE = 66;
/** Hauteur maximale dont on lève un modèle (m). */
const LIFT_MAX = 3;
/** Pas de la grille (m), quand elle est cochée. */
const GRILLE = 0.25;
/** On glisse un modèle choisi au-delà de ça (m) : en deçà, c'est un clic. */
const DRAG_MIN = 0.05;
/** Une face sur laquelle on pose : sa normale monte au moins de ça. */
const DESSUS_MIN = 0.6;
/** Décor plus petit que ça (m, plus grande dimension) : on passe à travers (carteTest : SMALL). */
const PETIT = 0.7;
/** Un modèle posé plus haut que ça au-dessus du sol (sur une table) ne gêne pas le passage. */
const HAUT_SOL = 0.3;
/** Le perso fait à peu près ça de rayon (m) : un meuble posé sur lui le coincerait. */
const RAYON_PERSO = 0.25;
const UNDO_MAX = 200;
/** Au-delà de ce nombre de modèles posés, on prévient (une fois) que la page peut ralentir. */
const BEAUCOUP = 300;
const RECENTS_KEY = 'island-modeles-recents';
const RECENTS_MAX = 18;
const BROUILLON_KEY = 'island-carte-test-modeles';
const MIEL = 0xf5be5b;

const UP = new THREE.Vector3(0, 1, 0);
const r3 = (v: number) => Math.round(v * 1000) / 1000 || 0;
/** Lacet ramené dans [-π, π]. */
const angle = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/** Les poses à sauver, arrondies au millimètre et au millième de radian. */
export function encodePoses(list: ReadonlyArray<{ key: string; x: number; y: number; z: number; yaw: number }>): ModelePose[] {
  return list.map((p) => [p.key, r3(p.x), r3(p.y), r3(p.z), r3(angle(p.yaw))]);
}

/**
 * Relit les poses d'une sauvegarde : les lignes illisibles sont laissées de côté sans bruit, les
 * modèles inconnus (retirés du jeu, pack disparu) aussi, mais comptés dans `ignores`.
 */
export function decodePoses(x: unknown, connue: (key: string) => boolean = () => true): { poses: ModelePose[]; ignores: number } {
  const poses: ModelePose[] = [];
  let ignores = 0;
  if (!Array.isArray(x)) return { poses, ignores };
  for (const row of x) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const [key, px, py, pz, yaw] = row as unknown[];
    if (typeof key !== 'string') continue;
    if (![px, py, pz, yaw].every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
    if (!connue(key)) {
      ignores++;
      continue;
    }
    poses.push([key, px as number, py as number, pz as number, yaw as number]);
  }
  return { poses, ignores };
}

/** Le modèle d'une entrée, le dessous à y = 0, et sa boîte dans ce repère. */
interface Built {
  inner: THREE.Object3D;
  /** L'objet du jeu qui l'habille (rhabillé à l'arrivée du pack intérieur). */
  item: WorldItem | null;
  local: THREE.Box3;
  /** Modèle de pack à pièces mobiles dont le pack se charge encore : refait découpé à son arrivée. */
  rigPending: boolean;
}

/** Construit le modèle d'une entrée (comme la visionneuse : objet du jeu, ou modèle de pack, découpé s'il a un rig). */
function construire(e: ModeleEntry): Built {
  if (e.kind === 'objet' && e.def) {
    const item = new WorldItem(e.def);
    // couverts, livres… couchés à plat comme sur la carte de test, le dessous au sol
    const rot = e.def.layFlat ? LAY_FLAT.clone() : new THREE.Quaternion();
    item.object.quaternion.copy(rot);
    item.object.position.set(0, item.restLift(rot), 0);
    item.object.updateMatrix();
    return { inner: item.object, item, local: item.box.clone().applyMatrix4(item.object.matrix), rigPending: false };
  }
  const pack = e.pack!;
  const name = e.model as ModelName<typeof pack>;
  // posé au sol et centré (manifest.ts) : la boîte est connue avant que le pack arrive
  const s = packSize(pack, name).multiplyScalar(e.scale);
  const local = new THREE.Box3(new THREE.Vector3(-s.x / 2, 0, -s.z / 2), new THREE.Vector3(s.x / 2, s.y, s.z / 2));
  const rigged = !!packRigOf(pack, name);
  const rig = rigged && packReady(pack) ? packRig(pack, name) : null;
  if (rig) {
    rig.scale.setScalar(e.scale);
    const g = new THREE.Group();
    g.add(rig);
    return { inner: g, item: null, local, rigPending: false };
  }
  // pack pas encore chargé : le groupe se remplit à son arrivée (packModel)
  return { inner: packModel(pack, name, { scale: e.scale }), item: null, local, rigPending: rigged };
}

/** Un modèle sans aucune pièce à dessiner (son pack se charge encore, ou a échoué). */
function vide(o: THREE.Object3D): boolean {
  let any = false;
  o.traverse((c) => {
    if (!any && c instanceof THREE.Mesh && c.name !== SHADOW_ONLY) any = true;
  });
  return !any;
}

/** L'objet et tous ses parents sont-ils montrés ? */
function montre(o: THREE.Object3D): boolean {
  for (let x: THREE.Object3D | null = o; x; x = x.parent) if (!x.visible) return false;
  return true;
}

/** Une pose, telle qu'on la défait. */
interface Pose {
  uid: number;
  entry: ModeleEntry;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Hauteur dont il est levé au-dessus de ce qui le porte (m). */
  lift: number;
}

/** Un modèle posé dans le monde. */
interface Placed extends Pose {
  object: THREE.Group;
  item: WorldItem | null;
  /** Boîte dans son repère (dessous à y = 0, avant tourné). */
  local: THREE.Box3;
  /** Boîte dans le monde (alignée sur les axes). */
  world: THREE.Box3;
  rigPending: boolean;
}

/** Un geste à annuler. Les modèles sont retrouvés par leur `uid`. */
type Step =
  | { kind: 'ajout'; poses: Pose[] }
  | { kind: 'retrait'; poses: Pose[] }
  | { kind: 'deplace'; avant: Pose }
  | { kind: 'vide'; poses: Pose[] };

/** Ce que vise la souris : un point, sur le dessus d'un modèle (ou d'une pièce), ou au sol. */
interface Aim {
  point: THREE.Vector3;
  dessus: boolean;
}

/** Un modèle touché par un rayon. */
interface Touch {
  p: Placed | null;
  distance: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

export class Modeles {
  readonly root = new THREE.Group();
  private readonly placedGroup = new THREE.Group();
  private readonly placed: Placed[] = [];
  private undoList: Step[] = [];
  private open = false;
  private pressing = false;
  private uids = 0;
  /** Le modèle en main (null : rien), son lacet et sa hauteur. */
  private inHand: ModeleEntry | null = null;
  private yaw = 0;
  private lift = 0;
  /** Le modèle posé choisi (cadre miel). */
  private sel: Placed | null = null;
  /** Le glissé en cours : le modèle, le point de départ, l'écart au point visé, la pose d'avant. */
  private drag: { p: Placed; start: THREE.Vector3; dx: number; dz: number; avant: Pose; moved: boolean } | null = null;
  private grid = false;
  private readonly rayBuf = new THREE.Ray();
  /** Le rayon de la souris (null : hors de la vue). */
  private ray: THREE.Ray | null = null;
  private ghost: { key: ModeleKey; holder: THREE.Group; item: WorldItem | null; local: THREE.Box3 } | null = null;
  private readonly ghostOk = new THREE.MeshBasicMaterial({ color: 0x8fe07a, transparent: true, opacity: 0.45, depthWrite: false });
  private readonly ghostBad = new THREE.MeshBasicMaterial({ color: 0xf2795b, transparent: true, opacity: 0.45, depthWrite: false });
  private readonly marker = new THREE.Box3Helper(new THREE.Box3(), MIEL);
  private readonly raycaster = new THREE.Raycaster();
  private readonly listeners = new Set<() => void>();
  private recentList: ModeleKey[] = lireRecents();
  private warned = false;
  /** Modèles à pièces mobiles dont on attend le pack (une seule attente par modèle). */
  private readonly waiting = new Set<ModeleKey>();
  /** Quelque chose a changé depuis la dernière sauvegarde. */
  private dirty = false;
  private saved: ModelePose[] | null | undefined;

  constructor(private readonly host: ModelesHost) {
    this.root.name = 'modeles';
    this.placedGroup.name = 'modeles-poses';
    this.marker.visible = false;
    this.marker.renderOrder = 20;
    (this.marker.material as THREE.LineBasicMaterial).depthTest = false;
    this.root.add(this.placedGroup, this.marker);
  }

  get on(): boolean {
    return this.open;
  }

  set on(v: boolean) {
    if (v === this.open) return;
    this.open = v;
    this.pressing = false;
    this.ray = null;
    this.drag = null;
    // panneau fermé : plus rien en main ni de choisi
    this.inHand = null;
    this.sel = null;
    this.showGhost(null);
    this.marker.visible = false;
    this.emit();
  }

  listen(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  get pressed(): boolean {
    return this.pressing;
  }

  get count(): number {
    return this.placed.length;
  }

  get canUndo(): boolean {
    return this.undoList.length > 0;
  }

  get enMain(): PoseInfo | null {
    return this.inHand ? { uid: 0, entry: this.inHand, lift: this.lift, yaw: this.yaw } : null;
  }

  get selection(): PoseInfo | null {
    const p = this.sel;
    return p ? { uid: p.uid, entry: p.entry, lift: p.lift, yaw: p.yaw } : null;
  }

  /** Calé sur une grille de 25 cm (pose et glissé). */
  get grille(): boolean {
    return this.grid;
  }

  set grille(v: boolean) {
    if (v === this.grid) return;
    this.grid = v;
    this.emit();
  }

  /** Prend un modèle en main (null : le lâche) ; il passe en tête des récents. */
  prendre(key: ModeleKey | null): void {
    const e = key ? entree(key) : null;
    if (key && !e) return;
    this.inHand = e;
    this.lift = 0;
    if (e) {
      this.sel = null;
      this.drag = null;
      this.recentList = [e.key, ...this.recentList.filter((k) => k !== e.key)].slice(0, RECENTS_MAX);
      ecrireRecents(this.recentList);
    }
    this.emit();
  }

  /** Les modèles pris récemment, le dernier d'abord (sans ceux qui ont disparu du catalogue). */
  recents(): ModeleKey[] {
    return this.recentList.filter((k) => entree(k) !== null);
  }

  /** Tourne le modèle en main, ou le modèle choisi : 45°, ou 15° (`fin`). */
  tourner(sens: 1 | -1, fin = false): void {
    const step = ((fin ? 15 : 45) * Math.PI) / 180 * sens;
    if (this.inHand) {
      this.yaw = angle(this.yaw + step);
      this.emit();
      return;
    }
    const p = this.sel;
    if (!p) return;
    this.record({ kind: 'deplace', avant: this.poseOf(p) });
    p.yaw = angle(p.yaw + step);
    this.applyPose(p);
    this.after();
  }

  /** Lève (ou baisse) le modèle en main, ou le modèle choisi, de `dy` m (entre 0 et 3 m). */
  monter(dy: number): void {
    if (this.inHand) {
      this.lift = r3(THREE.MathUtils.clamp(this.lift + dy, 0, LIFT_MAX));
      this.emit();
      return;
    }
    const p = this.sel;
    if (!p) return;
    const lift = r3(THREE.MathUtils.clamp(p.lift + dy, 0, LIFT_MAX));
    if (lift === p.lift) return;
    this.record({ kind: 'deplace', avant: this.poseOf(p) });
    p.y += lift - p.lift;
    p.lift = lift;
    this.applyPose(p);
    this.after();
  }

  /** Enlève le modèle choisi. */
  enlever(): void {
    const p = this.sel;
    if (!p) return;
    this.record({ kind: 'retrait', poses: [this.poseOf(p)] });
    this.remove(p);
    this.after();
  }

  /** Pose une copie du modèle choisi à côté de lui (sur ce qui la porte là), et la choisit. */
  dupliquer(): void {
    const p = this.sel;
    if (!p) return;
    const w = Math.max(p.world.max.x - p.world.min.x + 0.1, GRILLE);
    let x = this.snap(p.x + w);
    if (Math.abs(x) > BORNE) x = this.snap(p.x - w);
    const base = this.supportBelow(x, p.z, p.y - p.lift, null);
    const copy = this.put({ uid: ++this.uids, entry: p.entry, x, y: base + p.lift, z: p.z, yaw: p.yaw, lift: p.lift });
    this.record({ kind: 'ajout', poses: [this.poseOf(copy)] });
    this.sel = copy;
    this.after();
    this.warnMany();
  }

  /** Enlève tous les modèles posés (ça s'annule). */
  toutEnlever(): void {
    if (!this.placed.length) return;
    this.record({ kind: 'vide', poses: this.placed.map((p) => this.poseOf(p)) });
    for (const p of [...this.placed]) this.remove(p);
    this.after();
  }

  /** Défait le dernier geste. */
  annuler(): void {
    const step = this.undoList.pop();
    if (!step) return;
    this.drag = null;
    const byUid = (uid: number) => this.placed.find((p) => p.uid === uid);
    if (step.kind === 'ajout') {
      for (const s of step.poses) {
        const p = byUid(s.uid);
        if (p) this.remove(p);
      }
    } else if (step.kind === 'deplace') {
      const p = byUid(step.avant.uid);
      if (p) {
        Object.assign(p, { x: step.avant.x, y: step.avant.y, z: step.avant.z, yaw: step.avant.yaw, lift: step.avant.lift });
        this.applyPose(p);
      }
    } else {
      for (const s of step.poses) if (!byUid(s.uid)) this.put(s);
    }
    this.after();
  }

  /** Échap ou clic droit : lâche le modèle en main, sinon oublie le choisi. Vrai si quelque chose a été fait. */
  lacher(): boolean {
    if (this.inHand) {
      this.prendre(null);
      return true;
    }
    if (this.sel) {
      this.sel = null;
      this.drag = null;
      this.emit();
      return true;
    }
    return false;
  }

  /** Le repère de signalement du modèle choisi, sinon de celui en main (A / E). */
  cibleSignal(): string | null {
    return this.sel?.entry.signal ?? this.inHand?.signal ?? null;
  }

  /** Le rayon de la souris (copié : celui du jeu est réutilisé). */
  aim(ray: THREE.Ray | null): void {
    this.ray = ray ? this.rayBuf.copy(ray) : null;
  }

  /** Clic : pose le modèle en main, ou choisit (et commence à glisser) un modèle posé. */
  press(): void {
    if (!this.open) return;
    this.pressing = true;
    // au doigt, pas de survol : la visée est refaite ici
    if (this.inHand) {
      const a = this.aimAt(null);
      if (!a) return;
      const e = this.inHand;
      const at = this.spot(a, this.lift);
      // l'aperçu donne la boîte (au doigt, il apparaît là où on vient de poser)
      const local = this.showGhost(e)!.local;
      if (!this.libre(e, local, at, this.yaw)) {
        this.host.notice('Pas ici : trop loin, ou sur le perso.');
        return;
      }
      const p = this.put({ uid: ++this.uids, entry: e, x: at.x, y: at.y, z: at.z, yaw: this.yaw, lift: this.lift });
      this.record({ kind: 'ajout', poses: [this.poseOf(p)] });
      this.after();
      this.warnMany();
      return;
    }
    const t = this.ray ? this.nearest(this.touches(this.ray, null)) : null;
    if (!t?.p) {
      if (this.sel) {
        this.sel = null;
        this.emit();
      }
      return;
    }
    const p = t.p;
    if (this.sel !== p) {
      this.sel = p;
      this.emit();
    }
    // le point visé derrière lui (sol ou dessous) : le glissé le suit à cet écart
    const a = this.aimAt(p);
    if (a) this.drag = { p, start: a.point.clone(), dx: p.x - a.point.x, dz: p.z - a.point.z, avant: this.poseOf(p), moved: false };
  }

  release(): void {
    const d = this.drag;
    this.drag = null;
    this.pressing = false;
    if (d?.moved && this.placed.includes(d.p)) {
      this.record({ kind: 'deplace', avant: d.avant });
      this.after();
    }
  }

  // ---------------------------------------------------------------- visée

  /** Premier point du sol touché par le rayon (pas de 0,4 m, puis affiné), ou null (comme Construction). */
  private hitGround(ray: THREE.Ray): THREE.Vector3 | null {
    const p = new THREE.Vector3();
    const above = (t: number) => {
      p.copy(ray.origin).addScaledVector(ray.direction, t);
      return p.y - this.host.ground(p.x, p.z);
    };
    if (above(0) < 0) return null;
    let prev = 0;
    for (let t = 0.4; t < 600; t += 0.4) {
      if (above(t) < 0) {
        let lo = prev, hi = t;
        for (let k = 0; k < 10; k++) {
          const mid = (lo + hi) / 2;
          if (above(mid) < 0) hi = mid;
          else lo = mid;
        }
        above(hi);
        return p.clone();
      }
      if (p.y < -20 && ray.direction.y < 0) return null;
      prev = t;
    }
    return null;
  }

  /**
   * Les modèles posés touchés par le rayon (le premier point de chacun), sauf `skip`. On ne lance
   * le rayon que sur ceux dont la boîte est traversée ; un modèle encore vide compte par sa boîte.
   */
  private touches(ray: THREE.Ray, skip: Placed | null): Touch[] {
    const out: Touch[] = [];
    this.raycaster.ray.copy(ray);
    for (const p of this.placed) {
      if (p === skip || !ray.intersectsBox(p.world) || !montre(p.object)) continue;
      if (vide(p.object)) {
        const point = ray.intersectBox(p.world, new THREE.Vector3());
        if (point) {
          const top = Math.abs(point.y - p.world.max.y) < 1e-3;
          out.push({ p, distance: point.distanceTo(ray.origin), point, normal: top ? UP.clone() : new THREE.Vector3(1, 0, 0) });
        }
        continue;
      }
      for (const h of this.raycaster.intersectObject(p.object, true)) {
        if (!h.face || !montre(h.object)) continue;
        out.push({ p, distance: h.distance, point: h.point, normal: h.face.normal.clone().transformDirection(h.object.matrixWorld) });
        break;
      }
    }
    return out;
  }

  /** La pièce de construction (ou autre surface de l'hôte) touchée en premier. */
  private touchSurface(ray: THREE.Ray): Touch | null {
    const list = this.host.surfaces();
    if (!list.length) return null;
    this.raycaster.ray.copy(ray);
    for (const h of this.raycaster.intersectObjects(list, true)) {
      if (!h.face || !montre(h.object)) continue;
      return { p: null, distance: h.distance, point: h.point, normal: h.face.normal.clone().transformDirection(h.object.matrixWorld) };
    }
    return null;
  }

  private nearest(list: Touch[]): Touch | null {
    let best: Touch | null = null;
    for (const t of list) if (!best || t.distance < best.distance) best = t;
    return best;
  }

  /**
   * Où poser sous la souris (sans compter `skip`, le modèle qu'on glisse) : le dessus touché en
   * premier s'il est tourné vers le haut, sinon le sol.
   */
  private aimAt(skip: Placed | null): Aim | null {
    const ray = this.ray;
    if (!ray) return null;
    const g = this.hitGround(ray);
    const gd = g ? g.distanceTo(ray.origin) : Infinity;
    const surface = this.touchSurface(ray);
    const t = this.nearest(surface ? [...this.touches(ray, skip), surface] : this.touches(ray, skip));
    if (t && t.distance < gd + 1e-3 && t.normal.y > DESSUS_MIN) return { point: t.point.clone(), dessus: true };
    return g ? { point: g, dessus: false } : null;
  }

  private snap(v: number): number {
    return this.grid ? Math.round(v / GRILLE) * GRILLE : v;
  }

  /** Où va le dessous du modèle pour ce point visé (calé sur la grille, levé de `lift`). */
  private spot(a: Aim, lift: number): THREE.Vector3 {
    const x = this.snap(a.point.x), z = this.snap(a.point.z);
    const base = a.dessus ? a.point.y : this.host.ground(x, z);
    return new THREE.Vector3(x, base + lift, z);
  }

  /** Hauteur de ce qui porte un modèle en (x, z) sous `top` : un modèle posé (sa boîte), sinon le sol. */
  private supportBelow(x: number, z: number, top: number, skip: Placed | null): number {
    let base = this.host.ground(x, z);
    for (const p of this.placed) {
      const b = p.world;
      if (p === skip || x < b.min.x || x > b.max.x || z < b.min.z || z > b.max.z) continue;
      if (b.max.y <= top + 0.01 && b.max.y > base) base = b.max.y;
    }
    return base;
  }

  /** Un modèle qui bloque le passage : un meuble, ou un décor assez grand, posé à hauteur du sol. */
  private bloque(e: ModeleEntry, local: THREE.Box3, x: number, y: number, z: number): boolean {
    if (y - this.host.ground(x, z) > HAUT_SOL) return false;
    if (e.kind === 'objet') return !!e.def && !e.def.portable && !e.def.shower;
    const s = local.getSize(new THREE.Vector3());
    return Math.max(s.x, s.y, s.z) > PETIT;
  }

  /** Peut-on poser là : sur la carte, et pas un meuble sur le perso. */
  private libre(e: ModeleEntry, local: THREE.Box3, at: THREE.Vector3, yaw: number): boolean {
    if (Math.abs(at.x) > BORNE || Math.abs(at.z) > BORNE) return false;
    if (!this.bloque(e, local, at.x, at.y, at.z)) return true;
    const perso = this.host.perso();
    const dx = perso.x - at.x, dz = perso.z - at.z;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const m = RAYON_PERSO;
    return !(lx > local.min.x - m && lx < local.max.x + m && lz > local.min.z - m && lz < local.max.z + m);
  }

  // ---------------------------------------------------------------- modèles posés

  private poseOf(p: Placed): Pose {
    return { uid: p.uid, entry: p.entry, x: p.x, y: p.y, z: p.z, yaw: p.yaw, lift: p.lift };
  }

  private applyPose(p: Placed): void {
    p.object.position.set(p.x, p.y, p.z);
    p.object.rotation.set(0, p.yaw, 0);
    p.object.updateMatrixWorld(true);
    p.world.copy(p.local).applyMatrix4(p.object.matrixWorld);
  }

  private put(s: Pose): Placed {
    const b = construire(s.entry);
    const object = new THREE.Group();
    object.name = `modele/${s.entry.key}`;
    object.add(b.inner);
    this.placedGroup.add(object);
    const p: Placed = { ...s, object, item: b.item, local: b.local, world: new THREE.Box3(), rigPending: b.rigPending };
    this.applyPose(p);
    this.placed.push(p);
    if (b.rigPending) this.whenPack(s.entry);
    return p;
  }

  private remove(p: Placed): void {
    this.placedGroup.remove(p.object);
    // ne jamais libérer la géométrie : elle est partagée (packs, objets du jeu)
    forgetGhosts(p.object);
    const i = this.placed.indexOf(p);
    if (i >= 0) this.placed.splice(i, 1);
    if (this.sel === p) this.sel = null;
    if (this.drag?.p === p) this.drag = null;
  }

  /** Le pack d'un modèle à pièces mobiles arrive : ses copies posées (et l'aperçu) sont refaites découpées. */
  private whenPack(e: ModeleEntry): void {
    if (!e.pack || this.waiting.has(e.key)) return;
    this.waiting.add(e.key);
    void loadPack(e.pack).then(() => {
      this.waiting.delete(e.key);
      if (!packReady(e.pack!)) return;
      for (const p of this.placed) {
        if (!p.rigPending || p.entry.key !== e.key) continue;
        const b = construire(p.entry);
        for (const c of [...p.object.children]) {
          forgetGhosts(c);
          p.object.remove(c);
        }
        p.object.add(b.inner);
        p.rigPending = b.rigPending;
        p.object.updateMatrixWorld(true);
      }
      if (this.ghost?.key === e.key) {
        const keep = this.inHand;
        this.showGhost(null);
        if (keep) this.showGhost(keep);
      }
    });
  }

  private record(step: Step): void {
    this.undoList.push(step);
    if (this.undoList.length > UNDO_MAX) this.undoList.shift();
  }

  /** Après un changement : sauvegarde à refaire, chemins et brouillon (l'hôte), panneau. */
  private after(): void {
    this.dirty = true;
    this.host.changed();
    this.emit();
  }

  private warnMany(): void {
    if (this.warned || this.placed.length <= BEAUCOUP) return;
    this.warned = true;
    this.host.notice('Beaucoup de modèles posés : la page peut ralentir.');
  }

  /** Le modèle posé touché par le rayon (survol, signalements A / E), et sa distance. */
  hit(rc: THREE.Raycaster): { signal: string; name: string; distance: number } | null {
    const t = this.nearest(this.touches(rc.ray, null));
    return t?.p ? { signal: t.p.entry.signal, name: t.p.entry.label, distance: t.distance } : null;
  }

  /** Ce qui bloque le passage : les meubles et le gros décor posés au sol (leur boîte). */
  obstacles(): Array<{ box: THREE.Box3; pos: THREE.Vector3; yaw: number; wall: boolean }> {
    const out: Array<{ box: THREE.Box3; pos: THREE.Vector3; yaw: number; wall: boolean }> = [];
    for (const p of this.placed) {
      if (this.bloque(p.entry, p.local, p.x, p.y, p.z)) out.push({ box: p.local.clone(), pos: new THREE.Vector3(p.x, 0, p.z), yaw: p.yaw, wall: false });
    }
    return out;
  }

  /** Le pack intérieur est arrivé : les objets du jeu posés (et l'aperçu) sont rhabillés. */
  restyle(): void {
    for (const p of this.placed) p.item?.restyle();
    this.ghost?.item?.restyle();
  }

  // ---------------------------------------------------------------- à chaque image

  update(_dt: number): void {
    if (!this.open) return;
    const e = this.inHand;
    if (e) {
      const a = this.aimAt(null);
      // hors de la vue : l'aperçu est caché, pas refait
      const ghost = this.showGhost(e);
      if (ghost) ghost.holder.visible = !!a;
      if (a && ghost) {
        const at = this.spot(a, this.lift);
        ghost.holder.position.copy(at);
        ghost.holder.rotation.set(0, this.yaw, 0);
        const mat = this.libre(e, ghost.local, at, this.yaw) ? this.ghostOk : this.ghostBad;
        // les modèles arrivent après coup (packs, pack intérieur) : on repeint à chaque image
        ghost.holder.traverse((o) => {
          if (o instanceof THREE.Mesh && o.name !== SHADOW_ONLY && o.material !== mat) {
            o.material = mat;
            o.castShadow = false;
            o.receiveShadow = false;
          }
        });
      }
    } else {
      this.showGhost(null);
      if (this.drag && this.pressing) this.dragTo(this.drag);
    }
    const p = this.sel;
    this.marker.visible = !!p;
    if (p) this.marker.box.copy(p.world);
  }

  /** Le modèle glissé suit la souris (au-delà de 5 cm), sur ce qui est dessous, à sa hauteur. */
  private dragTo(d: NonNullable<Modeles['drag']>): void {
    const a = this.aimAt(d.p);
    if (!a) return;
    if (!d.moved) {
      if (Math.hypot(a.point.x - d.start.x, a.point.z - d.start.z) < DRAG_MIN) return;
      d.moved = true;
    }
    const p = d.p;
    const x = this.snap(a.point.x + d.dx), z = this.snap(a.point.z + d.dz);
    const base = a.dessus ? a.point.y : this.host.ground(x, z);
    const at = new THREE.Vector3(x, base + p.lift, z);
    if (!this.libre(p.entry, p.local, at, p.yaw)) return;
    p.x = x;
    p.y = at.y;
    p.z = z;
    this.applyPose(p);
  }

  private showGhost(e: ModeleEntry | null): NonNullable<Modeles['ghost']> | null {
    if ((e?.key ?? null) !== (this.ghost?.key ?? null)) {
      if (this.ghost) {
        this.root.remove(this.ghost.holder);
        forgetGhosts(this.ghost.holder);
      }
      this.ghost = null;
      if (e) {
        const b = construire(e);
        const holder = new THREE.Group();
        holder.renderOrder = 10;
        holder.add(b.inner);
        this.root.add(holder);
        this.ghost = { key: e.key, holder, item: b.item, local: b.local };
        if (b.rigPending) this.whenPack(e);
      }
    }
    return this.ghost;
  }

  // ---------------------------------------------------------------- sauvegarde

  save(): ModelePose[] | null {
    if (!this.dirty && this.saved !== undefined) return this.saved;
    this.dirty = false;
    return (this.saved = this.placed.length ? encodePoses(this.placed.map((p) => ({ key: p.entry.key, x: p.x, y: p.y, z: p.z, yaw: p.yaw }))) : null);
  }

  /** Remplace les modèles posés par ceux d'une sauvegarde ; rend le nombre de modèles inconnus laissés de côté. */
  load(x: unknown): { ignores: number } {
    for (const p of [...this.placed]) this.remove(p);
    this.undoList = [];
    this.sel = null;
    this.drag = null;
    const { poses, ignores } = decodePoses(x, (k) => entree(k) !== null);
    const added = poses.map(([key, px, py, pz, yaw]) => this.put({ uid: ++this.uids, entry: entree(key)!, x: px, y: py, z: pz, yaw, lift: 0 }));
    // la hauteur dont chacun est levé : au-dessus de ce qui le porte (un modèle posé, sinon le sol)
    for (const p of added) p.lift = r3(THREE.MathUtils.clamp(p.y - this.supportBelow(p.x, p.z, p.y, p), 0, LIFT_MAX));
    this.dirty = false;
    this.saved = undefined;
    // pas de host.changed : c'est l'hôte qui charge (la carte n'en devient pas modifiée)
    this.emit();
    return { ignores };
  }
}

function lireRecents(): ModeleKey[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const x: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(x) ? x.filter((k): k is string => typeof k === 'string').slice(0, RECENTS_MAX) : [];
  } catch {
    return [];
  }
}

function ecrireRecents(list: ModeleKey[]): void {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
  } catch {
    // stockage plein ou refusé : les récents restent pour cette visite
  }
}

/** Le brouillon des modèles posés sur la carte de test. */
export function loadModelesBrouillon(): unknown {
  try {
    const raw = localStorage.getItem(BROUILLON_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveModelesBrouillon(x: unknown): void {
  try {
    if (x) localStorage.setItem(BROUILLON_KEY, JSON.stringify(x));
    else localStorage.removeItem(BROUILLON_KEY);
  } catch {
    // stockage plein ou refusé : les modèles restent pour cette visite
  }
}
