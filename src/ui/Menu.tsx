import { type ReactNode, useEffect } from 'react';
import { Icon, type IconName } from './icons';

/**
 * Menu déroulant en haut à gauche (bouton ☰ ou Échap). Son contenu est une liste de
 * <MenuSection> : pour ajouter un réglage, ajouter une section dans App.tsx. `tools` : les autres
 * boutons de la barre du haut (caméra, masquer, signaler), rangés à côté du bouton du menu.
 */
export function Menu({ open, onToggle, tools, children }: { open: boolean; onToggle: (open: boolean) => void; tools?: ReactNode; children: ReactNode }) {
  // Échap (hors saisie) : ouvrir / fermer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      onToggle(!open);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onToggle]);

  return (
    <div className="menu">
      <div className="hud-bar">
        <button className={`hud-icon${open ? ' on' : ''}`} onClick={() => onToggle(!open)} aria-expanded={open} aria-label="Menu" title="Menu (Échap)">
          <Icon name="menu" />
        </button>
        {tools}
      </div>
      {open && <div className="menu-panel">{children}</div>}
    </div>
  );
}

/** Une partie du menu, repliable (une seule ouverte à la fois, gérée par App) ; `badge` : un compte à signaler. */
export function MenuSection({ title, icon, badge, open, onToggle, children }: { title: string; icon: IconName; badge?: number; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className={`menu-section${open ? ' open' : ''}`}>
      <button className="menu-section-title" onClick={onToggle} aria-expanded={open}>
        <Icon name={icon} size={16} className="menu-section-icon" />
        <span>{title}</span>
        {badge ? <span className="menu-badge">{badge}</span> : null}
        <Icon name="chevron" size={15} className="menu-chevron" />
      </button>
      {open && <div className="menu-section-body">{children}</div>}
    </section>
  );
}

/** Raccourcis clavier du jeu (ce qu'un clic fait n'est pas listé). */
export const SHORTCUTS: Array<[string, string]> = [
  ['Clic droit', 'Tous les gestes possibles sur un objet'],
  ['ZQSD / ↑↓←→', 'Marcher'],
  ['Maj', 'Courir'],
  ['E', 'Poser / lâcher'],
  ['B', 'Boire'],
  ['M', 'Manger (assis : dans l’assiette)'],
  ['P', 'Servir dans l’assiette'],
  ['V', 'Faire la vaisselle'],
  ['K', 'Couper'],
  ['G', 'Préparer un plat'],
  ['L', 'Lire'],
  ['T', 'Lancer'],
  ['C', 'S’asseoir / se lever ; endormi : se réveiller'],
  ['Entrée', 'Écrire'],
  ['Tab', 'Parole ↔ Action'],
  ['H', 'Masquer / afficher l’interface'],
  ['Échap', 'Menu'],
];

/** Les raccourcis, chaque touche dessinée comme une touche (« ZQSD / ↑↓←→ » : deux touches). */
export function Shortcuts() {
  return (
    <dl className="menu-keys">
      {SHORTCUTS.map(([k, v]) => (
        <div key={k}>
          <dt>{k.split(' / ').map((x) => <kbd key={x} className="key">{x}</kbd>)}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
