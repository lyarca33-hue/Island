/**
 * Boîte (largeur x, hauteur y, profondeur z, en m) de chaque modèle des packs de Quaternius,
 * posé au sol et centré. Fichier écrit par tools/build_pack_assets.mjs : ne pas modifier à la main.
 */
export const PACK_SIZES = {
  nourriture: {
    "Apple": [0.802, 0.852, 0.799],
    "Banana": [1.175, 1.404, 0.309],
    "Bread": [0.693, 0.847, 1.199],
    "ChickenLeg": [1.399, 0.582, 0.612],
    "ChocolateBar": [0.575, 0.068, 0.874],
    "Egg_Fried": [1.192, 0.107, 1.117],
    "Egg_Whole": [0.363, 0.466, 0.363],
    "KetchupBottle": [0.5, 1.533, 0.5],
    "Lettuce_Whole": [1.661, 1.368, 1.661],
    "MayoBottle": [0.5, 1.533, 0.5],
    "Orange": [0.745, 0.742, 0.745],
    "Pepper_Red": [0.674, 1.106, 0.712],
    "Pizza": [3.372, 0.161, 3.357],
    "Steak": [1.32, 0.34, 1.913],
    "Tomato": [0.752, 0.626, 0.752],
  },
} as const satisfies Record<string, Record<string, readonly [number, number, number]>>;

export type PackId = keyof typeof PACK_SIZES;
export type ModelName<P extends PackId> = keyof (typeof PACK_SIZES)[P] & string;
