/**
 * Pièces mobiles des modèles Tripo du salon, de la salle de bain, de la chambre, de l'entrée et du
 * garage (la porte basculante, elle, est animée par room.ts), prêtes à brancher quand ces meubles
 * arrivent dans la maison : pour chaque modèle, ses pièces
 * (nœud du modèle, axe) au format de `TRIPO_LOOKS`, le mouvement de chacune, et les réglages de
 * fiche mesurés sur le modèle (hauteur de la lumière d'une lampe, dessus du matelas…).
 *
 * Un mouvement va de 0 (fermé, éteint, baissé) à 1 (ouvert, levé, tiré), comme l'ouverture des
 * portes du jeu (`Game.tickDoors`) : la porte de l'armoire tourne de 105°, le tiroir de la table de
 * nuit glisse de 24 cm, l'abattant des toilettes se relève, le drapeau de la boîte aux lettres se
 * lève d'un demi-tour sur le coude de sa tige, le rideau s'étire depuis son bord.
 *
 * Chaque axe a été essayé sur le modèle (rendus dans tripo/animations-modeles.md).
 */
import * as THREE from 'three';
import type { ItemDef } from './catalog';
import type { TripoLook } from './tripo';

export type Axis = 'x' | 'y' | 'z';

/** Mouvement d'une pièce posée sur son axe, selon une part `k` de 0 à 1. */
export type Motion =
  /** Tourne de `angle` (rad) autour de l'axe ; `rest` : angle à 0 (le modèle est fait dans l'autre position). */
  | { kind: 'turn'; axis: Axis; angle: number; rest?: number }
  /** Glisse de `distance` (m) le long de l'axe : un tiroir vers l'avant. */
  | { kind: 'slide'; axis: Axis; distance: number }
  /** Se tasse le long de l'axe jusqu'à la part `to` de sa taille, vers son axe : un rideau qu'on ouvre (à 1, tiré). */
  | { kind: 'gather'; axis: Axis; to: number }
  /** Se replie vers son axe en largeur (x et z) jusqu'à la part `to` : la toile d'un parasol (à 1, ouverte). */
  | { kind: 'fold'; to: number }
  /** Pousse depuis son axe le long de `axis`, de rien à toute sa taille : un filet d'eau, une flamme. Cachée à 0. */
  | { kind: 'grow'; axis: Axis }
  /** S'éclaire : sa couleur propre monte à `color` (à 1, allumée) : une lanterne, une croix de pharmacie. */
  | { kind: 'glow'; color: number }
  /**
   * Ondule comme un tissu au vent, sur toute une période quand la part va de 0 à 1 : chaque point
   * bouge le long de `push`, d'autant plus qu'il est loin de l'axe le long de `along` (le mât).
   */
  | { kind: 'wave'; along: Axis; push: Axis; amp: number; waves: number }
  /** Tourne de `angle` (rad) autour d'un axe quelconque (vecteur) : les aiguilles d'un cadran de biais. */
  | { kind: 'spin'; axis: [number, number, number]; angle: number }
  /** Change de taille le long de l'axe, depuis son axe, en suivant ces tailles (parts de la sienne) de 0 à 1 : la corde du puits. */
  | { kind: 'reel'; axis: Axis; sizes: number[] }
  /** Suit un chemin : décalages (m) depuis sa place, joints en ligne droite de 0 à 1 (le seau du puits). */
  | { kind: 'path'; points: Array<[number, number, number]> };

/** Pose `part` (sur son axe, au repos) à la part `k` de son mouvement. */
export function poseMotion(part: THREE.Object3D, motion: Motion, k: number): void {
  const t = THREE.MathUtils.clamp(k, 0, 1);
  if (motion.kind === 'turn') part.rotation[motion.axis] = (motion.rest ?? 0) + t * motion.angle;
  else if (motion.kind === 'slide') {
    const rest = (part.userData.rest ??= part.position.clone()) as THREE.Vector3;
    part.position[motion.axis] = rest[motion.axis] + t * motion.distance;
  } else if (motion.kind === 'gather') part.scale[motion.axis] = THREE.MathUtils.lerp(motion.to, 1, t);
  else if (motion.kind === 'fold') part.scale.x = part.scale.z = THREE.MathUtils.lerp(motion.to, 1, t);
  else if (motion.kind === 'grow') {
    part.scale[motion.axis] = Math.max(t, 1e-3);
    part.visible = t > 0;
  } else if (motion.kind === 'glow') glow(part, motion.color, t);
  else if (motion.kind === 'spin') part.quaternion.setFromAxisAngle(new THREE.Vector3(...motion.axis).normalize(), t * motion.angle);
  else if (motion.kind === 'reel') part.scale[motion.axis] = Math.max(along(motion.sizes, t), 1e-3);
  else if (motion.kind === 'path') {
    const rest = (part.userData.rest ??= part.position.clone()) as THREE.Vector3;
    const n = motion.points.length - 1;
    const i = Math.min(Math.floor(t * n), n - 1);
    const a = new THREE.Vector3(...motion.points[i]), b = new THREE.Vector3(...motion.points[i + 1]);
    part.position.copy(rest).add(a.lerp(b, t * n - i));
  } else wave(part, motion, k - Math.floor(k));
}

/** La valeur à la part `t` d'une suite jointe en ligne droite. */
function along(values: number[], t: number): number {
  const n = values.length - 1;
  const i = Math.min(Math.floor(t * n), n - 1);
  return THREE.MathUtils.lerp(values[i], values[i + 1], t * n - i);
}

/** Couleur propre des matériaux de la pièce (à elle : `packRig` les lui donne). */
function glow(part: THREE.Object3D, color: number, t: number): void {
  const c = new THREE.Color(color).multiplyScalar(t);
  part.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshToonMaterial | undefined;
    if (m?.emissive) m.emissive.copy(c);
  });
}

/** Le tissu ondulé à la phase `t` (0 à 1) : ses sommets à lui (`packRig` les lui donne), au repos gardés. */
function wave(part: THREE.Object3D, m: Extract<Motion, { kind: 'wave' }>, t: number): void {
  const ax = { x: 0, y: 1, z: 2 } as const;
  const a = ax[m.along], p = ax[m.push];
  part.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const pos = o.geometry.getAttribute('position') as THREE.BufferAttribute;
    const rest = (o.userData.rest ??= Float32Array.from(pos.array as Float32Array)) as Float32Array;
    let len = (o.userData.len as number | undefined) ?? 0;
    if (!len) {
      for (let i = 0; i < pos.count; i++) len = Math.max(len, Math.abs(rest[i * 3 + a]));
      o.userData.len = len ||= 1;
    }
    const arr = pos.array as Float32Array;
    for (let i = 0; i < pos.count; i++) {
      const d = Math.abs(rest[i * 3 + a]) / len;
      arr[i * 3 + p] = rest[i * 3 + p] + m.amp * d * Math.sin(2 * Math.PI * (m.waves * d - t));
    }
    pos.needsUpdate = true;
  });
}

/**
 * Pose la pièce `name` de l'objet `root` à la part `k` de son mouvement (celui que `dressTripo` lui a
 * donné) : `poseRig(toilettes, 'couvercle', ouvert)`, `poseRig(boite, 'drapeau', courrier ? 1 : 0)`.
 * Faux si la pièce n'a pas de mouvement (modèle pas chargé : la pièce faite par programme garde le sien).
 */
export function poseRig(root: THREE.Object3D, name: string, k: number): boolean {
  const part = root.getObjectByName(name);
  const motion = part?.userData.motion as Motion | undefined;
  if (!part || !motion) return false;
  poseMotion(part, motion, k);
  return true;
}

export interface Rig {
  /** Habillage du modèle, au format de `TRIPO_LOOKS` : ses pièces mobiles portent leur mouvement. */
  look: TripoLook;
  /** Réglages de la fiche du jeu mesurés sur le modèle. */
  def: Partial<ItemDef>;
}

const deg = THREE.MathUtils.degToRad;

/** La pente vers l'avant de la lunette des toilettes, telle que modélisée (m par m). */
const TOILET_SLOPE = 0.083;
/** L'abattant rabattu : un quart de tour, moins cette pente (il se couche à plat sur la lunette redressée). */
const TOILET_SHUT = Math.PI / 2 - Math.atan(TOILET_SLOPE);

/** Les modèles des autres pièces qui ont une pièce qui bouge ou s'allume, par nom de fichier (sans la taille). */
export const ROOM_RIGS: Record<string, Rig> = {
  // —— chambre
  // charnière à droite, poignée à gauche : comme l'ancienne armoire du jeu
  armoire: {
    look: { model: 'armoire', parts: { porte: { from: 'porte', pivot: [0.388, 0, 0.268], motion: { kind: 'turn', axis: 'y', angle: deg(105) } } } },
    def: { door: deg(105) },
  },
  // le jeu nomme `porte` la pièce qui glisse d'un tiroir
  'table-de-nuit': {
    look: { model: 'table-de-nuit', parts: { porte: { from: 'tiroir', motion: { kind: 'slide', axis: 'z', distance: 0.24 } } } },
    def: { drawer: 0.24 },
  },
  // l'abat-jour s'éclaire, la lumière part de son milieu (le jeu ajoute l'ampoule)
  'lampe-chevet': {
    look: { model: 'lampe-chevet', parts: { 'abat-jour': { from: 'abat-jour' } } },
    def: { lamp: { y: 0.29, color: 0xffc98a, intensity: 0.4, range: 3 } },
  },
  // la couette se cache quand le perso dort (le jeu montre `couette-dormeur` sur lui)
  lit: {
    look: { model: 'lit', parts: { couette: { from: 'couette' } } },
    def: { bed: { top: 0.59, length: 2.05 } },
  },
  // —— salon
  television: { look: { model: 'television', parts: { ecran: { from: 'ecran' } } }, def: { screen: true } },
  lampadaire: {
    look: { model: 'lampadaire', parts: { 'abat-jour': { from: 'abat-jour' } } },
    def: { lamp: { y: 1.42, color: 0xffd6a0, intensity: 0.9, range: 5 } },
  },
  // tiré à 1 (le modèle, de toute sa largeur) ; ouvert, il se tasse vers son bord droit, la tringle reste
  rideau: {
    look: { model: 'rideau', parts: { rideau: { from: 'rideau', pivot: [0.713, 0, 0], motion: { kind: 'gather', axis: 'x', to: 0.25 } } } },
    def: {},
  },
  // —— salle de bain
  // modélisé relevé ; fermé (0), il est rabattu sur sa charnière, au dos de l'abattant (z -0,08) :
  // il se couche à plat sur la lunette (dessus à 0,43 m). La lunette du modèle descend de 2 cm
  // vers l'avant (on aurait dit les toilettes penchées) : remise d'aplomb, l'abattant rabattu
  // d'autant moins qu'un quart de tour
  toilettes: {
    look: {
      model: 'toilettes',
      level: { z: 0, y: [0.15, 0.36], rise: TOILET_SLOPE },
      // l'ombre du réservoir cuite sur le dessus de l'abattant, et la sienne sur le devant du réservoir
      unshade: [
        { part: 'couvercle', min: [-1, -1, -1], max: [1, 2, 1], to: 160 },
        { min: [-0.22, 0.44, -0.14], max: [0, 0.82, 0], to: 178 },
      ],
      parts: { couvercle: { from: 'abattant', pivot: [0, 0.435, -0.08], motion: { kind: 'turn', axis: 'x', rest: TOILET_SHUT, angle: -TOILET_SHUT } } },
    },
    // on s'assoit sur la lunette, couvercle levé
    def: { toilet: true, seat: 0.43 },
  },
  // —— entrée
  // modélisé baissé (pointe en bas) ; il se lève d'un demi-tour sur le coude du L quand il y a du courrier
  'boite-lettres': {
    look: { model: 'boite-lettres', parts: { drapeau: { from: 'drapeau', pivot: [0.105, 1.115, 0.2], motion: { kind: 'turn', axis: 'z', angle: Math.PI } } } },
    def: {},
  },
  // —— garage
  // le couvercle (avec sa poignée) se relève vers l'arrière, sur l'arête du haut au dos de la caisse
  'caisse-outils': {
    look: { model: 'caisse-outils', parts: { porte: { from: 'couvercle', pivot: [0, 0.175, -0.125], motion: { kind: 'turn', axis: 'x', angle: deg(-100) } } } },
    def: { door: deg(-100), doorAxis: 'x' },
  },
  // les roues et le pédalier tournent sur leur axe (z) quand on roule (velo.ts) ; l'avant du vélo est vers -x
  velo: {
    look: {
      model: 'velo',
      parts: {
        'roue-avant': { from: 'roue-avant', pivot: [-0.531, 0.312, 0] },
        'roue-arriere': { from: 'roue-arriere', pivot: [0.546, 0.3, 0] },
        pedalier: { from: 'pedalier', pivot: [0.087, 0.302, 0] },
      },
    },
    def: {
      bike: {
        saddle: [0.36, 0.89, 0],
        grip: [-0.23, 1.08, 0.29],
        crank: [0.087, 0.302, 0],
        // la manivelle gauche pend, la droite (hors du carter de chaîne) est en haut
        pedals: [[-0.002, -0.147, 0.106], [0.002, 0.147, -0.213]],
        wheel: 0.31,
      },
    },
  },
};
