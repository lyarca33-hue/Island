import { describe, expect, it } from 'vitest';
import { AtelierCartes, MSG_PLEIN, type CarteHooks } from '../src/game/atelierCartes';
import {
  type CarteCourante, type CarteGrille, type CarteInfo, type CarteSave, type ContenuCarte, contenuVide, infoDe,
  lireCarte, migrerBrouillon, MSG_AUTRE_GRILLE, MSG_PAS_UNE_CARTE, MSG_PLUS_RECENTE, nomDuJour, nomFichier, nomLibre,
  nouvelId, nouvelleCarte,
} from '../src/game/cartes';
import type { StockageCartes } from '../src/game/cartesStockage';

const GRILLE: CarteGrille = { n: 280, mapSize: 256, half: 70, cell: 0.5 };

const contenu = (): ContenuCarte => ({
  relief: { relief: 'AAAB', sols: 'CCCD' },
  batiments: [['mur', 1, 0, 0, 0.25], ['banc', 2.5, -1, 0.785, 0.25]],
  modeles: [['pack:ville/banc-public', 1000, 250, -2000, 1571]],
  depart: [1, 2, 3.14],
});

const lue = (x: unknown, g = GRILLE) => {
  const r = lireCarte(x, g);
  if ('erreur' in r) throw new Error(r.erreur);
  return r;
};

describe('cartes : le format', () => {
  it('aller-retour : nouvelleCarte → JSON → lireCarte', () => {
    const c = nouvelleCarte('Village', contenu(), GRILLE, 1_700_000_000_000);
    const { carte, avertissements } = lue(JSON.parse(JSON.stringify(c)));
    expect(avertissements).toEqual([]);
    expect(carte).toEqual(c);
    expect(carte.format).toBe('island-carte');
    expect(carte.v).toBe(1);
    expect(carte.base).toBe('plat');
  });

  it('refuse ce qui n’est pas une carte, et les versions plus récentes', () => {
    const c = nouvelleCarte('Village', contenu(), GRILLE);
    expect(lireCarte({ ...c, format: 'autre' }, GRILLE)).toEqual({ erreur: MSG_PAS_UNE_CARTE });
    expect(lireCarte(null, GRILLE)).toEqual({ erreur: MSG_PAS_UNE_CARTE });
    expect(lireCarte([c], GRILLE)).toEqual({ erreur: MSG_PAS_UNE_CARTE });
    expect(lireCarte({ ...c, v: 'un' }, GRILLE)).toEqual({ erreur: MSG_PAS_UNE_CARTE });
    expect(lireCarte({ ...c, v: 2 }, GRILLE)).toEqual({ erreur: MSG_PLUS_RECENTE });
  });

  it('un terrain fait sur une autre grille est laissé plat, avec un avertissement', () => {
    const c = nouvelleCarte('Village', contenu(), { ...GRILLE, n: 140, cell: 1 });
    const { carte, avertissements } = lue(c);
    expect(carte.relief).toBeNull();
    expect(carte.grille).toEqual(GRILLE);
    expect(avertissements).toEqual([MSG_AUTRE_GRILLE]);
    // le reste est gardé
    expect(carte.batiments).toHaveLength(2);
    // sans terrain, pas d'avertissement
    expect(lue({ ...c, relief: null }).avertissements).toEqual([]);
  });

  it('les rangées illisibles sont laissées de côté, les clés inconnues gardées', () => {
    const c = {
      ...nouvelleCarte('Village', contenu(), GRILLE),
      batiments: [['mur', 1, 0, 0, 0], ['mur', 1, 0, 0], ['mur', 1, 0, 0, 0, 9], [3, 1, 0, 0, 0], ['mur', NaN, 0, 0, 0], 'mur', null],
      modeles: [['pack:inconnu/truc', 1, 2, 3, 4], ['objet:tasse', '1', 2, 3, 4], ['', 1, 2, 3, 4]],
      relief: { relief: 12, sols: 'xyz' },
      depart: [1, 2],
      nom: '   ',
    };
    const { carte } = lue(c);
    expect(carte.batiments).toEqual([['mur', 1, 0, 0, 0]]);
    expect(carte.modeles).toEqual([['pack:inconnu/truc', 1, 2, 3, 4]]);
    expect(carte.relief).toEqual({ sols: 'xyz' });
    expect(carte.depart).toBeUndefined();
    expect(carte.nom).toBe('Carte sans nom');
    // tout illisible : null
    expect(lue({ ...c, batiments: [['x']], modeles: 'non', relief: {} }).carte).toMatchObject({ batiments: null, modeles: null, relief: null });
  });

  it('infoDe compte les modèles et les pièces', () => {
    const c = nouvelleCarte('Village', contenu(), GRILLE, 5);
    expect(infoDe(c)).toEqual({ id: c.id, nom: 'Village', modifieLe: 5, taille: JSON.stringify(c).length, nModeles: 1, nPieces: 2, terrain: true });
    expect(infoDe(nouvelleCarte('Vide', contenuVide(), GRILLE))).toMatchObject({ nModeles: 0, nPieces: 0, terrain: false });
  });

  it('nouvelId : l’heure puis du hasard', () => {
    expect(nouvelId(36 ** 3, () => 0.5)).toBe('1000-iiiiii');
    expect(nouvelId()).not.toBe(nouvelId());
  });
});

describe('cartes : les noms', () => {
  it('nomLibre ajoute un numéro aux noms pris', () => {
    expect(nomLibre('Village', [])).toBe('Village');
    expect(nomLibre('Village', ['Village'])).toBe('Village (2)');
    expect(nomLibre('village', ['Village', 'Village (2)'])).toBe('village (3)');
    expect(nomLibre('Village (2)', ['Village', 'Village (2)'])).toBe('Village (3)');
    expect(nomLibre('  ', [])).toBe('Carte sans nom');
  });

  it('nomFichier sans accents ni espaces', () => {
    expect(nomFichier('Village du port')).toBe('carte-village-du-port.json');
    expect(nomFichier('Étagère à côté !')).toBe('carte-etagere-a-cote.json');
    expect(nomFichier('Carte du 13/10')).toBe('carte-du-13-10.json');
    expect(nomFichier('???')).toBe('carte-sans-nom.json');
  });

  it('nomDuJour', () => {
    expect(nomDuJour(new Date(2026, 9, 3, 14, 32).getTime())).toBe('Carte du 03/10');
  });
});

describe('cartes : la migration des brouillons', () => {
  it('rien à garder : null', () => {
    expect(migrerBrouillon(null, null, GRILLE, 1)).toBeNull();
    expect(migrerBrouillon({}, [], GRILLE, 1)).toBeNull();
  });

  it('sinon une carte « Ma carte d’avant » avec les brouillons', () => {
    const c = migrerBrouillon({ relief: 'AAAB' }, [['mur', 1, 0, 0, 0]], GRILLE, 42)!;
    expect(c.nom).toBe('Ma carte d’avant');
    expect(c.relief).toEqual({ relief: 'AAAB' });
    expect(c.batiments).toEqual([['mur', 1, 0, 0, 0]]);
    expect(c.modeles).toBeNull();
    expect(c.creeLe).toBe(42);
    expect(lue(c).carte).toEqual(c);
    expect(migrerBrouillon(null, [['mur', 1, 0, 0, 0]], GRILLE, 1)?.relief).toBeNull();
  });
});

// ---------------------------------------------------------------- l'atelier, sur un faux stockage

function fauxStockage(dispo = true) {
  const cartes = new Map<string, CarteSave>();
  let courante: CarteCourante | null = null;
  let migree = false;
  let plein = false;
  const st: StockageCartes = {
    dispo: async () => dispo,
    lister: async () => [...cartes.values()].map(infoDe).sort((a: CarteInfo, b: CarteInfo) => b.modifieLe - a.modifieLe),
    lire: async (id) => (cartes.has(id) ? JSON.parse(JSON.stringify(cartes.get(id))) : null),
    ecrire: async (c) => {
      if (plein) return false;
      cartes.set(c.id, JSON.parse(JSON.stringify(c)));
      return true;
    },
    supprimer: async (id) => void cartes.delete(id),
    lireCourante: () => courante,
    ecrireCourante: (c) => void (courante = { ...c }),
    migree: () => migree,
    marquerMigree: () => void (migree = true),
  };
  return { st, cartes, get courante() { return courante; }, set plein(v: boolean) { plein = v; } };
}

function faussePartie(depart: ContenuCarte = contenuVide()) {
  const jeu = { contenu: depart, notices: [] as string[], refuse: false, atelier: null as AtelierCartes | null };
  const hooks: CarteHooks = {
    capturer: () => JSON.parse(JSON.stringify(jeu.contenu)),
    appliquer: (c) => {
      if (jeu.refuse) return false;
      jeu.contenu = { relief: c.relief, batiments: c.batiments, modeles: c.modeles, depart: c.depart };
      // le jeu signale ses changements pendant le chargement : l'atelier les ignore
      jeu.atelier?.marquer();
      return true;
    },
    notice: (t) => void jeu.notices.push(t),
  };
  return { jeu, hooks };
}

describe('atelier des cartes', () => {
  it('migre les brouillons une seule fois, même lancé deux fois', async () => {
    const f = fauxStockage();
    const { hooks } = faussePartie(contenu());
    const a = new AtelierCartes(hooks, GRILLE, f.st), b = new AtelierCartes(hooks, GRILLE, f.st);
    await Promise.all([a.demarrer(), b.demarrer()]);
    expect(f.cartes.size).toBe(1);
    expect(a.courante).toMatchObject({ nom: 'Ma carte d’avant', modifiee: false });
    expect(b.courante.id).toBe(a.courante.id);
    expect(a.liste).toHaveLength(1);
    expect(a.enregistreeLe).not.toBeNull();
    // les modèles du brouillon suivent
    expect(f.cartes.get(a.courante.id!)!.modeles).toHaveLength(1);
    await new AtelierCartes(hooks, GRILLE, f.st).demarrer();
    expect(f.cartes.size).toBe(1);
  });

  it('brouillons vides : carte sans nom, rien d’écrit', async () => {
    const f = fauxStockage();
    const { hooks } = faussePartie();
    const a = new AtelierCartes(hooks, GRILLE, f.st);
    await a.demarrer();
    expect(f.cartes.size).toBe(0);
    expect(a.courante).toEqual({ id: null, nom: 'Carte sans nom', modifiee: false });
    expect(a.dispo).toBe(true);
  });

  it('enregistrer sous, marquer, enregistrer, ouvrir, nouvelle', async () => {
    const f = fauxStockage();
    const { jeu, hooks } = faussePartie();
    const a = (jeu.atelier = new AtelierCartes(hooks, GRILLE, f.st));
    await a.demarrer();
    let appels = 0;
    a.listen(() => appels++);

    expect(await a.enregistrer()).toBe(false); // pas d'id : l'interface demande un nom
    jeu.contenu = contenu();
    a.marquer();
    expect(a.courante.modifiee).toBe(true);
    expect(f.courante?.modifiee).toBe(true);
    expect(await a.enregistrerSous('Village')).toBe(true);
    expect(a.courante).toMatchObject({ nom: 'Village', modifiee: false });
    expect(jeu.notices.at(-1)).toBe('Carte « Village » enregistrée.');
    const village = a.courante.id!;

    jeu.contenu = { ...jeu.contenu, modeles: null };
    a.marquer();
    expect(await a.enregistrer()).toBe(true);
    expect(f.cartes.get(village)!.modeles).toBeNull();
    expect(a.courante.modifiee).toBe(false);

    expect(await a.enregistrerSous('village')).toBe(true);
    expect(a.courante.nom).toBe('village (2)');
    expect(a.liste).toHaveLength(2);

    expect(a.nouvelle()).toBe(true);
    expect(jeu.contenu).toEqual(contenuVide());
    expect(a.courante).toEqual({ id: null, nom: 'Carte sans nom', modifiee: false });
    expect(a.enregistreeLe).toBeNull();
    expect(jeu.notices.at(-1)).toBe('Nouvelle carte.');

    expect(await a.ouvrir(village)).toBe(true);
    expect(a.courante).toEqual({ id: village, nom: 'Village', modifiee: false });
    expect(jeu.contenu.batiments).toHaveLength(2);
    expect(jeu.notices.at(-1)).toBe('Carte « Village » ouverte.');
    expect(appels).toBeGreaterThan(4);

    // refusée par le jeu (un geste en cours) : rien ne change
    jeu.refuse = true;
    expect(a.nouvelle()).toBe(false);
    expect(a.courante.id).toBe(village);
  });

  it('stockage plein : notice et carte toujours « changée »', async () => {
    const f = fauxStockage();
    const { jeu, hooks } = faussePartie();
    const a = new AtelierCartes(hooks, GRILLE, f.st);
    await a.demarrer();
    a.marquer();
    f.plein = true;
    expect(await a.enregistrerSous('Village')).toBe(false);
    expect(jeu.notices.at(-1)).toBe(MSG_PLEIN);
    expect(a.courante).toMatchObject({ id: null, modifiee: true });
  });

  it('renommer, supprimer, exporter, importer', async () => {
    const f = fauxStockage();
    const { jeu, hooks } = faussePartie(contenu());
    const a = new AtelierCartes(hooks, GRILLE, f.st);
    await a.demarrer();
    const id = a.courante.id!;
    await a.renommer('Village');
    expect(a.courante.nom).toBe('Village');
    expect(f.cartes.get(id)!.nom).toBe('Village');

    const ex = (await a.exporter())!;
    expect(ex.fichier).toBe('carte-village.json');
    const id2 = await a.importer(ex.json);
    expect(id2).not.toBeNull();
    expect(id2).not.toBe(id);
    expect(f.cartes.get(id2!)!.nom).toBe('Village (2)');
    expect(jeu.notices.at(-1)).toBe('Carte « Village (2) » importée.');
    expect((await a.exporter(id2!))!.fichier).toBe('carte-village-2.json');

    expect(await a.importer('pas du json')).toBeNull();
    expect(jeu.notices.at(-1)).toBe('Ce fichier n’est pas une carte de l’île.');
    expect(await a.importer(JSON.stringify({ ...JSON.parse(ex.json), v: 2 }))).toBeNull();
    expect(jeu.notices.at(-1)).toBe('Carte faite par une version plus récente du jeu.');
    const autreGrille = JSON.stringify({ ...JSON.parse(ex.json), grille: { ...GRILLE, n: 1 } });
    expect(await a.importer(autreGrille)).not.toBeNull();
    expect(jeu.notices.at(-1)).toBe('Carte « Village (3) » importée. Terrain fait sur une autre grille : laissé plat.');

    await a.supprimer(id);
    expect(f.cartes.has(id)).toBe(false);
    expect(a.courante).toMatchObject({ id: null, nom: 'Village', modifiee: true });
    expect(a.liste).toHaveLength(2);
  });

  it('sans IndexedDB : pas de liste, import ouvert tout de suite', async () => {
    const f = fauxStockage(false);
    const { jeu, hooks } = faussePartie(contenu());
    const a = new AtelierCartes(hooks, GRILLE, f.st);
    await a.demarrer();
    expect(a.dispo).toBe(false);
    expect(a.liste).toEqual([]);
    expect(a.courante.modifiee).toBe(true);
    expect(await a.enregistrerSous('Village')).toBe(false);
    expect(jeu.notices.at(-1)).toBe('Les cartes ne peuvent pas être gardées dans ce navigateur : utilise Exporter / Importer.');
    const ex = (await a.exporter())!;
    jeu.contenu = contenuVide();
    expect(await a.importer(ex.json)).toBeNull();
    expect(jeu.contenu.batiments).toHaveLength(2);
    expect(a.courante).toMatchObject({ id: null, nom: 'Carte sans nom', modifiee: true });
  });
});
