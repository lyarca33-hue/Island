import { useEffect, useReducer, useState } from 'react';
import type { Game } from '../game/Game';
import { CATEGORIES, PIECE_BY_ID, PIECES } from '../game/batir';
import { Icon } from './icons';
import './terraform.css';
import './build.css';

/**
 * Le panneau du créateur de bâtiment (sa page `?batir` ; bouton maison ou touche N) : les familles de pièces (murs, sols,
 * toits, décor), la pièce à poser, tourner, démolir, annuler, et de quoi tout démolir.
 */
export function BuildPanel({ game }: { game: Game }) {
  const c = game.construction;
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => c.listen(refresh), [c]);
  /** « Tout démolir » demande confirmation. */
  const [asking, setAsking] = useState(false);
  if (!c.on) return null;
  const piece = PIECE_BY_ID.get(c.piece)!;
  const list = PIECES.filter((p) => p.cat === c.category);
  // un réglage touché à la souris : rendre le clavier au perso (ZQSD)
  const blur = (e: { currentTarget: HTMLElement }) => e.currentTarget.blur();
  const demolish = c.tool === 'demolir';
  return (
    <div className="terra-panel build-panel" role="dialog" aria-label="Construction">
      <div className="terra-head">
        <Icon name="house" size={18} />
        <b>Construction</b>
        <button className="hud-icon" onClick={() => (game.building = false)} aria-label="Fermer la construction" title="Fermer (N)">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="build-tabs" role="tablist">
        {CATEGORIES.map((cat) => (
          <button key={cat.id} role="tab" aria-selected={c.category === cat.id} className={c.category === cat.id ? 'active' : ''} onClick={(e) => { c.setCategory(cat.id); blur(e); }}>
            {cat.label}
          </button>
        ))}
      </div>
      <div className="terra-tools build-pieces">
        {list.map((p, i) => (
          <button key={p.id} className={!demolish && c.piece === p.id ? 'active' : ''} onClick={(e) => { c.setPiece(p.id); blur(e); }} title={p.hint}>
            <kbd className="key key-ghost">{i + 1}</kbd>
            {p.label}
          </button>
        ))}
      </div>
      <div className="build-actions">
        <button onClick={(e) => { c.rotate(); blur(e); }} disabled={demolish} title="Tourner la pièce (R)">
          <Icon name="rotate" size={15} />
          Tourner
        </button>
        <button className={demolish ? 'active danger' : ''} onClick={(e) => { c.setTool(demolish ? 'poser' : 'demolir'); blur(e); }} aria-pressed={demolish} title="Démolir la pièce visée (Suppr)">
          <Icon name="trash" size={15} />
          Démolir
        </button>
        <button onClick={(e) => { c.undo(); blur(e); }} disabled={!c.canUndo} title="Annuler (Ctrl+Z)">
          <Icon name="undo" size={15} />
          Annuler
        </button>
      </div>
      <p className="terra-hint">
        {demolish
          ? 'Clic sur une pièce pour la démolir (glisser pour en démolir plusieurs).'
          : `${piece.hint}. Clic pour poser, glisser pour poser une rangée ; sur une place prise, la pièce remplace l’ancienne.`}
      </p>
      {asking ? (
        <div className="terra-confirm">
          <span>Démolir les {c.count} pièces posées ?</span>
          <button onClick={(e) => { c.clearAll(); setAsking(false); blur(e); }}>Oui</button>
          <button onClick={(e) => { setAsking(false); blur(e); }}>Non</button>
        </div>
      ) : (
        <div className="build-foot">
          <span className="terra-value">{c.count} pièce{c.count > 1 ? 's' : ''}</span>
          <button className="terra-reset" disabled={!c.count} onClick={(e) => { setAsking(true); blur(e); }}>Tout démolir</button>
        </div>
      )}
    </div>
  );
}
