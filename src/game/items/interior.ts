/**
 * Meubles habillés par l'« Ultimate House Interior Pack » de Quaternius (CC0) : canapé, tables,
 * chaises, tabouret. Les modèles sont regroupés dans `public/models/interior.glb` par
 * `tools/build_interior_assets.py`.
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
import type { ItemDef } from './catalog';

export const INTERIOR_URL = `${import.meta.env.BASE_URL}models/interior.glb`;

/** Fiche du jeu -> modèle du pack (même orientation : l'avant vers +Z, le dossier côté -Z). */
export const INTERIOR_LOOKS: Record<string, string> = {
  canape: 'Couch_Medium1',
  'table-basse': 'Table_RoundLarge',
  table: 'Table_RoundLarge',
  chaise: 'Chair_2',
  tabouret: 'Stool',
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

/** Une pièce sans nom, hors des pièces nommées : c'est elle que le pack remplace. */
function plainMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D) => {
    for (const c of o.children) {
      if (c.name) continue;
      if (c instanceof THREE.Mesh) out.push(c);
      else walk(c);
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

/** Vrai si la fiche est habillée par le pack (et qu'il est chargé). */
export function hasLook(def: ItemDef): boolean {
  return !!kit && def.id in INTERIOR_LOOKS;
}
