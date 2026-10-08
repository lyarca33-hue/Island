/**
 * Ordres que l'analyseur ne comprend pas (« tu peux mettre un peu d'ordre ? ») : un modèle de chat
 * via OpenRouter choisit les tâches, une par tour, en voyant l'état de la pièce et le résultat de
 * la précédente. Il peut aussi faire parler le perso (refus en personnage, réponse).
 *
 * Format texte JSON plutôt que l'appel d'outils natif : marche avec n'importe quel modèle.
 */
import type { Game } from '../game/Game';
import type { Missing } from './missing';
import { type Intent, intentLabel, runIntents, type Step } from './tasks';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Envoie la conversation au modèle et rend sa réponse (texte). */
export type Chat = (messages: ChatMessage[], signal?: AbortSignal) => Promise<string>;

export interface AiSettings {
  apiKey: string;
  model: string;
}

/** Le modèle par défaut de Lumen : rapide et très bon marché. */
export const DEFAULT_MODEL = 'qwen/qwen3.7-flash';
const STORAGE_KEY = 'rp-island.ia';

/** Réglages enregistrés dans le navigateur, sinon ceux du fichier .env (VITE_OPENROUTER_API_KEY, VITE_OPENROUTER_MODEL). */
export function loadSettings(): AiSettings {
  let saved: Partial<AiSettings> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    // stockage indisponible : réglages par défaut
  }
  return {
    apiKey: saved.apiKey || import.meta.env.VITE_OPENROUTER_API_KEY || '',
    model: saved.model || import.meta.env.VITE_OPENROUTER_MODEL || DEFAULT_MODEL,
  };
}

export function saveSettings(s: AiSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // tant pis : valable pour cette session seulement
  }
}

/** Appel à OpenRouter (API compatible OpenAI), sans chaîne de pensée (comme Lumen). */
export function openRouterChat({ apiKey, model }: AiSettings): Chat {
  return async (messages, signal) => {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Rp Island',
      },
      body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 300, reasoning: { enabled: false } }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error?.message ?? `OpenRouter : erreur ${res.status}`);
    return data?.choices?.[0]?.message?.content ?? '';
  };
}

/** Le strict nécessaire du `sample` des pages claude.ai (demander à Claude depuis la page). */
type Sample = (input: Array<{ role: 'user' | 'assistant'; content: string }>, options?: { signal?: AbortSignal; modelTier?: 'quick' | 'default' | 'complex'; cache?: boolean }) => Promise<{ text: string }>;

/**
 * Dans l'aperçu publié sur claude.ai, la page ne peut pas joindre OpenRouter ; elle peut en
 * revanche demander à Claude (compte de la personne qui joue, avec son accord au premier ordre).
 * Rend ce modèle, ou null hors de claude.ai.
 */
export async function claudePageChat(): Promise<Chat | null> {
  const host = (window as unknown as { claude?: { use(name: string): Promise<unknown> } }).claude;
  const sample = (await host?.use('sample').catch(() => null)) as Sample | null;
  if (!sample) return null;
  return async (messages, signal) => {
    // pas de rôle « system » : les consignes passent en premier message
    const turns = messages.map((m) => ({ role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const), content: m.content }));
    try {
      return (await sample(turns, { signal, modelTier: 'quick', cache: false })).text;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'not_granted') throw new Error('Claude n’a pas été autorisé pour cette page.');
      throw new Error((e as { message?: string }).message ?? 'Claude ne répond pas.');
    }
  };
}

const SYSTEM = `Tu joues le personnage du joueur dans un petit monde 3D de jeu de rôle. Le joueur te donne un ordre ; tu le réalises en enchaînant les tâches du jeu, une par tour.

Tâches possibles (réponds avec l'une d'elles) :
- {"tache": "prendre", "objet": "<ref>"} : aller prendre un objet portable. Le perso a deux mains : un objet par main (ex. la tasse et un livre) ; un livre s'ajoute à la pile de livres tenue (une pile, une caisse ou une chaise prend les deux mains) ; si les mains sont prises, il pose d'abord ce qu'il faut
- {"tache": "poser", "objet": "<ref>", "sur": "<ref>"} : poser un objet sur un autre objet ou un meuble (« objet » et « sur » sont facultatifs : sans « objet », ce qu'on tient ; sans « sur », devant soi). Si l'objet n'est pas en main, il est pris d'abord
- {"tache": "aller", "objet": "<ref>"} : marcher jusqu'à un objet ou un meuble
- {"tache": "ranger", "livres": ["<ref>", ...]} : ranger ces livres dans la bibliothèque (liste vide = tous ceux qui traînent)
- {"tache": "cafe"} : se faire un café (prend la tasse si besoin)
- {"tache": "the"} : se faire un thé à la bouilloire (prend la tasse si besoin) ; le thé réveille moitié moins que le café
- {"tache": "jus"} : se servir dans la tasse un jus de fruits du mixeur (il doit être prêt : « mettre » un fruit dans le mixeur puis « allumer » le mixeur d'abord). Le jus désaltère et nourrit un peu
- {"tache": "boire", "objet": "<ref>", "liquide": "eau"} : boire une gorgée (« objet » facultatif : une bouteille d'eau du frigo, la tasse… ; sans objet, la tasse ; « liquide » facultatif, "eau", "café", "thé" ou "jus de fruits" : si la tasse est vide, elle est d'abord remplie, de café par défaut). Boire fait baisser la soif
- {"tache": "eau"} : remplir la tasse d'eau à l'évier (prend la tasse si besoin). Une tasse « sale » (bue jusqu'au bout) est seulement rincée : la machine à café refuse une tasse sale
- {"tache": "eau", "objet": "<ref>"} marche aussi pour remplir d'eau la bouteille ou la casserole (« objet » : son ref)
- {"tache": "verser", "objet": "<ref>", "dans": "<ref>"} : verser le contenu d'un récipient (bouteille, tasse, casserole) dans un autre récipient, ou de l'eau dans la bouilloire (« objet » facultatif : ce qu'on tient ; « dans » facultatif : le récipient le plus proche)
- {"tache": "vider_recipient", "objet": "<ref>"} : vider dans l'évier ce que contient un récipient (« objet » facultatif : ce qu'on tient) ; dans la casserole, les pommes de terre restent (égoutter)
- {"tache": "remplir_bouilloire", "objet": "<ref>"} : remplir d'eau la bouilloire (elle n'a pas de robinet : le perso remplit un récipient à l'évier et le verse dedans). Sans eau, la bouilloire ne fait pas de thé
- {"tache": "robinet", "ouvrir": true} : ouvrir (ou fermer, « ouvrir » faux) le robinet de l'évier ; il coule jusqu'à ce qu'on le ferme
- {"tache": "bouchon", "mettre": true} : boucher l'évier (ou enlever le bouchon, « mettre » faux). Bouché avec le robinet ouvert, la cuve se remplit puis déborde
- {"tache": "boire_robinet"} : boire au robinet, dans le creux des mains (pose d'abord ce que le perso tient)
- {"tache": "charger_lv"} : charger toute la vaisselle sale au lave-vaisselle
- {"tache": "pastille"} : mettre une pastille dans le lave-vaisselle (boîte au placard) ; sans pastille, le lavage rate. Pour laver : charger_lv, pastille, puis allumer le lave-vaisselle
- {"tache": "vider_lv"} : vider le lave-vaisselle et ranger la vaisselle propre à sa place
- {"tache": "chaise", "objet": "<ref>", "sous": true} : ranger la chaise sous la table (« sous »: false pour la tirer)
- {"tache": "essuyer", "objet": "<ref>"} : essuyer les miettes de la table avec l'éponge (« objet » facultatif)
- {"tache": "empiler"} : empiler les assiettes propres (prendre celle du dessous emporte la pile)
- {"tache": "essuyer_sol"} : essuyer les petites flaques d'eau par terre avec l'éponge
- {"tache": "serpillere"} : passer la serpillière (dans le seau) sur les flaques, même grosses
- {"tache": "balayer"} : balayer les éclats de verre et les miettes par terre avec le balai (marcher sur des éclats coupe)
- {"tache": "nettoyer", "objet": "<ref>"} : nettoyer au spray et à l'éponge une surface tachée par la cuisine (« objet » facultatif)
- {"tache": "gants", "mettre": true} : enfiler les gants de ménage (« mettre » faux pour les enlever) ; ils protègent les mains à la vaisselle
- {"tache": "sortir_poubelle"} : sortir le sac de la poubelle au conteneur dehors
- {"tache": "sac_neuf", "objet": "<ref>"} : remettre un sac neuf dans la poubelle
- {"tache": "heure"} : regarder l'heure à l'horloge
- {"tache": "essuyer_vaisselle", "objets": ["<ref>", ...]} : essuyer au torchon la vaisselle mouillée (sortie de l'évier ; liste vide = toute). Sinon « mettre » la vaisselle mouillée dans l'égouttoir, où elle sèche seule
- {"tache": "essuyer_mains"} : s'essuyer les mains au torchon après les avoir lavées
- {"tache": "liste_courses"} : lire la liste de courses (ce qui manque à la maison)
- {"tache": "courses"} : commander ce qui manque ; le sac de courses arrive devant la porte une demi-heure plus tard
- {"tache": "ranger_courses"} : ranger le sac de courses (frigo, congélateur, garde-manger)
- Provisions : épicerie au garde-manger (farine, sucre, chocolat, confiture, miel, pâte à tartiner, sauce tomate, vinaigre, levure, biscuits, chips, oignon, ail, banane, pommes de terre), frais et boissons au frigo (jambon, saucisses, poulet, poisson, yaourt, crème, salade, orange, fraises, citron, champignons, poivron, courgette, sauces, jus d'orange, soda, eau gazeuse, vin), surgelés au congélateur (frites, pizza, légumes surgelés : à passer au four). Poulet, poisson, saucisses et légumes se cuisent à la poêle
- La carafe (sur la table) est pleine d'eau : on ne boit pas à la carafe, on la « verse » dans un verre (« objet » : la carafe, « dans » : le verre)
- Le plateau : « poser » un objet avec « sur »: le plateau, puis prendre le plateau emporte tout ce qui est dessus
- {"tache": "mettre_table"} : mettre le couvert devant la chaise (assiette, fourchette, couteau de table pris au placard et au tiroir)
- {"tache": "debarrasser"} : débarrasser la table (vaisselle sale au lave-vaisselle, propre à sa place)
- {"tache": "couper_assiette"} : assis devant l'assiette servie, couper le plat en bouchées avec le couteau de table
- {"tache": "regarder", "objet": "<ref>"} : ouvrir un meuble (frigo, congélateur, placard, tiroir) et regarder ce qu'il contient
- {"tache": "ranger_place", "objet": "<ref>"} : ranger un objet à sa place sans nommer le meuble (« objet » facultatif : ce qu'on tient) : aliments au frigo, glaçons et lasagne au congélateur, vaisselle au placard, couverts au tiroir
- {"tache": "laisser_ouvert", "objet": "<ref>"} : ouvrir un meuble et laisser sa porte ouverte (elle ne se referme plus seule)
- {"tache": "glacons", "dans": "<ref>"} : mettre des glaçons (bac au congélateur) dans une tasse (« dans » facultatif)
- La lasagne du congélateur est congelée : il faut la « mettre » au micro-ondes (ou au four) et l'« allumer » avant de la manger
- {"tache": "omelette"} : faire une omelette (poêle sur le feu, 2 œufs du frigo cassés dans le saladier, fouettés, versés, cuits en remuant, servis dans une assiette sortie s'il y en a une)
- {"tache": "crepe"} : faire une crêpe (pâte au saladier : œuf, lait, farine, fouettés ; une crêpe par ordre, retournée à la spatule)
- {"tache": "oeuf_plat"} : faire un œuf au plat (cassé dans la poêle sur le feu)
- {"tache": "casser_oeuf", "dans": "<ref>"} : casser un œuf du frigo dans le saladier ou la poêle (« dans » facultatif)
- {"tache": "fouetter"} : mélanger le saladier au fouet (œufs → œufs battus ; œuf, lait, farine → pâte à crêpes)
- {"tache": "remuer", "objet": "<ref>"} : remuer à la spatule ce qui cuit (sinon ça attache au fond et brûle plus vite)
- {"tache": "sauter", "objet": "<ref>"} : faire sauter (retourner en l'air) la crêpe ou l'omelette dans la poêle ; elle peut tomber à côté
- {"tache": "servir_poele", "assiette": "<ref>"} : servir à la spatule ce qui est cuit dans la poêle, dans une assiette posée (« assiette » facultatif)
- {"tache": "assaisonner", "epice": "sel", "objet": "<ref>"} : assaisonner (épices de l'étagère : sel, poivre, paprika, herbes de Provence, huile d'olive) le plat de la poêle ou de l'assiette (« objet » facultatif)
- {"tache": "tartiner", "pot": "confiture", "objet": "<ref>"} : tartiner des tranches de pain ou une crêpe cuite (« pot » : confiture, miel, pâte à tartiner ou beurre ; facultatif)
- {"tache": "raper", "objet": "<ref>"} : râper du fromage (frigo) à la râpe (placard) sur le plat de l'assiette ou de la poêle, ou sur la planche
- {"tache": "gouter", "objet": "<ref>"} : goûter à la cuillère ce qui cuit ou ce qui est servi ; le perso dit si c'est bon
- Les aliments vieillissent hors du frigo (« à manger vite », puis « périmé » : mal au ventre) ; un plat cuit refroidit (« froid » : le réchauffer au micro-ondes avec « cuire ») ; un plat préparé a des étoiles (★, meilleures avec la compétence cuisine, un plat assaisonné, chaud, frais). Le livre de recettes (dans la cuisine) se lit avec « lire »
- Ustensiles : fouet, spatule, cuillère en bois et louche dans le pot à ustensiles ; saladier et râpe au placard ; œufs, lait, beurre, fromage au frigo
- {"tache": "laver", "visage": true} : se laver à l'évier ou au lavabo (« visage » faux : les mains seulement ; vrai : toilette, mains et visage). Fait remonter l'hygiène ; pose d'abord ce que le perso tient
- {"tache": "douche"} : prendre une douche dans la salle de bain (hygiène à fond) ; le perso en sort mouillé
- {"tache": "secher"} : se sécher avec la serviette (sur le porte-serviettes), puis la remettre à sa place
- {"tache": "toilettes"} : aller aux toilettes quand la vessie est basse (s'asseoir, se soulager, tirer la chasse)
- {"tache": "chasse"} : tirer la chasse d'eau
- {"tache": "miroir"} : se regarder dans le miroir du lavabo
- {"tache": "manger", "objet": "<ref>"} : manger un aliment en entier : pomme, sandwich, pain, légumes ou morceaux coupés (« objet » facultatif ; il y en a dans le frigo, le perso ouvre la porte tout seul)
- {"tache": "couper", "objet": "<ref>"} : couper en morceaux un aliment entier (pomme, pain, carotte, tomate, concombre ; sa fiche dit « coupable ») sur la planche à découper avec le couteau (« objet » facultatif : l'aliment tenu, sinon le plus proche). Le perso le prend, le pose sur la planche, prend le couteau, coupe et repose le couteau ; les morceaux restent sur la planche et se mangent
- {"tache": "preparer", "plat": "<id du plat>"} : préparer un plat d'une recette ; le perso coupe et fait cuire ce qu'il faut, réunit les ingrédients sur la planche à découper et les assemble. Plats : "salade-composee" (tomate et concombre coupés, carotte en plus), "tartine-tomate" (pain et tomate coupés), "sandwich-steak" (pain coupé et steak cuit, tomate ou concombre en plus), "steak-pommes-de-terre" (steak et pomme de terre cuits). Le plat se mange comme le sandwich, ou se sert dans l'assiette pour un repas à table
- {"tache": "servir", "objet": "<ref>", "assiette": "<ref>"} : servir un aliment (pomme, sandwich) dans une assiette propre et vide (« objet » et « assiette » facultatifs : ce qu'on tient, ou le plus proche ; la plus proche)
- {"tache": "repas", "objet": "<ref>"} : un vrai repas à table : sert l'aliment dans l'assiette si elle est vide, prend la fourchette, s'assoit devant l'assiette et mange tout le plat (rassasie un peu plus que manger debout). Assiette et couverts sont ensuite sales. « dans » facultatif : un bol (on y mange à la cuillère)
- {"tache": "vaisselle", "objets": ["<ref>", ...]} : laver à l'évier la vaisselle sale (pour le lave-vaisselle : « mettre » chaque pièce dedans puis « allumer » le lave-vaisselle) (assiette, fourchette, couteau, tasse après un café ; liste vide = toute la vaisselle sale). Le perso la reprend propre
- {"tache": "mettre", "objet": "<ref>", "dans": "<ref du meuble>"} : ranger un objet dans un meuble qui a une porte ou un tiroir (« objet » facultatif : ce qu'on tient) : frigo (bouteille, aliments entiers ou coupés), placard (tasse, assiette, bouteille, pomme), tiroir (couverts, lettre), four et micro-ondes (steak, pomme de terre, pain, sandwich), lave-vaisselle (tasse, assiette, couverts), grille-pain (tranches de pain), mixeur (pomme, quartiers de pomme)
- {"tache": "ouvrir", "objet": "<ref>"} / {"tache": "fermer", "objet": "<ref>"} : ouvrir ou fermer la porte d'un meuble (frigo, placard, four…), un tiroir ou le couvercle de la poubelle
- {"tache": "cuire", "objet": "<ref>"} : faire cuire un ingrédient cru (steak à la poêle, pomme de terre à l'eau dans la casserole ; il y en a dans le frigo). Le perso fait tout : eau à l'évier, ustensile sur la gazinière, ingrédient dedans, feu allumé, puis éteint une fois cuit. Cru, ça ne se mange pas ; oublié sur le feu, ça brûle
- {"tache": "mettre", "objet": "<ref>", "dans": "<ref>"} marche aussi pour poser une poêle ou une casserole sur la gazinière (« dans » : la gazinière) ou mettre un ingrédient dans un ustensile
- {"tache": "allumer", "objet": "<ref>"} / {"tache": "eteindre", "objet": "<ref>"} : allumer ou éteindre la gazinière (les feux où un ustensile est posé) ou la machine à café. Le four et le micro-ondes (sorte « appareil ») : il faut d'abord y « mettre » ce qu'il faut cuire (steak, pomme de terre) ; le four cuit d'un cran à chaque fois (cru → cuit → brûlé), le micro-ondes cuit sans brûler ; le lave-vaisselle rend propre la vaisselle sale ; le grille-pain fait du pain grillé avec les tranches de pain qu'on y a mises ; le mixeur fait du jus de fruits avec les fruits qu'on y a mis (une tasse par fruit). La tâche finit quand l'appareil sonne
- {"tache": "jeter", "objet": "<ref>"} : jeter un objet à la poubelle (« objet » facultatif : ce qu'on tient) ; il disparaît
- {"tache": "vider", "objet": "<ref>"} : vider la poubelle quand elle est pleine
- {"tache": "lire", "objet": "<ref>"} : lire un livre (« objet » facultatif : le livre tenu, sinon le plus proche ; le perso le prend et libère l'autre main si besoin)
- {"tache": "arreter_lire"} : fermer le livre qu'on lit
- {"tache": "asseoir", "objet": "<ref>"} : s'asseoir sur un siège (sorte « siège », ex. la chaise ; « objet » facultatif : le plus proche). Assis, le perso peut boire, lire, parler ; il se lève tout seul pour marcher ou prendre un objet
- {"tache": "lever"} : se lever quand on est assis (ou se réveiller quand on dort)
- {"tache": "dormir", "objet": "<ref>"} : aller se coucher dans le lit et dormir (« objet » facultatif : le lit le plus proche). L'écran passe au noir, le temps file, la fatigue remonte ; le perso se réveille seul une fois reposé. Pas possible si la fatigue est presque pleine
- {"tache": "reveiller"} : se réveiller et sortir du lit
- La lampe de chevet (sorte « lampe ») s'allume et s'éteint avec « allumer » / « eteindre »
- {"tache": "dire", "texte": "<phrase>"} : le personnage dit une phrase, en personnage
- {"tache": "manque", "action": "<verbe court, ex. danser>", "sorte": "geste", "objet": "<nom>", "raison": "<ce qui manque au jeu, en une phrase>"} : signale au créateur du jeu une action ou un objet que le jeu n'a pas encore (« sorte » : "geste" si l'objet existe mais pas le geste, ex. laver la tasse ; "objet" si l'objet n'est pas dans la pièce, ex. une casserole ; "autre" sinon. « objet » facultatif : l'objet concerné)
- {"tache": "fini", "message": "<phrase courte pour le joueur>"} : l'ordre est réalisé, ou impossible

Chaque tâche fait elle-même les étapes nécessaires (prendre l'objet, poser ce qu'on tient, aller jusqu'au meuble) : ne refuse jamais un ordre parce que le personnage ne tient pas encore l'objet.
Pour prendre plusieurs livres, enchaîne plusieurs « prendre » (6 livres au plus en pile).
Les objets sont désignés par leur « ref », donnée dans l'état de la pièce. N'invente aucun objet.
Si l'ordre demande une action que les tâches ne permettent pas (danser, dormir…) ou un objet absent de la pièce : d'abord « manque », puis dis-le en personnage avec « dire », puis « fini ». Fais ce qui est faisable dans l'ordre et signale seulement le reste.

Réponds UNIQUEMENT par un objet JSON, sans texte autour. Une seule tâche par réponse : tu verras son résultat et l'état de la pièce avant de choisir la suivante.`;

/** Nombre de tâches au plus pour un ordre (garde-fou). */
const MAX_STEPS = 20;

/** Premier objet JSON trouvé dans la réponse (le modèle ajoute parfois du texte ou des ```). */
export function parseJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        const obj = JSON.parse(text.slice(start, i + 1));
        return obj && typeof obj === 'object' ? obj : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Traduit la réponse du modèle en tâche du jeu (null : réponse mal formée). */
function toIntent(o: Record<string, unknown>): Intent | 'fini' | 'manque' | null {
  const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '');
  switch (o.tache) {
    case 'prendre': return s('objet') ? { kind: 'prendre', ref: s('objet') } : null;
    case 'poser': return { kind: 'poser', ref: s('objet') || undefined, sur: s('sur') || undefined };
    case 'aller': return s('objet') ? { kind: 'aller', ref: s('objet') } : null;
    case 'ranger': return { kind: 'ranger', refs: Array.isArray(o.livres) ? o.livres.map(String) : [] };
    case 'cafe': return { kind: 'cafe' };
    case 'the': return { kind: 'the' };
    case 'jus': return { kind: 'jus' };
    case 'boire': return { kind: 'boire', ref: s('objet') || undefined, liquide: s('liquide') === 'eau' ? 'eau' : s('liquide') === 'café' || s('liquide') === 'cafe' ? 'café' : s('liquide') === 'thé' || s('liquide') === 'the' ? 'thé' : s('liquide').startsWith('jus') ? 'jus de fruits' : undefined };
    case 'eau': return { kind: 'eau', ref: s('objet') || undefined };
    case 'verser': return { kind: 'verser', ref: s('objet') || undefined, dans: s('dans') || undefined };
    case 'vider_recipient': return { kind: 'vider_recipient', ref: s('objet') || undefined };
    case 'remplir_bouilloire': return s('objet') ? { kind: 'remplir_bouilloire', ref: s('objet') } : null;
    case 'robinet': return { kind: 'robinet', ouvrir: o.ouvrir !== false };
    case 'bouchon': return { kind: 'bouchon', mettre: o.mettre !== false };
    case 'boire_robinet': return { kind: 'boire_robinet' };
    case 'charger_lv': return { kind: 'charger_lv' };
    case 'pastille': return { kind: 'pastille' };
    case 'vider_lv': return { kind: 'vider_lv' };
    case 'chaise': return s('objet') ? { kind: 'chaise', ref: s('objet'), sous: o.sous !== false } : null;
    case 'essuyer': return { kind: 'essuyer', ref: s('objet') || undefined };
    case 'empiler': return { kind: 'empiler' };
    case 'essuyer_sol': return { kind: 'essuyer_sol' };
    case 'serpillere': return { kind: 'serpillere' };
    case 'balayer': return { kind: 'balayer' };
    case 'nettoyer': return { kind: 'nettoyer', ref: s('objet') || undefined };
    case 'gants': return { kind: 'gants', mettre: o.mettre !== false };
    case 'sortir_poubelle': return { kind: 'sortir_poubelle' };
    case 'sac_neuf': return { kind: 'sac_neuf', ref: s('objet') || undefined };
    case 'heure': return { kind: 'heure' };
    case 'essuyer_vaisselle': return { kind: 'essuyer_vaisselle', refs: Array.isArray(o.objets) ? o.objets.map(String) : [] };
    case 'essuyer_mains': return { kind: 'essuyer_mains' };
    case 'liste_courses': return { kind: 'liste_courses' };
    case 'courses': return { kind: 'courses' };
    case 'ranger_courses': return { kind: 'ranger_courses' };
    case 'mettre_table': return { kind: 'mettre_table' };
    case 'debarrasser': return { kind: 'debarrasser' };
    case 'couper_assiette': return { kind: 'couper_assiette' };
    case 'regarder': return s('objet') ? { kind: 'regarder', ref: s('objet') } : null;
    case 'ranger_place': return { kind: 'ranger_place', ref: s('objet') || undefined };
    case 'laisser_ouvert': return s('objet') ? { kind: 'laisser_ouvert', ref: s('objet') } : null;
    case 'glacons': return { kind: 'glacons', dans: s('dans') || undefined };
    case 'laver': return { kind: 'laver', visage: o.visage !== false };
    case 'douche': return { kind: 'douche' };
    case 'secher': return { kind: 'secher' };
    case 'toilettes': return { kind: 'toilettes' };
    case 'chasse': return { kind: 'chasse' };
    case 'miroir': return { kind: 'miroir' };
    case 'manger': return { kind: 'manger', ref: s('objet') || undefined };
    case 'couper': return { kind: 'couper', ref: s('objet') || undefined };
    case 'preparer': return { kind: 'preparer', plat: s('plat') || undefined };
    case 'mettre': return s('dans') ? { kind: 'mettre', ref: s('objet') || undefined, dans: s('dans') } : null;
    case 'ouvrir': return s('objet') ? { kind: 'ouvrir', ref: s('objet') } : null;
    case 'jeter': return { kind: 'jeter', ref: s('objet') || undefined };
    case 'vider': return s('objet') ? { kind: 'vider', ref: s('objet') } : null;
    case 'fermer': return s('objet') ? { kind: 'fermer', ref: s('objet') } : null;
    case 'lire': return { kind: 'lire', ref: s('objet') || undefined };
    case 'arreter_lire': return { kind: 'arreter_lire' };
    case 'asseoir': return { kind: 'asseoir', ref: s('objet') || undefined };
    case 'servir': return { kind: 'servir', ref: s('objet') || undefined, sur: s('assiette') || undefined };
    case 'repas': return { kind: 'repas', ref: s('objet') || undefined, dans: s('dans') || undefined };
    case 'vaisselle': return { kind: 'vaisselle', refs: Array.isArray(o.objets) ? o.objets.map(String) : [] };
    case 'lever': return { kind: 'lever' };
    case 'dormir': return { kind: 'dormir', ref: s('objet') || undefined };
    case 'reveiller': return { kind: 'reveiller' };
    case 'cuire': return { kind: 'cuire', ref: s('objet') || undefined };
    case 'allumer': return { kind: 'allumer', ref: s('objet') || undefined };
    case 'eteindre': return { kind: 'eteindre', ref: s('objet') || undefined };
    case 'omelette': return { kind: 'omelette' };
    case 'crepe': return { kind: 'crepe' };
    case 'oeuf_plat': return { kind: 'oeuf_plat' };
    case 'casser_oeuf': return { kind: 'casser_oeuf', dans: s('dans') || undefined };
    case 'fouetter': return { kind: 'fouetter' };
    case 'remuer': return { kind: 'remuer', ref: s('objet') || undefined };
    case 'sauter': return { kind: 'sauter', ref: s('objet') || undefined };
    case 'servir_poele': return { kind: 'servir_poele', sur: s('assiette') || undefined };
    case 'assaisonner': return { kind: 'assaisonner', epice: s('epice') || 'sel', ref: s('objet') || undefined };
    case 'tartiner': return { kind: 'tartiner', pot: s('pot') || undefined, ref: s('objet') || undefined };
    case 'raper': return { kind: 'raper', ref: s('objet') || undefined };
    case 'gouter': return { kind: 'gouter', ref: s('objet') || undefined };
    case 'dire': return s('texte') ? { kind: 'dire', texte: s('texte') } : null;
    case 'fini': return 'fini';
    case 'manque': return s('action') || s('raison') ? 'manque' : null;
  }
  return null;
}

/** Ce que l'IA signale comme manquant, ou une tâche qui a échoué (pour le journal des manques). */
export type OnMissing = (m: Omit<Missing, 'at' | 'ordre'>) => void;

/** Réalise l'ordre avec le modèle ; rend un message pour le joueur. `onStep(null)` : il réfléchit. */
export async function runAi(game: Game, chat: Chat, order: string, onStep: (s: Step | null) => void, signal?: AbortSignal, onMissing?: OnMissing): Promise<string> {
  const state = () => {
    const w = game.describe();
    return `État de la pièce : ${JSON.stringify({ mains: w.mains, mainsLibres: w.mainsLibres, lit: w.lit, objets: w.objets.map(({ ref, nom, ou, coupable }) => ({ ref, nom, ou, coupable })) })}`;
  };
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Ordre du joueur : ${order}\n\n${state()}` },
  ];
  let misses = 0;
  for (let step = 0; step < MAX_STEPS; step++) {
    onStep(null);
    const reply = await chat(messages, signal);
    if (signal?.aborted) return 'Interrompu.';
    messages.push({ role: 'assistant', content: reply });
    const json = parseJson(reply);
    const intent = json && toIntent(json);
    if (!intent) {
      if (++misses > 2) throw new Error('le modèle ne répond pas dans le bon format.');
      messages.push({ role: 'user', content: 'Réponds uniquement par un objet JSON {"tache": ...} parmi les tâches possibles.' });
      continue;
    }
    misses = 0;
    if (intent === 'fini') return typeof json!.message === 'string' && json!.message ? json!.message : 'C’est fait.';
    if (intent === 'manque') {
      const str = (k: string) => (typeof json![k] === 'string' ? (json![k] as string) : '');
      const sorte = str('sorte') === 'objet' ? `objet absent du jeu${str('objet') ? ` (${str('objet')})` : ''}` : str('sorte') === 'geste' ? `geste absent${str('objet') ? ` pour ${str('objet')}` : ''}` : undefined;
      onMissing?.({ kind: 'action', quoi: str('action') || str('raison'), detail: str('raison') || str('action'), cause: sorte });
      messages.push({ role: 'user', content: 'Noté. Continue.' });
      continue;
    }
    const { ok, message } = await runIntents(game, [intent], onStep, signal);
    if (signal?.aborted) return 'Interrompu.';
    if (!ok) onMissing?.({ kind: 'echec', quoi: intentLabel(intent), detail: message });
    messages.push({ role: 'user', content: `Résultat : ${ok ? 'ok' : `échec : ${message}`}\n\n${state()}` });
  }
  return 'J’ai arrêté : trop d’étapes.';
}
