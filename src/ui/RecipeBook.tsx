import { useEffect, useState } from 'react';
import type { Game } from '../game/Game';
import { runIntents, type Intent } from '../orders/tasks';

type Entry = ReturnType<Game['recipeBook']>[number];

/**
 * Le livre de recettes : toutes les recettes, ce qui en manque à la maison, et comment les faire.
 * « Préparer » envoie l'ordre au perso (comme « fais une omelette »). Ouvert en lisant le livre de
 * recettes de la cuisine (fenêtre), ou dans le menu (`inline`).
 */
export function RecipeBook({ game, inline, onClose }: { game: Game; inline?: boolean; onClose?: () => void }) {
  const [book, setBook] = useState<Entry[]>(() => game.recipeBook());
  const [skill, setSkill] = useState(() => game.cookingSkill);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setBook(game.recipeBook());
      setSkill(game.cookingSkill);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [game]);

  const prepare = async (e: Entry) => {
    const intent: Intent | null = e.task ? { kind: e.task } : e.plat ? { kind: 'preparer', plat: e.plat } : null;
    if (!intent || busy) return;
    setBusy(e.name);
    const r = await runIntents(game, [intent], () => {});
    setBusy(null);
    game.onNotice?.(r.ok ? `${e.name.charAt(0).toUpperCase()}${e.name.slice(1)} : c’est fait.` : r.message);
  };

  const body = (
    <>
      <p className="recipe-skill">
        Compétence cuisine : <b>niveau {skill.level}</b>
        {skill.next !== null ? ` (${skill.points - skill.from} / ${skill.next - skill.from} points)` : ' (maximum)'}
      </p>
      <ul className="inv-list recipe-list">
        {book.map((e) => (
          <li key={e.name} className={open === e.name ? 'open' : ''}>
            <button className="recipe-name" onClick={() => setOpen(open === e.name ? null : e.name)} aria-expanded={open === e.name}>
              <span>{e.name}</span>
              <small>{e.ready ? 'tout est là' : `il manque ${e.needs.filter((n) => !n.have).length}`}</small>
            </button>
            {open === e.name && (
              <div className="recipe-detail">
                <div>
                  {e.needs.map((n, i) => (
                    <span key={i} className={n.have ? 'have' : 'miss'}>{n.have ? '✓' : '✗'} {n.name}</span>
                  ))}
                  {e.extras.length > 0 && <small> · en plus si tu en as : {e.extras.join(', ')}</small>}
                </div>
                <p>{e.how}</p>
                {(e.task || e.plat) && <button onClick={() => prepare(e)} disabled={!!busy}>{busy === e.name ? 'En cours…' : 'Préparer'}</button>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
  if (inline) return <div className="recipe-book">{body}</div>;
  return (
    <div className="inv-panel recipe-book" role="dialog" aria-label="Livre de recettes">
      <div className="inv-head">
        <b>Livre de recettes</b>
        {onClose && <button className="inv-x" onClick={onClose} aria-label="Fermer le livre">✕</button>}
      </div>
      {body}
    </div>
  );
}
