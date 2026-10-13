import { describe, expect, it } from 'vitest';
import { galleryModels, PACK_SCALE } from '../src/game/carteTest';
import { ITEMS } from '../src/game/items/catalog';
import { FOOD_LOOKS } from '../src/game/items/interior';
import { RETIRES, RETIRES_PACK } from '../src/game/items/retires';
import { catalogue, chercher, entree, familleObjet, joliNom, MODELE_CATS, signalDe } from '../src/game/modelesCatalogue';

describe('catalogue des modèles (panneau « Modèles »)', () => {
  const tout = catalogue();
  const objets = tout.filter((e) => e.kind === 'objet');
  const decor = tout.filter((e) => e.kind === 'pack');
  const catsObjets = MODELE_CATS.filter((c) => c.source === 'objets').map((c) => c.id);
  const catsDecor = MODELE_CATS.filter((c) => c.source === 'decor').map((c) => c.id);

  it('est fait une fois', () => {
    expect(catalogue()).toBe(tout);
  });

  it('a des clés uniques', () => {
    expect(new Set(tout.map((e) => e.key)).size).toBe(tout.length);
  });

  it('propose chaque objet du jeu une fois, dans une seule famille d’objets', () => {
    expect(objets.length).toBe(ITEMS.length);
    expect(new Set(objets.map((e) => e.id))).toEqual(new Set(ITEMS.map((d) => d.id)));
    for (const e of objets) {
      expect(e.source).toBe('objets');
      expect(catsObjets).toContain(e.cat);
      expect(familleObjet(e.def!)).toBe(e.cat);
    }
    // chaque famille d'objets sert
    for (const c of catsObjets) expect(objets.some((e) => e.cat === c)).toBe(true);
    expect(entree('objet:tasse')?.cat).toBe('vaisselle');
    expect(entree('objet:chaise')?.cat).toBe('meubles');
  });

  it('ne propose rien de retiré du jeu', () => {
    for (const e of objets) expect(RETIRES.has(e.id!)).toBe(false);
    for (const e of decor) expect(RETIRES_PACK.has(`${e.pack}/${e.model}`)).toBe(false);
    const retire = [...RETIRES][0];
    expect(entree(`objet:${retire}`)).toBeNull();
    expect(signalDe(`objet:${retire}`)).toBeNull();
    expect(entree('pack:monuments/phare')).toBeNull();
  });

  it('range en décor la galerie, sans les modèles qui habillent un objet vivant', () => {
    const vivants = new Set(ITEMS.map((d) => d.id));
    const habilles = new Set(
      Object.entries(FOOD_LOOKS)
        .filter(([id]) => vivants.has(id))
        .map(([, l]) => `${l.pack ?? 'nourriture'}/${l.model}`),
    );
    const attendu = galleryModels().flatMap(({ pack, models }) => models.map((m) => `${pack}/${m}`)).filter((m) => !habilles.has(m));
    expect(decor.map((e) => `${e.pack}/${e.model}`)).toEqual(attendu);
    for (const e of decor) {
      expect(e.source).toBe('decor');
      expect(catsDecor).toContain(e.cat);
      expect(e.scale).toBe(PACK_SCALE[e.pack!] ?? 1);
    }
    // aucun pack connu n'échoue dans « Autres »
    expect(decor.filter((e) => e.cat === 'autres')).toEqual([]);
  });

  it('retrouve chaque entrée par sa clé', () => {
    for (const e of tout) expect(entree(e.key)).toBe(e);
    expect(entree('objet:nimporte-quoi')).toBeNull();
    expect(entree('pack:ville/rien')).toBeNull();
  });

  it('signale comme la carte de test', () => {
    const tasse = ITEMS.find((d) => d.id === 'tasse')!;
    expect(signalDe('objet:tasse')).toBe(`objet tasse (${tasse.name})`);
    for (const e of objets) expect(e.signal).toBe(`objet ${e.id} (${e.def!.name})`);
    for (const e of decor) {
      expect(e.signal).toBe(`pack ${e.pack}/${e.model}`);
      expect(e.key).toBe(`pack:${e.pack}/${e.model}`);
    }
  });

  it('cherche sans tenir compte des accents ni des majuscules', () => {
    const accentue = objets.find((e) => /[éèêàâîôûç]/.test(e.label))!;
    const sans = accentue.label.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    expect(chercher(sans)).toContain(accentue);
    const etageres = chercher('etagere');
    expect(etageres.length).toBeGreaterThan(0);
    expect(etageres[0].label).toBe('étagère');
    // le pack et la famille comptent aussi
    expect(chercher('ville').some((e) => e.pack === 'ville')).toBe(true);
    expect(chercher('vaisselle').some((e) => e.id === 'tasse')).toBe(true);
    // tous les mots doivent y être
    expect(chercher('banc ville').every((e) => e.search.includes('banc') && e.search.includes('ville'))).toBe(true);
    expect(chercher('zzzzqqq')).toEqual([]);
  });

  it('rend au plus `max` résultats', () => {
    expect(chercher('a').length).toBe(120);
    expect(chercher('a', tout, 5).length).toBe(5);
    expect(chercher('', tout, 7)).toEqual(tout.slice(0, 7));
  });

  it('rend les noms de fichier lisibles', () => {
    expect(joliNom('banc-public')).toBe('Banc public');
    expect(joliNom('Pepper_Red')).toBe('Pepper red');
    expect(joliNom('ChickenLeg')).toBe('Chicken leg');
    expect(joliNom('etal')).toBe('Etal');
  });
});
