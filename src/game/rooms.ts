/**
 * Les pièces de la maison, dans l'ordre où elles sont construites. Pour ajouter une pièce : une
 * fiche RoomSpec dans son fichier (comme salon.ts), ajoutée ici ; la pièce voisine reçoit le
 * passage dans ses `doors` et le mur mitoyen dans ses `joined`.
 */
import { KITCHEN, ROOM, type RoomSpec } from './room';
import { SALON_SPEC } from './salon';
import { CHAMBRE_SPEC } from './chambre';
import { BATHROOM_SPEC } from './salle-de-bain';
import { ENTREE_SPEC } from './entree';
import { CUISINE_SEULE } from './carte';

/**
 * La cuisine seule (carte.ts) : la porte de l'entrée devient la porte d'entrée de la maison, le
 * passage vers le salon est muré, le toit déborde des quatre côtés, et le conteneur des sacs
 * poubelle attend dehors, près de la porte.
 */
const KITCHEN_ALONE: RoomSpec = {
  ...KITCHEN,
  doors: [{ ...KITCHEN.doors[0], leaf: true }],
  joined: [],
  items: (KITCHEN.items ?? []).map((it) => (it[0] === 'conteneur' ? ['conteneur', ROOM.x0 - 0.9, 0, 0.6, 0] : it)),
};

export const ROOMS: RoomSpec[] = CUISINE_SEULE ? [KITCHEN_ALONE] : [KITCHEN, SALON_SPEC, CHAMBRE_SPEC, BATHROOM_SPEC, ENTREE_SPEC];
