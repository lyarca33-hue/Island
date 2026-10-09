/**
 * Pièces mobiles des modèles Tripo du salon, de la salle de bain, de la chambre, de l'entrée et du
 * garage, prêtes à brancher quand ces meubles arrivent dans la maison : pour chaque modèle, ses pièces
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
  | { kind: 'gather'; axis: Axis; to: number };

/** Pose `part` (sur son axe, au repos) à la part `k` de son mouvement. */
export function poseMotion(part: THREE.Object3D, motion: Motion, k: number): void {
  const t = THREE.MathUtils.clamp(k, 0, 1);
  if (motion.kind === 'turn') part.rotation[motion.axis] = (motion.rest ?? 0) + t * motion.angle;
  else if (motion.kind === 'slide') {
    const rest = (part.userData.rest ??= part.position.clone()) as THREE.Vector3;
    part.position[motion.axis] = rest[motion.axis] + t * motion.distance;
  } else part.scale[motion.axis] = THREE.MathUtils.lerp(motion.to, 1, t);
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
    def: { lamp: { y: 0.29, color: 0xffc98a, intensity: 1.4, range: 4.5 } },
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
    def: { lamp: { y: 1.42, color: 0xffd6a0, intensity: 2.2, range: 6 } },
  },
  // tiré à 1 (le modèle, de toute sa largeur) ; ouvert, il se tasse vers son bord droit, la tringle reste
  rideau: {
    look: { model: 'rideau', parts: { rideau: { from: 'rideau', pivot: [0.713, 0, 0], motion: { kind: 'gather', axis: 'x', to: 0.25 } } } },
    def: {},
  },
  // —— salle de bain
  // modélisé relevé ; fermé (0), il est rabattu d'un quart de tour vers l'avant sur sa charnière
  toilettes: {
    look: {
      model: 'toilettes',
      parts: { couvercle: { from: 'abattant', pivot: [0, 0.43, -0.046], motion: { kind: 'turn', axis: 'x', rest: Math.PI / 2, angle: -Math.PI / 2 } } },
    },
    def: { toilet: true },
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
  // d'un bloc : la porte entière bascule vers l'intérieur (-z) sur son bord du haut, et finit à plat sous le plafond
  'porte-garage': {
    look: { model: 'porte-garage', parts: { porte: { from: 'porte-garage', pivot: [0, 2.1, -0.03], motion: { kind: 'turn', axis: 'x', angle: deg(90) } } } },
    def: { door: deg(90), doorAxis: 'x' },
  },
};
