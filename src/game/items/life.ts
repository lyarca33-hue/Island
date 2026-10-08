/**
 * La vie autour de la cuisine (lot « vie ») : la théière et la boîte de sachets de thé. L'eau
 * chaude vient de la bouilloire ; un sachet dans la tasse ou la théière la fait infuser en thé.
 *
 * Les règles (infusion, petit-déjeuner, humeur du repas à table) sont dans Game, les sons dans
 * ../sound.ts.
 */
import * as THREE from 'three';
import { createToonMaterial } from '../toon';
import type { ItemDef } from './catalog';

const toon = (color: THREE.ColorRepresentation) => createToonMaterial({ color, rimStrength: 0.15 });

function mesh(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, toon(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function group(...parts: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.add(...parts);
  return g;
}

/** Ce que verse la bouilloire, et ce qu'il devient avec un sachet. */
export const HOT_WATER = 'eau chaude';
export const TEA = 'thé';
export const HOT_WATER_COLOR = 0xd7e4e6;
export const TEA_COLOR = 0x9a5a22;
/** Secondes pour qu'un sachet infuse l'eau chaude en thé. */
export const INFUSE = 6;
/** Sachets dans une boîte neuve. */
export const TEA_BAGS = 20;

/** Théière : corps rond, hauteur. */
const POT_R = 0.075;
const POT_H = 0.13;

export const LIFE_FEMININE = ['théière'];
export const LIFE_PLURAL = ['sachets de thé'];
/** Stock voulu (liste de courses) : une boîte de sachets. */
export const LIFE_STOCK: Record<string, number> = { 'sachets de thé': 1 };

export const LIFE_ITEMS: ItemDef[] = [
  {
    id: 'theiere',
    name: 'théière',
    portable: true,
    // tenue par l'anse (côté +Z) ; on verse par le bec (côté -Z), on ne boit pas dedans
    grip: 'fist',
    gripPoint: [0, POT_H * 0.55, POT_R + 0.035],
    mouth: [0, POT_H * 0.78, -POT_R - 0.055],
    jug: true,
    fill: [0.01, POT_H * 0.8],
    volume: 0.8,
    dish: true,
    fragility: 2,
    durability: 60,
    build: () => {
      const body = 0xf1ece2, band = 0x3f7f8c;
      const belly = mesh(new THREE.SphereGeometry(POT_R, 22, 14).scale(1, 0.85, 1), body, 0, POT_R * 0.85, 0);
      const stripe = mesh(new THREE.CylinderGeometry(POT_R * 1.005, POT_R * 1.005, 0.014, 22, 1, true), band, 0, POT_R * 0.85, 0);
      const lid = mesh(new THREE.CylinderGeometry(POT_R * 0.45, POT_R * 0.55, 0.018, 18), body, 0, POT_R * 1.68, 0);
      const knob = mesh(new THREE.SphereGeometry(0.011, 10, 8), band, 0, POT_R * 1.68 + 0.016, 0);
      // le bec, penché vers l'avant (-Z)
      const spout = mesh(new THREE.CylinderGeometry(0.008, 0.016, 0.085, 10), body, 0, POT_H * 0.6, -POT_R - 0.02);
      spout.rotation.x = -Math.PI / 4;
      // l'anse, à l'arrière (+Z)
      const handle = mesh(new THREE.TorusGeometry(0.035, 0.007, 8, 14, Math.PI), body, 0, POT_H * 0.55, POT_R - 0.004);
      handle.rotation.set(0, -Math.PI / 2, -Math.PI / 2);
      // le thé à l'intérieur (ne se voit pas, mais la théière se remplit comme la carafe)
      const tea = new THREE.Mesh(new THREE.CylinderGeometry(POT_R * 0.7, POT_R * 0.7, 1, 12).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: TEA_COLOR }));
      tea.name = 'liquide';
      tea.userData.column = true;
      tea.position.y = 0.01;
      tea.scale.y = 0.001;
      tea.visible = false;
      const stain = mesh(new THREE.CircleGeometry(POT_R * 0.4, 14).rotateX(-Math.PI / 2), 0x8a6a48, 0, POT_R * 1.68 + 0.0095, 0);
      stain.name = 'sale';
      return group(tea, belly, stripe, lid, knob, spout, handle, stain);
    },
  },
  {
    id: 'sachets-the',
    name: 'sachets de thé',
    portable: true,
    fragility: 8,
    durability: 80,
    build: () => {
      const g = group(
        mesh(new THREE.BoxGeometry(0.12, 0.07, 0.07), 0x2f6b4f, 0, 0.035, 0),
        mesh(new THREE.BoxGeometry(0.08, 0.035, 0.002), 0xf3e7c4, 0, 0.04, 0.036),
        mesh(new THREE.BoxGeometry(0.03, 0.03, 0.002), 0xc94f3d, -0.035, 0.04, 0.0365),
      );
      return g;
    },
  },
];

/** Le sachet qui pend dans la tasse ou la théière : la ficelle passe par-dessus le bord, l'étiquette dehors. */
export function teaBag(rim: number, radius: number): THREE.Group {
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.03, 0.006), new THREE.MeshBasicMaterial({ color: 0xe8dcc0 }));
  bag.position.set(radius * 0.4, rim - 0.035, 0);
  const string = new THREE.Mesh(new THREE.BoxGeometry(0.0015, 0.05, 0.0015), new THREE.MeshBasicMaterial({ color: 0xf4f1ea }));
  string.position.set(radius * 0.85, rim - 0.005, 0);
  string.rotation.z = -0.5;
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.018, 0.002), new THREE.MeshBasicMaterial({ color: 0xc94f3d }));
  tag.position.set(radius + 0.012, rim - 0.03, 0);
  const g = group(bag, string, tag);
  g.name = 'sachet';
  return g;
}
