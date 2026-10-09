/**
 * La pâtisserie : le moule à gâteau et les gâteaux. La pâte se fait au saladier (œufs, farine,
 * sucre ; levure pour qu'il lève, chocolat ou yaourt pour changer), se verse dans le moule, cuit
 * au four (cru → cuit → brûlé), refroidit, puis se coupe en parts sur la planche. Un plat brûlant
 * se sort du four avec les maniques.
 *
 * Les règles (verser, couper, se brûler) sont dans Game.
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

/** La pâte du saladier (BATTERS, prep.ts) qui se verse dans le moule. */
export const CAKE_BATTER = 'pâte à gâteau';

/** Ce qui s'ajoute au saladier pour un gâteau (et ce que ça fait monter) ; le pot de yaourt et la tablette y passent entiers. */
export const CAKE_MIX: Record<string, number> = { 'tablette de chocolat': 0.1, yaourt: 0.15 };
export const CAKE_USED_UP = Object.keys(CAKE_MIX);

/** Le gâteau que donne la pâte : au chocolat, au yaourt, ou nature. */
export function cakeFor(parts: string[]): string {
  if (parts.includes('tablette de chocolat')) return 'gateau-chocolat';
  if (parts.includes('yaourt')) return 'gateau-yaourt';
  return 'gateau';
}

/** Gâteaux dans leur moule (id) : le moule revient, sale, quand on les coupe. */
export const TIN_CAKES = ['gateau', 'gateau-chocolat', 'gateau-yaourt'];

/** Plus de chaleur que ça (0 à 1) : brûlant, on ne le sort du four qu'avec les maniques, on ne le coupe pas. */
export const TOO_HOT = 0.5;
/** Santé perdue en sortant un plat brûlant du four à mains nues. */
export const HOT_DISH_HARM = 5;
/** Sans levure, le gâteau ne lève pas : moins haut, une étoile de moins. */
export const FLAT_CAKE = 0.55;

/** Moule : rayon, hauteur (m). */
const TIN_R = 0.11;
const TIN_H = 0.05;
const TIN = 0xb9bec4;

/** Le moule : un fond et un bord d'acier. */
function tin(): THREE.Object3D[] {
  const wall = mesh(new THREE.CylinderGeometry(TIN_R, TIN_R * 0.95, TIN_H, 28, 1, true), TIN, 0, TIN_H / 2, 0);
  (wall.material as THREE.Material).side = THREE.DoubleSide;
  const rim = mesh(new THREE.TorusGeometry(TIN_R, 0.003, 6, 28).rotateX(Math.PI / 2), TIN, 0, TIN_H, 0);
  return [wall, rim, mesh(new THREE.CylinderGeometry(TIN_R * 0.95, TIN_R * 0.95, 0.004, 28), 0xa7adb3, 0, 0.002, 0)];
}

/** Le gâteau dans son moule ; sa pièce `cuit` (base en bas, pour qu'il lève ou reste plat). */
function cake(id: string, name: string, colors: [number, number, number], top?: number): ItemDef {
  return {
    id,
    name,
    portable: true,
    grip: 'palm',
    gripPoint: [0, 0.03, 0],
    food: { hunger: 96, bites: 16, color: colors[1] },
    cook: { seconds: 10, burn: 20, colors },
    cut: `parts-${id}`,
    fragility: 9,
    durability: 40,
    breakWord: 'écrasé',
    build: () => {
      const body = mesh(new THREE.CylinderGeometry(TIN_R * 0.93, TIN_R * 0.93, 0.055, 28).translate(0, 0.0275, 0), colors[0], 0, 0.004, 0);
      body.name = 'cuit';
      const g = group(...tin(), body);
      // le glaçage ou le sucre du dessus
      if (top !== undefined) g.add(mesh(new THREE.CylinderGeometry(TIN_R * 0.7, TIN_R * 0.7, 0.003, 24), top, 0, 0.061, 0));
      return g;
    },
  };
}

/** Huit parts en couronne sur la planche ; même cuisson que le gâteau entier. */
function parts(id: string, name: string, colors: [number, number, number]): ItemDef {
  return {
    id: `parts-${id}`,
    name,
    portable: true,
    grip: 'pinch',
    gripPoint: [0, 0.02, 0.06],
    mouth: [0, 0.025, -0.06],
    food: { hunger: 96, bites: 16, color: colors[1] },
    cook: { seconds: 10, burn: 20, colors },
    fragility: 10,
    durability: 20,
    breakWord: 'écrasé',
    build: () => {
      const g = new THREE.Group();
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = (i * Math.PI * 2) / n;
        const p = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 6, 1, false, a + 0.03, (Math.PI * 2) / n - 0.06).translate(0, 0.025, 0), colors[1]);
        p.name = 'cuit';
        // chaque part un peu écartée du centre
        p.position.set(Math.sin(a + Math.PI / n) * 0.008, 0, Math.cos(a + Math.PI / n) * 0.008);
        g.add(p);
      }
      return g;
    },
  };
}

/** Un plat ou un ustensile de cuisine : une boîte `size` (largeur, hauteur, profondeur), habillée par son modèle. */
function cookware(id: string, name: string, size: [number, number, number], color: number, breakWord: string, fragility: number): ItemDef {
  const [w, h, d] = size;
  return {
    id,
    name,
    portable: true,
    grip: 'palm',
    gripPoint: [0, h * 0.6, 0],
    dish: true,
    fragility,
    durability: 150,
    breakWord,
    build: () => group(mesh(new THREE.BoxGeometry(w, h, d), color, 0, h / 2, 0)),
  };
}

const PLAIN: [number, number, number] = [0xf1deb0, 0xd9a24e, 0x3a2a20];
const CHOCOLATE: [number, number, number] = [0x8a5a3a, 0x4a2a1a, 0x1e1410];
const YOGURT: [number, number, number] = [0xf6ecd0, 0xe2b866, 0x3a2a20];

export const PATISSERIE_ITEMS: ItemDef[] = [
  {
    id: 'moule',
    name: 'moule à gâteau',
    portable: true,
    grip: 'palm',
    gripPoint: [0, 0.02, 0],
    dish: true,
    fragility: 10,
    durability: 200,
    breakWord: 'cabossé',
    build: () => {
      const stain = mesh(new THREE.TorusGeometry(TIN_R * 0.8, 0.006, 6, 24).rotateX(Math.PI / 2), 0x8a6a3a, 0, 0.006, 0);
      stain.name = 'sale';
      return group(...tin(), stain);
    },
  },
  // la vaisselle du four et de l'évier (modèles Tripo du pack `plats`, interior.ts) : se lave, se range
  cookware('plat-four', 'plat à four', [0.31, 0.065, 0.22], 0xc0703a, 'fêlé', 4),
  cookware('passoire', 'passoire', [0.25, 0.11, 0.25], 0xb9bec4, 'cabossé', 10),
  cookware('pierre-pizza', 'pierre à pizza', [0.3, 0.02, 0.3], 0xb8a88a, 'fendu', 3),
  cake('gateau', 'gâteau', PLAIN, 0xffffff),
  cake('gateau-chocolat', 'gâteau au chocolat', CHOCOLATE),
  cake('gateau-yaourt', 'gâteau au yaourt', YOGURT, 0xffffff),
  parts('gateau', 'parts de gâteau', PLAIN),
  parts('gateau-chocolat', 'parts de gâteau au chocolat', CHOCOLATE),
  parts('gateau-yaourt', 'parts de gâteau au yaourt', YOGURT),
];

/** Ce qui va au four et au frigo. */
export const PATISSERIE_OVEN = ['gâteau', 'gâteau au chocolat', 'gâteau au yaourt', 'parts de gâteau', 'parts de gâteau au chocolat', 'parts de gâteau au yaourt'];
/** Le moule et la pierre à pizza se rangent au placard (la passoire et le plat à four sous le plan de travail). */
export const PATISSERIE_CUPBOARD = ['moule à gâteau', 'pierre à pizza'];

export const PATISSERIE_FEMININE = ['passoire', 'pierre à pizza', 'pâte à gâteau', 'parts de gâteau', 'parts de gâteau au chocolat', 'parts de gâteau au yaourt'];
export const PATISSERIE_PLURAL = ['parts de gâteau', 'parts de gâteau au chocolat', 'parts de gâteau au yaourt'];
