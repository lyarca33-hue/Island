/**
 * Meubles habillés par l'« Ultimate House Interior Pack » de Quaternius (CC0) : canapé, tables,
 * chaises, tabouret. Les modèles sont regroupés dans `public/models/interior.glb` par
 * `tools/build_interior_assets.py`.
 *
 * Aliments habillés par les modèles texturés faits avec Tripo (pack `aliments`, voir
 * tools/build_aliments_assets.mjs) ou, à défaut, par l'« Ultimate Food Pack » (CC0, pack
 * `nourriture`) ; les deux sont chargés avant la maison (packs/assets.ts). Le modèle garde ses
 * proportions et prend la place des pièces qu'il remplace ; sa pièce principale s'appelle `cuit`
 * quand l'aliment cuit, pour que sa couleur suive la cuisson (cooking.ts).
 *
 * Un meuble habillé garde tout ce qui sert au jeu : sa fiche, ses pièces nommées (rien ici n'en
 * a), et sa taille. Le modèle du pack prend exactement la boîte des pièces faites par programme
 * qu'il remplace : l'assise, le plateau et le dossier restent où le jeu les attend (s'asseoir,
 * poser une assiette). Tant que le fichier n'est pas chargé, les meubles faits par programme
 * restent ; Game les rhabille ensuite (WorldItem.restyle).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createToonMaterial } from '../toon';
import { packModel, packReady } from '../packs/assets';
import type { ModelName, PackId } from '../packs/manifest';
import type { ItemDef } from './catalog';
import { dressTripo, hasTripoLook } from './tripo';

export const INTERIOR_URL = `${import.meta.env.BASE_URL}models/interior.glb`;

/** Fiche du jeu -> modèle du pack (même orientation : l'avant vers +Z, le dossier côté -Z). */
export const INTERIOR_LOOKS: Record<string, string> = {
  canape: 'Couch_Medium1',
  'table-basse': 'Table_RoundLarge',
  table: 'Table_RoundLarge',
  chaise: 'Chair_2',
  tabouret: 'Stool',
};

/**
 * Fiche du jeu -> aliment d'un pack (`aliments` de Tripo, sinon `nourriture` de Quaternius). `turn`
 * le couche comme celui du jeu ; `fit` : « inside » (défaut) le fait tenir dans la boîte des pièces
 * remplacées, « long » lui donne leur longueur, « stretch » exactement leur boîte ; `cuit` nomme la
 * pièce qui cuit (un modèle Tripo n'a qu'une pièce : c'est elle) ; `colors` remplace des couleurs de
 * FOOD_PALETTE.
 */
type FoodLook = ({ pack: 'aliments'; model: ModelName<'aliments'> } | { pack?: 'nourriture'; model: ModelName<'nourriture'> }) & {
  turn?: [number, number, number];
  fit?: 'inside' | 'long' | 'stretch';
  cuit?: string;
  colors?: Record<string, number>;
};

/** Un aliment habillé par son modèle Tripo (même nom que la fiche, sauf `model`). */
const tripo = (model: ModelName<'aliments'>, more: { fit?: FoodLook['fit']; turn?: FoodLook['turn'] } = {}): FoodLook => ({ pack: 'aliments', model, ...more });

/** Couleurs du jeu pour les matériaux du pack (les siennes, sombres, juraient à côté des autres objets). */
const FOOD_PALETTE: Record<string, number> = {
  DarkRed: 0xc8352a,
  Red: 0xc0302a,
  DarkGreen: 0x4f8a3a,
  PaleGreen: 0x8bc34a,
  DarkBrown: 0x5a3220,
  Brown: 0xb9783a,
  Light: 0xf0d29a,
  Orange: 0xf08a1a,
  Yellow: 0xf2cf3a,
  LightYellow: 0xe8c27a,
  White: 0xf3efe4,
  Beige: 0xf0e6d0,
};
export const FOOD_LOOKS: Record<string, FoodLook> = {
  // les aliments faits avec Tripo, déjà couchés comme ceux du jeu (les longs le long de Z)
  ...Object.fromEntries(
    (['ail', 'beurre', 'chocolat', 'citron', 'confiture', 'farine', 'fraises', 'fromage', 'huile', 'ketchup', 'lait', 'mayonnaise', 'miel', 'moutarde', 'oeuf', 'oignon', 'orange', 'pain', 'poire', 'poisson', 'poivre', 'poivron', 'pomme', 'pomme-de-terre', 'raisin', 'salade', 'sel', 'steak', 'tomate', 'vinaigre', 'yaourt'] as const).map((id) => [id, tripo(id)]),
  ),
  // longs, ou plus épais que celui du jeu (fanes, feuilles, tranche) : à sa longueur plutôt que dans sa boîte
  ...Object.fromEntries((['banane', 'carotte', 'concombre', 'courgette', 'poireau', 'poulet', 'saucisses'] as const).map((id) => [id, tripo(id, { fit: 'long' })])),
  // la baguette de Tripo, plus large que haute, et la tranche de jambon, trop épaisse : à la boîte du jeu
  baguette: tripo('baguette', { fit: 'stretch' }),
  jambon: tripo('jambon', { fit: 'stretch' }),
  champignons: tripo('champignon'),
  creme: tripo('creme'),
  // l'œuf au plat et la pizza n'ont pas (encore) de modèle Tripo
  'oeuf-plat': { model: 'Egg_Fried', cuit: 'White' },
  pizza: { model: 'Pizza', cuit: 'Yellow' },
};

/** Les modèles chargés : pour chacun, ses pièces (géométrie partagée, couleur). */
type Kit = Map<string, Array<{ geometry: THREE.BufferGeometry; color: THREE.Color }>>;
let kit: Kit | null = null;
let loading: Promise<void> | null = null;

/** Charge le fichier une seule fois. */
export function loadInterior(): Promise<void> {
  loading ??= new GLTFLoader().loadAsync(INTERIOR_URL).then((gltf) => {
    const k: Kit = new Map();
    for (const node of gltf.scene.children) {
      const parts: Array<{ geometry: THREE.BufferGeometry; color: THREE.Color }> = [];
      node.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const m = o.material as THREE.MeshStandardMaterial;
        parts.push({ geometry: o.geometry, color: m.color.clone() });
        m.dispose();
      });
      k.set(node.name, parts);
    }
    kit = k;
  });
  return loading;
}

/** Une pièce sans nom (ou nommée `also`), hors des pièces nommées : c'est elle que le pack remplace. */
function plainMeshes(root: THREE.Object3D, also = ''): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D) => {
    for (const c of o.children) {
      if (c.name && c.name !== also) continue;
      if (c instanceof THREE.Mesh) out.push(c);
      else if (!c.name) walk(c);
    }
  };
  walk(root);
  return out;
}

/**
 * Le modèle d'un objet : celui du pack si la fiche en a un et que le fichier est chargé (posé
 * dans la boîte des pièces qu'il remplace), sinon celui fait par programme.
 */
export function buildModel(def: ItemDef): THREE.Object3D {
  const model = def.build();
  // meubles et appareils de la cuisine faits avec Tripo (tripo.ts)
  if (hasTripoLook(def.id)) return dressTripo(def.id, model);
  const food = FOOD_LOOKS[def.id];
  if (food && packReady(packOf(food))) return dressFood(def, model, food);
  const look = INTERIOR_LOOKS[def.id];
  const parts = look ? kit?.get(look) : undefined;
  if (!parts?.length) return model;
  model.updateMatrixWorld(true);
  const plain = plainMeshes(model);
  const target = new THREE.Box3();
  for (const m of plain) target.union(new THREE.Box3().setFromObject(m));
  if (target.isEmpty()) return model;
  for (const m of plain) {
    m.removeFromParent();
    m.geometry.dispose();
  }
  const source = new THREE.Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    source.union(p.geometry.boundingBox!);
  }
  const from = source.getSize(new THREE.Vector3()), to = target.getSize(new THREE.Vector3());
  const dressed = new THREE.Group();
  for (const p of parts) {
    // un matériau par objet : l'usure (durability.ts) ternit chaque meuble pour lui seul
    const mesh = new THREE.Mesh(p.geometry, createToonMaterial({ color: p.color, rimStrength: 0.15 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    dressed.add(mesh);
  }
  dressed.scale.set(to.x / from.x, to.y / from.y, to.z / from.z);
  const c = source.getCenter(new THREE.Vector3()).multiply(dressed.scale);
  dressed.position.copy(target.getCenter(new THREE.Vector3())).sub(c);
  model.add(dressed);
  return model;
}

const packOf = (look: FoodLook): PackId => look.pack ?? 'nourriture';

/** L'aliment du pack, à sa taille, posé dans la boîte des pièces qu'il remplace. */
function dressFood(def: ItemDef, model: THREE.Object3D, look: FoodLook): THREE.Object3D {
  model.updateMatrixWorld(true);
  const plain = plainMeshes(model, 'cuit');
  const target = new THREE.Box3();
  for (const m of plain) target.union(new THREE.Box3().setFromObject(m));
  if (target.isEmpty()) return model;
  for (const m of plain) {
    m.removeFromParent();
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  }
  const turned = new THREE.Group();
  turned.add(look.pack === 'aliments' ? packModel('aliments', look.model, {}, true) : packModel('nourriture', look.model, {}, true));
  if (look.turn) turned.rotation.set(...look.turn);
  turned.updateMatrixWorld(true);
  const source = new THREE.Box3().setFromObject(turned);
  const from = source.getSize(new THREE.Vector3()), to = target.getSize(new THREE.Vector3());
  const k = to.clone().divide(from);
  // mêmes proportions que dans le pack, sauf « stretch »
  const scale = look.fit === 'stretch' ? k
    : new THREE.Vector3().setScalar(look.fit === 'long' ? Math.max(to.x, to.y, to.z) / Math.max(from.x, from.y, from.z) : Math.min(k.x, k.y, k.z));
  const dressed = new THREE.Group();
  dressed.add(turned);
  dressed.scale.copy(scale);
  const c = source.getCenter(new THREE.Vector3()).multiply(scale);
  const t = target.getCenter(new THREE.Vector3());
  dressed.position.set(t.x - c.x, target.min.y - source.min.y * scale.y, t.z - c.z);
  model.add(dressed);
  // une colonne de boisson (bouteille, canette) reste cachée dans le modèle, plus fin que la pièce remplacée
  model.traverse((o) => {
    if (o.userData.column) o.scale.set(0.75, o.scale.y, 0.75);
  });
  dressed.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material as THREE.MeshToonMaterial;
    if (look.pack === 'aliments') {
      // peint : la texture donne la couleur crue, la cuisson la teinte par-dessus (cooking.ts)
      if (def.cook) {
        o.name = 'cuit';
        m.userData.cookTint = true;
      }
      return;
    }
    const color = look.colors?.[m.name] ?? FOOD_PALETTE[m.name];
    if (color !== undefined) m.color.set(color);
    if (def.cook && m.name === look.cuit) {
      o.name = 'cuit';
      // cru au départ (la couleur suit ensuite la cuisson)
      m.color.set(def.cook.colors[0]);
    }
  });
  return model;
}

/** Vrai si la fiche est habillée par un pack (et qu'il est chargé). */
export function hasLook(def: ItemDef): boolean {
  // (les modèles Tripo sont chargés avant la maison : déjà en place, rien à rhabiller)
  if (hasTripoLook(def.id)) return false;
  return (!!kit && def.id in INTERIOR_LOOKS) || (def.id in FOOD_LOOKS && packReady(packOf(FOOD_LOOKS[def.id])));
}
