/**
 * Recettes : des ingrédients réunis sur la planche à découper ou dans une assiette deviennent un
 * plat (« Préparer », touche R). Pas de geste par recette : on coupe, on cuit, on pose avec les
 * gestes qui existent déjà, et l'assemblage fait le reste. Le carnet des recettes du projet
 * (cuisine/carnet-recettes.md) liste celles qui viendront avec les prochains ingrédients.
 *
 * Un plat se mange comme le sandwich (à la main, ou dans l'assiette avec la fourchette) ; il
 * rassasie autant que ses ingrédients, plus un petit bonus pour la peine.
 */
import * as THREE from 'three';
import { createToonMaterial } from '../toon';
import type { ItemDef } from './catalog';

export interface Recipe {
  /** Id du plat obtenu (fiche dans DISHES). */
  dish: string;
  /** Ingrédients obligatoires (noms des objets). Un ingrédient qui cuit doit être cuit. */
  needs: string[];
  /** Ingrédients en plus, pris s'ils sont là. */
  extras?: string[];
  /** Faim rendue en plus de celle des ingrédients. */
  bonus: number;
  /** Où on le prépare de préférence (s'il faut choisir). */
  on: 'planche' | 'assiette';
  /**
   * Ce qui désigne le plat dans un ordre (forme normalisée, sans accents) : un mot, ou plusieurs
   * séparés d'une espace qui doivent tous y être (« steak frites »).
   */
  words: string[];
}

export const RECIPES: Recipe[] = [
  {
    dish: 'salade-composee',
    needs: ['tranches de tomate', 'rondelles de concombre'],
    extras: ['rondelles de carotte'],
    bonus: 6,
    on: 'planche',
    words: ['salade', 'salades', 'crudites'],
  },
  {
    dish: 'tartine-tomate',
    needs: ['tranches de pain', 'tranches de tomate'],
    bonus: 4,
    on: 'planche',
    words: ['tartine', 'tartines', 'bruschetta'],
  },
  {
    dish: 'sandwich-steak',
    needs: ['tranches de pain', 'steak'],
    extras: ['tranches de tomate', 'rondelles de concombre'],
    bonus: 6,
    on: 'planche',
    words: ['sandwich', 'sandwichs', 'burger', 'hamburger'],
  },
  {
    dish: 'steak-pommes-de-terre',
    needs: ['steak', 'pomme de terre'],
    extras: ['rondelles de carotte'],
    bonus: 8,
    on: 'assiette',
    words: ['steak patates', 'steak frites', 'steak pommes', 'steak pomme', 'steak puree'],
  },
];

export const RECIPE_BY_DISH = new Map(RECIPES.map((r) => [r.dish, r]));

/** Noms des plats au féminin (accord des messages). */
export const DISH_FEMININE = ['salade composée', 'tartine à la tomate'];

const toon = (color: THREE.ColorRepresentation) => createToonMaterial({ color, rimStrength: 0.15 });

function mesh(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, toon(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Un plat : se prend entre les doigts comme les morceaux coupés, se mange en `bites` bouchées. */
function dish(id: string, name: string, food: { hunger: number; bites: number; color: THREE.ColorRepresentation }, build: () => THREE.Object3D): ItemDef {
  return {
    id,
    name,
    portable: true,
    grip: 'pinch',
    gripPoint: [0, 0.015, 0.05],
    mouth: [0, 0.02, -0.05],
    food,
    fragility: 10,
    durability: 15,
    breakWord: 'écrasé',
    build,
  };
}

/** Une rondelle couchée : peau `skin` sur le bord, chair `flesh` dessus. */
function disk(g: THREE.Group, r: number, x: number, y: number, z: number, skin: THREE.ColorRepresentation, flesh: THREE.ColorRepresentation): void {
  g.add(mesh(new THREE.CylinderGeometry(r, r, 0.006, 14), skin, x, y + 0.003, z));
  g.add(mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 0.007, 14), flesh, x, y + 0.0035, z));
}

/** Tranche de pain couchée : croûte et mie. */
function slice(g: THREE.Group, y: number, rot = 0): void {
  const s = new THREE.Group();
  s.add(mesh(new THREE.BoxGeometry(0.085, 0.012, 0.075), 0xb98a4a, 0, 0.006, 0));
  s.add(mesh(new THREE.BoxGeometry(0.075, 0.013, 0.065), 0xf2dca8, 0, 0.0065, 0));
  s.position.y = y;
  s.rotation.y = rot;
  g.add(s);
}

export const DISHES: ItemDef[] = [
  dish('salade-composee', 'salade composée', { hunger: 23, bites: 5, color: 0x7cb342 }, () => {
    // un petit tas de feuilles, les rondelles de légumes dessus
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4, d = i ? 0.035 : 0;
      const leaf = mesh(new THREE.SphereGeometry(0.03, 10, 6), i % 2 ? 0x8bc34a : 0x689f38, Math.cos(a) * d, 0.012, Math.sin(a) * d);
      leaf.scale.set(1.2, 0.45, 0.9);
      leaf.rotation.y = a;
      g.add(leaf);
    }
    disk(g, 0.022, -0.02, 0.022, 0.01, 0xd8352a, 0xf07a5f);
    disk(g, 0.022, 0.025, 0.02, -0.015, 0xd8352a, 0xf07a5f);
    disk(g, 0.017, 0.01, 0.026, 0.03, 0x3f7a35, 0xd9ecb0);
    disk(g, 0.017, -0.035, 0.018, -0.025, 0x3f7a35, 0xd9ecb0);
    return g;
  }),
  dish('tartine-tomate', 'tartine à la tomate', { hunger: 35, bites: 4, color: 0xe5704f }, () => {
    const g = new THREE.Group();
    slice(g, 0);
    disk(g, 0.024, -0.017, 0.013, -0.012, 0xd8352a, 0xf07a5f);
    disk(g, 0.024, 0.019, 0.013, 0.013, 0xd8352a, 0xf07a5f);
    return g;
  }),
  dish('sandwich-steak', 'sandwich au steak', { hunger: 66, bites: 6, color: 0x8a5a3c }, () => {
    // tranche, steak, tranche
    const g = new THREE.Group();
    slice(g, 0);
    g.add(mesh(new THREE.CylinderGeometry(0.038, 0.04, 0.014, 16), 0x7b4a2c, 0, 0.019, 0));
    disk(g, 0.026, 0.012, 0.026, 0.008, 0xd8352a, 0xf07a5f);
    slice(g, 0.033, 0.12);
    return g;
  }),
  dish('steak-pommes-de-terre', 'steak et pommes de terre', { hunger: 68, bites: 6, color: 0xc89a5a }, () => {
    const g = new THREE.Group();
    const steak = mesh(new THREE.CylinderGeometry(0.04, 0.042, 0.016, 16), 0x7b4a2c, -0.025, 0.008, 0);
    steak.scale.set(1.25, 1, 0.9);
    g.add(steak);
    // pommes de terre en morceaux, à côté
    for (const [x, z] of [[0.035, -0.02], [0.045, 0.015], [0.02, 0.03]]) {
      const p = mesh(new THREE.SphereGeometry(0.016, 10, 8), 0xe6cf8a, x, 0.012, z);
      p.scale.set(1.2, 0.8, 1);
      g.add(p);
    }
    return g;
  }),
];
