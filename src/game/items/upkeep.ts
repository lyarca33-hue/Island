/**
 * Meubles et entretien de la cuisine (lot « meubles et entretien ») : la barre aimantée à
 * couteaux et les crochets à torchon et maniques (au mur), l'horloge qui donne l'heure du jeu, la
 * fenêtre au-dessus de l'évier qui s'ouvre, l'îlot et ses tabourets ; le balai, la serpillière
 * dans son seau, les sacs poubelle et le conteneur dehors, le spray nettoyant, les gants de
 * ménage et le savon de l'évier.
 *
 * Les règles (balayer, passer la serpillière, nettoyer, sortir la poubelle, gants, mains sales)
 * sont dans Game.
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

const box = (w: number, h: number, d: number, color: THREE.ColorRepresentation, x = 0, y = h / 2, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z);
const cyl = (r: number, h: number, color: THREE.ColorRepresentation, y = h / 2, x = 0, z = 0, n = 16) => mesh(new THREE.CylinderGeometry(r, r, h, n), color, x, y, z);

/** Hauteur du plan de travail (le dessus des meubles bas). */
const COUNTER_H = 0.9;
/** Barre à couteaux : hauteur au-dessus du plan de travail, longueur. */
const BAR_Y = 0.42;
const BAR_W = 0.44;
/** Crochets : hauteur de la tringle au-dessus du four, écart entre les crochets. */
const HOOK_Y = 0.62;
const HOOK_GAP = 0.15;
/** Îlot : caisson, plateau (qui déborde côté tabourets, +Z), hauteur d'assise des tabourets. */
const ISLAND_W = 1.2;
const ISLAND_D = 0.6;
const TOP_W = 1.28;
const TOP_D = 0.84;
const TOP_Z = 0.1;
export const STOOL_H = 0.66;
/** Fenêtre au-dessus de l'évier : battant (hors cadre du mur). */
const SASH_W = 0.9;
const SASH_H = 0.7;

/** Rouleau de sacs poubelle neuf : nombre de sacs. */
export const BAGS_PER_ROLL = 10;

/** Ce qui se range au placard en plus (sous l'évier, en vrai) : les sacs, le spray, les gants, le chiffon et le plumeau. */
export const UPKEEP_CUPBOARD = ['sacs poubelle', 'spray nettoyant', 'gants de ménage', 'chiffon', 'plumeau'];
/** Noms au féminin, au pluriel (accord des messages). */
export const UPKEEP_FEMININE = ['barre à couteaux', 'horloge', 'fenêtre', 'maniques', 'serpillière', 'brosse WC'];
export const UPKEEP_PLURAL = ['crochets', 'maniques', 'sacs poubelle', 'gants de ménage'];
/** Stock voulu (liste de courses) : un rouleau de sacs, un spray. */
export const UPKEEP_STOCK: Record<string, number> = { 'sacs poubelle': 1, 'spray nettoyant': 1 };

/** Manche à balai (le long de +Y, base au sol), tenu en haut. */
function stick(len: number, color: THREE.ColorRepresentation): THREE.Mesh {
  return cyl(0.012, len, color, len / 2 + 0.04, 0, 0, 10);
}

export const UPKEEP_ITEMS: ItemDef[] = [
  // ——— au mur ———
  {
    id: 'barre-couteaux',
    name: 'barre à couteaux',
    portable: false,
    movable: false,
    durability: 300,
    fragility: 10,
    holds: ['couteau'],
    // les couteaux pendent, lame en bas, le plat contre la barre aimantée
    slots: [-0.13, 0, 0.13].map((x): [number, number, number] => [x, BAR_Y + 0.135, 0.02]),
    slotTilt: [Math.PI, Math.PI / 2, 0],
    build: () => group(
      box(BAR_W, 0.035, 0.018, 0x2e3135, 0, BAR_Y - 0.0175, 0),
      box(BAR_W - 0.02, 0.012, 0.004, 0x8a9096, 0, BAR_Y - 0.0175, 0.01),
      box(0.03, 0.03, 0.02, 0x2e3135, -BAR_W / 2 + 0.03, BAR_Y - 0.0175, -0.012),
      box(0.03, 0.03, 0.02, 0x2e3135, BAR_W / 2 - 0.03, BAR_Y - 0.0175, -0.012),
    ),
  },
  {
    id: 'crochets',
    name: 'crochets',
    portable: false,
    movable: false,
    durability: 300,
    fragility: 10,
    holds: ['torchon', 'maniques'],
    // torchon et maniques pendent à plat contre le mur, le haut au crochet
    slots: [-HOOK_GAP, 0, HOOK_GAP].map((x): [number, number, number] => [x, HOOK_Y - 0.075, 0.035]),
    slotTilt: [Math.PI / 2, 0, 0],
    build: () => {
      const g = group(box(HOOK_GAP * 2 + 0.12, 0.03, 0.015, 0x7a5232, 0, HOOK_Y, 0));
      for (const x of [-HOOK_GAP, 0, HOOK_GAP]) {
        g.add(box(0.012, 0.012, 0.04, 0xb9bec4, x, HOOK_Y - 0.01, 0.025));
        g.add(box(0.012, 0.025, 0.012, 0xb9bec4, x, HOOK_Y + 0.005, 0.045));
      }
      return g;
    },
  },
  {
    id: 'maniques',
    name: 'maniques',
    portable: true,
    grip: 'loose',
    gripPoint: [0, 0.012, -0.08],
    fragility: 10,
    durability: 120,
    breakWord: 'déchiré',
    // une paire posée à plat, matelassée, l'une sur l'autre
    build: () => group(
      box(0.15, 0.014, 0.21, 0xb33a3a, 0, 0.007, 0),
      box(0.05, 0.014, 0.08, 0xb33a3a, 0.085, 0.007, 0.03),
      box(0.15, 0.014, 0.21, 0xd9cfbf, 0.008, 0.021, -0.006),
      box(0.12, 0.002, 0.004, 0x8a2a2a, 0, 0.0145, -0.04),
      box(0.12, 0.002, 0.004, 0x8a2a2a, 0, 0.0145, 0.04),
    ),
  },
  {
    id: 'horloge',
    name: 'horloge',
    portable: false,
    movable: false,
    durability: 200,
    fragility: 4,
    clock: true,
    // le cadran face à +Z, accroché au mur par son dos ; la base du cercle à y = 0
    build: () => {
      const r = 0.17;
      const g = group(
        mesh(new THREE.CylinderGeometry(r, r, 0.03, 32).rotateX(Math.PI / 2), 0xfbf8f0, 0, r, 0.015),
        mesh(new THREE.TorusGeometry(r, 0.015, 8, 32), 0x5d4129, 0, r, 0.02),
      );
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const tick = box(0.012, i % 3 ? 0.02 : 0.035, 0.004, 0x333333, Math.sin(a) * 0.135, r + Math.cos(a) * 0.135, 0.032);
        tick.rotation.z = -a;
        tick.castShadow = false;
        g.add(tick);
      }
      const hand = (name: string, len: number, w: number) => {
        const pivot = new THREE.Group();
        pivot.name = name;
        pivot.position.set(0, r, 0.036);
        const m = box(w, len, 0.004, 0x222222, 0, len / 2 - 0.02, 0);
        m.castShadow = false;
        pivot.add(m);
        g.add(pivot);
      };
      hand('aiguille-heures', 0.09, 0.016);
      hand('aiguille-minutes', 0.13, 0.01);
      return g;
    },
  },
  {
    id: 'fenetre',
    name: 'fenêtre',
    portable: false,
    movable: false,
    durability: 300,
    fragility: 8,
    // le battant s'ouvre vers la pièce, charnière à gauche
    door: -THREE.MathUtils.degToRad(95),
    window: true,
    build: () => {
      const frame = 0xf6f3ec, f = 0.045;
      const leaf = new THREE.Group();
      leaf.name = 'porte';
      leaf.position.set(-SASH_W / 2, 0, 0);
      const bars = [
        box(f, SASH_H, 0.04, frame, f / 2, 0, 0),
        box(f, SASH_H, 0.04, frame, SASH_W - f / 2, 0, 0),
        box(SASH_W, f, 0.04, frame, SASH_W / 2, 0, 0),
        box(SASH_W, f, 0.04, frame, SASH_W / 2, SASH_H - f, 0),
        box(0.03, SASH_H, 0.03, frame, SASH_W / 2, 0, 0),
        box(SASH_W, 0.03, 0.03, frame, SASH_W / 2, SASH_H / 2 - 0.015, 0),
      ];
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(SASH_W - 2 * f, SASH_H - 2 * f, 0.006),
        new THREE.MeshBasicMaterial({ color: 0xcfe6f0, transparent: true, opacity: 0.18, depthWrite: false }),
      );
      glass.position.set(SASH_W / 2, SASH_H / 2, 0);
      glass.name = 'vitre';
      // la poignée, côté ouverture
      const knob = box(0.02, 0.09, 0.03, 0xb9bec4, SASH_W - 0.06, SASH_H / 2 - 0.045, 0.03);
      leaf.add(...bars, glass, knob);
      // le battant ne fait pas d'ombre : la lumière du dehors passe par l'ouverture
      leaf.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = false; });
      return group(leaf);
    },
  },
  // ——— l'îlot et ses tabourets ———
  {
    id: 'ilot',
    name: 'îlot',
    portable: false,
    movable: true,
    durability: 350,
    fragility: 9,
    table: 'comptoir',
    build: () => {
      const wood = 0x7a5232, top = 0xd9d3c5;
      const g = group(
        box(ISLAND_W, COUNTER_H - 0.04, ISLAND_D, wood, 0, (COUNTER_H - 0.04) / 2, 0),
        box(TOP_W, 0.04, TOP_D, top, 0, COUNTER_H - 0.02, TOP_Z),
        // portes du caisson côté cuisine (-Z), plinthe
        box(ISLAND_W - 0.04, 0.7, 0.01, 0x8a6440, 0, 0.45, -ISLAND_D / 2 - 0.004),
        box(ISLAND_W - 0.02, 0.07, 0.01, 0x5d4129, 0, 0.035, ISLAND_D / 2 + 0.004),
      );
      for (const x of [-0.3, 0.3]) g.add(box(0.12, 0.015, 0.02, 0xb9bec4, x, 0.72, -ISLAND_D / 2 - 0.015));
      return g;
    },
  },
  {
    id: 'tabouret',
    name: 'tabouret',
    portable: true,
    grip: 'twoHands',
    gripPoint: [0, STOOL_H - 0.05, 0],
    fragility: 7,
    durability: 140,
    seat: STOOL_H,
    build: () => {
      const g = group(cyl(0.17, 0.04, 0x8a5a34, STOOL_H - 0.02, 0, 0, 20));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const leg = box(0.03, STOOL_H - 0.04, 0.03, 0x2e3135, Math.cos(a) * 0.12, (STOOL_H - 0.04) / 2, Math.sin(a) * 0.12);
        g.add(leg);
      }
      // repose-pieds
      g.add(mesh(new THREE.TorusGeometry(0.12, 0.008, 6, 20).rotateX(Math.PI / 2), 0x2e3135, 0, 0.25, 0));
      return g;
    },
  },
  // ——— ménage ———
  {
    id: 'balai',
    name: 'balai',
    portable: true,
    grip: 'pole',
    gripPoint: [0, 0.82, 0],
    fragility: 9,
    durability: 150,
    sweeps: true,
    // brosse au sol, manche vers le haut ; la pelle accrochée au manche
    build: () => group(
      box(0.28, 0.035, 0.06, 0x3a3a3a, 0, 0.0175, 0),
      box(0.3, 0.025, 0.07, 0xc23b2b, 0, 0.045, 0),
      stick(1.0, 0xc23b2b),
      box(0.2, 0.012, 0.16, 0x2f6fae, 0, 0.62, 0.035),
      box(0.03, 0.08, 0.02, 0x2f6fae, 0, 0.66, 0.0),
    ),
  },
  {
    id: 'serpilliere',
    name: 'serpillière',
    portable: true,
    grip: 'pole',
    gripPoint: [0, 0.82, 0],
    fragility: 10,
    durability: 120,
    mops: true,
    build: () => {
      const g = group(stick(1.0, 0x9aa3ab), cyl(0.04, 0.05, 0x4a4d52, 0.06));
      // franges de la serpillière
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const s = box(0.018, 0.07, 0.018, 0xe8e2d0, Math.cos(a) * 0.04, 0.035, Math.sin(a) * 0.04);
        s.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
        g.add(s);
      }
      return g;
    },
  },
  {
    id: 'seau',
    name: 'seau',
    portable: true,
    grip: 'side',
    gripPoint: [0, 0.3, 0],
    fragility: 9,
    durability: 140,
    holds: ['serpillière'],
    slots: [[0, 0.02, 0]],
    build: () => {
      // seau plein (fermé), l'intérieur sombre vu d'en haut
      const g = group(mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.28, 20), 0x2f8a6e, 0, 0.14, 0), cyl(0.138, 0.004, 0x1f4f40, 0.281));
      // anse
      g.add(mesh(new THREE.TorusGeometry(0.15, 0.006, 6, 20, Math.PI), 0x9aa3ab, 0, 0.28, 0));
      return g;
    },
  },
  // formes provisoires en attendant les modèles Tripo de Greg (fil « Prompts Tripo du ménage »)
  {
    id: 'aspirateur',
    name: 'aspirateur',
    portable: true,
    grip: 'pole',
    gripPoint: [0, 1.0, 0],
    fragility: 6,
    durability: 200,
    vacuums: true,
    // aspirateur balai : la brosse large au sol, le bloc moteur et son réservoir sur le manche, la poignée en haut
    build: () => group(
      box(0.3, 0.05, 0.11, 0x3a3d42, 0, 0.025, 0.01),
      box(0.26, 0.012, 0.02, 0xc23b2b, 0, 0.012, 0.065),
      cyl(0.018, 0.08, 0x3a3d42, 0.09),
      stick(0.95, 0x9aa3ab),
      cyl(0.055, 0.24, 0xd9442f, 0.36, 0, -0.035, 16),
      cyl(0.045, 0.13, 0xbfe3f2, 0.3, 0, -0.035, 16),
      box(0.05, 0.12, 0.04, 0x2e3135, 0, 1.0, -0.02),
    ),
  },
  {
    id: 'plumeau',
    name: 'plumeau',
    portable: true,
    grip: 'utensil',
    gripPoint: [0, 0.07, 0],
    fragility: 10,
    durability: 90,
    dusts: true,
    // manche en bois, plumes grises en houppe au bout
    build: () => {
      const g = group(cyl(0.011, 0.3, 0x8a5a33, 0.15, 0, 0, 10));
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const f = mesh(new THREE.ConeGeometry(0.035, 0.18, 6), i % 2 ? 0x8d8a86 : 0xb8b2aa, Math.cos(a) * 0.025, 0.37, Math.sin(a) * 0.025);
        f.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
        g.add(f);
      }
      g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), 0xa29d96, 0, 0.36, 0));
      return g;
    },
  },
  {
    id: 'chiffon',
    name: 'chiffon',
    portable: true,
    grip: 'loose',
    gripPoint: [0.07, 0.006, 0.05],
    // microfibre : essuie les meubles, les vitres et les miroirs (comme l'éponge, sans mouiller)
    wipes: true,
    fragility: 10,
    durability: 80,
    breakWord: 'déchiré',
    build: () => group(box(0.18, 0.01, 0.15, 0x4f9fd8, 0, 0.005, 0), box(0.181, 0.0105, 0.02, 0x3c7fb0, 0, 0.005, 0.06)),
  },
  {
    id: 'brosse-wc',
    name: 'brosse WC',
    portable: true,
    grip: 'fist',
    gripPoint: [0, 0.36, 0],
    fragility: 8,
    durability: 120,
    scrubsBowl: true,
    // la brosse en bas (rangée tête en bas dans son pot), le manche blanc vers le haut
    build: () => group(
      mesh(new THREE.SphereGeometry(0.045, 10, 8), 0x5d6670, 0, 0.05, 0),
      cyl(0.008, 0.36, 0xf3f3f3, 0.24, 0, 0, 8),
      box(0.03, 0.05, 0.02, 0xf3f3f3, 0, 0.42),
    ),
  },
  {
    id: 'sacs-poubelle',
    name: 'sacs poubelle',
    portable: true,
    grip: 'cradle',
    fragility: 10,
    durability: 60,
    // rouleau de sacs noirs
    build: () => group(cyl(0.035, 0.24, 0x1f2124, 0.035, 0, 0, 14).rotateZ(Math.PI / 2)),
  },
  {
    id: 'sac-poubelle',
    name: 'sac poubelle',
    portable: true,
    grip: 'side',
    gripPoint: [0, 0.38, 0],
    fragility: 10,
    durability: 30,
    breakWord: 'déchiré',
    // sac plein, noué en haut
    build: () => {
      const body = mesh(new THREE.SphereGeometry(0.17, 14, 10), 0x1f2124, 0, 0.17, 0);
      body.scale.set(1, 1.1, 0.9);
      return group(body, mesh(new THREE.ConeGeometry(0.05, 0.1, 8), 0x1f2124, 0, 0.38, 0), cyl(0.015, 0.03, 0x1f2124, 0.43));
    },
  },
  {
    id: 'conteneur',
    name: 'conteneur',
    portable: false,
    movable: true,
    durability: 300,
    fragility: 9,
    // couvercle à charnière derrière : il se relève
    door: -THREE.MathUtils.degToRad(100),
    doorAxis: 'x',
    bin: 30,
    outdoor: true,
    build: () => {
      const w = 0.58, d = 0.7, h = 1.0, color = 0x2f5e3c;
      const g = group(
        box(w, h, d, color, 0, h / 2, 0),
        box(w + 0.04, 0.05, 0.06, 0x2a2b2e, 0, 0.9, -d / 2 - 0.03),
        cyl(0.1, 0.05, 0x1f2124, 0.1, -w / 2 + 0.06, -d / 2 + 0.1),
        cyl(0.1, 0.05, 0x1f2124, 0.1, w / 2 - 0.06, -d / 2 + 0.1),
      );
      (g.children[2] as THREE.Mesh).rotation.z = Math.PI / 2;
      (g.children[3] as THREE.Mesh).rotation.z = Math.PI / 2;
      const trash = box(w - 0.04, 1, d - 0.04, 0x1f2124, 0, 0, 0);
      trash.geometry.translate(0, 0.5, 0);
      trash.position.y = 0.04;
      trash.scale.y = 0.001;
      trash.visible = false;
      trash.name = 'dechets';
      g.add(trash);
      const lid = new THREE.Group();
      lid.name = 'porte';
      lid.position.set(0, h, -d / 2);
      lid.add(box(w + 0.03, 0.04, d + 0.03, 0x24492f, 0, 0.02, d / 2));
      g.add(lid);
      return g;
    },
  },
  {
    id: 'spray',
    name: 'spray nettoyant',
    portable: true,
    grip: 'fist',
    gripPoint: [0, 0.1, 0],
    fragility: 7,
    durability: 60,
    spray: true,
    build: () => group(
      cyl(0.035, 0.17, 0x3fa0d8, 0.085, 0, 0, 14),
      box(0.05, 0.022, 0.05, 0x3fa0d8, 0, 0.18),
      box(0.03, 0.045, 0.05, 0xf3f3f3, 0, 0.205, 0.01),
      box(0.012, 0.012, 0.03, 0xf3f3f3, 0, 0.222, 0.045),
      box(0.071, 0.06, 0.004, 0xffffff, 0, 0.08, 0.035),
    ),
  },
  {
    id: 'gants',
    name: 'gants de ménage',
    portable: true,
    grip: 'loose',
    fragility: 10,
    durability: 100,
    breakWord: 'déchiré',
    gloves: true,
    // une paire de gants jaunes posés à plat
    build: () => group(
      box(0.1, 0.012, 0.2, 0xf2c94c, 0, 0.006, 0),
      box(0.03, 0.012, 0.06, 0xf2c94c, 0.06, 0.006, 0.03),
      box(0.1, 0.012, 0.2, 0xe9b93a, 0.012, 0.018, -0.01),
    ),
  },
  {
    id: 'savon',
    name: 'savon',
    portable: true,
    grip: 'cradle',
    fragility: 6,
    durability: 80,
    soap: true,
    // flacon à pompe
    build: () => group(
      cyl(0.03, 0.12, 0xe7a6c4, 0.06, 0, 0, 14),
      cyl(0.008, 0.03, 0xf3f3f3, 0.135),
      box(0.012, 0.01, 0.035, 0xf3f3f3, 0, 0.15, 0.012),
    ),
  },
];
