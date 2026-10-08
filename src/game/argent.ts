/**
 * L'argent du perso : un porte-monnaie qui part d'un montant de départ, les prix du magasin
 * (épicerie et maison) et ce que le marché donne pour les légumes du jardin, les pommes et les
 * plats faits maison. Les montants sont en centimes (entiers) : pas d'arrondis qui traînent.
 *
 * Les objets cassés sont notés ici (où ils étaient) : on peut les racheter au rayon maison, et
 * un meuble racheté revient à sa place.
 */
import type { ItemDef } from './items/catalog';
import { ITEM_BY_ID } from './items/catalog';
import { STOCK } from './items/pantry';
import { FISH_BY_ID, OUTDOOR_PRICES, RODS } from './items/plein-air';

/** Argent au début d'une partie (centimes). */
export const START_MONEY = 20000;

/** Prix au magasin (centimes), par genre d'objet. Les autres : voir priceOf. */
const PRICES: Record<string, number> = {
  // épicerie
  farine: 120, sucre: 130, chocolat: 180, confiture: 250, miel: 390, 'pate-tartiner': 320, 'sauce-tomate': 150, vinaigre: 140, levure: 90,
  biscuits: 190, chips: 170, oignon: 40, ail: 60, salade: 110, poulet: 650, poisson: 720, jambon: 290, saucisses: 340, yaourt: 60, creme: 130,
  banane: 30, orange: 40, fraises: 350, citron: 50, champignons: 210, poivron: 90, courgette: 80, moutarde: 160, ketchup: 210, mayonnaise: 230,
  'jus-orange': 220, soda: 150, 'eau-gazeuse': 70, vin: 690, frites: 240, pizza: 420, 'legumes-surgeles': 260, pomme: 50, steak: 380,
  tomate: 60, carotte: 30, concombre: 80, 'pomme-de-terre': 30, pain: 130, 'bouteille-eau': 60, lasagne: 450, sandwich: 390,
  oeuf: 35, lait: 110, beurre: 230, fromage: 350, sel: 80, poivre: 220, paprika: 240, herbes: 260, huile: 690,
  'sacs-poubelle': 290, spray: 340, 'sachets-the': 280, 'paquet-pates': 120, 'paquet-riz': 180, 'brique-soupe': 260,
  // maison
  'papier-toilette': 60, pastilles: 590, assiette: 450, verre: 250, bol: 350, tasse: 400, cuillere: 150, fourchette: 150, 'couteau-table': 180,
  couteau: 1990, carafe: 900, theiere: 1800, saladier: 1200, moule: 1100, poele: 2500, casserole: 2200, planche: 900, plateau: 1200,
  fouet: 450, spatule: 350, 'cuillere-bois': 250, louche: 450, rape: 650, 'bac-glacons': 300, eponge: 120, torchon: 400, maniques: 600,
  serviette: 1200, 'verre-a-dents': 300, 'brosse-a-dents': 250, savon: 220, 'lampe-chevet': 2900, reveil: 1500, chaise: 3500, tabouret: 2500,
  caisse: 1500, arrosoir: 1400, balai: 1200, seau: 900, serpilliere: 800, gants: 350,
};

/** Toujours en rayon maison, cassé ou pas : ce qui s'use ou se perd. */
export const HOUSE_ALWAYS = ['papier-toilette', 'pastilles', 'assiette', 'verre', 'bol', 'tasse', 'cuillere', 'fourchette', 'couteau-table', 'trousse-de-secours', 'pansements', ...RODS.slice(1).map((r) => r.id)];

/** Jamais en vente : ce qu'on ne trouve pas au magasin (courrier, sac du livreur, plantes du jardin, poissons de l'étang…). */
const NOT_SOLD = new Set(['lettre', 'liste-courses', 'sac-courses', 'sac-poubelle', 'bouquet', 'livre-recettes', ...FISH_BY_ID.keys()]);

/** Ce que le marché rachète sans étoiles : les légumes du potager et les pommes du pommier. */
export const MARKET_PRODUCE = new Set(['carotte', 'tomate', 'pomme-de-terre', 'concombre', 'pomme']);

/** Prix d'un objet au magasin (centimes). */
export function priceOf(def: ItemDef): number {
  const p = PRICES[def.id] ?? OUTDOOR_PRICES[def.id];
  if (p !== undefined) return p;
  // un plat cuisiné (pas vendu tout fait) : ce que coûterait le même au restaurant du port
  if (def.food) return STOCK[def.name] ? 250 : 900;
  if (def.portable) return 1000;
  return def.movable ? 9000 : 15000;
}

/** Ce que le marché donne pour un objet (centimes), toujours sous son prix au magasin ; 0 : il n'en veut pas. */
export function sellPrice(def: ItemDef, stars: number, fresh: 'frais' | 'à manger vite' | 'périmé'): number {
  if (fresh === 'périmé') return 0;
  // un poisson de l'étang : son prix, selon sa rareté
  const fish = FISH_BY_ID.get(def.id);
  if (fish) return fish.price;
  const buy = priceOf(def);
  let k: number;
  if (stars > 0) k = 0.2 + 0.12 * Math.min(5, stars); // 1 étoile : 32 %, 5 étoiles : 80 %
  else if (MARKET_PRODUCE.has(def.id)) k = 0.5;
  else return 0;
  if (fresh === 'à manger vite') k *= 0.6;
  return Math.max(1, Math.min(buy - 1, Math.round(buy * k)));
}

/** « 12,50 € ». */
export function euros(cents: number): string {
  const neg = cents < 0;
  const c = Math.abs(Math.round(cents));
  return `${neg ? '−' : ''}${Math.floor(c / 100)},${String(c % 100).padStart(2, '0')} €`;
}

/** Une ligne de commande : genre d'objet, combien. */
export type OrderLine = { id: string; n: number };

/** Total d'une commande (centimes). */
export function orderTotal(lines: OrderLine[]): number {
  return lines.reduce((sum, l) => {
    const def = ITEM_BY_ID.get(l.id);
    return sum + (def && l.n > 0 ? priceOf(def) * l.n : 0);
  }, 0);
}

/** Le rayon épicerie : chaque aliment de la liste de courses (STOCK), dans l'ordre de la liste. */
export function groceryAisle(): ItemDef[] {
  const byName = new Map<string, ItemDef>();
  for (const d of ITEM_BY_ID.values()) if (!byName.has(d.name)) byName.set(d.name, d);
  return Object.keys(STOCK).flatMap((name) => byName.get(name) ?? []);
}

/** Un objet cassé : son genre, et où il était (pour remettre un meuble à sa place). */
export interface Broken {
  id: string;
  p: [number, number, number];
  q: [number, number, number, number];
}

/** Commande en route : heures de jeu avant le livreur, aliments (noms) et objets de la maison (où remettre un meuble cassé). */
export interface Commande {
  hours: number;
  names: string[];
  house: Array<{ id: string; at?: Broken }>;
}

/** Relit une commande sauvée ; null si illisible. */
export function readCommande(x: unknown): Commande | null {
  const c = x as Partial<Commande> | null;
  if (!c || typeof c.hours !== 'number' || !Array.isArray(c.names)) return null;
  const names = c.names.filter((n): n is string => typeof n === 'string');
  const house = (Array.isArray(c.house) ? c.house : []).filter((h) => h && typeof h.id === 'string' && ITEM_BY_ID.has(h.id));
  return { hours: c.hours, names, house };
}

/** Ce que la sauvegarde garde de l'argent. */
export interface ArgentSave {
  money: number;
  broken?: Broken[];
}

/** Le porte-monnaie, et les objets cassés qu'on peut racheter. */
export class Argent {
  money = START_MONEY;
  broken: Broken[] = [];
  private subs = new Set<() => void>();

  /** Prévient `fn` à chaque changement ; renvoie de quoi se désabonner. */
  subscribe(fn: () => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  private changed(): void {
    for (const fn of this.subs) fn();
  }

  /** Paie `cents` s'il y a assez : vrai si payé. */
  spend(cents: number): boolean {
    if (cents < 0 || cents > this.money) return false;
    this.money -= cents;
    this.changed();
    return true;
  }

  earn(cents: number): void {
    if (cents <= 0) return;
    this.money += cents;
    this.changed();
  }

  /** Note un objet cassé, s'il se rachète (pas un aliment, ni ce que le magasin ne vend pas). */
  noteBroken(def: ItemDef, p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number; w: number }): void {
    if (def.food || NOT_SOLD.has(def.id) || STOCK[def.name]) return;
    this.broken.push({ id: def.id, p: [p.x, p.y, p.z], q: [q.x, q.y, q.z, q.w] });
    this.changed();
  }

  /** Retire de la liste des objets cassés un `id` racheté, et rend où il était. */
  takeBroken(id: string): Broken | undefined {
    const i = this.broken.findIndex((b) => b.id === id);
    if (i < 0) return undefined;
    const [b] = this.broken.splice(i, 1);
    this.changed();
    return b;
  }

  /**
   * Le rayon maison : les objets cassés (combien de chaque), puis ce qui est toujours en rayon.
   * `broken` : combien de ce genre ont été cassés.
   */
  houseAisle(): Array<{ def: ItemDef; broken: number }> {
    const count = new Map<string, number>();
    for (const b of this.broken) count.set(b.id, (count.get(b.id) ?? 0) + 1);
    const ids = [...count.keys(), ...HOUSE_ALWAYS.filter((id) => !count.has(id))];
    return ids.flatMap((id) => {
      const def = ITEM_BY_ID.get(id);
      return def ? [{ def, broken: count.get(id) ?? 0 }] : [];
    });
  }

  save(): ArgentSave {
    return this.broken.length ? { money: this.money, broken: this.broken.map((b) => ({ ...b })) } : { money: this.money };
  }

  load(s: ArgentSave | undefined): void {
    this.money = s && Number.isFinite(s.money) ? Math.round(s.money) : START_MONEY;
    this.broken = (s?.broken ?? []).filter((b) => b && typeof b.id === 'string' && ITEM_BY_ID.has(b.id) && Array.isArray(b.p) && Array.isArray(b.q));
    this.changed();
  }
}
