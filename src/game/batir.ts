/**
 * Le créateur de bâtiment, sans le rendu : le catalogue des pièces, où chacune se cale (la grille
 * de 2 m des pans de mur) et la sauvegarde. Le mode lui-même (aperçu, pose, portes) est dans
 * construction.ts ; ce fichier se teste seul (tests/batir.test.ts).
 *
 * La grille suit les pans de mur taillés dans le muret (packs/pansMur.ts) : un pan fait 2 m, il se
 * pose sur un bord de case ; un sol ou un toit plat couvre une case ; le toit à deux pentes couvre
 * deux cases de large (4 m, la base du pignon), faîtage sur un bord ; le pignon se pose sur une
 * ligne de la grille, centré sur un croisement ; le décor se pose librement (tous les 25 cm).
 */

export const GRID = 2;
/** Hauteur d'un pan droit (m) : là se posent toits, toits plats et pignons. */
export const STOREY = 2.8;

export type PieceId =
  | 'mur' | 'mur-fenetre' | 'mur-porte' | 'mur-porte-bois' | 'barriere'
  | 'parquet' | 'carrelage' | 'dallage'
  | 'toit' | 'pignon' | 'toit-plat'
  | 'lampadaire' | 'banc' | 'jardiniere' | 'escalier' | 'tonneau' | 'table' | 'puits' | 'rondins';

export type Category = 'murs' | 'sols' | 'toits' | 'decor';
/** Comment la pièce se cale : sur un bord de case, centrée sur un croisement (pignon), sur une case, librement. */
export type Snap = 'bord' | 'pignon' | 'case' | 'libre';
/** Ce qu'une place accueille : une pièce par place et par couche (en poser une autre la remplace). */
export type Layer = 'mur' | 'sol' | 'toit' | 'pignon' | 'decor';

export interface PieceDef {
  id: PieceId;
  label: string;
  cat: Category;
  snap: Snap;
  layer: Layer;
  /** Posée en haut des murs (toits, pignons) plutôt qu'au sol. */
  high?: boolean;
  hint: string;
}

export const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: 'murs', label: 'Murs' },
  { id: 'sols', label: 'Sols' },
  { id: 'toits', label: 'Toits' },
  { id: 'decor', label: 'Décor' },
];

export const PIECES: PieceDef[] = [
  { id: 'mur', label: 'Mur', cat: 'murs', snap: 'bord', layer: 'mur', hint: 'Un pan de mur en pierre de 2 m' },
  { id: 'mur-fenetre', label: 'Fenêtre', cat: 'murs', snap: 'bord', layer: 'mur', hint: 'Un pan de mur avec sa fenêtre' },
  { id: 'mur-porte', label: 'Passage', cat: 'murs', snap: 'bord', layer: 'mur', hint: 'Un pan de mur avec une ouverture de porte, sans battant' },
  { id: 'mur-porte-bois', label: 'Porte', cat: 'murs', snap: 'bord', layer: 'mur', hint: 'Un pan de mur avec sa porte en bois, qui s’ouvre quand le perso approche' },
  { id: 'barriere', label: 'Barrière', cat: 'murs', snap: 'bord', layer: 'mur', hint: 'Une barrière en bois de 2 m' },
  { id: 'parquet', label: 'Parquet', cat: 'sols', snap: 'case', layer: 'sol', hint: 'Un sol en parquet sur une case' },
  { id: 'carrelage', label: 'Carrelage', cat: 'sols', snap: 'case', layer: 'sol', hint: 'Un sol carrelé sur une case' },
  { id: 'dallage', label: 'Dallage', cat: 'sols', snap: 'case', layer: 'sol', hint: 'Un sol en dalles de pierre sur une case' },
  { id: 'toit', label: 'Toit', cat: 'toits', snap: 'bord', layer: 'toit', high: true, hint: 'Deux pentes en tuiles sur 4 m de large, le faîtage sur un bord de case' },
  { id: 'pignon', label: 'Pignon', cat: 'toits', snap: 'pignon', layer: 'pignon', high: true, hint: 'Le haut en pointe du mur, au bout du toit (4 m de base)' },
  { id: 'toit-plat', label: 'Toit plat', cat: 'toits', snap: 'case', layer: 'toit', high: true, hint: 'Une dalle sur le haut des murs, sur une case' },
  { id: 'lampadaire', label: 'Lampadaire', cat: 'decor', snap: 'libre', layer: 'decor', hint: 'Un lampadaire de rue' },
  { id: 'banc', label: 'Banc', cat: 'decor', snap: 'libre', layer: 'decor', hint: 'Un banc public' },
  { id: 'jardiniere', label: 'Jardinière', cat: 'decor', snap: 'libre', layer: 'decor', hint: 'Une jardinière fleurie' },
  { id: 'escalier', label: 'Escalier', cat: 'decor', snap: 'libre', layer: 'decor', hint: 'Quelques marches en pierre' },
  { id: 'tonneau', label: 'Tonneau', cat: 'decor', snap: 'libre', layer: 'decor', hint: 'Un tonneau en bois' },
  { id: 'table', label: 'Table', cat: 'decor', snap: 'libre', layer: 'decor', hint: 'Une table de pique-nique' },
  { id: 'puits', label: 'Puits', cat: 'decor', snap: 'libre', layer: 'decor', hint: 'Un puits en pierre' },
  { id: 'rondins', label: 'Rondins', cat: 'decor', snap: 'libre', layer: 'decor', hint: 'Une pile de rondins' },
];

export const PIECE_BY_ID = new Map(PIECES.map((p) => [p.id, p]));

/** Une pièce calée : son centre au sol (m), son lacet (rad), et sa place (vide : le décor, sans place). */
export interface Spot {
  x: number;
  z: number;
  yaw: number;
  slot: string;
}

const snapTo = (v: number, step: number, offset = 0) => Math.round((v - offset) / step) * step + offset;
/** -0 → 0 (les places se comparent en texte). */
const clean = (v: number) => (Math.abs(v) < 1e-9 ? 0 : +v.toFixed(3));

/**
 * Où se cale la pièce `def` visée au point (x, z), tournée `turn` fois (un quart de tour pour une
 * case, un huitième pour le décor, un demi-tour pour un bord).
 */
export function snapPiece(def: PieceDef, x: number, z: number, turn = 0): Spot {
  const q = Math.PI / 2;
  if (def.snap === 'case') {
    const cx = clean(snapTo(x, GRID, GRID / 2)), cz = clean(snapTo(z, GRID, GRID / 2));
    return { x: cx, z: cz, yaw: (((turn % 4) + 4) % 4) * q, slot: `${def.layer}|${cx}|${cz}` };
  }
  if (def.snap === 'libre') {
    return { x: clean(snapTo(x, 0.25)), z: clean(snapTo(z, 0.25)), yaw: (((turn % 8) + 8) % 8) * (Math.PI / 4), slot: '' };
  }
  // bord ou pignon : la ligne de la grille la plus proche, le long de x ou de z
  const lz = snapTo(z, GRID), lx = snapTo(x, GRID);
  const alongX = Math.abs(z - lz) <= Math.abs(x - lx);
  const flip = ((turn % 2) + 2) % 2 ? Math.PI : 0;
  // le long de la ligne : le milieu d'un bord, ou un croisement pour le pignon
  const along = (v: number) => (def.snap === 'pignon' ? snapTo(v, GRID) : snapTo(v, GRID, GRID / 2));
  const sx = clean(alongX ? along(x) : lx), sz = clean(alongX ? lz : along(z));
  return { x: sx, z: sz, yaw: (alongX ? 0 : q) + flip, slot: `${def.layer}|${sx}|${sz}|${alongX ? 'x' : 'z'}` };
}

/** Points du sol sous la pièce (repère du monde), pour la poser à la hauteur du plus bas. */
export function footPoints(def: PieceDef, s: Spot): Array<[number, number]> {
  const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
  // repère de la pièce : x le long, z en travers
  const local: Array<[number, number]> =
    def.snap === 'case' ? [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]
      : def.snap === 'libre' ? [[0, 0]]
        : def.id === 'toit' ? [[0, 0], [-1, -2], [1, -2], [-1, 2], [1, 2]]
          : def.snap === 'pignon' ? [[0, 0], [-2, 0], [2, 0]]
            : [[0, 0], [-1, 0], [1, 0]];
  return local.map(([lx, lz]) => [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c]);
}

/** Une pièce posée, telle qu'elle se sauve : son genre, sa place, sa hauteur au sol (m). */
export interface PieceSave {
  id: PieceId;
  x: number;
  z: number;
  yaw: number;
  /** Hauteur du sol du bâtiment (le bas des murs). */
  y: number;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Les pièces en texte compact : [genre, x, z, lacet, hauteur] chacune. */
export function encodePieces(list: PieceSave[]): Array<[string, number, number, number, number]> {
  return list.map((p) => [p.id, r3(p.x), r3(p.z), r3(p.yaw), r3(p.y)]);
}

/** Relit les pièces d'une sauvegarde ; ce qui est illisible ou inconnu est laissé de côté. */
export function decodePieces(x: unknown): PieceSave[] {
  if (!Array.isArray(x)) return [];
  const out: PieceSave[] = [];
  for (const row of x) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const [id, px, pz, yaw, y] = row as unknown[];
    if (typeof id !== 'string' || !PIECE_BY_ID.has(id as PieceId)) continue;
    if (![px, pz, yaw, y].every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
    out.push({ id: id as PieceId, x: px as number, z: pz as number, yaw: yaw as number, y: y as number });
  }
  return out;
}

/** La place d'une pièce posée (pour la retrouver, la remplacer). */
export function slotOf(p: PieceSave): string {
  const def = PIECE_BY_ID.get(p.id)!;
  if (def.snap === 'libre') return '';
  // lacet → l'axe de la pièce (pour un bord), sans la demi-tour
  const alongX = Math.abs(Math.cos(p.yaw)) > 0.5;
  if (def.snap === 'case') return `${def.layer}|${clean(p.x)}|${clean(p.z)}`;
  return `${def.layer}|${clean(p.x)}|${clean(p.z)}|${alongX ? 'x' : 'z'}`;
}
