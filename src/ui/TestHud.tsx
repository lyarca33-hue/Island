import { useEffect, useReducer } from 'react';

/**
 * Petits outils de l'interface de la carte de test (panneaux Modèles et Cartes).
 */

/** Ce qu'on peut écouter : `listen(fn)` prévient à chaque changement et rend de quoi arrêter. */
export interface Ecoutable {
  listen(fn: () => void): () => void;
}

/** Redessine le composant à chaque changement de `source` ; rend le compte des changements. */
export function useListen(source: Ecoutable | null | undefined): number {
  const [rev, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => source?.listen(refresh), [source]);
  return rev;
}

/** Un réglage touché à la souris : rendre le clavier au perso (ZQSD). */
export const blur = (e: { currentTarget: HTMLElement }) => e.currentTarget.blur();
