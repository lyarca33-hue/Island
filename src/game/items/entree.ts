/**
 * L'entrée : banc à chaussures (on s'y assoit pour changer de chaussures), miroir, portemanteau
 * (manteau, écharpe, bonnet qu'on met pour sortir), et dehors la boîte aux lettres. Mêmes fiches
 * que le reste du catalogue (catalog.ts) ; ce qu'on en fait est joué par entree.ts.
 *
 * Tous sont posés au sol ou au mur, l'avant vers +Z.
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

/** Banc à chaussures : largeur, profondeur, hauteur de l'assise, du rayon à chaussures. */
const BENCH_W = 1.0;
const BENCH_D = 0.38;
export const BENCH_SEAT = 0.45;
const SHOE_SHELF = 0.1;
/** Portemanteau : hauteur des patères, écart entre elles. */
const HOOK_Y = 1.72;
const HOOK_GAP = 0.3;
/** Miroir : largeur, hauteur du cadre. */
const MIRROR_W = 0.5;
const MIRROR_H = 0.8;
/** Boîte aux lettres : hauteur du dessous de la boîte (sur son poteau). */
const MAILBOX_Y = 0.95;

/** Une paire de chaussures posée sur le rayon, centrée en (x, y, z) : `boot` pour des bottes. */
function shoes(color: THREE.ColorRepresentation, sole: THREE.ColorRepresentation, x: number, y: number, z: number, boot = false): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const x0 = x + s * 0.055;
    g.add(box(0.085, 0.02, 0.25, sole, x0, y + 0.01, z));
    g.add(box(0.08, 0.06, 0.23, color, x0, y + 0.05, z + 0.005));
    if (boot) g.add(box(0.08, 0.2, 0.09, color, x0, y + 0.18, z - 0.07));
    else g.add(box(0.07, 0.04, 0.09, color, x0, y + 0.09, z - 0.07));
  }
  return g;
}

/** Vêtement qui pend à plat (manteau, écharpe, bonnet) : posé, il est couché ; à la patère, le haut (-Z) au crochet. */
function hangs(id: string, name: string): Pick<ItemDef, 'id' | 'name' | 'portable' | 'grip' | 'fragility' | 'durability' | 'breakWord'> {
  return { id, name, portable: true, grip: 'loose', fragility: 10, durability: 200, breakWord: 'déchiré' };
}

/** Noms au féminin (accord des messages). */
export const ENTREE_FEMININE = ['écharpe', 'boîte aux lettres'];

export const ENTREE_ITEMS: ItemDef[] = [
  {
    id: 'banc-chaussures',
    name: 'banc à chaussures',
    portable: false,
    movable: true,
    durability: 400,
    seat: BENCH_SEAT,
    build: () => {
      // bois clair, coussin bleu ; dessous, un rayon : les chaussures de dehors, ou les chaussons
      const wood = 0xb68a5a, dark = 0x8a6440;
      const g = group(
        box(BENCH_W, 0.04, BENCH_D, wood, 0, BENCH_SEAT - 0.06, 0),
        box(BENCH_W - 0.06, 0.05, BENCH_D - 0.06, 0x4f6f8f, 0, BENCH_SEAT - 0.015, 0.01),
        box(0.04, BENCH_SEAT - 0.08, BENCH_D, dark, -BENCH_W / 2 + 0.02, (BENCH_SEAT - 0.08) / 2, 0),
        box(0.04, BENCH_SEAT - 0.08, BENCH_D, dark, BENCH_W / 2 - 0.02, (BENCH_SEAT - 0.08) / 2, 0),
        box(BENCH_W - 0.08, 0.025, BENCH_D - 0.02, wood, 0, SHOE_SHELF, 0),
        box(BENCH_W - 0.08, BENCH_SEAT - 0.08, 0.02, dark, 0, (BENCH_SEAT - 0.08) / 2, -BENCH_D / 2 + 0.01),
      );
      const y = SHOE_SHELF + 0.0125;
      // les chaussures de dehors, rangées quand on est en chaussons
      const out = group(shoes(0x6b4a33, 0x2a2420, -0.3, y, 0.02), shoes(0x2f5e8a, 0xf2f0ea, 0, y, 0.02));
      out.name = 'chaussures';
      // les chaussons, rangés quand on est sorti en chaussures
      const slippers = group(shoes(0xc9a0b8, 0xe9dccb, -0.15, y, 0.02));
      slippers.name = 'chaussons';
      slippers.visible = false;
      // et les bottes de pluie, toujours là
      g.add(out, slippers, shoes(0x3f7a4a, 0x22301f, 0.3, y, 0.02, true));
      return g;
    },
  },
  {
    id: 'miroir',
    name: 'miroir',
    portable: false,
    movable: false,
    durability: 200,
    fragility: 3,
    // le milieu du miroir, au-dessus du pied (posé à 1 m du sol)
    mirror: { y: MIRROR_H / 2 },
    build: () => {
      const frame = 0x8a6440;
      const glass = new THREE.MeshBasicMaterial({ color: 0x9fc1d0 });
      const g = group(
        box(MIRROR_W, 0.04, 0.03, frame, 0, 0.02, 0.015),
        box(MIRROR_W, 0.04, 0.03, frame, 0, MIRROR_H - 0.02, 0.015),
        box(0.04, MIRROR_H, 0.03, frame, -MIRROR_W / 2 + 0.02, MIRROR_H / 2, 0.015),
        box(0.04, MIRROR_H, 0.03, frame, MIRROR_W / 2 - 0.02, MIRROR_H / 2, 0.015),
      );
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(MIRROR_W - 0.08, MIRROR_H - 0.08), glass);
      pane.position.set(0, MIRROR_H / 2, 0.012);
      // un reflet clair en biais
      const shine = new THREE.Mesh(new THREE.PlaneGeometry(0.06, MIRROR_H * 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
      shine.position.set(-0.08, MIRROR_H / 2 + 0.05, 0.014);
      shine.rotation.z = -0.5;
      g.add(pane, shine);
      return g;
    },
  },
  {
    id: 'portemanteau',
    name: 'portemanteau',
    portable: false,
    movable: false,
    durability: 400,
    fragility: 10,
    holds: ['manteau', 'écharpe', 'bonnet'],
    // les vêtements pendent à plat contre le mur, le haut à la patère
    slots: [-HOOK_GAP, 0, HOOK_GAP].map((x): [number, number, number] => [x, HOOK_Y - 0.03, 0.05]),
    slotTilt: [Math.PI / 2, 0, 0],
    build: () => {
      const g = group(box(HOOK_GAP * 2 + 0.2, 0.1, 0.025, 0x5d4129, 0, HOOK_Y + 0.02, 0.0125));
      for (const x of [-HOOK_GAP, 0, HOOK_GAP]) {
        g.add(box(0.02, 0.02, 0.07, 0xc9a24a, x, HOOK_Y - 0.01, 0.045));
        g.add(box(0.02, 0.04, 0.02, 0xc9a24a, x, HOOK_Y + 0.01, 0.075));
      }
      return g;
    },
  },
  {
    ...hangs('manteau', 'manteau'),
    // le haut (col) vers -Z : il pend du col
    gripPoint: [0, 0.04, -0.02],
    build: () => {
      const wool = 0x7a3b2e;
      const g = group(
        box(0.42, 0.06, 0.82, wool, 0, 0.03, 0.39),
        // les manches, le long du corps
        box(0.09, 0.07, 0.62, 0x6a3328, -0.24, 0.035, 0.33),
        box(0.09, 0.07, 0.62, 0x6a3328, 0.24, 0.035, 0.33),
        // le col, les boutons
        box(0.26, 0.075, 0.08, 0x5a2a20, 0, 0.04, 0.02),
      );
      for (let i = 0; i < 4; i++) g.add(box(0.025, 0.012, 0.025, 0xd9c08a, 0.04, 0.066, 0.2 + i * 0.15));
      return g;
    },
  },
  {
    ...hangs('echarpe', 'écharpe'),
    gripPoint: [0, 0.015, 0],
    build: () => {
      // laine rayée, franges au bout
      const g = new THREE.Group();
      for (let i = 0; i < 6; i++) g.add(box(0.16, 0.025, 0.1, i % 2 ? 0xf2c94c : 0x2f6f8f, 0, 0.0125, 0.05 + i * 0.1));
      g.add(box(0.14, 0.01, 0.05, 0xf2c94c, 0, 0.005, 0.625));
      return g;
    },
  },
  {
    ...hangs('bonnet', 'bonnet'),
    gripPoint: [0, 0.03, 0],
    build: () => {
      // tricot à revers, pompon ; à plat, le revers vers -Z
      const g = group(
        box(0.2, 0.05, 0.2, 0xb8432f, 0, 0.025, 0.12),
        box(0.21, 0.055, 0.06, 0xf1e2c0, 0, 0.0275, 0.0),
      );
      const pompom = mesh(new THREE.SphereGeometry(0.04, 10, 8), 0xf1e2c0, 0, 0.035, 0.24);
      g.add(pompom);
      return g;
    },
  },
  {
    id: 'boite-aux-lettres',
    name: 'boîte aux lettres',
    portable: false,
    movable: false,
    durability: 500,
    fragility: 9,
    build: () => {
      const metal = 0x3f6f5a, y = MAILBOX_Y;
      const g = group(
        // le poteau, la boîte, son toit arrondi
        box(0.07, y, 0.07, 0x5d4129, 0, y / 2, -0.05),
        box(0.3, 0.26, 0.38, metal, 0, y + 0.13, 0),
      );
      const roof = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.38, 16, 1, false, -Math.PI / 2, Math.PI), metal, 0, y + 0.26, 0);
      roof.rotation.x = Math.PI / 2;
      g.add(roof);
      // la fente devant, le nom sur la porte
      g.add(box(0.2, 0.025, 0.01, 0x1c2a24, 0, y + 0.2, 0.192), box(0.12, 0.05, 0.008, 0xf1e2c0, 0, y + 0.1, 0.193));
      // le courrier qui dépasse de la fente
      const mail = box(0.15, 0.05, 0.004, 0xf4ead2, 0, y + 0.21, 0.19);
      mail.name = 'courrier';
      mail.visible = false;
      g.add(mail);
      // le drapeau rouge sur le côté : levé quand il y a du courrier
      const flag = new THREE.Group();
      flag.name = 'drapeau';
      flag.add(box(0.012, 0.22, 0.02, 0x9a9fa5, 0, 0.11, 0), box(0.012, 0.07, 0.1, 0xc0392b, 0, 0.19, 0.05));
      flag.position.set(0.157, y + 0.12, -0.06);
      flag.rotation.x = Math.PI / 2;
      g.add(flag);
      return g;
    },
  },
];
