/**
 * Catalogue des modèles qu'on pose sur la carte de test (panneau « Modèles ») et qu'on regarde dans
 * la visionneuse : les objets du jeu (catalog.ts, sans les retirés), rangés en sept familles, puis le
 * décor des packs (la galerie de la carte de test, carteTest.ts : galleryModels), rangé par groupes
 * de packs. Un modèle de pack qui habille un objet vivant (FOOD_LOOKS) n'est pas proposé en décor :
 * on le pose comme l'objet. Chaque entrée a une clé stable (`objet:tasse`, `pack:ville/banc-public`),
 * gardée dans les cartes sauvées, et son repère de signalement (`objet <id> (<nom>)`,
 * `pack <pack>/<modèle>`), le même que sur la carte de test (Game.testModelAt, galleryHit).
 * Pas de rendu ici : les vignettes sont dans items/vignettes.ts.
 */
import { galleryModels, PACK_SCALE } from './carteTest';
import { type ItemDef, ITEMS } from './items/catalog';
import { FOOD_LOOKS } from './items/interior';
import { KITCHEN_ITEMS } from './items/kitchen';
import { MENAGE_ITEMS } from './items/menage';
import { PANTRY_ITEMS } from './items/pantry';
import { DISHES } from './items/recipes';
import { RETIRES } from './items/retires';
import type { PackId } from './packs/manifest';

/** Clé d'un modèle : `objet:<id>` ou `pack:<pack>/<modèle>`. */
export type ModeleKey = string;
/** D'où vient le modèle : un objet du jeu, ou le décor des packs. */
export type ModeleSource = 'objets' | 'decor';

export interface ModeleEntry {
  key: ModeleKey;
  kind: 'objet' | 'pack';
  source: ModeleSource;
  /** Famille (id de MODELE_CATS). */
  cat: string;
  /** Nom montré : celui de la fiche, ou le nom du modèle rendu lisible (joliNom). */
  label: string;
  /** Objet du jeu : son id et sa fiche. */
  id?: string;
  def?: ItemDef;
  /** Décor : le pack et le nom du modèle dans le pack. */
  pack?: PackId;
  model?: string;
  /** Échelle à appliquer au modèle du pack (PACK_SCALE ; 1 pour un objet). */
  scale: number;
  /** Repère de signalement (A / E), comme sur la carte de test. */
  signal: string;
  /** Texte où l'on cherche : nom, id, pack, famille, sans accents ni majuscules. */
  search: string;
}

/**
 * Les familles, dans l'ordre des puces du panneau : sept pour les objets du jeu, onze pour le décor
 * (`packs` : les packs rangés là, à charger quand on ouvre la famille ; « Autres » ramasse un pack
 * qui n'est rangé nulle part).
 */
export const MODELE_CATS: ReadonlyArray<{ id: string; source: ModeleSource; label: string; packs?: PackId[] }> = [
  { id: 'meubles', source: 'objets', label: 'Meubles' },
  { id: 'cuisine', source: 'objets', label: 'Cuisine' },
  { id: 'vaisselle', source: 'objets', label: 'Vaisselle' },
  { id: 'aliments', source: 'objets', label: 'Aliments' },
  { id: 'plats', source: 'objets', label: 'Plats' },
  { id: 'menage', source: 'objets', label: 'Ménage' },
  { id: 'divers', source: 'objets', label: 'Divers' },
  { id: 'ville', source: 'decor', label: 'Ville', packs: ['ville', 'enseignes', 'monuments'] },
  { id: 'bouche', source: 'decor', label: 'Boulangerie, resto, marché', packs: ['boulangerie', 'restaurant', 'marche', 'glacier', 'nourriture'] },
  { id: 'boutiques', source: 'decor', label: 'Boutiques', packs: ['poste', 'fleuriste', 'librairie', 'pharmacie', 'coiffeur', 'veterinaire'] },
  { id: 'port', source: 'decor', label: 'Port et pêche', packs: ['port', 'peche'] },
  { id: 'outils', source: 'decor', label: 'Outils', packs: ['atelier', 'outillage'] },
  {
    id: 'mobilier',
    source: 'decor',
    label: 'Mobilier de boutique',
    packs: ['mobilier', 'comptoirs', 'presentoirs', 'rangements', 'salon', 'tables', 'guichets', 'etals'],
  },
  { id: 'ferme', source: 'decor', label: 'Ferme, jardin, plage', packs: ['ferme', 'cour', 'bucheron', 'animalerie', 'plage'] },
  {
    id: 'vehicules',
    source: 'decor',
    label: 'Véhicules et cabanes',
    packs: ['deuxroues', 'charrettes', 'voitures', 'engins', 'bateaux', 'cabanes', 'train', 'utilitaires'],
  },
  { id: 'animaux', source: 'decor', label: 'Animaux', packs: ['betail', 'oiseaux', 'petitsanimaux'] },
  // les états des aliments et des plats (cuit, brûlé, périmé…) qui n'habillent aucun objet vivant
  { id: 'etats', source: 'decor', label: 'États des aliments', packs: ['aliments', 'plats'] },
  { id: 'autres', source: 'decor', label: 'Autres' },
];

const CAT_LABEL = new Map(MODELE_CATS.map((c) => [c.id, c.label]));
const CAT_OF_PACK = new Map<string, string>(MODELE_CATS.flatMap((c) => (c.packs ?? []).map((p) => [p, c.id] as [string, string])));

/** Texte sans accents ni majuscules (décomposé, signes diacritiques ôtés), pour chercher. */
export function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Nom de fichier rendu lisible : 'banc-public' → 'Banc public', 'Pepper_Red' → 'Pepper red', 'ChickenLeg' → 'Chicken leg'. */
export function joliNom(name: string): string {
  const s = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_\s]+/g, ' ')
    .trim()
    .toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ids = (list: ItemDef[]) => new Set(list.map((d) => d.id));
const PLATS = ids(DISHES);
const GARDE_MANGER = ids(PANTRY_ITEMS);
const CUISINE = ids(KITCHEN_ITEMS);
const MENAGE = ids(MENAGE_ITEMS);

/**
 * Famille d'un objet du jeu, d'après sa fiche. Règles dans l'ordre, la première qui convient gagne :
 * 1. plats : un plat des recettes (recipes.ts), ou un aliment habillé par le pack `plats` ;
 * 2. aliments : le garde-manger, ce qui se mange, les épices, l'œuf, le beurre, le fromage ;
 * 3. vaisselle : vaisselle, couverts, ustensiles de cuisson, couteaux, cuillères à remuer, carafes ;
 * 4. ménage : les objets du ménage et ce qui balaie, lave, aspire, vaporise, jette…, et le dehors ;
 * 5. cuisine : les meubles et appareils de la cuisine (ce qui chauffe, lave, mixe, verse, garde au froid) ;
 * 6. meubles : ce qui ne se porte pas, et les sièges ;
 * 7. divers : tout le reste.
 */
export function familleObjet(def: ItemDef): string {
  const id = def.id;
  if (PLATS.has(id) || (def.food && FOOD_LOOKS[id]?.pack === 'plats')) return 'plats';
  if (GARDE_MANGER.has(id) || def.food || def.spice || id === 'oeuf' || id === 'beurre' || id === 'fromage') return 'aliments';
  if (def.dish || def.utensil || def.cookware || def.knife || def.stirs || def.jug || id === 'maniques' || id === 'bouteille-eau') return 'vaisselle';
  if (
    MENAGE.has(id) ||
    def.sweeps ||
    def.mops ||
    def.vacuums ||
    def.dusts ||
    def.scrubsBowl ||
    def.spray ||
    def.gloves ||
    def.bin != null ||
    def.outdoor ||
    id === 'seau'
  )
    return 'menage';
  if (
    CUISINE.has(id) ||
    def.heat ||
    def.heats ||
    def.washes ||
    def.blends ||
    def.pour ||
    def.wash ||
    def.cold ||
    id === 'plan-de-travail' ||
    id === 'crochets' ||
    id === 'ilot' ||
    id.startsWith('barre-')
  )
    return 'cuisine';
  if (!def.portable || def.seat != null) return 'meubles';
  return 'divers';
}

/** Modèles de pack (`pack/modèle`) qui habillent un objet vivant : proposés comme l'objet, pas en décor. */
function habillages(): Set<string> {
  const vivants = new Set(ITEMS.map((d) => d.id));
  return new Set(
    Object.entries(FOOD_LOOKS)
      .filter(([id]) => !RETIRES.has(id) && vivants.has(id))
      .map(([, look]) => `${look.pack ?? 'nourriture'}/${look.model}`),
  );
}

function objetEntry(def: ItemDef): ModeleEntry {
  const cat = familleObjet(def);
  return {
    key: `objet:${def.id}`,
    kind: 'objet',
    source: 'objets',
    cat,
    label: def.name,
    id: def.id,
    def,
    scale: 1,
    signal: `objet ${def.id} (${def.name})`,
    search: normaliser([def.name, def.id, CAT_LABEL.get(cat)].join(' ')),
  };
}

function packEntry(pack: PackId, model: string): ModeleEntry {
  const cat = CAT_OF_PACK.get(pack) ?? 'autres';
  const label = joliNom(model);
  return {
    key: `pack:${pack}/${model}`,
    kind: 'pack',
    source: 'decor',
    cat,
    label,
    pack,
    model,
    scale: PACK_SCALE[pack] ?? 1,
    signal: `pack ${pack}/${model}`,
    search: normaliser([label, model, pack, CAT_LABEL.get(cat)].join(' ')),
  };
}

let memo: { list: ModeleEntry[]; byKey: Map<ModeleKey, ModeleEntry> } | null = null;

function construire(): NonNullable<typeof memo> {
  if (memo) return memo;
  const objets = [...ITEMS].sort((a, b) => a.name.localeCompare(b.name, 'fr')).map(objetEntry);
  const pris = habillages();
  const decor = galleryModels().flatMap(({ pack, models }) => models.filter((m) => !pris.has(`${pack}/${m}`)).map((m) => packEntry(pack, m)));
  const list = [...objets, ...decor];
  memo = { list, byKey: new Map(list.map((e) => [e.key, e])) };
  return memo;
}

/** Tous les modèles : les objets du jeu par ordre alphabétique, puis le décor pack par pack. Fait une fois. */
export function catalogue(): ModeleEntry[] {
  return construire().list;
}

/** L'entrée de cette clé ; null si inconnue ou retirée du jeu (une vieille carte). */
export function entree(key: ModeleKey): ModeleEntry | null {
  return construire().byKey.get(key) ?? null;
}

/** Repère de signalement de cette clé (`objet <id> (<nom>)`, `pack <pack>/<modèle>`), ou null. */
export function signalDe(key: ModeleKey): string | null {
  return entree(key)?.signal ?? null;
}

/** Nombre de résultats rendus au plus par défaut (le panneau dit d'affiner au-delà). */
export const CHERCHER_MAX = 120;

/**
 * Les modèles qui répondent à la recherche `q` (chaque mot doit s'y trouver, accents et majuscules
 * ignorés) : d'abord ceux dont le nom commence par la recherche, puis ceux dont un mot du nom
 * commence par elle, puis les autres, chacun dans l'ordre de `list`. Au plus `max`.
 * Recherche vide : les `max` premiers de la liste.
 */
export function chercher(q: string, list: ModeleEntry[] = catalogue(), max = CHERCHER_MAX): ModeleEntry[] {
  const nq = normaliser(q).trim();
  if (!nq) return list.slice(0, max);
  const mots = nq.split(/\s+/);
  const rang = (e: ModeleEntry) => {
    const nom = normaliser(e.label);
    if (nom.startsWith(nq)) return 0;
    if (nom.split(/[\s'’-]+/).some((m) => m.startsWith(mots[0]))) return 1;
    return 2;
  };
  const trouves = list.filter((e) => mots.every((m) => e.search.includes(m))).map((e, i) => ({ e, i, r: rang(e) }));
  trouves.sort((a, b) => a.r - b.r || a.i - b.i);
  return trouves.slice(0, max).map((t) => t.e);
}
