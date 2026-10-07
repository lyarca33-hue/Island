import { type ReactNode, useEffect } from 'react';

/**
 * Menu déroulant en haut à gauche (bouton ☰ ou Échap). Son contenu est une liste de
 * <MenuSection> : pour ajouter un réglage, ajouter une section dans App.tsx.
 */
export function Menu({ open, onToggle, children }: { open: boolean; onToggle: (open: boolean) => void; children: ReactNode }) {
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
      <button className="menu-button" onClick={() => onToggle(!open)} aria-expanded={open} title="Menu (Échap)">
        ☰ Menu
      </button>
      {open && <div className="menu-panel">{children}</div>}
    </div>
  );
}

/** Une partie du menu, repliable (une seule ouverte à la fois, gérée par App). */
export function MenuSection({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className={`menu-section${open ? ' open' : ''}`}>
      <button className="menu-section-title" onClick={onToggle} aria-expanded={open}>
        <span>{title}</span>
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="menu-section-body">{children}</div>}
    </section>
  );
}

/** Raccourcis clavier du jeu (ce qu'un clic fait n'est pas listé). */
export const SHORTCUTS: Array<[string, string]> = [
  ['ZQSD / ↑↓←→', 'Marcher'],
  ['Maj', 'Courir'],
  ['E', 'Poser / lâcher'],
  ['B', 'Boire'],
  ['M', 'Manger (assis : dans l’assiette)'],
  ['P', 'Servir dans l’assiette'],
  ['V', 'Faire la vaisselle'],
  ['L', 'Lire'],
  ['T', 'Lancer'],
  ['C', 'S’asseoir / se lever'],
  ['Entrée', 'Écrire'],
  ['Tab', 'Parole ↔ Action'],
  ['Échap', 'Menu'],
];
