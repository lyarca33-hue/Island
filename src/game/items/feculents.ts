/**
 * Pâtes, riz et soupes (carnet des recettes, niveau 1) : les paquets de pâtes et de riz et la
 * brique de soupe du garde-manger, et ce qu'ils donnent dans la casserole.
 *
 * Pâtes et riz : on remplit la casserole d'eau à l'évier, on la fait bouillir sur le feu, on y
 * verse les pâtes (ou le riz), on égoutte au-dessus de l'évier, puis on sert ; beurre, sauce
 * tomate ou fromage râpé par-dessus. Soupe de légumes : des légumes coupés dans l'eau, cuits, puis
 * servis à la louche dans un bol. Soupe en brique : versée dans la casserole, réchauffée.
 *
 * Les règles des gestes sont dans Game (pourStarch, addToSoup, pourSoup, topStarch).
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
/** Une pièce dont la couleur suit la cuisson (voir cooking.ts). */
const cooked = <T extends THREE.Mesh>(m: T): T => {
  m.name = 'cuit';
  return m;
};

/** Couleur du bouillon dans la casserole (soupe de légumes, soupe en brique). */
export const SOUP_BROTH: Record<string, THREE.ColorRepresentation> = { 'soupe de légumes': 0xd9893a, 'soupe de poireaux': 0xd8d9a0, soupe: 0xe0a03c };

/** Paquets qu'on verse dans l'eau qui bout : nom → id de ce qui cuit, combien de fois on s'en sert, et le mot du geste. */
export const PACKETS: Record<string, { cooks: string; servings: number; what: string }> = {
  'paquet de pâtes': { cooks: 'pates', servings: 3, what: 'les pâtes' },
  'paquet de riz': { cooks: 'riz', servings: 3, what: 'le riz' },
};

/** Légumes (coupés, ou qui cuisent tels quels) qui vont dans la soupe. */
export const SOUP_VEG = ['rondelles de carotte', 'tranches de tomate', 'courgette', 'poivron', 'champignons', 'oignon', 'poireau', 'pomme de terre'];
/** Un poireau dans la soupe en fait une soupe de poireaux (avec les pommes de terre, la vraie). */
export const LEEK_SOUP = { veg: 'poireau', from: 'soupe-legumes', to: 'soupe-poireaux' };

/** Ce qui s'égoutte avant d'être servi (cuit dans l'eau, on ne garde pas l'eau). */
export const DRAINS = ['pâtes', 'riz'];
/** Ce qui se sert à la louche, dans un bol, avec son bouillon. */
export const SOUPS = ['soupe de légumes', 'soupe de poireaux', 'soupe'];

/** Ce qu'on met sur les pâtes ou le riz cuits : nom du plat → nom de ce qu'on ajoute → id du plat obtenu. */
export const TOPPED: Record<string, Record<string, string>> = {
  'pâtes': { beurre: 'pates-beurre', 'sauce tomate': 'pates-tomate' },
  riz: { beurre: 'riz-beurre', 'sauce tomate': 'riz-tomate' },
};
/** Pots de sauce : combien de plats on nappe avec un pot. */
export const SAUCE_SERVINGS = 3;

/** Se rangent au garde-manger. */
export const FECULENT_PANTRY = ['paquet de pâtes', 'paquet de riz', 'brique de soupe'];
export const FECULENT_FEMININE = ['soupe de poireaux', 'pâtes', 'pâtes au beurre', 'pâtes à la tomate', 'soupe de légumes', 'soupe', 'brique de soupe'];
export const FECULENT_PLURAL = ['pâtes', 'pâtes au beurre', 'pâtes à la tomate'];
/** Stock voulu (liste de courses). */
export const FECULENT_STOCK: Record<string, number> = { 'paquet de pâtes': 1, 'paquet de riz': 1, 'brique de soupe': 1 };

/** Pages du livre de recettes (gestes à la casserole ; « Préparer » dans le livre les fait faire au perso). */
export const FECULENT_RECIPES: Array<{ name: string; needs: string[]; how: string }> = [
  { name: 'pâtes au beurre', needs: ['paquet de pâtes', 'beurre'], how: 'Remplis la casserole d’eau à l’évier, fais-la bouillir sur le feu, verse les pâtes. Une fois cuites, égoutte au-dessus de l’évier, ajoute le beurre (fromage râpé en plus si tu veux), sers à la spatule.' },
  { name: 'pâtes à la tomate', needs: ['paquet de pâtes', 'sauce tomate'], how: 'Comme les pâtes au beurre, mais verse la sauce tomate sur les pâtes égouttées.' },
  { name: 'riz', needs: ['paquet de riz'], how: 'Eau qui bout dans la casserole, verse le riz, attends qu’il soit cuit, égoutte à l’évier, sers. Beurre ou sauce tomate par-dessus si tu veux.' },
  { name: 'soupe de légumes', needs: ['carotte', 'tomate'], how: 'Coupe les légumes sur la planche, mets-les dans la casserole pleine d’eau, fais cuire sur le feu, puis sers à la louche dans un bol. Se mange à la cuillère.' },
  { name: 'soupe de poireaux', needs: ['poireau', 'pomme de terre'], how: 'Casserole pleine d’eau, mets-y le poireau et une pomme de terre (et ce que tu veux en plus), fais cuire sur le feu, puis sers à la louche dans un bol.' },
  { name: 'soupe', needs: ['brique de soupe'], how: 'Verse la brique dans la casserole, réchauffe-la sur le feu, sers à la louche dans un bol.' },
];

/** Un paquet du garde-manger (carton) : corps, bande de couleur, fenêtre sur ce qu'il y a dedans. */
function packet(id: string, name: string, body: THREE.ColorRepresentation, band: THREE.ColorRepresentation, inside: THREE.ColorRepresentation): ItemDef {
  const [w, h, d] = [0.1, 0.17, 0.05];
  return {
    id,
    name,
    portable: true,
    grip: 'fist',
    gripPoint: [0, h / 2, d / 2],
    fragility: 10,
    durability: 30,
    breakWord: 'écrasé',
    build: () => group(box(w, h, d, body), box(w + 0.002, h * 0.25, d + 0.002, band, 0, h * 0.75), box(w * 0.5, h * 0.3, d + 0.003, inside, 0, h * 0.35)),
  };
}

/** Un plat de féculents : se mange à la fourchette, cuit comme `base` (même temps de cuisson). */
function starch(id: string, name: string, hunger: number, color: THREE.ColorRepresentation, cook: ItemDef['cook'], build: () => THREE.Object3D): ItemDef {
  return {
    id,
    name,
    portable: true,
    grip: 'pinch',
    gripPoint: [0, 0.012, 0.035],
    mouth: [0, 0.015, -0.035],
    food: { hunger, bites: 6, color },
    cook,
    fragility: 10,
    durability: 15,
    breakWord: 'écrasé',
    build,
  };
}

const PASTA_COOK: ItemDef['cook'] = { seconds: 25, burn: 20, colors: [0xe9cf86, 0xf6e4ae, 0x3a2a20] };
const RICE_COOK: ItemDef['cook'] = { seconds: 30, burn: 20, colors: [0xece6d2, 0xfffcf2, 0x3a2a20] };

/** Un tas de pâtes (des penne couchées en vrac). */
function pastaHeap(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4, d = Math.sqrt(i / 16) * 0.032;
    const p = cooked(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.022, 8).rotateZ(Math.PI / 2), 0xe9cf86, Math.cos(a) * d, 0.005 + (i % 3) * 0.004, Math.sin(a) * d));
    p.rotation.y = a * 1.3;
    g.add(p);
  }
  return g;
}

/** Un dôme de riz. */
function riceHeap(): THREE.Group {
  return group(cooked(mesh(new THREE.SphereGeometry(0.036, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1), 0xece6d2)));
}

/** Ce qu'on met par-dessus : une noix de beurre, ou une nappe de sauce tomate. */
function butterOn(g: THREE.Group): THREE.Group {
  g.add(box(0.014, 0.008, 0.014, 0xf6e7a8, 0.004, 0.017, -0.004));
  return g;
}
function sauceOn(g: THREE.Group): THREE.Group {
  g.add(mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.004, 16), 0xc0302a, 0, 0.015, 0));
  return g;
}

/** Une soupe : un disque de bouillon (au fond de la casserole ou du bol), avec des morceaux. */
function soup(id: string, name: string, hunger: number, cook: NonNullable<ItemDef['cook']>, bits: THREE.ColorRepresentation[], rawWord?: string): ItemDef {
  return {
    id,
    name,
    portable: true,
    grip: 'pinch',
    gripPoint: [0, 0.006, 0.03],
    mouth: [0, 0.008, -0.03],
    food: { hunger, bites: 6, color: cook.colors[1] },
    cook,
    rawWord,
    fragility: 10,
    durability: 15,
    breakWord: 'renversé',
    build: () => {
      const g = group(cooked(mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.012, 20), cook.colors[0], 0, 0.006, 0)));
      bits.forEach((c, i) => g.add(box(0.008, 0.004, 0.008, c, Math.cos(i * 2.1) * 0.022, 0.013, Math.sin(i * 2.1) * 0.022)));
      return g;
    },
  };
}

export const FECULENT_ITEMS: ItemDef[] = [
  packet('paquet-pates', 'paquet de pâtes', 0x2f5fa8, 0xf2f0e6, 0xe9cf86),
  packet('paquet-riz', 'paquet de riz', 0xf2efe4, 0xc0302a, 0xf4f1e6),
  {
    ...packet('brique-soupe', 'brique de soupe', 0x3f7a35, 0xf2efe4, 0xe0a03c),
    build: () => group(box(0.07, 0.16, 0.05, 0x3f7a35), box(0.072, 0.05, 0.052, 0xe0a03c, 0, 0.09), box(0.02, 0.012, 0.02, 0xf2efe4, 0.015, 0.166)),
  },
  starch('pates', 'pâtes', 35, 0xf6e4ae, PASTA_COOK, pastaHeap),
  starch('riz', 'riz', 35, 0xfffcf2, RICE_COOK, riceHeap),
  starch('pates-beurre', 'pâtes au beurre', 45, 0xf6e4ae, PASTA_COOK, () => butterOn(pastaHeap())),
  starch('pates-tomate', 'pâtes à la tomate', 55, 0xd0503a, PASTA_COOK, () => sauceOn(pastaHeap())),
  starch('riz-beurre', 'riz au beurre', 40, 0xfffcf2, RICE_COOK, () => butterOn(riceHeap())),
  starch('riz-tomate', 'riz à la tomate', 45, 0xd0503a, RICE_COOK, () => sauceOn(riceHeap())),
  soup('soupe-legumes', 'soupe de légumes', 30, { seconds: 38, burn: 30, colors: [0xd9a05a, 0xd9893a, 0x3a2a20] }, [0xe8792a, 0xc0302a, 0x4f8a3a]),
  soup('soupe-poireaux', 'soupe de poireaux', 38, { seconds: 40, burn: 30, colors: [0xe6e3b0, 0xd8d9a0, 0x3a2a20] }, [0x4f8a3a, 0xe8eccf, 0xe6cf8a]),
  soup('soupe-brique', 'soupe', 25, { seconds: 12, burn: 30, colors: [0xd9b46a, 0xe0a03c, 0x3a2a20] }, [], 'froid'),
];
