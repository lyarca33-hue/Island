/**
 * Les cartes de la carte de test (`?test`), sans rendu ni stockage : le format d'une carte gardée
 * ou exportée en fichier, sa relecture (tout ce qui vient d'un fichier ou du navigateur est vérifié)
 * et les petits utilitaires des noms. Le stockage est dans cartesStockage.ts, le chef d'orchestre
 * (enregistrer, ouvrir, importer…) dans atelierCartes.ts ; ce fichier se teste seul
 * (tests/cartes.test.ts).
 *
 * Une carte, c'est le terrain plat retouché (terraform.ts), les bâtiments (construction.ts) et les
 * modèles posés (modeles.ts), toujours ensemble : les hauteurs des bâtiments et des modèles sont
 * absolues, elles n'ont de sens qu'avec le terrain sur lequel on les a posés.
 */

export const CARTE_FORMAT = 'island-carte';
export const CARTE_V = 1;

/** Nom d'une carte qui n'a pas encore été enregistrée. */
export const SANS_NOM = 'Carte sans nom';
/** Nom de la carte faite des brouillons d'avant les cartes (migration). */
export const NOM_MIGRATION = 'Ma carte d’avant';
/** Taille maximale d'un fichier de carte importé (octets). */
export const MAX_CARTE_OCTETS = 5 * 1024 * 1024;
/** Longueur maximale d'un nom de carte. */
const NOM_MAX = 80;

/** Messages montrés au joueur. */
export const MSG_PAS_UNE_CARTE = 'Ce fichier n’est pas une carte de l’île.';
export const MSG_PLUS_RECENTE = 'Carte faite par une version plus récente du jeu.';
export const MSG_AUTRE_GRILLE = 'Terrain fait sur une autre grille : laissé plat.';

/** La grille du relief (ile.ts : RELIEF) : un terrain retouché ne se relit que sur la même. */
export interface CarteGrille { n: number; mapSize: number; half: number; cell: number }

/** Une rangée de bâtiment ou de modèle : [genre, puis quatre nombres]. */
export type RangCarte = [string, number, number, number, number];

export interface CarteSave {
  format: typeof CARTE_FORMAT;
  v: typeof CARTE_V;
  id: string;
  nom: string;
  creeLe: number;
  modifieLe: number;
  /** Le terrain de départ, avant les retouches : le terrain plat de la carte de test. */
  base: 'plat';
  grille: CarteGrille;
  /** Les retouches du terrain (Terraform.save()), null : terrain plat. */
  relief: { relief?: string; sols?: string } | null;
  /** Les pièces posées (Construction.save() : [genre, x, z, lacet, hauteur]). */
  batiments: RangCarte[] | null;
  /** Les modèles posés (Modeles.save() : [clé, x, y, z, lacet], en mm et millièmes de radian). */
  modeles: RangCarte[] | null;
  /** Où le perso se tient à l'ouverture : [x, z, lacet]. */
  depart?: [x: number, z: number, yaw: number];
}

/** Ce que la carte ouverte contient : ce que le jeu donne à enregistrer et reprend à l'ouverture. */
export type ContenuCarte = Pick<CarteSave, 'relief' | 'batiments' | 'modeles' | 'depart'>;

/** Une ligne de la liste « Mes cartes » (gardée à part : la liste se lit vite). */
export interface CarteInfo {
  id: string;
  nom: string;
  modifieLe: number;
  /** Taille du texte de la carte (caractères, à peu près des octets). */
  taille: number;
  nModeles: number;
  nPieces: number;
  /** Terrain retouché. */
  terrain: boolean;
}

/** La carte ouverte : id null tant qu'elle n'est pas enregistrée. */
export interface CarteCourante { id: string | null; nom: string; modifiee: boolean }

/** Identifiant neuf : l'heure et un peu de hasard, en base 36. */
export function nouvelId(now = Date.now(), rnd: () => number = Math.random): string {
  let r = '';
  for (let k = 0; k < 6; k++) r += Math.floor(rnd() * 36).toString(36);
  return `${Math.max(0, Math.floor(now)).toString(36)}-${r}`;
}

/** Une carte neuve, avec un id neuf. */
export function nouvelleCarte(nom: string, c: ContenuCarte, grille: CarteGrille, now = Date.now()): CarteSave {
  const carte: CarteSave = {
    format: CARTE_FORMAT,
    v: CARTE_V,
    id: nouvelId(now),
    nom: nettoyerNom(nom),
    creeLe: now,
    modifieLe: now,
    base: 'plat',
    grille: { n: grille.n, mapSize: grille.mapSize, half: grille.half, cell: grille.cell },
    relief: c.relief,
    batiments: c.batiments,
    modeles: c.modeles,
  };
  if (c.depart) carte.depart = c.depart;
  return carte;
}

const estNombre = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function nettoyerNom(nom: unknown): string {
  const s = typeof nom === 'string' ? nom.replace(/\s+/g, ' ').trim().slice(0, NOM_MAX).trim() : '';
  return s || SANS_NOM;
}

function memeGrille(a: unknown, b: CarteGrille): boolean {
  return estObjet(a) && a.n === b.n && a.mapSize === b.mapSize && a.half === b.half && a.cell === b.cell;
}

/** Les retouches du terrain, null si illisibles ou absentes. */
function lireRelief(x: unknown): CarteSave['relief'] {
  if (!estObjet(x)) return null;
  const out: { relief?: string; sols?: string } = {};
  if (typeof x.relief === 'string' && x.relief) out.relief = x.relief;
  if (typeof x.sols === 'string' && x.sols) out.sols = x.sols;
  return out.relief || out.sols ? out : null;
}

/** Les rangées lisibles (un texte puis quatre nombres finis) ; les autres sont laissées de côté. */
function lireRangs(x: unknown): RangCarte[] | null {
  if (!Array.isArray(x)) return null;
  const out: RangCarte[] = [];
  for (const row of x) {
    if (!Array.isArray(row) || row.length !== 5) continue;
    const [k, a, b, c, d] = row as unknown[];
    if (typeof k !== 'string' || !k || !estNombre(a) || !estNombre(b) || !estNombre(c) || !estNombre(d)) continue;
    out.push([k, a, b, c, d]);
  }
  return out.length ? out : null;
}

/**
 * Relit une carte (fichier importé ou gardée dans le navigateur). Refusée si ce n'en est pas une
 * ou si elle vient d'une version plus récente ; sinon, ce qui est illisible est laissé de côté
 * (avec un avertissement quand le joueur doit le savoir). Les clés de modèles inconnues sont
 * gardées : c'est Modeles.load qui les compte.
 */
export function lireCarte(x: unknown, grille: CarteGrille): { carte: CarteSave; avertissements: string[] } | { erreur: string } {
  if (!estObjet(x) || x.format !== CARTE_FORMAT || !estNombre(x.v) || x.v < 1) return { erreur: MSG_PAS_UNE_CARTE };
  if (x.v > CARTE_V) return { erreur: MSG_PLUS_RECENTE };
  // les versions suivantes se ramèneront ici : switch (x.v) { case 1: … }
  const avertissements: string[] = [];
  let relief = lireRelief(x.relief);
  if (relief && !memeGrille(x.grille, grille)) {
    relief = null;
    avertissements.push(MSG_AUTRE_GRILLE);
  }
  const creeLe = estNombre(x.creeLe) ? x.creeLe : 0;
  const carte: CarteSave = {
    format: CARTE_FORMAT,
    v: CARTE_V,
    id: typeof x.id === 'string' && x.id ? x.id : nouvelId(),
    nom: nettoyerNom(x.nom),
    creeLe,
    modifieLe: estNombre(x.modifieLe) ? x.modifieLe : creeLe,
    base: 'plat',
    grille: { n: grille.n, mapSize: grille.mapSize, half: grille.half, cell: grille.cell },
    relief,
    batiments: lireRangs(x.batiments),
    modeles: lireRangs(x.modeles),
  };
  const d = x.depart;
  if (Array.isArray(d) && d.length === 3 && d.every(estNombre)) carte.depart = [d[0], d[1], d[2]];
  return { carte, avertissements };
}

/** La ligne de la liste « Mes cartes ». */
export function infoDe(c: CarteSave): CarteInfo {
  return {
    id: c.id,
    nom: c.nom,
    modifieLe: c.modifieLe,
    taille: JSON.stringify(c).length,
    nModeles: c.modeles?.length ?? 0,
    nPieces: c.batiments?.length ?? 0,
    terrain: c.relief !== null,
  };
}

const cle = (nom: string) => nom.trim().toLocaleLowerCase('fr');

/** Un nom pas encore pris (sans tenir compte des majuscules) : « Village », « Village (2) »… */
export function nomLibre(nom: string, pris: string[]): string {
  const voulu = nettoyerNom(nom);
  const deja = new Set(pris.map(cle));
  if (!deja.has(cle(voulu))) return voulu;
  // « Village (2) » déjà pris : on repart de « Village »
  const base = voulu.replace(/\s*\(\d+\)$/, '') || voulu;
  for (let k = 2; ; k++) {
    const essai = `${base} (${k})`;
    if (!deja.has(cle(essai))) return essai;
  }
}

/** Nom du fichier exporté : « Village du port » → carte-village-du-port.json. */
export function nomFichier(nom: string): string {
  const slug = nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
    // « Carte du 13/10 » : pas de « carte-carte-… »
    .replace(/^carte(-|$)/, '');
  return `carte-${slug || 'sans-nom'}.json`;
}

/** Le contenu d'une carte neuve : terrain plat, rien de posé. */
export function contenuVide(): ContenuCarte {
  return { relief: null, batiments: null, modeles: null };
}

/** Nom proposé par « Enregistrer sous… » : « Carte du 13/10 ». */
export function nomDuJour(now = Date.now()): string {
  const d = new Date(now);
  const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0');
  return `Carte du ${dd}/${mm}`;
}

/**
 * La carte faite des brouillons d'avant les cartes (terrain et bâtiments gardés à part dans le
 * navigateur), ou null s'ils sont vides : rien à garder.
 */
export function migrerBrouillon(relief: unknown, batiments: unknown, grille: CarteGrille, now: number): CarteSave | null {
  const r = lireRelief(relief), b = lireRangs(batiments);
  if (!r && !b) return null;
  return nouvelleCarte(NOM_MIGRATION, { relief: r, batiments: b, modeles: null }, grille, now);
}
