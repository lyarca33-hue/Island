/**
 * La lessive : le panier à linge de la salle de bain, la machine à laver et le sèche-linge (côte
 * à côte au fond de la salle de bain, à côté du lavabo), l'étendoir pliant (dehors au départ, à côté de la
 * maison), et le linge qu'on porte de l'un à l'autre : un tas de linge mouillé, une pile de linge
 * propre plié. Mêmes fiches que le reste du catalogue (catalog.ts) ; ce qu'on en fait est joué par
 * buanderie.ts.
 *
 * Tous sont posés au sol, l'avant vers +Z, le dos contre le mur (-Z).
 *
 * Pièces nommées que buanderie.ts anime :
 * - panier : `linge` (le tas, qui monte avec le linge sale), `deborde` (ce qui dépasse, panier plein) ;
 * - machines : `hublot` (la porte ronde, charnière à gauche), `tambour` (le linge dedans, qui
 *   tourne), `eau` (l'eau du lavage), `voyant` (vert en marche) ;
 * - étendoir : `linge` (les vêtements étendus, plus foncés mouillés).
 */
import * as THREE from 'three';
import { createToonMaterial } from '../toon';
import type { ItemDef } from './catalog';

const toon = (color: THREE.ColorRepresentation) => createToonMaterial({ color, rimStrength: 0.15 });

function mesh(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation | THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, color instanceof THREE.Material ? color : toon(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const box = (w: number, h: number, d: number, color: THREE.ColorRepresentation | THREE.Material, x: number, y: number, z: number) => mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z);

function group(...parts: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.add(...parts);
  return g;
}

/** Les couleurs des vêtements de la maison (linge sale, lavé, étendu). */
export const CLOTHES_COLORS = [0xb04a3c, 0x4b6a8f, 0xe0b23a, 0xf4f1ea, 0x6d9a3e, 0xd98aa6];

/** Panier à linge : rayon du haut, du bas, hauteur. */
const BASKET_R = 0.2;
const BASKET_R0 = 0.17;
const BASKET_H = 0.5;
/** Machines : largeur, profondeur, hauteur ; centre et rayon du hublot. */
const MACHINE_W = 0.6;
const MACHINE_D = 0.58;
const MACHINE_H = 0.85;
const PORT_Y = 0.42;
const PORT_R = 0.17;
/** Étendoir : longueur, largeur ouvert, hauteur des fils. */
const RACK_L = 1.1;
const RACK_W = 0.56;
const RACK_H = 0.95;

/** Un vêtement roulé en boule (tas de linge). */
function wad(color: THREE.ColorRepresentation, r: number, x: number, y: number, z: number, flat = 0.55): THREE.Mesh {
  const m = mesh(new THREE.SphereGeometry(r, 10, 7).scale(1.2, flat, 1), color, x, y, z);
  m.rotation.y = x * 7 + z * 3;
  return m;
}

/** Le panier à linge en osier ; le tas de linge sale monte avec ce qu'on y jette. */
function basketModel(): THREE.Group {
  // paroi ouverte en haut : on voit l'intérieur
  const wicker = toon(0xc7a26b);
  wicker.side = THREE.DoubleSide;
  const g = group(mesh(new THREE.CylinderGeometry(BASKET_R, BASKET_R0, BASKET_H, 18, 1, true), wicker, 0, BASKET_H / 2, 0));
  g.add(mesh(new THREE.CylinderGeometry(BASKET_R0, BASKET_R0, 0.02, 18), 0xa9844e, 0, 0.01, 0));
  // tresse : quelques cercles plus foncés
  for (const y of [0.12, 0.25, 0.38]) g.add(mesh(new THREE.TorusGeometry(BASKET_R0 + (BASKET_R - BASKET_R0) * (y / BASKET_H) + 0.003, 0.008, 5, 18).rotateX(Math.PI / 2), 0xa9844e, 0, y, 0));
  g.add(mesh(new THREE.TorusGeometry(BASKET_R, 0.02, 6, 18).rotateX(Math.PI / 2), 0xa9844e, 0, BASKET_H, 0));
  // anses de chaque côté
  for (const s of [-1, 1]) {
    const handle = mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 10, Math.PI), 0xa9844e, s * (BASKET_R + 0.005), BASKET_H - 0.06, 0);
    handle.rotation.y = Math.PI / 2;
    g.add(handle);
  }
  // le tas : posé au fond, monté par buanderie.ts (échelle en y)
  const pile = new THREE.Group();
  pile.name = 'linge';
  for (let i = 0; i < 6; i++) {
    const a = i * 2.1;
    pile.add(wad(CLOTHES_COLORS[i], 0.085, Math.cos(a) * 0.07, 0.06 + (i % 3) * 0.12, Math.sin(a) * 0.07));
  }
  pile.visible = false;
  g.add(pile);
  // panier plein : des vêtements dépassent et pendent par-dessus le bord
  const over = new THREE.Group();
  over.name = 'deborde';
  over.add(
    wad(CLOTHES_COLORS[0], 0.1, 0.03, BASKET_H + 0.04, -0.02),
    wad(CLOTHES_COLORS[3], 0.09, -0.07, BASKET_H + 0.07, 0.05),
    box(0.1, 0.18, 0.012, CLOTHES_COLORS[1], 0.04, BASKET_H - 0.06, BASKET_R + 0.01),
  );
  over.visible = false;
  g.add(over);
  return g;
}

/**
 * Machine à hublot (machine à laver ou sèche-linge) : caisse blanche, bandeau de commande en haut,
 * hublot à charnière à gauche, tambour où l'on voit le linge tourner.
 */
function machineModel(panel: THREE.ColorRepresentation, ring: THREE.ColorRepresentation, dryer: boolean): THREE.Group {
  const w = MACHINE_W, d = MACHINE_D, h = MACHINE_H;
  const white = 0xf3f4f2;
  const g = group(
    // caisse : côtés, dessus, socle et façade autour du hublot
    box(w, h - 0.06, d - 0.02, white, 0, 0.06 + (h - 0.06) / 2, -0.01),
    box(w - 0.02, 0.06, d - 0.04, 0xbfc4c8, 0, 0.03, -0.01),
    box(w + 0.005, 0.02, d, 0xe6e8e6, 0, h - 0.01, 0),
    // bandeau : tiroir à lessive (ou bac à eau), écran, programmateur
    box(w - 0.02, 0.11, 0.012, panel, 0, h - 0.08, d / 2 - 0.006),
    box(0.17, 0.07, 0.008, 0xdfe2e4, -w / 2 + 0.11, h - 0.08, d / 2 + 0.003),
    box(0.12, 0.035, 0.006, 0x1d2a22, 0.03, h - 0.08, d / 2 + 0.003),
  );
  const knob = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 16).rotateX(Math.PI / 2), 0xd9dcdf, w / 2 - 0.09, h - 0.08, d / 2 + 0.01);
  g.add(knob, box(0.005, 0.02, 0.004, 0x50565c, w / 2 - 0.09, h - 0.07, d / 2 + 0.024));
  // voyant : vert en marche
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0x48524c }));
  led.name = 'voyant';
  led.position.set(0.12, h - 0.08, d / 2 + 0.004);
  g.add(led);
  // le creux du tambour, sombre, derrière le hublot
  const z = d / 2;
  g.add(mesh(new THREE.CylinderGeometry(PORT_R - 0.01, PORT_R - 0.01, 0.02, 24).rotateX(Math.PI / 2), 0x5b6066, 0, PORT_Y, z - 0.02));
  // le linge dans le tambour (caché vide) ; tourne autour de l'axe du hublot
  const drum = new THREE.Group();
  drum.name = 'tambour';
  drum.position.set(0, PORT_Y, z - 0.01);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    drum.add(wad(CLOTHES_COLORS[i], 0.055, Math.cos(a) * 0.08, Math.sin(a) * 0.08 - 0.03, 0, 0.7));
  }
  drum.visible = false;
  g.add(drum);
  if (!dryer) {
    // l'eau qui monte au fond du tambour pendant le lavage
    const water = new THREE.Mesh(new THREE.CircleGeometry(PORT_R - 0.02, 20, Math.PI * 1.15, Math.PI * 0.7), new THREE.MeshBasicMaterial({ color: 0x8fc6e3, transparent: true, opacity: 0.55, depthWrite: false }));
    water.name = 'eau';
    water.position.set(0, PORT_Y, z + 0.004);
    water.visible = false;
    g.add(water);
  }
  // le hublot : anneau, vitre, poignée ; charnière à gauche (on le fait tourner autour de y)
  const port = new THREE.Group();
  port.name = 'hublot';
  port.position.set(-PORT_R - 0.02, PORT_Y, z + 0.005);
  const ringMesh = mesh(new THREE.TorusGeometry(PORT_R, 0.028, 8, 28), ring, PORT_R + 0.02, 0, 0.012);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(PORT_R - 0.01, 24), new THREE.MeshBasicMaterial({ color: dryer ? 0x9aa4ad : 0xbfe0ee, transparent: true, opacity: 0.28, depthWrite: false }));
  glass.position.set(PORT_R + 0.02, 0, 0.012);
  port.add(ringMesh, glass, box(0.03, 0.07, 0.025, ring, 2 * PORT_R + 0.04, 0, 0.02));
  g.add(port);
  if (dryer) {
    // grille d'aération en bas de la façade
    for (let i = 0; i < 5; i++) g.add(box(0.36, 0.008, 0.004, 0xc9cdd0, 0, 0.1 + i * 0.022, d / 2 + 0.002));
  }
  return g;
}

/** L'étendoir pliant : deux pieds en X de chaque côté, les fils tendus entre deux barres. */
function rackModel(): THREE.Group {
  const metal = 0xdfe3e6, dark = 0x9aa3aa;
  const g = new THREE.Group();
  const leg = (x: number, s: number) => {
    const l = mesh(new THREE.CylinderGeometry(0.012, 0.012, Math.hypot(RACK_H, RACK_W * 0.8), 8), metal, x, RACK_H / 2, 0);
    l.rotation.x = s * Math.atan2(RACK_W * 0.8, RACK_H);
    return l;
  };
  for (const x of [-RACK_L / 2, RACK_L / 2]) g.add(leg(x, 1), leg(x, -1), mesh(new THREE.SphereGeometry(0.02, 8, 6), dark, x, RACK_H / 2, 0));
  // le cadre du dessus : deux longues barres, deux traverses, et les fils entre elles
  for (const z of [-RACK_W / 2, RACK_W / 2]) {
    const bar = mesh(new THREE.CylinderGeometry(0.013, 0.013, RACK_L + 0.06, 8), metal, 0, RACK_H, z);
    bar.rotation.z = Math.PI / 2;
    g.add(bar);
  }
  for (const x of [-RACK_L / 2, RACK_L / 2]) g.add(box(0.025, 0.025, RACK_W, metal, x, RACK_H, 0));
  const wires = 7;
  for (let i = 0; i < wires; i++) {
    const x = -RACK_L / 2 + 0.08 + (i * (RACK_L - 0.16)) / (wires - 1);
    g.add(box(0.006, 0.006, RACK_W, 0xf6f7f8, x, RACK_H + 0.008, 0));
  }
  // les vêtements étendus : pendent à cheval sur les fils (cachés sans linge)
  const laundry = new THREE.Group();
  laundry.name = 'linge';
  const sizes: Array<[number, number]> = [[0.34, 0.5], [0.22, 0.32], [0.3, 0.44], [0.16, 0.26], [0.36, 0.4], [0.2, 0.3]];
  sizes.forEach(([wd, ht], i) => {
    const x = -RACK_L / 2 + 0.08 + (i * (RACK_L - 0.16)) / (wires - 1) + 0.09;
    const c = CLOTHES_COLORS[i];
    // un pan de chaque côté du fil
    laundry.add(box(0.012, ht / 2, wd, c, x - 0.012, RACK_H - ht / 4, 0), box(0.012, ht / 2, wd, c, x + 0.012, RACK_H - ht / 4, 0));
  });
  laundry.visible = false;
  g.add(laundry);
  return g;
}

/** Un tas de linge mouillé, lourd et foncé, qu'on porte contre soi. */
function wetPileModel(): THREE.Group {
  const g = new THREE.Group();
  const dark = (c: number) => new THREE.Color(c).multiplyScalar(0.72);
  g.add(
    wad(dark(CLOTHES_COLORS[0]), 0.1, -0.05, 0.05, 0),
    wad(dark(CLOTHES_COLORS[1]), 0.1, 0.06, 0.05, 0.03),
    wad(dark(CLOTHES_COLORS[3]), 0.09, 0.0, 0.1, -0.04),
    wad(dark(CLOTHES_COLORS[2]), 0.08, 0.02, 0.14, 0.04),
  );
  return g;
}

/** Une pile de linge propre plié. */
function cleanPileModel(): THREE.Group {
  const g = new THREE.Group();
  [CLOTHES_COLORS[3], CLOTHES_COLORS[1], CLOTHES_COLORS[5], CLOTHES_COLORS[2]].forEach((c, i) => {
    g.add(box(0.28 - i * 0.01, 0.045, 0.22 - i * 0.008, c, (i % 2) * 0.008, 0.0225 + i * 0.046, 0));
  });
  return g;
}

/** Noms au féminin (accord des messages). */
export const LINGE_FEMININE = ['machine à laver'];

export const LINGE_ITEMS: ItemDef[] = [
  {
    id: 'panier-linge',
    name: 'panier à linge',
    portable: true,
    grip: 'twoHands',
    gripPoint: [0, BASKET_H * 0.7, 0],
    fragility: 9,
    durability: 300,
    breakWord: 'défoncé',
    build: basketModel,
  },
  {
    id: 'machine-a-laver',
    name: 'machine à laver',
    portable: false,
    durability: 400,
    fragility: 8,
    build: () => machineModel(0xe6e8e6, 0xc8ced4, false),
  },
  {
    id: 'seche-linge',
    name: 'sèche-linge',
    portable: false,
    durability: 400,
    fragility: 8,
    build: () => machineModel(0xd4d9dd, 0x7e8790, true),
  },
  {
    id: 'etendoir',
    name: 'étendoir',
    portable: false,
    // on le pousse dehors au soleil, ou dedans quand il pleut
    movable: true,
    durability: 300,
    fragility: 9,
    build: rackModel,
  },
  {
    id: 'linge-mouille',
    name: 'linge mouillé',
    portable: true,
    grip: 'chest',
    fragility: 10,
    durability: 500,
    build: wetPileModel,
  },
  {
    id: 'linge-propre',
    name: 'linge propre',
    portable: true,
    grip: 'chest',
    fragility: 10,
    durability: 500,
    build: cleanPileModel,
  },
];
