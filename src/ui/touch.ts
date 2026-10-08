import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Game } from '../game/Game';

/**
 * Jouer au doigt (téléphone, tablette). Le jeu écoute la souris et le clavier ; ici on traduit
 * les gestes du doigt en ces mêmes événements, sans toucher à la logique du jeu :
 * - deux doigts qui s'écartent ou se rapprochent : zoom ;
 * - appui long sur un objet (iOS n'envoie jamais de « clic droit ») ou bouton « Gestes » puis
 *   toucher un objet : le menu rond des gestes ;
 * - flèches et boutons de rotation à l'écran : les touches Z Q S D et R / F, tant qu'on appuie.
 */

const LONG_PRESS_MS = 550;
/** Au-delà, le doigt a bougé : ce n'est plus un appui long. */
const LONG_PRESS_SLOP = 10;

// mode « Gestes » : le prochain toucher sur la scène ouvre le menu rond au lieu d'agir
let gestureMode = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const gestures = {
  get on(): boolean {
    return gestureMode;
  },
  set(on: boolean): void {
    if (gestureMode === on) return;
    gestureMode = on;
    emit();
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/** Ouvre le menu rond au point touché, comme un clic droit à cet endroit. */
function openMenuAt(canvas: HTMLCanvasElement, x: number, y: number): void {
  canvas.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }));
}

/** Branche les gestes du doigt sur la scène ; renvoie de quoi les débrancher. */
export function installTouch(game: Game): () => void {
  const canvas = game.renderer.domElement;
  const touches = new Map<number, { x: number; y: number }>();
  let pinch: number | null = null; // écart entre les deux doigts au dernier pas
  // Le premier doigt n'agit qu'en se levant, en glissant, ou pas du tout : un second doigt (zoom)
  // ou un appui long (menu) ne doivent ni faire marcher le perso ni attraper un meuble au passage.
  let held: { down: PointerEvent; timer: number } | null = null;
  const replayed = new WeakSet<Event>();
  let menuAt = 0; // dernier menu ouvert par nous (pour ne pas doubler celui d'Android)
  const offs: Array<() => void> = [];
  const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
    // en capture : on passe avant les écouteurs du jeu, et on peut les court-circuiter
    t.addEventListener(type, fn as EventListener, { capture: true, passive: false });
    offs.push(() => t.removeEventListener(type, fn as EventListener, { capture: true }));
  };
  const drop = () => {
    if (held) clearTimeout(held.timer);
    held = null;
  };
  /** Le toucher retenu arrive au jeu, tel quel (il agit comme d'habitude). */
  const release = () => {
    if (!held) return;
    const d = held.down;
    drop();
    const e = new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, pointerId: d.pointerId, pointerType: d.pointerType, isPrimary: d.isPrimary,
      clientX: d.clientX, clientY: d.clientY, screenX: d.screenX, screenY: d.screenY, button: 0, buttons: 1, shiftKey: d.shiftKey,
    });
    replayed.add(e);
    canvas.dispatchEvent(e);
  };
  const spread = () => {
    const [a, b] = [...touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  on(canvas, 'pointerdown', (e) => {
    if (e.pointerType !== 'touch' || replayed.has(e)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.stopImmediatePropagation();
    if (touches.size >= 2) {
      // second doigt : on zoome, rien d'autre
      drop();
      game.cancelPress();
      pinch = spread();
      return;
    }
    if (gestures.on) {
      gestures.set(false);
      menuAt = performance.now();
      openMenuAt(canvas, e.clientX, e.clientY);
      return;
    }
    drop();
    const x = e.clientX, y = e.clientY;
    held = {
      down: e,
      timer: window.setTimeout(() => {
        held = null;
        menuAt = performance.now();
        openMenuAt(canvas, x, y);
      }, LONG_PRESS_MS),
    };
  });

  on(canvas, 'pointermove', (e) => {
    const t = touches.get(e.pointerId);
    if (!t) return;
    t.x = e.clientX;
    t.y = e.clientY;
    // le doigt glisse : c'est un glisser-déposer, le jeu reçoit l'appui puis le mouvement
    if (held?.down.pointerId === e.pointerId && Math.hypot(e.clientX - held.down.clientX, e.clientY - held.down.clientY) > LONG_PRESS_SLOP) release();
    if (pinch !== null && touches.size >= 2) {
      e.stopImmediatePropagation();
      const d = spread();
      if (pinch > 0 && d > 0) game.setZoom(d / pinch);
      pinch = d;
    }
  });

  const lift = (e: PointerEvent) => {
    if (!touches.delete(e.pointerId)) return;
    // un simple toucher : l'appui arrive au jeu juste avant le relâcher
    if (held?.down.pointerId === e.pointerId) {
      if (e.type === 'pointerup') release();
      else drop();
    }
    if (pinch !== null) {
      // fin du zoom : le doigt qui reste ne doit pas devenir un clic
      e.stopImmediatePropagation();
      if (touches.size < 2) pinch = null;
    }
  };
  on(window, 'pointerup', lift);
  on(window, 'pointercancel', lift);

  // Android envoie aussi un « clic droit » à l'appui long : un seul menu, pas deux
  on(canvas, 'contextmenu', (e) => {
    if (!e.isTrusted || performance.now() - menuAt > 1000) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  });

  return () => {
    drop();
    gestures.set(false);
    offs.forEach((off) => off());
  };
}

/**
 * Tenir une touche du clavier enfoncée depuis un bouton à l'écran (déplacer, pivoter un meuble) :
 * appuyer = touche enfoncée, relâcher ou glisser hors du bouton = touche relâchée.
 */
export function holdKey(code: string) {
  const send = (type: 'keydown' | 'keyup') => window.dispatchEvent(new KeyboardEvent(type, { code, key: '', bubbles: true }));
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      send('keydown');
    },
    onPointerUp: () => send('keyup'),
    onPointerCancel: () => send('keyup'),
    onLostPointerCapture: () => send('keyup'),
    onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
  };
}
