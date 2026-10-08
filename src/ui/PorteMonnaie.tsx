import { useEffect, useRef, useState } from 'react';
import { euros } from '../game/argent';
import type { Game } from '../game/Game';
import './magasin.css';

/**
 * Le porte-monnaie, sous les jauges : l'argent du perso. Il brille un instant quand le montant
 * change (vert si ça monte, orange si ça baisse) ; un clic ouvre le magasin.
 */
export function PorteMonnaie({ game }: { game: Game | null }) {
  const [money, setMoney] = useState<number | null>(null);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const last = useRef<number | null>(null);
  const timer = useRef(0);
  useEffect(() => {
    if (!game) return;
    const read = () => {
      const m = game.argent.money;
      if (last.current !== null && m !== last.current) {
        setFlash(m > last.current ? 'up' : 'down');
        clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setFlash(null), 900);
      }
      last.current = m;
      setMoney(m);
    };
    read();
    const off = game.argent.subscribe(read);
    return () => {
      off();
      clearTimeout(timer.current);
    };
  }, [game]);
  if (!game || money === null) return null;
  return (
    <button className={`wallet${flash ? ` ${flash}` : ''}`} onClick={() => game.openShop()} title="Porte-monnaie : ouvrir le magasin" aria-label={`Porte-monnaie : ${euros(money)}. Ouvrir le magasin`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 7.5h14.5A1.5 1.5 0 0 1 20 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM4 7.5l11-3.5v3.5M16 13.5h.01" />
      </svg>
      <b>{euros(money)}</b>
    </button>
  );
}
