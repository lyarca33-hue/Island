import { useEffect, useRef, useState } from 'react';
import type { AtelierCartes } from '../game/atelierCartes';
import { type ContenuCarte, nomDuJour } from '../game/cartes';
import { lireTexte, telechargerJson } from './fichiers';
import { Icon } from './icons';
import { blur, useListen } from './TestHud';
import './cartes.css';

/** « 13/10 à 14:32 » */
const jourHeure = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} à ${p(d.getHours())}:${p(d.getMinutes())}`;
};
/** « 13 oct. 14:32 » */
const dateCourte = (t: number) => {
  const d = new Date(t);
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
};
const ko = (n: number) => `${Math.max(1, Math.round(n / 1024))} Ko`;
const plur = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/** « 12 modèles · 40 pièces · terrain retouché » (ou « Carte vide »). */
function resume(nModeles: number, nPieces: number, terrain: boolean): string {
  const bouts = [nModeles && plur(nModeles, 'modèle'), nPieces && plur(nPieces, 'pièce'), terrain && 'terrain retouché'].filter(Boolean);
  return bouts.length ? bouts.join(' · ') : 'Carte vide';
}

/** Ce qui attend une réponse à « des changements non enregistrés » : ouvrir une carte, en commencer une, importer. */
type Suite = () => Promise<unknown> | unknown;

/**
 * Menu → Carte, sur la carte de test : la carte ouverte (son nom, ce qu'elle contient, si elle est
 * enregistrée), Enregistrer / Enregistrer sous… / Nouvelle carte, la liste « Mes cartes » (ouvrir,
 * exporter, supprimer), importer un fichier, exporter la carte ouverte. Changer de carte quand
 * l'ouverte a des changements non enregistrés demande d'abord quoi en faire.
 *
 * `nommer` : ouvrir tout de suite le champ « Enregistrer sous » (Ctrl+S sur une carte jamais
 * enregistrée) ; `onDone` est appelé quand ce champ se referme, et quand une autre carte est
 * ouverte (le menu peut alors se fermer). `contenu` : ce que la carte ouverte contient maintenant
 * (Game.contenuCarte), pour la ligne « 12 modèles · 40 pièces » ; sans lui, celle de la dernière
 * version enregistrée.
 */
export function CartesPanel({ atelier, nommer, onDone, contenu }: { atelier: AtelierCartes; nommer?: boolean; onDone?: () => void; contenu?: () => ContenuCarte }) {
  useListen(atelier);
  const cur = atelier.courante;
  const liste = atelier.liste;

  // le nom de la carte ouverte : renommée sur Entrée ou en quittant le champ
  const [nom, setNom] = useState(cur.nom);
  const nomFocus = useRef(false);
  useEffect(() => {
    if (!nomFocus.current) setNom(cur.nom);
  }, [cur.nom]);
  const renommer = () => {
    const n = nom.trim();
    if (n && n !== cur.nom) void atelier.renommer(n);
    else setNom(cur.nom);
  };

  // « Enregistrer sous… » : un champ et OK / Annuler ; `apres` : ce qui attendait l'enregistrement
  const [sous, setSous] = useState<{ nom: string; apres?: Suite } | null>(null);
  const sousRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (nommer) setSous((s) => s ?? { nom: nomDuJour() });
  }, [nommer]);
  const sousOuvert = sous !== null;
  useEffect(() => {
    if (sousOuvert) sousRef.current?.focus();
  }, [sousOuvert]);
  const fermerSous = () => {
    setSous(null);
    onDone?.();
  };
  const validerSous = async () => {
    if (!sous) return;
    const n = sous.nom.trim() || nomDuJour();
    const apres = sous.apres;
    setSous(null);
    const ok = await atelier.enregistrerSous(n);
    if (ok && apres) await apres();
    onDone?.();
  };

  // des changements non enregistrés : demander avant d'ouvrir, de commencer ou d'importer une carte
  const [garde, setGarde] = useState<Suite | null>(null);
  const changerDeCarte = (suite: Suite) => {
    if (atelier.courante.modifiee) setGarde(() => suite);
    else void suite();
  };
  const enregistrerDAbord = async () => {
    const suite = garde;
    setGarde(null);
    if (!suite) return;
    if (!atelier.courante.id) setSous({ nom: nomDuJour(), apres: suite });
    else if (await atelier.enregistrer()) await suite();
  };

  const ouvrir = (id: string) =>
    changerDeCarte(async () => {
      if (await atelier.ouvrir(id)) onDone?.();
    });
  const nouvelle = () =>
    changerDeCarte(() => {
      if (atelier.nouvelle()) onDone?.();
    });
  const enregistrer = async () => {
    if (!cur.id) setSous((s) => s ?? { nom: nomDuJour() });
    else await atelier.enregistrer();
  };

  const [supprimer, setSupprimer] = useState<string | null>(null);
  const exporter = async (id?: string) => {
    const f = await atelier.exporter(id);
    if (f) telechargerJson(f.fichier, f.json);
  };

  // importer : la carte est gardée sous un nom libre, puis ouverte (sans stockage : ouverte tout de suite)
  const fichier = useRef<HTMLInputElement>(null);
  const importer = async (file: File) => {
    let texte: string;
    try {
      texte = await lireTexte(file);
    } catch {
      texte = '';
    }
    if (!atelier.dispo) {
      changerDeCarte(() => atelier.importer(texte));
      return;
    }
    const id = await atelier.importer(texte);
    if (id) ouvrir(id);
  };

  // ce que la carte ouverte contient
  let stats: string | null = null;
  if (contenu) {
    const c = contenu();
    stats = resume(c.modeles?.length ?? 0, c.batiments?.length ?? 0, c.relief !== null && c.relief !== undefined);
  } else {
    const info = cur.id ? liste.find((c) => c.id === cur.id) : undefined;
    if (info) stats = resume(info.nModeles, info.nPieces, info.terrain);
  }
  const savedAt = atelier.enregistreeLe;
  const etat = cur.modifiee ? 'Changements non enregistrés' : savedAt && cur.id ? `Enregistrée le ${jourHeure(savedAt)}` : 'Jamais enregistrée';

  return (
    <div className="menu-form cartes-panel">
      <label>
        <small>Carte ouverte</small>
        <input
          value={nom}
          maxLength={80}
          aria-label="Nom de la carte ouverte"
          title="Entrée ou sortie du champ : renommer"
          onFocus={() => (nomFocus.current = true)}
          onChange={(e) => setNom(e.target.value)}
          onBlur={() => {
            nomFocus.current = false;
            renommer();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            else if (e.key === 'Escape') {
              setNom(cur.nom);
              nomFocus.current = false;
              e.currentTarget.blur();
            }
          }}
        />
      </label>
      {stats && <p className="menu-note cartes-stats">{stats}</p>}
      <p className={`cartes-etat${cur.modifiee ? ' modifiee' : ''}`}>
        {cur.modifiee && <span className="carte-dot" />}
        {etat}
      </p>

      {garde ? (
        <div className="terra-confirm cartes-confirm">
          <span>« {cur.nom} » a des changements non enregistrés.</span>
          <button onClick={(e) => { void enregistrerDAbord(); blur(e); }}>Enregistrer d’abord</button>
          <button onClick={(e) => { const s = garde; setGarde(null); void s(); blur(e); }}>Continuer sans</button>
          <button onClick={(e) => { setGarde(null); blur(e); }}>Annuler</button>
        </div>
      ) : sous ? (
        <form
          className="cartes-sous"
          onSubmit={(e) => {
            e.preventDefault();
            void validerSous();
          }}
        >
          <small>{sous.apres ? 'Enregistrer d’abord sous le nom :' : 'Enregistrer sous le nom :'}</small>
          <input
            ref={sousRef}
            value={sous.nom}
            maxLength={80}
            aria-label="Nom de la nouvelle carte"
            onChange={(e) => setSous({ ...sous, nom: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                fermerSous();
              }
            }}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="cartes-row">
            <button type="submit">OK</button>
            <button type="button" onClick={fermerSous}>Annuler</button>
          </div>
        </form>
      ) : (
        <div className="cartes-row">
          <button onClick={(e) => { void enregistrer(); blur(e); }} title="Enregistrer la carte (Ctrl+S)">
            <Icon name="save" size={15} />
            Enregistrer
          </button>
          <button onClick={(e) => { setSous({ nom: nomDuJour() }); blur(e); }} title="Garder la carte ouverte sous un autre nom">
            <Icon name="copy" size={15} />
            Enregistrer sous…
          </button>
          <button onClick={(e) => { nouvelle(); blur(e); }} title="Une carte plate et vide">
            <Icon name="plus" size={15} />
            Nouvelle carte
          </button>
        </div>
      )}

      {!atelier.dispo && <p className="menu-note">Les cartes ne peuvent pas être gardées dans ce navigateur : utilise Exporter / Importer.</p>}

      {atelier.dispo && (
        <>
          <b className="cartes-titre">Mes cartes ({liste.length})</b>
          {liste.length ? (
            <ul className="cartes-liste">
              {liste.map((c) => {
                const ouverte = c.id === cur.id;
                return (
                  <li key={c.id} className={ouverte ? 'ouverte' : ''}>
                    <div className="cartes-ligne">
                      <span className="cartes-nom">
                        <b>{c.nom}</b>
                        <small>{dateCourte(c.modifieLe)} · {ko(c.taille)}</small>
                      </span>
                      {ouverte ? (
                        <small className="cartes-ouverte">(ouverte)</small>
                      ) : (
                        <span className="cartes-outils">
                          <button onClick={(e) => { ouvrir(c.id); blur(e); }}>Ouvrir</button>
                          <button className="cartes-icone" onClick={(e) => { void exporter(c.id); blur(e); }} aria-label={`Exporter « ${c.nom} »`} title="Exporter en fichier">
                            <Icon name="download" size={15} />
                          </button>
                          <button className="cartes-icone" onClick={(e) => { setSupprimer(c.id); blur(e); }} aria-label={`Supprimer « ${c.nom} »`} title="Supprimer">
                            <Icon name="trash" size={15} />
                          </button>
                        </span>
                      )}
                    </div>
                    {supprimer === c.id && (
                      <div className="terra-confirm cartes-confirm">
                        <span>Supprimer « {c.nom} » ?</span>
                        <button className="danger" onClick={(e) => { setSupprimer(null); void atelier.supprimer(c.id); blur(e); }}>Supprimer</button>
                        <button onClick={(e) => { setSupprimer(null); blur(e); }}>Annuler</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="menu-note">Aucune carte enregistrée pour l’instant.</p>
          )}
        </>
      )}

      <div className="cartes-row">
        <button onClick={(e) => { fichier.current?.click(); blur(e); }} title="Ouvrir une carte exportée (.json)">
          <Icon name="upload" size={15} />
          Importer un fichier…
        </button>
        <button onClick={(e) => { void exporter(); blur(e); }} title="Télécharger la carte ouverte, telle qu’elle est">
          <Icon name="download" size={15} />
          Exporter la carte ouverte
        </button>
      </div>
      <input
        ref={fichier}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void importer(f);
        }}
      />
      <small>Cartes gardées dans ce navigateur. Exporte-les en fichier pour les garder ailleurs.</small>
    </div>
  );
}

/**
 * En haut à droite de la carte de test : enregistrer la carte, son nom (ouvre Menu → Carte), un
 * point miel quand elle a des changements non enregistrés. Une carte jamais enregistrée demande
 * d'abord un nom (`onNommer`, sinon `onOpen`).
 */
export function CarteChip({ atelier, onOpen, onNommer }: { atelier: AtelierCartes; onOpen: () => void; onNommer?: () => void }) {
  useListen(atelier);
  const cur = atelier.courante;
  return (
    <div className="carte-chip">
      <button
        className="carte-chip-save"
        onClick={(e) => {
          if (cur.id) void atelier.enregistrer();
          else (onNommer ?? onOpen)();
          blur(e);
        }}
        aria-label="Enregistrer la carte"
        title="Enregistrer la carte (Ctrl+S)"
      >
        <Icon name="save" size={17} />
      </button>
      <button className="carte-chip-nom" onClick={(e) => { onOpen(); blur(e); }} title="Mes cartes (Menu → Carte)">
        <span>{cur.nom}</span>
        {cur.modifiee && <span className="carte-dot" title="Changements non enregistrés" aria-label="Changements non enregistrés" />}
      </button>
    </div>
  );
}
