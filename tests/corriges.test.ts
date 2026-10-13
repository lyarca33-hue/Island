import { describe, expect, it } from 'vitest';
import { galleryModels } from '../src/game/carteTest';
import { ITEM_BY_ID } from '../src/game/items/catalog';
import { CORRIGES } from '../src/game/items/corriges';

describe('modèles corrigés sur Blender', () => {
  it('chaque objet et chaque modèle de pack listé existe dans la visionneuse', () => {
    const packs = new Set(galleryModels().flatMap(({ pack, models }) => models.map((m) => `${pack}/${m}`)));
    for (const c of CORRIGES) {
      for (const id of c.objets ?? []) expect(ITEM_BY_ID.has(id), id).toBe(true);
      for (const p of c.packs ?? []) expect(packs.has(p), p).toBe(true);
      expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
