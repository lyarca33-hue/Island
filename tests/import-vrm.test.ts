import { describe, expect, it } from 'vitest';
import { isImportedId } from '../src/creator/imported';
import { defaultRecipe, importedOf, sanitizeRecipe, withImported, withPiece } from '../src/creator/recipe';

const ID = 'perso:0123456789abcdef';

describe('perso VRoid importé', () => {
  it('reconnaît les identifiants de persos importés', () => {
    expect(isImportedId(ID)).toBe(true);
    expect(isImportedId('sample_a')).toBe(false);
    expect(isImportedId('perso:../../etc')).toBe(false);
  });

  it('la recette garde le perso importé en entier, quel que soit le genre', () => {
    const r = withImported(defaultRecipe('m'), ID);
    const back = sanitizeRecipe(JSON.parse(JSON.stringify(r)))!;
    expect(back.outfit).toBe(ID);
    expect(back.face).toBe(ID);
    expect(back.hair).toBe(ID);
    expect(importedOf(back)).toBe(ID);
  });

  it('un perso importé sur la tenue seulement couvre aussi visage et coiffure', () => {
    const back = sanitizeRecipe({ ...defaultRecipe('f'), outfit: ID })!;
    expect([back.face, back.hair]).toEqual([ID, ID]);
  });

  it('choisir une pièce du créateur quitte le perso importé', () => {
    const r = withPiece(withImported(defaultRecipe('f'), ID), 'hair', 'shino');
    expect(importedOf(r)).toBeNull();
    expect(r.hair).toBe('shino');
    expect(r.outfit).toBe(defaultRecipe('f').outfit);
  });

  it('sans perso importé, changer une pièce garde les autres', () => {
    const r = withPiece({ ...defaultRecipe('f'), face: 'shino' }, 'hair', 'vivi');
    expect([r.outfit, r.face, r.hair]).toEqual(['sample_a', 'shino', 'vivi']);
  });
});
