/**
 * Les pièces de la maison, dans l'ordre où elles sont construites : pour l'instant la cuisine
 * seule, construite avec le kit Tripo (kit.ts). Pour ajouter une pièce : une fiche RoomSpec dans
 * son fichier, ajoutée ici ; la pièce voisine reçoit le passage dans ses `doors` et le mur mitoyen
 * dans ses `joined`.
 */
import { KITCHEN, type RoomSpec } from './room';

export const ROOMS: RoomSpec[] = [KITCHEN];
