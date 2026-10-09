import { useEffect, useState } from 'react';
import type { Game } from '../game/Game';
import { Icon } from './icons';

type Inventory = NonNullable<ReturnType<Game['inventory']>>;

/** Texte foncé sur une case claire, clair sur une case foncée. */
function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#2b1d12' : '#fff6e8';
}

/**
 * Inventaire à cases d'un meuble (frigo, congélateur, placard, tiroir, armoire…), ouvert par
 * « Inventaire » au clic droit. Chaque meuble a sa grille, chaque objet y prend des cases selon sa
 * taille (cases.ts). Un clic sur un objet le sort : la porte s'ouvre et le perso le prend.
 */
export function InventoryPanel({ game, refId, onClose }: { game: Game; refId: string; onClose: () => void }) {
  const [inv, setInv] = useState<Inventory | null>(() => game.inventory(refId));
  const [hoverRef, setHover] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setInv(game.inventory(refId)), 300);
    return () => window.clearInterval(timer);
  }, [game, refId]);
  if (!inv) return null;
  const [cols, rows] = inv.grid;
  const hover = inv.items.find((i) => i.ref === hoverRef);
  const used = inv.items.reduce((n, i) => n + i.cell.w * i.cell.h, 0);
  return (
    <div className="inv-panel inv-cases" role="dialog" aria-label={`Inventaire : ${inv.title}`}>
      <div className="inv-head">
        <b className="inv-title">
          <Icon name="inventory" size={16} />
          {inv.title}
        </b>
        <button className="inv-x" onClick={onClose} aria-label="Fermer l’inventaire">✕</button>
      </div>
      <div className="inv-grid" style={{ gridTemplateColumns: `repeat(${cols}, var(--inv-cell))`, gridTemplateRows: `repeat(${rows}, var(--inv-cell))` }}>
        {Array.from({ length: cols * rows }, (_, k) => (
          <div key={`c${k}`} className="inv-cell" style={{ gridColumn: (k % cols) + 1, gridRow: Math.floor(k / cols) + 1 }} />
        ))}
        {inv.items.map((i) => (
          <button
            key={i.ref}
            className="inv-item"
            lang="fr"
            title={i.state ? `${i.name} · ${i.state}` : i.name}
            style={{ gridColumn: `${i.cell.x + 1} / span ${i.cell.w}`, gridRow: `${i.cell.y + 1} / span ${i.cell.h}`, background: i.color, color: inkOn(i.color) }}
            onPointerEnter={() => setHover(i.ref)}
            onPointerLeave={() => setHover((h) => (h === i.ref ? null : h))}
            onClick={() => game.takeOut(i.ref)}
          >
            {i.name}
          </button>
        ))}
      </div>
      <p className="inv-info">
        {hover ? (
          <>
            <b>{hover.name}</b>
            {hover.state && <small> · {hover.state}</small>} : clique pour le sortir
          </>
        ) : inv.items.length ? (
          `${used} case${used > 1 ? 's' : ''} sur ${cols * rows}`
        ) : (
          'Vide.'
        )}
      </p>
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
