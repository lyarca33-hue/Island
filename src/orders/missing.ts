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
