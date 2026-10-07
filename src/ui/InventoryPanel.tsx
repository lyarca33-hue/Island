import { useEffect, useState } from 'react';
import type { Game } from '../game/Game';

type Inventory = NonNullable<ReturnType<Game['inventory']>>;

/**
 * Fenêtre « ce qu'il y a dedans » d'un meuble (frigo, congélateur, placard, tiroir…), ouverte par
 * « Regarder dedans » au clic droit. Elle suit le contenu du meuble ; « Prendre » sort un objet.
 */
export function InventoryPanel({ game, refId, onClose }: { game: Game; refId: string; onClose: () => void }) {
  const [inv, setInv] = useState<Inventory | null>(() => game.inventory(refId));
  useEffect(() => {
    const timer = window.setInterval(() => setInv(game.inventory(refId)), 300);
    return () => window.clearInterval(timer);
  }, [game, refId]);
  if (!inv) return null;
  return (
    <div className="inv-panel" role="dialog" aria-label={`Contenu : ${inv.title}`}>
      <div className="inv-head">
        <b>{inv.title}</b>
        <button className="inv-x" onClick={onClose} aria-label="Fermer la fenêtre">✕</button>
      </div>
      {inv.items.length ? (
        <ul className="inv-list">
          {inv.items.map((i) => (
            <li key={i.ref}>
              <span>
                {i.name}
                {i.count > 1 && <b> ×{i.count}</b>}
                {i.state && <small> · {i.state}</small>}
              </span>
              <button onClick={() => game.takeOut(i.ref)}>Prendre</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="inv-empty">Vide.</p>
      )}
      {inv.open && (
        <button
          className="inv-close"
          onClick={() => {
            game.closeDoor(refId);
            onClose();
          }}
        >
          Refermer
        </button>
      )}
    </div>
  );
}
