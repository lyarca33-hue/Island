import { Fragment, type ReactNode } from 'react';
import type { Game, HandActions } from '../game/Game';
import { Icon, type IconName } from './icons';

/** Une touche du clavier, dessinée comme une touche. */
export function Key({ k }: { k: string }) {
  return <kbd className="key">{k}</kbd>;
}

/** Bouton d'action : la touche puis le geste ; `main` : le geste principal (teinté). */
function Act({ k, label, title, main, onClick }: { k: string | string[]; label: string; title?: string; main?: boolean; onClick?: () => void }) {
  const keys = Array.isArray(k) ? k : [k];
  const body = (
    <>
      <span className="act-keys">{keys.map((x) => <Key key={x} k={x} />)}</span>
      {label}
    </>
  );
  // les gestes au clavier seulement (déplacer un meuble) ne sont pas des boutons
  if (!onClick) return <span className="act act-info" title={title}>{body}</span>;
  return (
    <button className={`act${main ? ' act-main' : ''}`} onClick={onClick} title={title ?? `${label} (${keys.join(' ')})`}>
      {body}
    </button>
  );
}

/** « tasse de café, neuve et assiette ×3 » : le nom en clair, l'usure en retrait. */
function HeldName({ label }: { label: string }) {
  const parts = label.split(' et ');
  return (
    <span className="held-name">
      {parts.map((p, i) => {
        const [name, grade] = p.split(', ');
        return (
          <Fragment key={i}>
            {i > 0 && <span className="held-dim"> et </span>}
            <b>{name}</b>
            {grade && <span className="held-dim"> {grade}</span>}
          </Fragment>
        );
      })}
    </span>
  );
}

function Pill({ icon, children, actions }: { icon: IconName; children: ReactNode; actions: ReactNode }) {
  return (
    <div className="held">
      <span className="held-what">
        <span className="held-pic"><Icon name={icon} size={16} /></span>
        {children}
      </span>
      <span className="held-actions">{actions}</span>
    </div>
  );
}

/**
 * En bas, au-dessus de la saisie : ce que le perso tient (ou fait : assis, endormi, plat à
 * préparer) et les gestes possibles, chacun avec sa touche.
 */
export function HeldBar({ game, held, can }: { game: Game | null; held: string | null; can: HandActions }) {
  const g = game;
  if (!g) return null;
  if (held && can.moving) {
    return (
      <Pill icon="move" actions={<><Act k={['Z', 'Q', 'S', 'D']} label="Déplacer" /><Act k={['R', 'F']} label="Pivoter" /><Act k="E" label="Lâcher" main onClick={() => g.drop()} /></>}>
        <span className="held-dim">Déplace</span> <HeldName label={held} />
      </Pill>
    );
  }
  if (held) {
    const free = !can.reading;
    return (
      <Pill
        icon="hand"
        actions={
          <>
            <Act k="E" label="Poser" main onClick={() => g.drop()} />
            {can.drink && free && <Act k="B" label="Boire" onClick={() => g.drink()} />}
            {can.eat && free && <Act k="M" label="Manger" onClick={() => g.eat()} />}
            {can.serve && free && <Act k="P" label="Servir" title="Servir dans l’assiette (P)" onClick={() => g.serve()} />}
            {can.dishes && free && <Act k="V" label="Faire la vaisselle" onClick={() => g.washDishes()} />}
            {can.cut && free && <Act k="K" label="Couper" onClick={() => g.cut()} />}
            {can.prepare && free && <Act k="G" label="Préparer le plat" onClick={() => g.prepare()} />}
            {can.throw && free && <Act k="T" label="Lancer" onClick={() => g.throwItem()} />}
            {can.seated && <Act k="C" label="Se lever" onClick={() => g.standUp()} />}
            {(can.read || can.reading) && <Act k="L" label={can.reading ? 'Fermer le livre' : 'Lire'} onClick={() => (can.reading ? g.stopReading() : g.read())} />}
          </>
        }
      >
        <HeldName label={held} />
      </Pill>
    );
  }
  if (can.sleeping) return <Pill icon="moon" actions={<Act k="C" label="Se réveiller" main onClick={() => g.wakeUp()} />}>Endormi</Pill>;
  if (can.prepare && !can.seated) return <Pill icon="pot" actions={<Act k="G" label="Préparer le plat" main onClick={() => g.prepare()} />}>Ingrédients prêts</Pill>;
  if (can.seated) return <Pill icon="chair" actions={<Act k="C" label="Se lever" main onClick={() => g.standUp()} />}>Assis</Pill>;
  return null;
}
