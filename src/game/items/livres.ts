/**
 * Les livres de la maison : un titre et une petite histoire en quelques pages, par sorte de livre
 * (id du catalogue). Le livre de recettes n'est pas ici : le lire ouvre la liste des recettes.
 * Le marque-page (dernière page laissée) est gardé dans le navigateur, un par sorte de livre.
 */

export interface Livre {
  title: string;
  author: string;
  pages: string[];
}

export const LIVRES: Record<string, Livre> = {
  livre: {
    title: 'Le Phare de l’île aux Mouettes',
    author: 'Hélène Marin',
    pages: [
      'Sur la pointe nord de l’île, le vieux phare ne s’allumait plus depuis dix ans. Les bateaux de pêche rentraient avant la nuit, et les mouettes avaient fait leur nid tout en haut, dans la grande lanterne éteinte.',
      'Un matin de septembre, Lou trouva la clé rouillée au fond d’une boîte à biscuits, dans le grenier de sa grand-mère. Une étiquette en carton y pendait encore : « Phare – ne pas perdre ».',
      'Elle grimpa les cent douze marches en comptant à voix haute. En haut, le vent sifflait dans les vitres fêlées, et une mouette la regarda d’un œil sévère, comme une gardienne dérangée dans son travail.',
      'Il fallut trois semaines pour tout nettoyer : la poussière, les plumes, les toiles d’araignée grandes comme des draps. Le soir, Lou rentrait les mains noires et le cœur léger.',
      'Le premier soir d’octobre, un brouillard épais tomba sur la mer. On entendait au loin le moteur du bateau de Marcel, qui cherchait le port à l’aveugle.',
      'Lou tourna l’interrupteur. La lanterne grésilla, hésita, puis s’alluma d’un coup, balayant la brume de son grand bras doré. Au port, on vit le bateau de Marcel apparaître, droit comme une flèche.',
      'Depuis, le phare brille chaque nuit. Les mouettes ont déménagé un étage plus bas, et Lou monte les cent douze marches tous les soirs, en comptant toujours à voix haute. Fin.',
    ],
  },
  'livre-rouge': {
    title: 'La Soupe de minuit',
    author: 'Pierre Dufour',
    pages: [
      'Monsieur Albert ne dormait jamais avant minuit. À minuit pile, il descendait à la cuisine en pantoufles et préparait une soupe. Personne ne savait pourquoi, pas même lui.',
      'Ce soir-là, il n’y avait presque rien dans le frigo : une carotte fatiguée, un poireau, un bout de fromage et un œuf. « Ça fera l’affaire », dit-il au chat, qui n’était pas d’accord.',
      'Pendant que l’eau chauffait, on frappa à la porte. C’était sa voisine, Madame Rose, en robe de chambre : « J’ai vu de la lumière. Je ne dors pas non plus. » Elle tenait une pomme de terre.',
      'Dix minutes plus tard, le facteur de nuit passa, puis le boulanger qui commençait sa journée, puis deux enfants qui avaient fait un cauchemar. Chacun apporta quelque chose : du thym, du pain, une gousse d’ail.',
      'À une heure du matin, la cuisine était pleine. La soupe débordait presque de la marmite, et elle sentait si bon que le chat lui-même changea d’avis.',
      'On la mangea tous ensemble, assis partout, sur les chaises, sur le plan de travail, sur les marches. Puis chacun rentra chez soi et dormit comme un bébé.',
      'Depuis, à minuit, la porte de Monsieur Albert reste entrouverte. Il paraît qu’il n’a plus jamais mangé sa soupe seul. Fin.',
    ],
  },
  'livre-vert': {
    title: 'Le Jardin qui parlait',
    author: 'Camille Verdier',
    pages: [
      'Quand Noé s’installa dans la petite maison au bord de l’eau, le jardin n’était qu’un carré d’herbes folles et de cailloux. « Rien ne pousse ici », lui avait dit l’ancien propriétaire.',
      'Noé planta quand même des tomates, des radis et un rang de tournesols. Chaque matin, il les arrosait en leur racontant sa journée, parce qu’il n’avait personne d’autre à qui parler.',
      'Un jour de grosse chaleur, il crut entendre un murmure sous les feuilles : « Plus d’eau, s’il te plaît. » Il regarda autour de lui. Il n’y avait que les tomates.',
      'Il arrosa, un peu inquiet pour sa santé. Le lendemain, les radis demandèrent de l’ombre, et les tournesols se plaignirent des escargots. Noé décida de ne le dire à personne.',
      'Le jardin devint le plus beau de l’île. Les voisins venaient voir les tomates grosses comme des poings et les tournesols plus hauts que le toit. « Quel est ton secret ? » demandaient-ils.',
      '« J’écoute », répondait Noé. Les voisins riaient, croyant à une blague. Mais certains, en rentrant chez eux, se surprirent à murmurer quelques mots à leurs géraniums.',
      'Et cet été-là, sur toute l’île, les jardins fleurirent comme jamais. Fin.',
    ],
  },
  'livre-ocre': {
    title: 'Le Voyage de la bouteille',
    author: 'Jules Sablon',
    pages: [
      'La bouteille avait été jetée à la mer un soir d’été, très loin, par une petite fille qui voulait un ami. Dedans, un papier roulé : « Si tu me trouves, écris-moi. Je m’appelle Inès. »',
      'Elle flotta pendant des mois. Une tortue la poussa du nez, une tempête la fit tourner sur elle-même, et un dauphin joua avec elle tout un après-midi avant de l’oublier.',
      'Un matin d’hiver, elle s’échoua sur la plage de l’île, entre deux rochers couverts d’algues. Le soleil se levait à peine quand Tom, qui ramassait des coquillages, la vit briller.',
      'Il déroula le papier avec précaution. L’encre avait un peu coulé, mais on pouvait encore lire le nom et l’adresse, dans un pays dont il n’avait jamais entendu parler.',
      'Tom écrivit une longue lettre. Il parla de l’île, du phare, de la boulangerie, de son chat qui volait des sardines. Il la posta au village, sans trop y croire.',
      'Trois mois plus tard, une enveloppe pleine de timbres étranges arriva. Inès avait grandi ; elle avait maintenant des enfants. Elle avait pleuré de joie en lisant la lettre de Tom.',
      'Ils s’écrivent encore aujourd’hui, une lettre par saison. Et chaque été, Tom jette une bouteille à la mer, au cas où quelqu’un, quelque part, chercherait un ami. Fin.',
    ],
  },
  'livre-violet': {
    title: 'Les Étoiles de Mamie Jo',
    author: 'Aurore Lune',
    pages: [
      'Mamie Jo avait un télescope en cuivre sur son balcon. Les soirs sans nuage, elle appelait sa petite-fille Maya : « Viens vite, le ciel est ouvert ! »',
      'Elle connaissait le nom de toutes les étoiles, ou presque. Celles qu’elle ne connaissait pas, elle leur en inventait un : l’Étoile-Biscotte, la Grande Chaussette, le Petit Chat qui dort.',
      '« Ce ne sont pas les vrais noms », protestait Maya. « Les vrais noms, ce sont ceux qu’on retient », répondait Mamie Jo en lui tendant une tasse de chocolat chaud.',
      'Un hiver, Mamie Jo partit vivre chez sa sœur, de l’autre côté de la mer. Elle laissa le télescope à Maya, avec un carnet rempli de dessins d’étoiles et de leurs drôles de noms.',
      'Le premier soir, Maya monta sur le balcon, seule. Le ciel était immense et froid. Elle chercha longtemps, puis la trouva : la Grande Chaussette, juste au-dessus du phare.',
      'Au même moment, de l’autre côté de la mer, Mamie Jo regardait la même étoile. Elles ne le savaient pas, mais elles souriaient toutes les deux.',
      'Maya a gardé le carnet. Elle y ajoute ses propres étoiles maintenant. La dernière s’appelle « Mamie Jo », et c’est la plus brillante de toutes. Fin.',
    ],
  },
};

const MARK_KEY = 'island.marque-pages';

function marks(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(MARK_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

/** Page du marque-page de ce livre (null : pas de marque-page). */
export function bookmark(id: string): number | null {
  const p = marks()[id];
  return typeof p === 'number' ? p : null;
}

/** Pose le marque-page à `page`, ou le retire (null). */
export function setBookmark(id: string, page: number | null): void {
  try {
    const m = marks();
    if (page === null) delete m[id];
    else m[id] = page;
    localStorage.setItem(MARK_KEY, JSON.stringify(m));
  } catch {
    // stockage indisponible : le marque-page ne survit pas, la lecture marche quand même
  }
}
