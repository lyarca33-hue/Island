// Teste le vrai Jev sans la 3D : petite pièce simulée (mêmes actions, même prompt que le jeu).
// Mode d’emploi : tools/README.md.
import { runJev, openRouterChat, type ChatMessage } from '../src/jev/jev';
(globalThis as any).requestAnimationFrame = (f: () => void) => setTimeout(f, 0);

type Obj = { ref: string; nom: string; portable: boolean; ou: string };
const objets: Obj[] = [
  { ref: 'table', nom: 'table', portable: false, ou: 'au sol' },
  { ref: 'tasse', nom: 'tasse', portable: true, ou: 'posé sur table' },
  { ref: 'lettre', nom: 'lettre', portable: true, ou: 'posé sur table' },
  { ref: 'caisse', nom: 'caisse', portable: true, ou: 'au sol' },
  { ref: 'bibliotheque', nom: 'bibliothèque', portable: false, ou: 'au sol' },
  { ref: 'machine-a-cafe', nom: 'machine à café', portable: false, ou: 'au sol' },
  { ref: 'livre-rouge', nom: 'livre', portable: true, ou: 'rangé dans bibliotheque' },
  { ref: 'livre-vert-1', nom: 'livre', portable: true, ou: 'rangé dans bibliotheque' },
  { ref: 'livre-ocre-1', nom: 'livre', portable: true, ou: 'rangé dans bibliotheque' },
  { ref: 'livre-violet', nom: 'livre', portable: true, ou: 'rangé dans bibliotheque' },
  { ref: 'livre', nom: 'livre', portable: true, ou: 'au sol' },
  { ref: 'livre-vert-2', nom: 'livre', portable: true, ou: 'au sol' },
  { ref: 'livre-ocre-2', nom: 'livre', portable: true, ou: 'posé sur table' },
];
let hand: Obj[] = [];
const game: any = {
  onNotice: null as null | ((t: string) => void),
  idle: true,
  describe: () => ({ perso: 'peut porter des objets', enMain: hand.map((o) => o.ref), objets: objets.map((o) => ({ ...o, distance: 2 })) }),
  use(ref: string) {
    const o = objets.find((x) => x.ref === ref);
    if (!o) return this.onNotice?.(`Aucun objet « ${ref} ».`), false;
    if (o.ref === 'bibliotheque' && hand.length) {
      if (hand[0].nom !== 'livre') return this.onNotice?.('On ne range que des livres ici.'), false;
      for (const h of hand) h.ou = 'rangé dans bibliotheque';
      hand = [];
      return true;
    }
    if (!o.portable) return this.onNotice?.(`On ne peut pas porter : ${o.nom}.`), false;
    if (hand.length && !(o.nom === 'livre' && hand[0].nom === 'livre' && hand.length < 6)) return this.onNotice?.(`Les mains sont prises (${hand[0].nom}). E pour la poser.`), false;
    o.ou = 'en main';
    hand.push(o);
    return true;
  },
  drop() { if (!hand.length) return false; for (const h of hand) h.ou = 'au sol'; hand = []; return true; },
  walkTo: () => true, makeCoffee: () => false, drink: () => false,
  say: (t: string) => console.log('  [dit]', t),
};
const settings = { apiKey: process.env.OPENROUTER_API_KEY!, model: process.env.MODEL || 'typesafe/jev-1.13' };
const chat = openRouterChat(settings);
const logged = async (m: ChatMessage[], s?: AbortSignal) => { const r = await chat(m, s); console.log('  Jev >', r.replace(/\s+/g, ' ').slice(0, 300)); return r; };
const req = process.argv[2] || 'range tous les livres';
console.log('Demande :', req);
const t0 = Date.now();
const msg = await runJev(game, logged, req, () => {});
console.log('Fin :', msg, `(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
console.log('Livres :', objets.filter((o) => o.nom === 'livre').map((o) => `${o.ref}=${o.ou}`).join(' | '));
