import { Fragment, type ReactNode, useEffect, useSyncExternalStore } from 'react';
import type { Game, HandActions } from '../game/Game';
import { Icon, type IconName } from './icons';
import { gestures, holdKey, installTouch } from './touch';
import './touch.css';

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
  if (can.prepare && !can.seated) return <Pill icon="pot" actions={<Act k="G" label="Préparer le plat" main onClick={() => g.prepare()} />}>Ingrédients prêts</Pill>;
  if (can.seated) return <Pill icon="chair" actions={<Act k="C" label="Se lever" main onClick={() => g.standUp()} />}>Assis</Pill>;
  return null;
}

/**
 * Au doigt seulement (caché à la souris) : le bouton « Gestes », qui fait du prochain toucher un
 * clic droit (le menu rond), et, quand on déplace un meuble, les flèches et la rotation, à tenir
 * enfoncées comme les touches Z Q S D et R / F. Branche aussi le zoom à deux doigts et l'appui long.
 */
export function TouchPad({ game, can }: { game: Game | null; can: HandActions }) {
  useEffect(() => (game ? installTouch(game) : undefined), [game]);
  const armed = useSyncExternalStore(gestures.subscribe, () => gestures.on);
  if (!game) return null;
  return (
    <div className="touch-pad">
      {can.moving && (
        <div className="touch-move">
          <button className="touch-key" aria-label="Pivoter à gauche" {...holdKey('KeyF')}><Icon name="turnLeft" /></button>
          <div className="touch-arrows">
            <button className="touch-key up" aria-label="Avancer" {...holdKey('KeyW')}><Icon name="chevron" /></button>
            <button className="touch-key left" aria-label="À gauche" {...holdKey('KeyA')}><Icon name="chevron" /></button>
            <button className="touch-key down" aria-label="Reculer" {...holdKey('KeyS')}><Icon name="chevron" /></button>
            <button className="touch-key right" aria-label="À droite" {...holdKey('KeyD')}><Icon name="chevron" /></button>
          </div>
          <button className="touch-key" aria-label="Pivoter à droite" {...holdKey('KeyR')}><Icon name="turnRight" /></button>
        </div>
      )}
      <button
        className={`touch-gestures${armed ? ' on' : ''}`}
        aria-pressed={armed}
        onClick={() => {
          gestures.set(!armed);
          if (!armed) game.onNotice?.('Touche un objet (ou le perso) pour voir les gestes. Un appui long marche aussi.');
        }}
      >
        <Icon name="pinch" size={16} />
        {armed ? 'Touche un objet…' : 'Gestes'}
      </button>
    </div>
  );
}
