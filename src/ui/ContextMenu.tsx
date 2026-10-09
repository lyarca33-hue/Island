import { useEffect } from 'react';
import type { ContextMenu as Menu } from '../game/Game';
import { Icon } from './icons';

/**
 * Menu rond au clic droit : les gestes possibles sur l'objet visé, en cercle autour du point
 * cliqué, le nom de l'objet au centre. Un clic sur un geste le lance ; Échap ou un clic à côté
 * ferme le menu.
 */
export function ContextMenu({ menu, onClose }: { menu: Menu; onClose: () => void }) {
  // Échap ferme ce menu (sans ouvrir le menu principal, qui écoute aussi Échap)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const n = menu.entries.length;
  // assez grand pour que les gestes de côté ne mordent pas sur le nom de l'objet au centre
  const radius = n <= 1 ? 0 : Math.max(60, n * 12, menu.title.length * 3.6 + 18);
  // garder le cercle dans la vue (place pour les étiquettes de part et d'autre)
  const w = window.innerWidth;
  const h = window.innerHeight;
  const x = Math.min(Math.max(menu.x, radius + 180), Math.max(radius + 180, w - radius - 180));
  const y = Math.min(Math.max(menu.y, radius + 30), Math.max(radius + 30, h - radius - 30));

  return (
    <div className="ctx-backdrop" onPointerDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div className="ctx-menu" style={{ left: x, top: y }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="ctx-title">{menu.title}</div>
        {menu.entries.map((entry, i) => {
          // premier geste en haut, puis dans le sens des aiguilles d'une montre
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(n, 1);
          // l'étiquette part vers l'extérieur du cercle : à droite, calée à gauche, et l'inverse
          const cos = Math.cos(a);
          const ax = n <= 1 || Math.abs(cos) < 0.3 ? '-50%' : cos > 0 ? '0%' : '-100%';
          return (
            <button
              key={entry.label}
              className="ctx-entry"
              style={{ left: cos * radius, top: Math.sin(a) * radius + (n <= 1 ? 34 : 0), animationDelay: `${i * 18}ms`, ['--ax' as string]: ax }}
              onClick={() => {
                onClose();
                entry.run();
              }}
            >
              {entry.icon && <Icon name={entry.icon} size={15} className="ctx-icon" />}
              {entry.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
