/**
 * Modèles corrigés sur Blender (tools/retouche_glb), montrés dans l'onglet « Corrigés sur Blender »
 * de la visionneuse (ui/Visionneuse.tsx). Un modèle par entrée, avec ce qui a été fait et la PR.
 * Repères comme sur la carte de test : `objet <id>` pour un objet du jeu, `pack <pack>/<modèle>`
 * pour un modèle de la galerie (le même modèle peut habiller un objet : les deux sont donnés).
 * Après une retouche, ajouter ici le modèle corrigé.
 */
export interface Correction {
  /** Objets du jeu (id) et modèles de pack (`pack/modèle`) refaits. */
  objets?: string[];
  packs?: string[];
  /** Jour de la correction (AAAA-MM-JJ). */
  date: string;
  /** Ce qui a été corrigé. */
  quoi: string;
  /** Numéro de la PR sur GitHub. */
  pr: number;
}

export const CORRIGES: Correction[] = [
  { objets: ['banane'], packs: ['aliments/banane'], date: '2026-10-13', pr: 198, quoi: 'maillage refait d’un seul tenant (plus de fentes ni de trous), texture recuite' },
  { objets: ['beche'], date: '2026-10-13', pr: 198, quoi: 'le dos du manche et de la poignée, gris, reprend la texture bois de l’avant' },
  { objets: ['beurre'], packs: ['aliments/beurre'], date: '2026-10-13', pr: 198, quoi: 'le papier froissé du bas est ramené sous le pain, posé sur un beurrier en faïence' },
  { objets: ['boite-lettres'], date: '2026-10-13', pr: 198, quoi: 'les deux anneaux qui flottaient sous la boîte sont retirés' },
  { objets: ['bol'], date: '2026-10-13', pr: PR_7, quoi: 'maillage refait lisse et rond (plus de facettes), texture d’une seule teinte' },
  { objets: ['carafe'], date: '2026-10-13', pr: PR_7, quoi: 'l’anse ressort du verre au lieu d’être dedans ; verre arrondi en un seul tour (48 côtés au lieu de 22)' },
  { objets: ['casserole'], date: '2026-10-13', pr: PR_7, quoi: 'maillage refait lisse et rond (plus de facettes), texture recuite en aplats' },
  { objets: ['crumble'], packs: ['plats/crumble'], date: '2026-10-13', pr: PR_7, quoi: 'maillage refait d’un seul tenant et adouci, texture recuite' },
  { objets: ['four'], date: '2026-10-13', pr: PR_7, quoi: 'faces du caisson redressées bien à plat, plis peints dans la texture adoucis' },
  { objets: ['lettre'], date: '2026-10-13', pr: PR_7, quoi: 'les taches noires sur le papier sont effacées, le cachet de cire reste' },
  { objets: ['machine-a-laver'], date: '2026-10-13', pr: PR_7, quoi: 'faces du caisson redressées bien à plat, plis peints dans la texture adoucis' },
];

/** La correction d'un objet du jeu (`id`) ou d'un modèle de pack (`pack/modèle`), s'il y en a une. */
export function correctionOf(o: { objet?: string; pack?: string }): Correction | undefined {
  return CORRIGES.find((c) => (o.objet !== undefined && c.objets?.includes(o.objet)) || (o.pack !== undefined && c.packs?.includes(o.pack)));
}
