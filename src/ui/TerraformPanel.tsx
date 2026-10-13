import { useEffect, useReducer, useState } from 'react';
import type { Game } from '../game/Game';
import { RADIUS_MAX, RADIUS_MIN, TERRA_GROUNDS, TERRA_TOOLS } from '../game/terraform';
import { Icon } from './icons';
import './terraform.css';

/**
 * Le panneau de la terraformation (ouvert par le bouton montagne ou la touche U) : le pinceau,
 * le sol à peindre, la taille et la force, et de quoi rendre à l'île son relief d'origine.
 */
export function TerraformPanel({ game }: { game: Game }) {
  const t = game.terraform;
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => t.listen(refresh), [t]);
  /** « Tout rétablir » demande confirmation. */
  const [asking, setAsking] = useState(false);
  if (!t.on) return null;
  const tool = TERRA_TOOLS.find((x) => x.id === t.tool)!;
  // un réglage touché à la souris : rendre le clavier au perso (ZQSD)
  const blur = (e: { currentTarget: HTMLElement }) => e.currentTarget.blur();
  return (
    <div className="terra-panel" role="dialog" aria-label="Terraformation">
      <div className="terra-head">
        <Icon name="mountain" size={18} />
        <b>Terraformation</b>
        <button className="hud-icon" onClick={() => (game.terraforming = false)} aria-label="Fermer la terraformation" title="Fermer (U)">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="terra-tools">
        {TERRA_TOOLS.map((x, i) => (
          <button key={x.id} className={t.tool === x.id ? 'active' : ''} onClick={(e) => { t.setTool(x.id); blur(e); }} title={x.hint}>
            <kbd className="key key-ghost">{i + 1}</kbd>
            {x.label}
          </button>
        ))}
      </div>
      {t.tool === 'peindre' && (
        <div className="terra-grounds">
          {TERRA_GROUNDS.map((g) => (
            <button key={g.id} className={t.ground === g.id ? 'active' : ''} onClick={(e) => { t.setGround(g.id); blur(e); }}>
              <span className="terra-swatch" style={{ background: g.color }} />
              {g.label}
            </button>
          ))}
        </div>
      )}
      <label className="terra-slider">
        <span>Taille</span>
        <input type="range" min={RADIUS_MIN} max={RADIUS_MAX} step={0.5} value={t.radius} onChange={(e) => t.setRadius(+e.target.value)} onPointerUp={blur} />
        <span className="terra-value">{t.radius.toFixed(1).replace('.', ',')} m</span>
      </label>
      <label className="terra-slider">
        <span>Force</span>
        <input type="range" min={0.1} max={1} step={0.05} value={t.strength} onChange={(e) => t.setStrength(+e.target.value)} onPointerUp={blur} />
        <span className="terra-value">{Math.round(t.strength * 100)} %</span>
      </label>
      <p className="terra-hint">{tool.hint}. Clic gauche maintenu pour façonner, molette pour reculer.</p>
      {asking ? (
        <div className="terra-confirm">
          <span>Rendre toute l’île comme au départ ?</span>
          <button onClick={(e) => { t.resetAll(); setAsking(false); blur(e); }}>Oui</button>
          <button onClick={(e) => { setAsking(false); blur(e); }}>Non</button>
        </div>
      ) : (
        <button className="terra-reset" onClick={(e) => { setAsking(true); blur(e); }}>Tout rétablir</button>
      )}
    </div>
  );
}
