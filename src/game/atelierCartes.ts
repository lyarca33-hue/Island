/**
 * L'atelier des cartes de la carte de test : la carte ouverte, la liste « Mes cartes », et ce
 * qu'on en fait (enregistrer, enregistrer sous, ouvrir, nouvelle, renommer, supprimer, exporter,
 * importer). Il ne connaît pas le jeu : il lui demande ce que la carte contient (capturer) et lui
 * donne une carte à reprendre (appliquer), par les crochets que Game lui passe.
 *
 * Le brouillon (terrain, bâtiments, modèles, gardés à chaque changement dans le stockage local)
 * reste l'affaire du jeu : ici, une carte n'est écrite que sur « Enregistrer ». La carte ouverte
 * est notée « changée » (marquer) à chaque retouche, sauf pendant qu'on en applique une.
 */
import {
  type CarteCourante, type CarteGrille, type CarteInfo, type CarteSave, CARTE_FORMAT, CARTE_V, type ContenuCarte,
  contenuVide, lireCarte, MAX_CARTE_OCTETS, migrerBrouillon, MSG_PAS_UNE_CARTE, nomFichier, nomLibre, nouvelId,
  nouvelleCarte, SANS_NOM,
} from './cartes';
import { STOCKAGE_NAVIGATEUR, type StockageCartes } from './cartesStockage';

/** Ce que le jeu prête à l'atelier. */
export interface CarteHooks {
  /** Le contenu de la carte ouverte (terrain, bâtiments, modèles, place du perso). */
  capturer(): ContenuCarte;
  /** Remplace la carte ouverte ; faux : refusé (un geste en cours). */
  appliquer(c: ContenuCarte): boolean;
  notice(t: string): void;
}

export const MSG_PLEIN = 'Carte non enregistrée : stockage du navigateur plein ou refusé. Exporte-la en fichier.';
export const MSG_INDISPO = 'Les cartes ne peuvent pas être gardées dans ce navigateur : utilise Exporter / Importer.';

/**
 * La migration des brouillons d'avant les cartes, une seule fois par stockage : le double effet
 * de React (StrictMode) crée deux jeux, le second attend la même promesse.
 */
const migrations = new WeakMap<StockageCartes, Promise<CarteCourante | null>>();

const avec = (msg: string, avertissements: string[]) => [msg, ...avertissements].join(' ');

export class AtelierCartes {
  private cur: CarteCourante = { id: null, nom: SANS_NOM, modifiee: false };
  private cartes: CarteInfo[] = [];
  private savedAt: number | null = null;
  private ok = false;
  /** Une carte s'applique : ses changements ne comptent pas. */
  private applique = false;
  /** Compte des retouches : celles faites pendant une écriture laissent la carte « changée ». */
  private rev = 0;
  private arretee = false;
  private listeners = new Set<() => void>();

  constructor(
    private hooks: CarteHooks,
    private grille: CarteGrille,
    private st: StockageCartes = STOCKAGE_NAVIGATEUR,
  ) {}

  /** La carte ouverte. */
  get courante(): CarteCourante {
    return this.cur;
  }

  /** « Mes cartes », de la plus récente à la plus ancienne. */
  get liste(): CarteInfo[] {
    return this.cartes;
  }

  /** Quand la carte ouverte a été enregistrée (ou ouverte) pour la dernière fois, null : jamais. */
  get enregistreeLe(): number | null {
    return this.savedAt;
  }

  /** Les cartes peuvent être gardées dans ce navigateur. */
  get dispo(): boolean {
    return this.ok;
  }

  listen(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    if (this.arretee) return;
    for (const fn of this.listeners) fn();
  }

  /** L'atelier d'un jeu détruit : plus rien n'est signalé. */
  arreter(): void {
    this.arretee = true;
    this.listeners.clear();
  }

  private poser(c: CarteCourante): void {
    this.cur = c;
    this.st.ecrireCourante(c);
  }

  private async relister(): Promise<void> {
    this.cartes = this.ok ? await this.st.lister() : [];
  }

  /**
   * Au lancement : range une fois les brouillons d'avant les cartes en « Ma carte d'avant »,
   * reprend la carte ouverte à la dernière visite et lit la liste.
   */
  async demarrer(): Promise<void> {
    this.ok = await this.st.dispo();
    let migree: CarteCourante | null = null;
    if (this.ok) {
      let m = migrations.get(this.st);
      if (!m && !this.st.migree()) {
        m = this.migrer();
        migrations.set(this.st, m);
      }
      if (m) migree = await m;
    }
    await this.relister();
    if (migree) {
      this.poser(migree);
    } else {
      const c = this.st.lireCourante();
      if (c) this.cur = c;
      else this.poser({ id: null, nom: SANS_NOM, modifiee: this.nonVide() });
    }
    // la carte ouverte a disparu (supprimée dans un autre onglet) : elle redevient sans id
    const info = this.cur.id ? this.cartes.find((c) => c.id === this.cur.id) : undefined;
    if (this.cur.id && !info) this.poser({ id: null, nom: this.cur.nom, modifiee: true });
    this.savedAt = info?.modifieLe ?? null;
    this.changed();
  }

  private nonVide(): boolean {
    const c = this.hooks.capturer();
    return !!(c.relief || c.batiments?.length || c.modeles?.length);
  }

  private async migrer(): Promise<CarteCourante | null> {
    // posé avant l'écriture : un second lancement ne recommence pas
    this.st.marquerMigree();
    const c = this.hooks.capturer();
    const carte = migrerBrouillon(c.relief, c.batiments, this.grille, Date.now());
    if (!carte) return null;
    if (c.modeles?.length) carte.modeles = c.modeles;
    if (await this.st.ecrire(carte)) return { id: carte.id, nom: carte.nom, modifiee: false };
    return { id: null, nom: SANS_NOM, modifiee: true };
  }

  /** La carte ouverte a changé (ignoré pendant qu'une carte s'applique). */
  marquer(): void {
    if (this.applique) return;
    this.rev++;
    if (this.cur.modifiee) return;
    this.poser({ ...this.cur, modifiee: true });
    this.changed();
  }

  /** La carte ouverte, telle qu'elle est maintenant. */
  private capture(id: string, nom: string, creeLe: number, now: number): CarteSave {
    const carte = nouvelleCarte(nom, this.hooks.capturer(), this.grille, now);
    carte.id = id;
    carte.creeLe = creeLe;
    return carte;
  }

  /** Écrit la carte ; si c'est fait, elle devient la carte ouverte, à jour. */
  private async ecrire(carte: CarteSave, rev: number): Promise<boolean> {
    if (!(await this.st.ecrire(carte))) {
      this.hooks.notice(MSG_PLEIN);
      return false;
    }
    this.poser({ id: carte.id, nom: carte.nom, modifiee: this.rev !== rev });
    this.savedAt = carte.modifieLe;
    await this.relister();
    this.hooks.notice(`Carte « ${carte.nom} » enregistrée.`);
    this.changed();
    return true;
  }

  /** Enregistre la carte ouverte à sa place ; faux sans id (l'interface demande alors un nom). */
  async enregistrer(): Promise<boolean> {
    const { id, nom } = this.cur;
    if (!id) return false;
    if (!this.ok) {
      this.hooks.notice(MSG_INDISPO);
      return false;
    }
    const rev = this.rev, now = Date.now();
    const avant = (await this.st.lire(id)) as Partial<CarteSave> | null;
    const creeLe = typeof avant?.creeLe === 'number' ? avant.creeLe : now;
    return this.ecrire(this.capture(id, nom, creeLe, now), rev);
  }

  /** Enregistre la carte ouverte comme une nouvelle carte (un nom déjà pris reçoit un numéro). */
  async enregistrerSous(nom: string): Promise<boolean> {
    if (!this.ok) {
      this.hooks.notice(MSG_INDISPO);
      return false;
    }
    const rev = this.rev, now = Date.now();
    const libre = nomLibre(nom, this.cartes.map((c) => c.nom));
    return this.ecrire(this.capture(nouvelId(now), libre, now, now), rev);
  }

  /** Donne une carte au jeu ; faux s'il la refuse. */
  private appliquer(c: ContenuCarte): boolean {
    this.applique = true;
    try {
      return this.hooks.appliquer(c);
    } finally {
      this.applique = false;
    }
  }

  /** Ouvre une carte gardée (sans demander : l'interface a déjà proposé d'enregistrer). */
  async ouvrir(id: string): Promise<boolean> {
    if (!this.ok) {
      this.hooks.notice(MSG_INDISPO);
      return false;
    }
    const lu = lireCarte(await this.st.lire(id), this.grille);
    if ('erreur' in lu) {
      this.hooks.notice(lu.erreur);
      return false;
    }
    const { carte, avertissements } = lu;
    if (!this.appliquer(carte)) return false;
    this.poser({ id, nom: carte.nom, modifiee: false });
    this.savedAt = carte.modifieLe;
    this.hooks.notice(avec(`Carte « ${carte.nom} » ouverte.`, avertissements));
    this.changed();
    return true;
  }

  /** Une carte neuve : terrain plat, rien de posé, pas encore enregistrée. */
  nouvelle(): boolean {
    if (!this.appliquer(contenuVide())) return false;
    this.poser({ id: null, nom: SANS_NOM, modifiee: false });
    this.savedAt = null;
    this.hooks.notice('Nouvelle carte.');
    this.changed();
    return true;
  }

  /** Renomme la carte ouverte (et la carte gardée, sans toucher à son contenu). */
  async renommer(nom: string): Promise<void> {
    const { id } = this.cur;
    const libre = nomLibre(nom, this.cartes.filter((c) => c.id !== id).map((c) => c.nom));
    if (libre === this.cur.nom) return;
    this.poser({ ...this.cur, nom: libre });
    if (id && this.ok) {
      const lu = lireCarte(await this.st.lire(id), this.grille);
      if (!('erreur' in lu) && !(await this.st.ecrire({ ...lu.carte, nom: libre }))) this.hooks.notice(MSG_PLEIN);
      await this.relister();
    }
    this.changed();
  }

  /** Supprime une carte gardée ; la carte ouverte, si c'est elle, reste là, sans id. */
  async supprimer(id: string): Promise<void> {
    if (!this.ok) return;
    await this.st.supprimer(id);
    if (this.cur.id === id) {
      this.poser({ id: null, nom: this.cur.nom, modifiee: true });
      this.savedAt = null;
    }
    await this.relister();
    this.changed();
  }

  /** Le fichier d'une carte gardée, ou de la carte ouverte telle qu'elle est (sans id). */
  async exporter(id?: string): Promise<{ fichier: string; json: string } | null> {
    let carte: CarteSave;
    if (id && id !== this.cur.id) {
      const lu = lireCarte(await this.st.lire(id), this.grille);
      if ('erreur' in lu) {
        this.hooks.notice(lu.erreur);
        return null;
      }
      carte = lu.carte;
    } else {
      const now = Date.now();
      carte = this.capture(this.cur.id ?? nouvelId(now), this.cur.nom, now, now);
    }
    return { fichier: nomFichier(carte.nom), json: JSON.stringify(carte) };
  }

  /**
   * Garde la carte d'un fichier, sous un id neuf et un nom libre, et rend son id (l'interface
   * l'ouvre ensuite). Sans IndexedDB, elle est ouverte tout de suite (et rien n'est rendu) :
   * l'interface doit alors proposer d'enregistrer la carte ouverte avant.
   */
  async importer(texte: string): Promise<string | null> {
    let x: unknown = null;
    if (texte.length <= MAX_CARTE_OCTETS) {
      try {
        x = JSON.parse(texte);
      } catch {
        x = null;
      }
    }
    const lu = lireCarte(x, this.grille);
    if ('erreur' in lu) {
      this.hooks.notice(lu.erreur || MSG_PAS_UNE_CARTE);
      return null;
    }
    const now = Date.now();
    const carte: CarteSave = {
      ...lu.carte,
      format: CARTE_FORMAT,
      v: CARTE_V,
      id: nouvelId(now),
      nom: nomLibre(lu.carte.nom, this.cartes.map((c) => c.nom)),
      modifieLe: now,
    };
    if (!this.ok) {
      if (!this.appliquer(carte)) return null;
      this.poser({ id: null, nom: carte.nom, modifiee: true });
      this.savedAt = null;
      this.hooks.notice(avec(`Carte « ${carte.nom} » importée.`, lu.avertissements));
      this.changed();
      return null;
    }
    if (!(await this.st.ecrire(carte))) {
      this.hooks.notice(MSG_PLEIN);
      return null;
    }
    await this.relister();
    this.hooks.notice(avec(`Carte « ${carte.nom} » importée.`, lu.avertissements));
    this.changed();
    return carte.id;
  }
}
