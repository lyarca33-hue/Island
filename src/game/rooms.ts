/**
 * Les pièces de la maison, dans l'ordre où elles sont construites : la cuisine (room.ts), puis les
 * pièces autour, vides en attendant leurs meubles (maison.ts), toutes habillées avec le kit Tripo
 * (kit.ts). Pour ajouter une pièce : une fiche RoomSpec, ajoutée ici ; la pièce voisine reçoit le
 * passage dans ses `doors` et le mur mitoyen dans ses `joined`.
 */
import { KITCHEN, type RoomSpec } from './room';
import { CHAMBRE_SPEC, ENTREE_SPEC, GARAGE_SPEC, SALLE_DE_BAIN_SPEC, SALON_SPEC } from './maison';

export const ROOMS: RoomSpec[] = [KITCHEN, ENTREE_SPEC, GARAGE_SPEC, SALON_SPEC, SALLE_DE_BAIN_SPEC, CHAMBRE_SPEC];
