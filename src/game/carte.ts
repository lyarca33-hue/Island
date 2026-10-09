/**
 * Quelle carte charger : la cuisine seule (nouvelle carte, refaite pièce par pièce avec les assets
 * Tripo) ou l'ancienne maison complète (salon, chambre, salle de bain, entrée, jardin, paysage),
 * gardée le temps de la transition pour comparer. Réglage mémorisé dans le navigateur ; `?carte=`
 * dans l'adresse le force (tests). Changer de carte recharge la page : chaque carte a sa partie.
 */

export type Carte = 'cuisine' | 'ancienne';

export const CARTES: Array<[Carte, string]> = [['cuisine', 'Cuisine seule'], ['ancienne', 'Ancienne maison']];

const CARTE_KEY = 'island-carte';

function isCarte(v: unknown): v is Carte {
  return v === 'cuisine' || v === 'ancienne';
}

function readCarte(): Carte {
  try {
    const forced = new URLSearchParams(window.location.search).get('carte');
    if (isCarte(forced)) return forced;
    const kept = localStorage.getItem(CARTE_KEY);
    if (isCarte(kept)) return kept;
  } catch {
    // hors navigateur (tests) ou stockage indisponible
  }
  return 'cuisine';
}

/** La carte de cette partie (fixée au chargement de la page). */
export const CARTE: Carte = readCarte();

/** Cuisine seule : sans chambre ni salle de bain, la fatigue, l'hygiène et la vessie sont en pause. */
export const CUISINE_SEULE = CARTE === 'cuisine';

/** Suffixe des clés de sauvegarde : l'ancienne carte garde les siennes telles quelles. */
export const CARTE_SUFFIX = CUISINE_SEULE ? '-cuisine' : '';

/** Change de carte (mémorisé) et recharge la page. */
export function switchCarte(c: Carte): void {
  try {
    localStorage.setItem(CARTE_KEY, c);
  } catch {
    // stockage indisponible : on passe par l'adresse
  }
  const url = new URL(window.location.href);
  url.searchParams.delete('carte');
  if (c !== readStored()) url.searchParams.set('carte', c);
  window.location.assign(url.toString());
}

function readStored(): Carte | null {
  try {
    const v = localStorage.getItem(CARTE_KEY);
    return isCarte(v) ? v : null;
  } catch {
    return null;
  }
}
