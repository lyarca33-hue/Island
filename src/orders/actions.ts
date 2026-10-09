/**
 * Actions de base du perso, que les ordres du joueur enchaînent. Chacune lance un geste (comme
 * un clic du joueur) ; perform() attend qu'il soit fini et rend un compte rendu (lisible par l'IA).
 */
import type { Game } from '../game/Game';
import { euros } from '../game/argent';
import { normalize } from './parser';

export interface ActionDef {
  name: string;
  /** Ce que fait l'action (montré à l'IA). */
  description: string;
  /** Paramètres attendus : nom → description. */
  params: Record<string, string>;
  run(game: Game, args: Record<string, string>): boolean;
}

export const ACTIONS: ActionDef[] = [
  {
    name: 'prendre',
    description: 'Aller prendre un objet portable. Si on tient déjà un livre, un autre livre vient s’ajouter à la pile (6 au plus). Un livre rangé se prend aussi.',
    params: { objet: 'ref de l’objet' },
    run: (g, a) => g.use(a.objet),
  },
  {
    name: 'ranger',
    description: 'Aller ranger dans un meuble de rangement ce qu’on tient, un par un : les livres dans la bibliothèque ; bouteille, aliments (entiers ou coupés) dans le frigo ; la tasse au placard ou au lave-vaisselle ; la lettre dans le tiroir ; pomme, sandwich au four ou au micro-ondes (le perso ouvre la porte ou le tiroir).',
    params: { meuble: 'ref du meuble' },
    // `objet` (facultatif) : ne ranger que lui
    run: (g, a) => g.store(a.meuble, a.objet),
  },
  {
    name: 'poser',
    description: 'Poser devant soi (sur le meuble qui s’y trouve, sinon par terre) l’objet tenu `objet`, ou le dernier pris.',
    params: {},
    run: (g, a) => {
      if (!a.objet) return g.drop();
      const nom = g.describe().objets.find((o) => o.ref === a.objet)?.nom;
      return nom ? g.drop(nom) : false;
    },
  },
  {
    name: 'lire',
    description: 'Ouvrir le livre tenu et le lire (un seul livre en main, l’autre main libre).',
    params: {},
    run: (g) => g.read(),
  },
  {
    name: 'arreter_lire',
    description: 'Fermer le livre qu’on lit.',
    params: {},
    run: (g) => g.stopReading(),
  },
  {
    name: 'aller',
    description: 'Marcher jusqu’à un objet ou un meuble.',
    params: { objet: 'ref de l’objet' },
    run: (g, a) => g.walkTo(a.objet),
  },
  {
    name: 'cafe',
    description: 'Se faire un café : il faut tenir la tasse ; le perso la pose sous la machine puis la reprend pleine.',
    params: {},
    run: (g) => g.makeCoffee(),
  },
  {
    name: 'jus',
    description: 'Se servir un jus de fruits : il faut tenir la tasse et que le mixeur ait mixé des fruits ; le perso la pose sous le bec du mixeur puis la reprend pleine.',
    params: {},
    run: (g) => g.makeJuice(),
  },
  {
    name: 'the',
    description: 'Eau chaude de la bouilloire : il faut tenir la tasse (ou la théière) ; le perso la pose sous le bec puis la reprend pleine. La bouilloire doit avoir de l’eau. Avec un sachet de thé dedans (action sachet), l’eau chaude infuse en thé.',
    params: {},
    run: (g) => g.makeTea(),
  },
  {
    name: 'sachet',
    description: 'Mettre un sachet de thé (la boîte de sachets tenue) dans la tasse ou la théière `dans` (sinon celle qu’on tient).',
    params: { dans: 'ref de la tasse ou de la théière' },
    run: (g, a) => g.addTeaBag(a.dans),
  },
  {
    name: 'infuser',
    description: 'Attendre que le sachet de thé ait infusé l’eau chaude de `objet` (tasse ou théière) : elle devient du thé.',
    params: { objet: 'ref de la tasse ou de la théière' },
    run: (g, a) => g.waitTea(a.objet),
  },
  {
    name: 'boire',
    description: 'Boire une gorgée de ce que contient le récipient tenu (tasse de café, bouteille d’eau ; il ne doit pas être vide).',
    params: {},
    run: (g) => g.drink(),
  },
  {
    name: 'manger',
    description: 'Prendre une bouchée de l’aliment tenu (pomme, sandwich, pain, légumes, morceaux) ; une fois fini, il disparaît et la faim remonte. Sans aliment en main, assis devant une assiette servie avec la fourchette en main : une bouchée de l’assiette (un repas à table rassasie un peu plus).',
    params: {},
    run: (g) => g.eat(),
  },
  {
    name: 'servir',
    description: 'Servir l’aliment tenu (pomme, sandwich) dans une assiette propre et vide (`assiette` facultatif : sinon la plus proche) ; le perso va la poser dedans.',
    params: {},
    run: (g, a) => g.serve(a.assiette),
  },
  {
    name: 'attabler',
    description: 'S’asseoir à table sur la chaise la plus proche de l’assiette (`assiette` facultatif : sinon la plus proche).',
    params: {},
    run: (g, a) => g.sitAtTable(a.assiette),
  },
  {
    name: 'vaisselle',
    description: 'Laver à l’évier la vaisselle tenue (assiette, fourchette, couteau, tasse ; une pièce par main) : posée au fond de la cuve, frottée sous l’eau, puis reprise propre. Les mains ne doivent tenir que de la vaisselle.',
    params: {},
    run: (g) => g.washDishes(),
  },
  {
    name: 'couper',
    description: 'Couper en morceaux l’aliment entier tenu (pomme, pain, carotte, tomate, concombre) : le perso le pose sur la planche à découper, prend le couteau, coupe, puis repose le couteau. Les morceaux restent sur la planche.',
    params: {},
    // `objet` (facultatif) : l'aliment tenu à couper
    run: (g, a) => g.cut(a.objet),
  },
  {
    name: 'preparer',
    description: 'Préparer un plat avec les ingrédients réunis sur la planche à découper (ou dans une assiette) et ceux qu’on tient : salade composée (tranches de tomate + rondelles de concombre, carotte en plus), tartine à la tomate (tranches de pain + tranches de tomate), sandwich au steak (tranches de pain + steak cuit, tomate ou concombre en plus), steak aux pommes de terre (steak cuit + pomme de terre cuite). Le perso pose ce qu’il tient sur la planche, et les ingrédients deviennent le plat.',
    params: {},
    // `plat` (facultatif) : l'id du plat voulu
    run: (g, a) => g.prepare(a.plat),
  },
  {
    name: 'ouvrir',
    description: 'Aller ouvrir la porte d’un meuble (frigo, placard, four, micro-ondes, lave-vaisselle), un tiroir, ou le couvercle de la poubelle.',
    params: { objet: 'ref du meuble' },
    run: (g, a) => g.openDoor(a.objet),
  },
  {
    name: 'fermer',
    description: 'Fermer la porte d’un meuble, un tiroir ou le couvercle de la poubelle.',
    params: { objet: 'ref du meuble' },
    run: (g, a) => g.closeDoor(a.objet),
  },
  {
    name: 'jeter',
    description: 'Jeter à la poubelle l’objet tenu `objet` (ou le dernier pris) : il disparaît.',
    params: {},
    run: (g, a) => {
      if (!a.objet) return g.throwAway();
      const nom = g.describe().objets.find((o) => o.ref === a.objet)?.nom;
      return nom ? g.throwAway(nom) : false;
    },
  },
  {
    name: 'vider_poubelle',
    description: 'Vider la poubelle (sortir le sac).',
    params: { objet: 'ref de la poubelle' },
    run: (g, a) => g.emptyBin(a.objet),
  },
  {
    name: 'eau',
    description: 'Remplir d’eau à l’évier le récipient tenu (tasse, bouteille, casserole ; ce qu’il contenait est vidé dans l’évier) ; le perso le reprend plein. Une tasse sale est seulement rincée.',
    params: {},
    run: (g) => g.fillWater(),
  },
  {
    name: 'allumer',
    description: 'Allumer un appareil : la gazinière (les feux où une poêle ou une casserole est posée), la machine à café, ou mettre en marche le four, le micro-ondes, le lave-vaisselle (ils cuisent ou lavent ce qui est dedans ; l’action finit quand ils sonnent).',
    params: { objet: 'ref de l’appareil' },
    // `ustensile` (facultatif) : seulement le feu sous lui
    run: (g, a) => (g.isLamp(a.objet) ? g.switchLamp(a.objet, true) : g.isAppliance(a.objet) ? g.startAppliance(a.objet) : g.switchOn(a.objet, false, a.ustensile)),
  },
  {
    name: 'eteindre',
    description: 'Éteindre un appareil (tous les feux de la gazinière, la machine à café, le four…).',
    params: { objet: 'ref de l’appareil' },
    run: (g, a) => (g.isLamp(a.objet) ? g.switchLamp(a.objet, false) : g.isAppliance(a.objet) ? g.stopAppliance(a.objet) : g.switchOff(a.objet, false, a.ustensile)),
  },
  {
    name: 'mettre_sur_feu',
    description: 'Poser la poêle ou la casserole tenue sur un feu libre de la gazinière.',
    params: { objet: 'ref de la gazinière' },
    run: (g, a) => g.putOnFire(a.objet),
  },
  {
    name: 'mettre_dans',
    description: 'Mettre l’ingrédient tenu dans un ustensile posé : le steak dans la poêle, la pomme de terre dans la casserole.',
    params: { ustensile: 'ref de l’ustensile' },
    run: (g, a) => g.putInPan(a.ustensile),
  },
  {
    name: 'attendre_cuisson',
    description: 'Attendre qu’un ingrédient sur le feu allumé soit cuit.',
    params: { objet: 'ref de l’ingrédient' },
    run: (g, a) => g.waitCooked(a.objet),
  },
  {
    name: 'verser',
    description: 'Verser le contenu du récipient tenu (bouteille d’eau, tasse, casserole) dans `dans` : un autre récipient (posé, ou tenu dans l’autre main), ou la bouilloire (de l’eau seulement, pour la remplir). Sans `dans` : l’autre main, sinon le récipient le plus proche.',
    params: {},
    // `dans` (facultatif) : ref du récipient ou de la bouilloire
    run: (g, a) => g.pourInto(a.dans),
  },
  {
    name: 'vider_recipient',
    description: 'Vider dans l’évier ce que contient le récipient tenu (tasse, bouteille, casserole ; dans la casserole, les pommes de terre restent : on égoutte).',
    params: {},
    run: (g) => g.emptyHeld(),
  },
  {
    name: 'robinet',
    description: 'Ouvrir (`etat` = ouvrir) ou fermer (`etat` = fermer) le robinet de l’évier. Ouvert, il coule jusqu’à ce qu’on le ferme ; évier bouché, la cuve se remplit puis déborde.',
    params: { etat: 'ouvrir ou fermer' },
    run: (g, a) => g.setTap(a.etat !== 'fermer', a.objet),
  },
  {
    name: 'bouchon',
    description: 'Boucher l’évier (`etat` = mettre) ou enlever le bouchon (`etat` = enlever, l’eau de la cuve s’écoule).',
    params: { etat: 'mettre ou enlever' },
    run: (g, a) => g.setPlug(a.etat !== 'enlever', a.objet),
  },
  {
    name: 'boire_robinet',
    description: 'Boire au robinet de l’évier, dans le creux des mains (les mains doivent être libres).',
    params: {},
    run: (g) => g.drinkAtTap(),
  },
  {
    name: 'charger_lave_vaisselle',
    description: 'Charger d’un coup au lave-vaisselle toute la vaisselle sale qui traîne (deux pièces par voyage). Une assiette où il reste à manger reste là.',
    params: {},
    run: (g) => g.loadDishwasher(),
  },
  {
    name: 'pastille',
    description: 'Mettre une pastille dans le lave-vaisselle (il faut tenir la boîte de pastilles, rangée au placard). Sans pastille, le lavage rate : la vaisselle reste sale.',
    params: {},
    run: (g) => g.addTablet(),
  },
  {
    name: 'vider_lave_vaisselle',
    description: 'Vider le lave-vaisselle arrêté : la vaisselle propre part à sa place (placard, tiroir). Les mains doivent être vides.',
    params: {},
    run: (g) => g.unloadDishwasher(),
  },
  {
    name: 'ranger_chaise',
    description: 'Ranger la chaise sous la table : le perso la prend par le dossier et la pousse. Les mains doivent être vides.',
    params: { objet: 'ref de la chaise' },
    run: (g, a) => g.slideChair(a.objet, true),
  },
  {
    name: 'tirer_chaise',
    description: 'Tirer la chaise de sous la table (pour s’asseoir ; « s’asseoir » la tire aussi tout seul). Les mains doivent être vides.',
    params: { objet: 'ref de la chaise' },
    run: (g, a) => g.slideChair(a.objet, false),
  },
  {
    name: 'essuyer_table',
    description: 'Essuyer les miettes laissées sur la table après un repas (il faut tenir l’éponge, près de l’évier).',
    params: {},
    run: (g, a) => g.wipeTable(a.objet),
  },
  {
    name: 'poser_sur',
    description: 'Poser l’objet tenu `objet` (sinon le dernier pris) sur l’objet `sur` : le plateau (ce qui est dessus part avec lui quand on le porte), une assiette vide (pour empiler)…',
    params: { sur: 'ref de l’objet où poser' },
    run: (g, a) => g.putOn(a.sur, a.objet),
  },
  {
    name: 'empiler',
    description: 'Empiler les assiettes propres qui traînent sur une seule ; prendre celle du dessous emporte toute la pile. Les mains doivent être vides.',
    params: {},
    run: (g) => g.stackPlates(),
  },
  {
    name: 'essuyer_sol',
    description: 'Essuyer les flaques d’eau par terre (l’évier qui a débordé) avec l’éponge tenue ; elles ne sèchent pas toutes seules.',
    params: {},
    run: (g) => g.cleanFloor(),
  },
  {
    name: 'balayer',
    description: 'Balayer par terre avec le balai tenu : les éclats de verre ou de vaisselle cassée (on se coupe en marchant dessus) et les miettes ; la pelle finit à la poubelle.',
    params: {},
    run: (g) => g.sweepFloor(),
  },
  {
    name: 'serpillere',
    description: 'Passer la serpillière tenue sur les flaques par terre (les grosses flaques, l’éponge ne suffit pas).',
    params: {},
    run: (g) => g.mopFloor(),
  },
  {
    name: 'nettoyer',
    description: 'Nettoyer au spray (tenu) puis à l’éponge (tenue) une surface tachée par la cuisine : plan de travail, gazinière, îlot. `objet` facultatif (la plus proche).',
    params: { objet: 'ref de la surface tachée' },
    run: (g, a) => g.cleanSurface(a.objet),
  },
  {
    name: 'gants',
    description: 'Enfiler (etat « mettre », les gants pris au placard) ou enlever (« enlever ») les gants de ménage : ils protègent les mains à la vaisselle ; on ne mange pas avec.',
    params: { etat: '« mettre » ou « enlever »' },
    run: (g, a) => (a.etat === 'enlever' ? g.takeOffGloves() : g.putOnGloves()),
  },
  {
    name: 'sortir_poubelle',
    description: 'Fermer le sac de la poubelle de la cuisine et le porter au conteneur dehors (le camion le vide à 6 h). Il faut ensuite remettre un sac neuf.',
    params: {},
    run: (g) => g.takeOutTrash(),
  },
  {
    name: 'sac_neuf',
    description: 'Mettre un sac neuf (du rouleau de sacs poubelle, au placard) dans la poubelle `objet` qui n’en a plus.',
    params: { objet: 'ref de la poubelle' },
    run: (g, a) => g.newBinBag(a.objet),
  },
  {
    name: 'heure',
    description: 'Regarder l’horloge de la cuisine : le perso dit l’heure.',
    params: {},
    run: (g) => g.readClock(),
  },
  {
    name: 'essuyer_vaisselle',
    description: 'Essuyer au torchon tenu la vaisselle mouillée `objet` (tenue dans l’autre main, ou posée ; sinon la plus proche). Sortie de l’évier, la vaisselle est mouillée ; sur l’égouttoir elle sèche seule.',
    params: { objet: 'ref de la pièce mouillée' },
    run: (g, a) => g.dryDish(a.objet),
  },
  {
    name: 'lire_liste',
    description: 'Lire la liste de courses : ce qui manque à la maison (le stock voulu de chaque aliment, moins ce qu’il y a).',
    params: {},
    run: (g) => g.readList(),
  },
  {
    name: 'commander_courses',
    description: 'Commander ce qui manque sur la liste de courses : un sac de courses est livré devant la porte d’entrée une demi-heure de jeu plus tard.',
    params: {},
    run: (g) => g.orderGroceries(),
  },
  {
    name: 'ranger_courses',
    description: 'Ranger le sac de courses `objet` (sinon le plus proche) : le perso le porte au frigo, au congélateur et au garde-manger, chaque aliment à sa place ; le sac vide disparaît.',
    params: { objet: 'ref du sac de courses' },
    run: (g, a) => g.unpackGroceries(a.objet),
  },
  {
    name: 'essuyer_mains',
    description: 'S’essuyer les mains au torchon tenu, après les avoir lavées.',
    params: {},
    run: (g) => g.dryHands(),
  },
  {
    name: 'mettre_table',
    description: 'Mettre la table devant la chaise : une assiette, une fourchette et un couteau de table propres, pris au placard et au tiroir, posés chacun à sa place. Les mains doivent être vides.',
    params: {},
    run: (g) => g.setTable(),
  },
  {
    name: 'debarrasser',
    description: 'Débarrasser la table : la vaisselle sale part au lave-vaisselle, la propre à sa place, deux pièces par voyage. Une assiette où il reste à manger reste sur la table. Les mains doivent être vides.',
    params: {},
    run: (g) => g.clearTable(),
  },
  {
    name: 'couper_assiette',
    description: 'Assis à table devant l’assiette servie, le couteau de table en main : couper le plat en bouchées (elles se mangent ensuite deux fois plus vite).',
    params: {},
    run: (g) => g.cutInPlate(),
  },
  {
    name: 'regarder_dedans',
    description: 'Aller ouvrir un meuble (frigo, congélateur, placard, tiroir) et regarder ce qu’il contient (le compte rendu le dit).',
    params: { objet: 'ref du meuble' },
    run: (g, a) => g.lookInside(a.objet),
  },
  {
    name: 'ranger_place',
    description: 'Ranger ce qu’on tient à sa place, sans nommer le meuble : aliments et bouteille au frigo, bac à glaçons et lasagne au congélateur, tasse et assiette au placard, couverts et lettre au tiroir, livres à la bibliothèque.',
    params: {},
    run: (g) => g.storeAway(),
  },
  {
    name: 'laisser_ouvert',
    description: 'Ouvrir la porte (ou le tiroir) d’un meuble et la laisser ouverte : elle ne se referme plus seule quand le perso s’éloigne.',
    params: { objet: 'ref du meuble' },
    run: (g, a) => g.keepOpen(a.objet),
  },
  {
    name: 'glacons',
    description: 'Mettre des glaçons dans une tasse (il faut tenir le bac à glaçons, rangé au congélateur ; `dans` facultatif : la tasse visée). Une boisson avec glaçons désaltère un peu plus.',
    params: {},
    run: (g, a) => g.addIce(a.dans),
  },
  {
    name: 'laver_mains',
    description: 'Se laver les mains à l’évier (les mains doivent être libres).',
    params: {},
    run: (g) => g.washHands(),
  },
  {
    name: 'se_laver',
    description: 'Faire sa toilette à l’évier : de l’eau sur les mains et le visage (les mains doivent être libres).',
    params: {},
    run: (g) => g.wash(),
  },
  {
    name: 'douche',
    description: 'Prendre une douche (les mains doivent être libres) : l’hygiène remonte à fond. On en sort mouillé : se sécher ensuite avec la serviette.',
    params: {},
    run: (g) => g.takeShower(),
  },
  {
    name: 'secher',
    description: 'Se sécher avec la serviette (prise sur le porte-serviettes si on ne la tient pas). Mouillé et pas séché, le perso laisse des gouttes par terre.',
    params: {},
    run: (g) => g.dryOff(),
  },
  {
    name: 'toilettes',
    description: 'Aller aux toilettes : le perso lève le couvercle, s’assoit, la vessie se vide, puis il se relève et tire la chasse. Penser à se laver les mains ensuite.',
    params: {},
    run: (g) => g.useToilet(),
  },
  {
    name: 'chasse',
    description: 'Tirer la chasse d’eau des toilettes.',
    params: {},
    run: (g) => g.flush(),
  },
  {
    name: 'verrou',
    description: 'Fermer à clé (`fermer` oui) ou déverrouiller (non) la porte de la salle de bain, de l’intérieur. Fermée à clé, elle ne s’ouvre plus ; le perso la déverrouille en sortant.',
    params: { fermer: 'oui ou non' },
    run: (g, a) => g.lockDoor(a.fermer !== 'non'),
  },
  {
    name: 'aller_piece',
    description: 'Aller dans une pièce de la maison (pour l’instant, seulement la cuisine) : le perso s’arrête juste après l’entrée.',
    params: { piece: 'cuisine' },
    run: (g, a) => g.walkToRoom(a.piece),
  },
  {
    name: 'asseoir',
    description: 'Aller s’asseoir sur un siège (chaise posée debout par terre, rien dessus). Les objets tenus d’une main restent en main. Le perso se lève tout seul pour toute autre action qui le fait bouger.',
    params: { siege: 'ref du siège' },
    run: (g, a) => g.sit(a.siege),
  },
  {
    name: 'lever',
    description: 'Se lever quand on est assis.',
    params: {},
    run: (g) => g.standUp(),
  },
  {
    name: 'casser_oeuf',
    description: 'Casser l’œuf tenu dans `dans` : le saladier (pour une omelette ou une pâte à crêpes) ou la poêle (un œuf au plat, qui cuit sur le feu). Sans `dans` : le saladier tenu ou proche, sinon la poêle.',
    params: {},
    // `dans` (facultatif) : ref du saladier ou de la poêle
    run: (g, a) => g.crackEgg(a.dans),
  },
  {
    name: 'ajouter_saladier',
    description: 'Verser dans le saladier l’ingrédient sec tenu : farine, sucre ou levure (le lait se verse avec « verser »).',
    params: {},
    run: (g, a) => g.addToBowl(a.saladier),
  },
  {
    name: 'fouetter',
    description: 'Mélanger le saladier (tenu ou posé) au fouet ou à la cuillère en bois tenus : œufs seuls → œufs battus (omelette) ; œuf, lait et farine → pâte à crêpes.',
    params: {},
    run: (g, a) => g.mixBowl(a.saladier),
  },
  {
    name: 'verser_pate',
    description: 'Verser la préparation du saladier tenu (œufs battus, pâte à crêpes) dans la poêle `poele` (sinon celle sur le feu) : une omelette, ou une crêpe à la fois.',
    params: {},
    run: (g, a) => g.pourBatter(a.poele),
  },
  {
    name: 'remuer',
    description: 'Remuer à la spatule ou à la cuillère en bois tenues ce qui cuit dans l’ustensile `objet` (sinon celui sur le feu) : sans ça, au bout d’un moment, ça attache et brûle plus vite.',
    params: {},
    run: (g, a) => g.stirPan(a.objet),
  },
  {
    name: 'faire_sauter',
    description: 'Faire sauter ce qui cuit dans la poêle `objet` (sinon celle sur le feu) : une main libre la prend, l’aliment (crêpe, omelette) se retourne en l’air (il peut tomber à côté), la poêle revient sur le feu.',
    params: {},
    run: (g, a) => g.tossPan(a.objet),
  },
  {
    name: 'servir_poele',
    description: 'Servir à la spatule (ou à la louche) tenue ce qui est cuit dans la poêle ou la casserole `objet` (sinon la plus proche) dans l’assiette posée `assiette` (sinon la plus proche, propre et vide).',
    params: {},
    run: (g, a) => g.serveFromPan(a.assiette, a.objet),
  },
  {
    name: 'assaisonner',
    description: 'Assaisonner avec le pot d’épices tenu (sel, poivre, paprika, herbes de Provence, huile d’olive) ou la sauce tenue (ketchup, mayonnaise, moutarde, vinaigre, crème, citron, ail) ce qu’il y a dans ou sur `objet` : la poêle, l’assiette, la planche (sinon l’aliment tenu, la poêle sur le feu, l’assiette servie).',
    params: {},
    run: (g, a) => g.season(a.objet),
  },
  {
    name: 'tartiner',
    description: 'Tartiner `objet` (tranches de pain, pain grillé, crêpe cuite ; sinon le plus proche) avec le pot tenu (confiture, miel, pâte à tartiner, beurre) et un couteau dans l’autre main.',
    params: {},
    run: (g, a) => g.spread(a.objet),
  },
  {
    name: 'raper',
    description: 'Râper le fromage tenu, à la râpe tenue dans l’autre main, sur `objet` : le plat de l’assiette, la poêle, ou la planche (un tas de fromage râpé).',
    params: {},
    run: (g, a) => g.grate(a.objet),
  },
  {
    name: 'gouter',
    description: 'Goûter à la cuillère tenue ce qu’il y a dans `objet` (poêle, assiette, saladier ; sinon la poêle sur le feu) : le perso dit si c’est cuit, brûlé, fade ou bon.',
    params: {},
    run: (g, a) => g.taste(a.objet),
  },
  {
    name: 'geste',
    description: 'Faire sur l’objet `objet` le geste de son menu (clic droit) dont le nom commence par `geste` : « Lancer un lavage », « Étendre le linge », « Pêcher », « Arroser le potager », « Cueillir une pomme »…',
    params: { objet: 'ref de l’objet', geste: 'début du nom du geste' },
    run: (g, a) => {
      const key = normalize(a.geste);
      const entries = g.menuOf(a.objet);
      const entry = entries.find((e) => normalize(e.label).startsWith(key));
      if (entry) return entry.run();
      g.onNotice?.(entries.length ? `Pas possible pour l’instant (${a.objet}) : ${a.geste.toLowerCase()}.` : `Aucun objet « ${a.objet} ».`);
      return false;
    },
  },
  {
    name: 'magasin',
    description: 'Ouvrir le magasin (épicerie et rayon maison) pour choisir ce qu’on achète.',
    params: {},
    run: (g) => g.openShop(),
  },
  {
    name: 'acheter',
    description: 'Commander et payer au magasin : `objets` est une liste « id×nombre » séparée par des virgules (ex. « tomate×2,lait×1 ») ; tout arrive par le livreur, devant la porte.',
    params: { objets: 'id×nombre, séparés par des virgules' },
    run: (g, a) => g.placeOrder(a.objets.split(',').map((l) => {
      const [id, n] = l.split('×');
      return { id, n: Math.max(1, Number(n) || 1) };
    })),
  },
  {
    name: 'vendre',
    description: 'Vendre au marché l’objet `objet` (plats faits maison) ; sans `objet`, tout ce que le marché rachète.',
    params: {},
    run: (g, a) => (a.objet ? g.sellItem(a.objet) : g.sellAll()),
  },
  {
    name: 'argent',
    description: 'Dire combien il reste dans le porte-monnaie.',
    params: {},
    run: (g) => {
      g.onNotice?.(`Il reste ${euros(g.argent.money)} dans le porte-monnaie.`);
      return true;
    },
  },
  {
    name: 'dire',
    description: 'Le perso dit une phrase (bulle au-dessus de sa tête).',
    params: { texte: 'la phrase' },
    run: (g, a) => {
      g.say(a.texte);
      return true;
    },
  },
];

export const ACTION_BY_NAME = new Map(ACTIONS.map((a) => [a.name, a]));

/** Durée maximale d'une action, en images (40 s à 60 i/s) : au-delà, on on abandonne. */
const MAX_FRAMES = 2400;

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Lance l'action, attend la fin du geste et rend « ok » ou « échec », avec les messages du jeu. */
export async function perform(game: Game, name: string, args: Record<string, string>, signal?: AbortSignal): Promise<{ ok: boolean; report: string }> {
  const def = ACTION_BY_NAME.get(name);
  if (!def) return { ok: false, report: `échec : action inconnue « ${name} »` };
  for (const p of Object.keys(def.params)) {
    if (!args[p]) return { ok: false, report: `échec : paramètre « ${p} » manquant` };
  }
  // les messages du jeu (« les mains sont prises »...) servent de compte rendu
  const notices: string[] = [];
  const show = game.onNotice;
  game.onNotice = (t) => {
    notices.push(t);
    show?.(t);
  };
  try {
    const started = def.run(game, args);
    if (!started) return { ok: false, report: `échec${notices.length ? ` : ${notices.join(' ')}` : ''}` };
    // fini quand plus rien ne bouge pendant quelques images d'affilée
    let calm = 0;
    let frames = 0;
    while (calm < 3) {
      await nextFrame();
      if (signal?.aborted) return { ok: false, report: 'interrompu' };
      calm = game.idle ? calm + 1 : 0;
      if (++frames > MAX_FRAMES) return { ok: false, report: 'échec : trop long, action abandonnée' };
    }
    return { ok: true, report: `ok${notices.length ? ` (${notices.join(' ')})` : ''}` };
  } finally {
    game.onNotice = show;
  }
}
