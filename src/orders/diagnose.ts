/**
 * Diagnostic du détecteur de manques : la cause probable d'un échec (« mains prises », « objet
 * absent »…) et la situation du perso à ce moment-là, pour que le journal dise pourquoi, pas
 * seulement quoi.
 */
import type { Game } from '../game/Game';
import type { Step } from './tasks';

/** Causes reconnues dans les messages d'échec du jeu, de la plus précise à la plus vague. */
const CAUSES: Array<[RegExp, string]> = [
  [/^interrompu/i, 'interrompu'],
  [/aucun objet «|il n’y a (pas|rien)|il n'y a (pas|rien)|aucun livre|aucun siège/i, 'objet absent de la pièce'],
  [/rien en main/i, 'rien en main'],
  [/pose d’abord|pose d'abord|deux mains|mains (sont )?prises|mains pleines/i, 'mains prises'],
  [/ferme d’abord|ferme d'abord|tu déplaces/i, 'perso occupé'],
  [/pas assez de place|il y a .+ sur |pas debout/i, 'pas de place'],
  [/est vide/i, 'récipient vide'],
  [/on ne s’assoit pas|on ne s'assoit pas|ne peut pas|crée un perso/i, 'impossible avec cet objet ou ce perso'],
  [/trop long|abandonnée|bloqué|chemin/i, 'trajet ou geste bloqué'],
  [/action inconnue|paramètre/i, 'tâche mal formée'],
];

/** Cause probable d'un échec d'après le message du jeu (« autre » si rien ne correspond). */
export function failureCause(message: string): string {
  return CAUSES.find(([re]) => re.test(message))?.[1] ?? 'autre';
}

/** Ce que le perso tient et fait (« tient : tasse-1 ; assis sur chaise-1 »), étape en cours comprise. */
export function situation(game: Game, step?: Step | null): string {
  const w = game.describe();
  const bits: string[] = [];
  const held = w.mains.filter((l) => l.length).map((l) => l.join(' + '));
  bits.push(held.length ? `tient : ${held.join(' et ')}` : 'mains vides');
  const assis = w.perso.match(/assis sur (.+)$/);
  if (assis) bits.push(`assis sur ${assis[1]}`);
  if (w.lit) bits.push(`lit ${w.lit}`);
  if (step) bits.push(`à l’étape « ${step.name}${Object.values(step.args).length ? ` ${Object.values(step.args).join(' ')}` : ''} »`);
  return bits.join(' ; ');
}
