/**
 * Les pièces de la maison, dans l'ordre où elles sont construites. Pour ajouter une pièce : une
 * fiche RoomSpec dans son fichier (comme salon.ts), ajoutée ici ; la pièce voisine reçoit le
 * passage dans ses `doors` et le mur mitoyen dans ses `joined`.
 */
import { KITCHEN, type RoomSpec } from './room';
import { SALON_SPEC } from './salon';
import { CHAMBRE_SPEC } from './chambre';
import { BATHROOM_SPEC } from './salle-de-bain';
import { ENTREE_SPEC } from './entree';

export const ROOMS: RoomSpec[] = [KITCHEN, SALON_SPEC, CHAMBRE_SPEC, BATHROOM_SPEC, ENTREE_SPEC];
