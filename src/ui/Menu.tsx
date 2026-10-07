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

/** Raccourcis clavier et souris du jeu. */
export const SHORTCUTS: Array<[string, string]> = [
  ['Clic', 'Aller ici'],
  ['Clic sur un objet', 'Le prendre / l’utiliser'],
  ['Z Q S D ou flèches', 'Marcher'],
  ['Maj', 'Courir'],
  ['E', 'Poser'],
  ['B', 'Boire'],
  ['M', 'Manger'],
  ['L', 'Lire / fermer le livre'],
  ['T', 'Lancer l’objet tenu'],
  ['Clic sur un meuble (mains vides)', 'L’agripper : Z Q S D le déplacent, E le lâche'],
  ['Clic sur la porte du frigo', 'L’ouvrir / la fermer (sur le côté : le pousser)'],
  ['Clic sur le frigo (objet en main)', 'Y ranger la bouteille, la pomme ou le sandwich'],
  ['Souris sur un objet', 'Son état (neuf, usé…) et sa durabilité'],
  ['Entrée', 'Écrire'],
  ['Tab (en écrivant)', 'Parole ↔ Action'],
  ['Échap', 'Menu'],
];
