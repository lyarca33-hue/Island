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
    dish: 'salade-verte',
    needs: ['feuilles de salade'],
    extras: ['tranches de tomate', 'rondelles de concombre', 'rondelles de carotte'],
    bonus: 4,
    on: 'planche',
    words: ['salade verte', 'laitue'],
  },
  {
    dish: 'salade-fruits',
    needs: ['rondelles de banane', "quartiers d'orange"],
    extras: ['fraises', 'quartiers de pomme'],
    bonus: 6,
    on: 'assiette',
    words: ['salade de fruits', 'salade fruits', 'dessert'],
  },
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
    dish: 'sandwich-jambon',
    needs: ['tranches de pain', 'jambon'],
    extras: ['feuilles de salade', 'tranches de tomate'],
    bonus: 5,
    on: 'planche',
    words: ['sandwich jambon', 'jambon beurre', 'croque'],
  },
  {
    dish: 'hot-dog',
    needs: ['tranches de pain', 'saucisses'],
    bonus: 5,
    on: 'planche',
    words: ['hot dog', 'hotdog', 'hot dogs', 'hotdogs'],
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
    words: ['steak patates', 'steak pommes', 'steak pomme', 'steak puree'],
  },
  {
    dish: 'steak-frites',
    needs: ['steak', 'frites'],
    extras: ['feuilles de salade'],
    bonus: 8,
    on: 'assiette',
    words: ['steak frites', 'steak frite'],
  },
  {
    dish: 'poisson-citron',
    needs: ['poisson', 'rondelles de citron'],
    extras: ['pomme de terre', 'feuilles de salade'],
    bonus: 7,
    on: 'assiette',
    words: ['poisson citron', 'poisson au citron'],
  },
  {
    dish: 'yaourt-fraises',
    needs: ['yaourt', 'fraises'],
    bonus: 4,
    on: 'assiette',
    words: ['yaourt fraises', 'yaourt fraise'],
  },
  {
    dish: 'poulet-frites',
    needs: ['poulet', 'frites'],
    bonus: 8,
    on: 'assiette',
    words: ['poulet frites', 'poulet'],
  },
  {
    dish: 'poelee-legumes',
    needs: ['courgette', 'poivron'],
    extras: ['champignons', 'oignon'],
    bonus: 8,
    on: 'assiette',
    words: ['poelee', 'legumes sautes', 'poelee de legumes'],
  },
];

export const RECIPE_BY_DISH = new Map(RECIPES.map((r) => [r.dish, r]));

/** Noms des plats au féminin (accord des messages). */
export const DISH_FEMININE = ['salade composée', 'tartine à la tomate', 'salade verte', 'salade de fruits', 'poêlée de légumes'];

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

/** Petit tas de feuilles de salade (vertes, plus ou moins foncées). */
function leaves(g: THREE.Group, n: number, r: number): void {
  for (let i = 0; i < n; i++) {
    const a = i * 2.4, d = i ? r : 0;
    const leaf = mesh(new THREE.SphereGeometry(0.03, 10, 6), i % 2 ? 0x8bc34a : 0x689f38, Math.cos(a) * d, 0.012, Math.sin(a) * d);
    leaf.scale.set(1.2, 0.45, 0.9);
    leaf.rotation.y = a;
    g.add(leaf);
  }
}

export const DISHES: ItemDef[] = [
  dish('salade-verte', 'salade verte', { hunger: 9, bites: 3, color: 0x8bc34a }, () => {
    const g = new THREE.Group();
    leaves(g, 8, 0.035);
    return g;
  }),
  dish('salade-fruits', 'salade de fruits', { hunger: 28, bites: 5, color: 0xf5a623 }, () => {
    // rondelles de banane, quartiers d'orange et fraises mêlés
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4, d = Math.sqrt(i / 9) * 0.045;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const color = [0xf6eec8, 0xf5a623, 0xd8352a][i % 3];
      const bit = i % 3 === 2 ? mesh(new THREE.ConeGeometry(0.012, 0.022, 8).rotateX(Math.PI), color, x, 0.016, z) : mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 10), color, x, 0.006 + (i % 2) * 0.006, z);
      g.add(bit);
    }
    return g;
  }),
  dish('sandwich-jambon', 'sandwich au jambon', { hunger: 45, bites: 5, color: 0xe8a0a0 }, () => {
    const g = new THREE.Group();
    slice(g, 0);
    g.add(mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.006, 18), 0xe8a0a0, 0, 0.015, 0));
    leaves(g, 3, 0.02);
    g.children.slice(-3).forEach((l) => (l.position.y = 0.021));
    slice(g, 0.026, 0.1);
    return g;
  }),
  dish('hot-dog', 'hot-dog', { hunger: 60, bites: 5, color: 0x8a4a2a }, () => {
    const g = new THREE.Group();
    slice(g, 0);
    g.add(mesh(new THREE.CapsuleGeometry(0.013, 0.09, 4, 10).rotateZ(Math.PI / 2), 0x8a4a2a, 0, 0.026, 0));
    // un trait de ketchup
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.004, 0.006), 0xc0302a, 0, 0.04, 0));
    return g;
  }),
  dish('poulet-frites', 'poulet frites', { hunger: 78, bites: 6, color: 0xc8803a }, () => {
    const g = new THREE.Group();
    const leg = mesh(new THREE.SphereGeometry(0.04, 12, 8), 0xc8803a, -0.03, 0.016, 0);
    leg.scale.set(1.3, 0.5, 0.9);
    g.add(leg);
    // un tas de frites
    for (let i = 0; i < 8; i++) {
      const f = mesh(new THREE.BoxGeometry(0.06, 0.008, 0.008), 0xe6c060, 0.04, 0.006 + (i % 3) * 0.007, -0.03 + i * 0.008);
      f.rotation.y = (i % 2 ? 0.4 : -0.3) + i * 0.1;
      g.add(f);
    }
    return g;
  }),
  dish('steak-frites', 'steak frites', { hunger: 70, bites: 6, color: 0x8a5a3c }, () => {
    const g = new THREE.Group();
    const steak = mesh(new THREE.CylinderGeometry(0.04, 0.042, 0.016, 16), 0x7b4a2c, -0.03, 0.008, 0);
    steak.scale.set(1.25, 1, 0.9);
    g.add(steak);
    // un tas de frites à côté
    for (let i = 0; i < 9; i++) {
      const f = mesh(new THREE.BoxGeometry(0.06, 0.008, 0.008), 0xe6c060, 0.04, 0.006 + (i % 3) * 0.007, -0.035 + i * 0.008);
      f.rotation.y = (i % 2 ? 0.4 : -0.3) + i * 0.1;
      g.add(f);
    }
    return g;
  }),
  dish('poisson-citron', 'poisson au citron', { hunger: 42, bites: 5, color: 0xf0dcc0 }, () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.12, 0.016, 0.055), 0xf0dcc0, -0.01, 0.008, 0));
    disk(g, 0.02, 0.0, 0.016, 0.0, 0xf2df3a, 0xf8f0a8);
    disk(g, 0.02, 0.045, 0.002, 0.03, 0xf2df3a, 0xf8f0a8);
    return g;
  }),
  dish('yaourt-fraises', 'yaourt aux fraises', { hunger: 24, bites: 4, color: 0xf2c4c8 }, () => {
    // une coupelle de yaourt, des fraises dessus
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.03, 18), 0xf6f3ec, 0, 0.015, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.004, 18), 0xf2c4c8, 0, 0.03, 0));
    for (let i = 0; i < 4; i++) {
      const a = i * (Math.PI / 2) + 0.4;
      g.add(mesh(new THREE.ConeGeometry(0.01, 0.018, 8).rotateX(Math.PI), 0xd8352a, Math.cos(a) * 0.018, 0.04, Math.sin(a) * 0.018));
    }
    return g;
  }),
  dish('poelee-legumes', 'poêlée de légumes', { hunger: 24, bites: 4, color: 0x7a9a3a }, () => {
    const g = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const a = i * 2.4, d = Math.sqrt(i / 12) * 0.05;
      const color = [0x7a9a3a, 0xa83a2a, 0x9a7a5a, 0xb07a3a][i % 4];
      const bit = mesh(new THREE.BoxGeometry(0.018, 0.01, 0.014), color, Math.cos(a) * d, 0.006 + (i % 2) * 0.006, Math.sin(a) * d);
      bit.rotation.y = a;
      g.add(bit);
    }
    return g;
  }),
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
  dish('steak-pommes-de-terre', 'steak aux pommes de terre', { hunger: 68, bites: 6, color: 0xc89a5a }, () => {
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
