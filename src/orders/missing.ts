/**
 * Journal des manques : ce que le perso n'a pas pu faire pendant les essais (action que le jeu ne
 * sait pas faire, ordre non compris, geste refusé). Gardé dans le navigateur, regroupé par
 * action pour servir de liste de choses à ajouter au jeu (Menu → Manques).
 */

export type MissingKind = 'action' | 'echec' | 'incompris';

export interface Missing {
  kind: MissingKind;
  /** L'ordre du joueur. */
  ordre: string;
  /** L'action manquante (« danser »), ou l'étape qui a échoué (« prendre bibliotheque »). */
  quoi: string;
  /** Pourquoi : explication de l'IA ou message du jeu. */
  detail: string;
  /** Date ISO. */
  at: string;
}

/** Un manque et toutes ses occurrences (même genre, même action). */
export interface MissingGroup {
  kind: MissingKind;
  quoi: string;
  count: number;
  last: Missing;
  ordres: string[];
}

export const KIND_LABEL: Record<MissingKind, string> = {
  action: 'Action que le jeu ne sait pas faire',
  echec: 'Action ratée',
  incompris: 'Ordre non compris',
};

const KEY = 'rp-island.manques';
const MAX = 300;
const listeners = new Set<() => void>();

function read(): Missing[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return memory;
  }
}

/** Repli quand le stockage du navigateur est indisponible. */
let memory: Missing[] = [];

function write(list: Missing[]): void {
  memory = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // stockage indisponible : gardé pour cette session seulement
  }
  listeners.forEach((f) => f());
}

export function logMissing(m: Omit<Missing, 'at'>): void {
  const quoi = m.quoi.trim().toLowerCase() || '?';
  write([...read(), { ...m, quoi, at: new Date().toISOString() }].slice(-MAX));
}

export function missingList(): Missing[] {
  return read();
}

export function clearMissing(): void {
  write([]);
}

/**
 * Manques connus, notés en ajoutant un objet (version simple faite, le reste à faire) : ajoutés
 * une seule fois au journal de chaque navigateur, même s'il a été vidé depuis.
 */
const KNOWN: Array<{ id: string } & Omit<Missing, 'at'>> = [
  { id: 'evier-robinet', kind: 'action', ordre: '(ajout de l’évier)', quoi: 'ouvrir le robinet', detail: 'L’eau coule toute seule quand les mains ou la tasse arrivent sous le robinet : pas encore de geste pour tourner la manette.' },
  { id: 'evier-boire', kind: 'action', ordre: '(ajout de l’évier)', quoi: 'boire au robinet', detail: 'On boit l’eau de l’évier seulement avec la tasse : pas de geste pour boire dans ses mains ou au robinet.' },
  { id: 'evier-vaisselle', kind: 'action', ordre: '(ajout de l’évier)', quoi: 'laver la tasse', detail: 'Pas encore de vaisselle : la tasse ne se lave pas (son usure ne baisse pas avec ça non plus).' },
  { id: 'evier-vider', kind: 'action', ordre: '(ajout de l’évier)', quoi: 'vider la tasse', detail: 'La tasse se vide dans l’évier seulement quand on la remplit d’eau : pas de geste pour la vider seule.' },
  { id: 'evier-douche', kind: 'action', ordre: '(ajout de l’évier)', quoi: 'se laver entièrement', detail: 'À l’évier, la toilette est faite d’eau sur les mains et le visage (hygiène +40) : pas de douche ni de bain, ni de geste de toilette du corps.' },
  { id: 'gaziniere-bouton', kind: 'action', ordre: '(ajout de la gazinière)', quoi: 'tourner le bouton du feu', detail: 'Le feu s’allume quand le perso arrive devant la gazinière : pas encore de geste de la main pour tourner le bouton.' },
  { id: 'gaziniere-four', kind: 'action', ordre: '(ajout de la gazinière)', quoi: 'utiliser le four', detail: 'La gazinière a un four dessiné, mais sa porte ne s’ouvre pas et on ne peut rien y cuire.' },
  { id: 'cuisine-recettes', kind: 'action', ordre: '(ajout de la gazinière)', quoi: 'cuisiner une recette', detail: 'Un seul ingrédient à la fois cuit tel quel (steak, pomme de terre) : pas de recette qui mélange plusieurs ingrédients, pas d’assaisonnement, pas d’assiette ni de couverts.' },
  { id: 'cuisine-vider', kind: 'action', ordre: '(ajout de la gazinière)', quoi: 'égoutter la casserole', detail: 'L’eau de la casserole ne se vide qu’en la remplissant à nouveau à l’évier, ou en s’évaporant sur le feu : pas de geste pour l’égoutter.' },
  { id: 'cuisine-retourner', kind: 'action', ordre: '(ajout de la gazinière)', quoi: 'retourner le steak', detail: 'Le steak cuit tout seul des deux côtés : pas de spatule ni de geste pour le retourner.' },
];
const KNOWN_KEY = 'rp-island.manques.connus';

/** Ajoute au journal les manques connus pas encore notés dans ce navigateur. */
export function noteKnownMissing(): void {
  let seen: string[] = [];
  try {
    seen = JSON.parse(localStorage.getItem(KNOWN_KEY) ?? '[]');
  } catch {
    // stockage indisponible : on les ajoute pour cette session
  }
  const fresh = KNOWN.filter((k) => !seen.includes(k.id));
  if (!fresh.length) return;
  const at = new Date().toISOString();
  write([...read(), ...fresh.map(({ id: _, ...m }) => ({ ...m, at }))].slice(-MAX));
  try {
    localStorage.setItem(KNOWN_KEY, JSON.stringify([...seen, ...fresh.map((k) => k.id)]));
  } catch {
    // tant pis
  }
}

/** Prévient quand le journal change ; rend la fonction pour se désabonner. */
export function onMissingChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Regroupe par genre et action, les plus fréquents d'abord. */
export function groupMissing(list = read()): MissingGroup[] {
  const groups = new Map<string, MissingGroup>();
  for (const m of list) {
    const k = `${m.kind}|${m.quoi}`;
    const g = groups.get(k) ?? { kind: m.kind, quoi: m.quoi, count: 0, last: m, ordres: [] };
    g.count++;
    g.last = m;
    if (!g.ordres.includes(m.ordre)) g.ordres.push(m.ordre);
    groups.set(k, g);
  }
  const order: MissingKind[] = ['action', 'echec', 'incompris'];
  return [...groups.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.count - a.count);
}

/** Le journal en texte (Markdown), à coller dans une discussion ou un ticket. */
export function missingReport(list = read()): string {
  if (!list.length) return 'Aucun manque noté.';
  const lines = [`# Manques notés (${list.length})`, ''];
  for (const kind of ['action', 'echec', 'incompris'] as MissingKind[]) {
    const groups = groupMissing(list).filter((g) => g.kind === kind);
    if (!groups.length) continue;
    lines.push(`## ${KIND_LABEL[kind]}`, '');
    for (const g of groups) {
      lines.push(`- **${g.quoi}** ×${g.count} : ${g.last.detail}`);
      lines.push(`  - ordres : ${g.ordres.slice(0, 5).map((o) => `« ${o} »`).join(', ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
