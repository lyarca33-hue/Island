/**
 * Objets retirés du jeu : signalés par Greg sur la carte de test (touche A, liste du 13 octobre).
 * Leurs fiches restent dans le code, mais le catalogue (ITEMS, ITEM_BY_ID) les écarte : ils
 * n'apparaissent plus nulle part (maison, frigo, garde-manger, magasin, carte de test), aucune
 * recette ni geste ne les fabrique, et les recettes qui en ont besoin sont retirées avec eux. Pour
 * en remettre un : l'enlever de cette liste.
 */
export const RETIRES = new Set([
  // livres et rangement
  'livre', 'livre-rouge', 'livre-vert', 'livre-ocre', 'caisse',
  // ustensiles, vaisselle et linge de cuisine
  'planche', 'fourchette', 'couteau-table', 'cuillere', 'bac-glacons', 'eponge', 'torchon', 'plateau', 'moule', 'plat-four', 'passoire',
  'pierre-pizza', 'fouet', 'cuillere-bois', 'louche', 'rape', 'chiffon',
  // plats, gâteaux et morceaux
  'quartiers-pomme', 'quartiers-orange', 'lasagne', 'gateau', 'gateau-chocolat', 'gateau-yaourt', 'parts-gateau', 'parts-gateau-chocolat',
  'parts-gateau-yaourt', 'fromage-rape', 'steak-pommes-de-terre', 'gratin-pates', 'gratin-dauphinois', 'salade-composee', 'crepe',
  'tartines-confiture', 'tartines-miel', 'tartines-chocolat', 'tartines-beurre', 'crepe-confiture', 'crepe-miel', 'crepe-chocolat',
  'crepe-beurre', 'riz', 'pates-tomate', 'riz-beurre', 'riz-tomate', 'soupe-legumes', 'soupe-poireaux', 'soupe-brique',
  // provisions et boissons
  'lait', 'legumes-surgeles', 'pizza', 'frites', 'vin', 'eau-gazeuse', 'soda', 'jus-orange', 'citron', 'fraises', 'chips', 'biscuits',
  'levure', 'sauce-tomate', 'pate-tartiner', 'sucre', 'paprika', 'herbes', 'sachets-the', 'paquet-pates', 'paquet-riz', 'brique-soupe',
  // courses, ménage et toilette
  'pastilles', 'liste-courses', 'sac-courses', 'sacs-poubelle', 'sac-poubelle', 'savon',
  // vêtements
  'pull', 'cintre', 'serviette', 'chaussure', 'chausson', 'botte',
  // deuxième liste (13 octobre) : meubles et appareils
  'pot-ustensiles', 'egouttoir', 'congelateur', 'machine-a-cafe', 'etagere-epices', 'armoire', 'lavabo', 'lit', 'toilettes', 'garde-manger',
  'poubelle',
  // troisième liste (13 octobre)
  'assiette', 'conteneur', 'crochets', 'fenetre', 'frigo', 'gaziniere', 'horloge', 'huile', 'ilot', 'jambon', 'livre-violet', 'livre-recettes',
]);

/**
 * Modèles de pack retirés du jeu (deuxième liste, `pack/modèle`) : plus dans la galerie de la carte
 * de test, et un objet qu'ils habillaient (FOOD_LOOKS) reprend son modèle de base.
 */
export const RETIRES_PACK = new Set([
  'utilitaires/bus', 'utilitaires/camion-pompier', 'train/wagon-voyageurs', 'train/locomotive', 'bateaux/bateau-peche-rouge',
  'bateaux/bateau-peche-bleu', 'monuments/phare', 'monuments/moulin-a-vent', 'voitures/voiture-citadine', 'engins/camionnette',
  'guichets/urne', 'pharmacie/boite-medicament',
  'nourriture/Lettuce_Whole', 'nourriture/Orange', 'nourriture/Pizza', 'nourriture/Steak', 'nourriture/Tomato', 'nourriture/MayoBottle',
  'nourriture/KetchupBottle', 'nourriture/Egg_Whole', 'nourriture/Egg_Fried', 'nourriture/ChickenLeg', 'nourriture/Bread',
  'nourriture/Banana', 'nourriture/Apple',
  'aliments/chocolat', 'aliments/fraises-perime', 'aliments/huile', 'plats/livre-recettes',
]);
