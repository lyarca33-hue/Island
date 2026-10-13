import { useEffect, useRef } from 'react';
import type { Game } from '../game/Game';

/** Pixels de vue simulés par pixel glissé sur la molette (la souris capturée tourne de 0,005 rad/px). */
const DRAG = 2.5;
/** Pas des flèches du clavier, en pixels de vue (≈ 7°). */
const KEY_STEP = 25;

/**
 * Molette de caméra du HUD : glisser dessus fait tourner la vue sans butée (un tour complet et
 * au-delà), et à la première personne glisser vers le haut ou le bas incline le regard. Remplace
 * un curseur 0–360° qui s'arrêtait net à ses bouts et ne suivait pas la vue tournée à la souris.
 */
export function CamDial({ game }: { game: Game | null }) {
  const el = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  // les rainures défilent avec l'angle de la vue, quel que soit ce qui la tourne
  useEffect(() => {
    if (!game) return;
    let raf = 0;
    let last = -1;
    const tick = () => {
      const a = Math.round(game.cameraAngle);
      if (a !== last && el.current) {
        last = a;
        el.current.style.setProperty('--cam-offset', `${-a}px`);
        el.current.setAttribute('aria-valuenow', String(a));
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [game]);

  return (
    <div
      ref={el}
      className="cam-dial"
      role="slider"
      tabIndex={0}
      aria-label="Faire tourner la caméra"
      aria-valuemin={0}
      aria-valuemax={360}
      title="Glisser pour faire tourner la caméra (sans fin) ; à la première personne, vers le haut ou le bas pour lever ou baisser le regard"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        drag.current = { x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || !game) return;
        game.turnView((e.clientX - d.x) * DRAG, game.firstPerson ? (e.clientY - d.y) * DRAG : 0);
        d.x = e.clientX;
        d.y = e.clientY;
      }}
      onPointerUp={(e) => {
        drag.current = null;
        // relâché : rendre le clavier au perso (ZQSD)
        e.currentTarget.blur();
      }}
      onPointerCancel={() => (drag.current = null)}
      onKeyDown={(e) => {
        if (!game) return;
        const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!dir) return;
        e.preventDefault();
        e.stopPropagation();
        game.turnView(dir * KEY_STEP, 0);
      }}
    />
  );
}
