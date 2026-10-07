/**
 * La salle de bain : lavabo (avec son miroir), douche à l'italienne, toilettes, porte-serviettes et
 * serviette. Mêmes fiches que le reste du catalogue (catalog.ts) ; la douche, les toilettes et
 * la serviette sont jouées par Game.ts.
 *
 * Tous sont posés au sol, l'avant vers +Z, le dos contre le mur (-Z).
 */
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
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

const box = (w: number, h: number, d: number, color: THREE.ColorRepresentation, x: number, y: number, z: number) => mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z);

/** Eau transparente (filets d'eau, eau de la cuvette). */
const water = (opacity = 0.7) => new THREE.MeshBasicMaterial({ color: 0x9fd3ef, transparent: true, opacity, depthWrite: false });

const PORCELAIN = 0xf6f6f2;
const CHROME = 0xc8ced4;

/** Lavabo : haut de la vasque, largeur, profondeur ; vasque (ouverture, profondeur, centre en z), bout du robinet. */
export const BASIN_TOP = 0.85;
const SINK_W = 0.6;
const SINK_D = 0.46;
const BOWL_W = 0.42;
const BOWL_D = 0.28;
const BOWL_H = 0.14;
const BOWL_Z = 0.05;
const TAP_Z = -0.04;
const TAP_Y = BASIN_TOP + 0.16;
/** Miroir au-dessus du lavabo : bas, haut, largeur (m). */
const MIRROR_Y0 = 1.12;
const MIRROR_Y1 = 1.78;
const MIRROR_W = 0.56;

/** Douche : côté du receveur, hauteur de la paroi vitrée, du pommeau (m). */
export const SHOWER_W = 0.95;
const SHOWER_GLASS = 1.95;
const SHOWER_HEAD_Y = 2.02;
/** Toilettes : hauteur de l'abattant (où l'on s'assoit), profondeur de la cuvette. */
const TOILET_SEAT = 0.42;
/** Porte-serviettes : hauteur de la barre du haut. */
const RACK_H = 0.98;
/** Serviette : largeur, hauteur pliée en deux sur la barre, épaisseur. */
const TOWEL_W = 0.42;
const TOWEL_H = 0.46;
const TOWEL_T = 0.02;

/** Bouffée de vapeur : un disque blanc aux bords fondus. */
let steamTex: THREE.CanvasTexture | null = null;
function steamTexture(): THREE.CanvasTexture {
  if (steamTex) return steamTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  steamTex = new THREE.CanvasTexture(cv);
  return steamTex;
}

export const BATHROOM_ITEMS: ItemDef[] = [
  {
    id: 'lavabo',
    name: 'lavabo',
    portable: false,
    movable: false,
    fragility: 6,
    durability: 300,
    // le verre à dents ou la bouteille se remplissent sous le robinet ; la vasque se bouche et se vide
    pour: { at: [0, BASIN_TOP - BOWL_H, TAP_Z + 0.06], fills: ['tasse', "bouteille d'eau"], liquid: 'eau', seconds: 2, color: 0x9fcde6, drain: true },
    // les mains sous le robinet, au-dessus de la vasque
    wash: { hands: [0, BASIN_TOP + 0.05, TAP_Z + 0.08] },
    mirror: { y: (MIRROR_Y0 + MIRROR_Y1) / 2 },
    build: () => {
      const H = BASIN_TOP, x1 = BOWL_W / 2, z0 = BOWL_Z - BOWL_D / 2, z1 = BOWL_Z + BOWL_D / 2;
      const inside = 0xe2e6e6, top = 0.03;
      const g = group(
        // colonne de porcelaine, plus étroite que la vasque
        box(0.2, H - 0.16, 0.2, PORCELAIN, 0, (H - 0.16) / 2, -0.08),
        // plateau de la vasque, percé pour la cuvette
        box(SINK_W, top, z0 + SINK_D / 2, PORCELAIN, 0, H - top / 2, (z0 - SINK_D / 2) / 2),
        box(SINK_W, top, SINK_D / 2 - z1, PORCELAIN, 0, H - top / 2, (z1 + SINK_D / 2) / 2),
        box(SINK_W / 2 - x1, top, BOWL_D, PORCELAIN, -(x1 + SINK_W / 2) / 2, H - top / 2, BOWL_Z),
        box(SINK_W / 2 - x1, top, BOWL_D, PORCELAIN, (x1 + SINK_W / 2) / 2, H - top / 2, BOWL_Z),
        // la vasque : fond, bonde, quatre parois, et le dessous arrondi
        box(BOWL_W, 0.01, BOWL_D, inside, 0, H - BOWL_H - 0.005, BOWL_Z),
        mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.004, 16), CHROME, 0, H - BOWL_H + 0.002, BOWL_Z),
        box(0.01, BOWL_H, BOWL_D, inside, -x1, H - BOWL_H / 2, BOWL_Z),
        box(0.01, BOWL_H, BOWL_D, inside, x1, H - BOWL_H / 2, BOWL_Z),
        box(BOWL_W, BOWL_H, 0.01, inside, 0, H - BOWL_H / 2, z0),
        box(BOWL_W, BOWL_H, 0.01, inside, 0, H - BOWL_H / 2, z1),
        box(SINK_W, 0.12, SINK_D, PORCELAIN, 0, H - 0.1, 0),
        // robinet mitigeur
        mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.12, 16), CHROME, 0, H + 0.06, -0.17),
        mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.15, 12).rotateX(Math.PI / 2), CHROME, 0, H + 0.11, (-0.17 + TAP_Z) / 2),
        mesh(new THREE.CylinderGeometry(0.011, 0.009, 0.03, 12), CHROME, 0, TAP_Y - 0.01 + 0.02, TAP_Z),
        box(0.016, 0.016, 0.09, CHROME, 0, H + 0.135, -0.2),
        // savon et verre à dents sur le rebord
        box(0.08, 0.025, 0.05, 0xe7a7b8, 0.21, H + 0.0125, -0.17),
        mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.1, 14), 0xc7e2ea, -0.21, H + 0.05, -0.17),
        box(0.008, 0.16, 0.008, 0x3d9ad1, -0.215, H + 0.11, -0.17),
      );
      // miroir et sa petite tablette, contre le mur
      const frame = box(MIRROR_W + 0.04, MIRROR_Y1 - MIRROR_Y0 + 0.04, 0.02, 0xe9e1cf, 0, (MIRROR_Y0 + MIRROR_Y1) / 2, -SINK_D / 2 + 0.01);
      // vrai reflet de la pièce (une image de plus à dessiner, petite)
      const glass = new Reflector(new THREE.PlaneGeometry(MIRROR_W, MIRROR_Y1 - MIRROR_Y0), { textureWidth: 384, textureHeight: 448, color: 0xc9d6dc });
      glass.position.set(0, (MIRROR_Y0 + MIRROR_Y1) / 2, -SINK_D / 2 + 0.022);
      glass.name = 'miroir';
      // buée sur le miroir après la douche (Game.tickBathroom)
      const fog = new THREE.Mesh(new THREE.PlaneGeometry(MIRROR_W, MIRROR_Y1 - MIRROR_Y0), new THREE.MeshBasicMaterial({ color: 0xf4f7f8, transparent: true, opacity: 0, depthWrite: false }));
      fog.position.set(0, (MIRROR_Y0 + MIRROR_Y1) / 2, -SINK_D / 2 + 0.024);
      fog.name = 'buee';
      fog.visible = false;
      const shelf = box(MIRROR_W, 0.02, 0.1, 0xe9e1cf, 0, MIRROR_Y0 - 0.05, -SINK_D / 2 + 0.05);
      g.add(frame, glass, fog, shelf);
      // l'eau qui monte dans la vasque bouchée (Game.tickSinks), et le bouchon sur la bonde
      const pool = new THREE.Mesh(new THREE.BoxGeometry(BOWL_W - 0.012, 1, BOWL_D - 0.012), water());
      pool.name = 'cuve';
      pool.visible = false;
      pool.position.set(0, H - BOWL_H, BOWL_Z);
      pool.userData = { floor: H - BOWL_H, depth: BOWL_H - 0.01 };
      const plug = mesh(new THREE.CylinderGeometry(0.026, 0.022, 0.012, 16), 0x2a2b2e, 0, H - BOWL_H + 0.008, BOWL_Z);
      plug.name = 'bouchon';
      plug.visible = false;
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 8), toon(0x9fd3ef));
      jet.name = 'jet';
      jet.visible = false;
      jet.position.set(0, TAP_Y, TAP_Z);
      g.add(pool, plug, jet);
      return g;
    },
  },
  {
    id: 'douche',
    name: 'douche',
    portable: false,
    movable: false,
    fragility: 7,
    durability: 300,
    // on y entre : le receveur est au ras du sol, seule la paroi vitrée (côté +X) arrête le perso
    shower: { seconds: 9, stand: [-0.05, 0.02], head: [0, SHOWER_HEAD_Y, -0.18] },
    build: () => {
      const W = SHOWER_W, half = W / 2;
      const g = group(
        // receveur extra-plat, bonde au milieu
        box(W, 0.03, W, 0xeef0ee, 0, 0.015, 0),
        mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.004, 18), CHROME, 0, 0.032, 0),
        // colonne de douche contre le mur : barre, bras, pommeau, mitigeur
        mesh(new THREE.CylinderGeometry(0.014, 0.014, SHOWER_HEAD_Y - 0.9, 10), CHROME, 0, (SHOWER_HEAD_Y + 0.9) / 2 + 0.05, -half + 0.04),
        mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 10).rotateX(Math.PI / 2), CHROME, 0, SHOWER_HEAD_Y + 0.05, -half + 0.12),
        mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.03, 24), CHROME, 0, SHOWER_HEAD_Y + 0.03, -0.18),
        box(0.16, 0.06, 0.05, CHROME, 0, 1.05, -half + 0.03),
        mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 12).rotateX(Math.PI / 2), 0x2f3438, 0.05, 1.05, -half + 0.07),
        // tablette d'angle : shampoing et gel douche
        box(0.18, 0.02, 0.12, CHROME, -half + 0.12, 1.25, -half + 0.08),
        box(0.05, 0.16, 0.04, 0x4aa3c9, -half + 0.08, 1.34, -half + 0.08),
        box(0.045, 0.13, 0.035, 0xf0a63a, -half + 0.15, 1.325, -half + 0.08),
      );
      // paroi vitrée sur le côté droit, un profilé chromé en haut
      const glassMat = new THREE.MeshBasicMaterial({ color: 0xcfe8f0, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
      const pane = new THREE.Mesh(new THREE.BoxGeometry(0.012, SHOWER_GLASS, W - 0.15), glassMat);
      pane.position.set(half - 0.01, 0.03 + SHOWER_GLASS / 2, -0.075);
      pane.name = 'vitre';
      g.add(pane, box(0.02, 0.02, W - 0.15, CHROME, half - 0.01, 0.03 + SHOWER_GLASS, -0.075), box(0.02, SHOWER_GLASS, 0.02, CHROME, half - 0.01, 0.03 + SHOWER_GLASS / 2, half - 0.16));
      // l'eau : des filets du pommeau au receveur, et la vapeur ; cachés au repos
      const rain = new THREE.Group();
      rain.name = 'jet';
      rain.visible = false;
      const mat = water(0.55);
      for (let i = 0; i < 14; i++) {
        const a = i * 2.39, r = 0.03 + 0.07 * Math.sqrt(i / 14);
        const len = SHOWER_HEAD_Y - 0.04;
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, len, 5), mat);
        s.position.set(Math.cos(a) * r * 1.6, 0.03 + len / 2, -0.18 + Math.sin(a) * r * 1.6);
        s.userData.phase = i * 0.37;
        rain.add(s);
      }
      const steam = new THREE.Group();
      steam.name = 'vapeur';
      steam.visible = false;
      const puff = new THREE.SpriteMaterial({ map: steamTexture(), color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
      for (let i = 0; i < 10; i++) {
        const m = new THREE.Sprite(puff);
        m.userData.phase = i / 10;
        steam.add(m);
      }
      g.add(rain, steam);
      return g;
    },
  },
  {
    id: 'toilettes',
    name: 'toilettes',
    portable: false,
    movable: false,
    fragility: 5,
    durability: 300,
    seat: TOILET_SEAT,
    toilet: true,
    build: () => {
      const g = group(
        // pied, cuvette, réservoir et son bouton de chasse
        box(0.24, 0.3, 0.34, PORCELAIN, 0, 0.15, 0.02),
        mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.12, 22).scale(1, 1, 1.25), PORCELAIN, 0, TOILET_SEAT - 0.08, 0.06),
        box(0.4, 0.38, 0.17, PORCELAIN, 0, TOILET_SEAT + 0.17, -0.25),
        box(0.42, 0.03, 0.19, 0xeeeeea, 0, TOILET_SEAT + 0.375, -0.25),
        mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.012, 16), CHROME, 0, TOILET_SEAT + 0.395, -0.25),
      );
      // l'eau au fond de la cuvette : elle tourbillonne quand on tire la chasse
      const pool = new THREE.Mesh(new THREE.CircleGeometry(0.12, 22).rotateX(-Math.PI / 2).scale(1, 1, 1.25), water(0.85));
      pool.position.set(0, TOILET_SEAT - 0.05, 0.07);
      pool.name = 'eau';
      // l'abattant (anneau) et le couvercle, articulés à l'arrière de la cuvette
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 26).rotateX(Math.PI / 2).scale(1, 0.5, 1.25), toon(0xffffff));
      ring.position.set(0, TOILET_SEAT - 0.01, 0.07);
      ring.castShadow = true;
      const lid = new THREE.Group();
      lid.name = 'couvercle';
      lid.position.set(0, TOILET_SEAT + 0.005, -0.15);
      const cover = mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.02, 24).scale(1, 1, 1.15), 0xffffff, 0, 0.01, 0.22);
      lid.add(cover);
      g.add(pool, ring, lid);
      return g;
    },
  },
  {
    id: 'porte-serviettes',
    name: 'porte-serviettes',
    portable: false,
    movable: true,
    fragility: 8,
    durability: 200,
    holds: ['serviette'],
    // la serviette pend sur la barre du haut, pliée en deux
    slots: [[0, RACK_H - TOWEL_H + 0.01, 0]],
    build: () => {
      const g = group(
        box(0.6, 0.02, 0.24, CHROME, 0, 0.01, 0),
        mesh(new THREE.CylinderGeometry(0.012, 0.012, RACK_H, 10), CHROME, -0.3, RACK_H / 2, 0),
        mesh(new THREE.CylinderGeometry(0.012, 0.012, RACK_H, 10), CHROME, 0.3, RACK_H / 2, 0),
        mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 10).rotateZ(Math.PI / 2), CHROME, 0, RACK_H, 0),
        mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.6, 10).rotateZ(Math.PI / 2), CHROME, 0, RACK_H - 0.3, 0.06),
      );
      return g;
    },
  },
  {
    id: 'serviette',
    name: 'serviette',
    portable: true,
    grip: 'fist',
    // tenue par le pli du haut
    gripPoint: [0, TOWEL_H - 0.03, 0],
    fragility: 10,
    durability: 120,
    layFlat: true,
    towel: true,
    build: () => {
      // pliée en deux sur la barre : deux pans et le pli arrondi en haut ; bande claire en bas
      const color = 0x4f8fb8;
      const g = group(
        box(TOWEL_W, TOWEL_H - 0.02, TOWEL_T, color, 0, (TOWEL_H - 0.02) / 2, -0.016),
        box(TOWEL_W, TOWEL_H - 0.08, TOWEL_T, color, 0, 0.06 + (TOWEL_H - 0.08) / 2, 0.016),
        mesh(new THREE.CylinderGeometry(0.026, 0.026, TOWEL_W, 12).rotateZ(Math.PI / 2), color, 0, TOWEL_H - 0.02, 0),
        box(TOWEL_W + 0.002, 0.04, TOWEL_T + 0.002, 0xdbe9f2, 0, 0.1, 0.016),
      );
      // taches plus foncées quand elle est mouillée (Game : après s'être séché)
      const wet = box(TOWEL_W - 0.06, TOWEL_H - 0.16, TOWEL_T + 0.004, 0x2f6386, 0, TOWEL_H / 2, 0);
      wet.name = 'mouillee';
      wet.visible = false;
      g.add(wet);
      return g;
    },
  },
];
