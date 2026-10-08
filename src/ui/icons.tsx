/**
 * Icônes du HUD, dessinées au trait (même allure sur tous les ordinateurs, contrairement aux
 * emojis). Elles prennent la couleur du texte ; `size` en pixels.
 */
const PATHS = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  flag: 'M5 21V4M5 4h12l-2.5 4.5L17 13H5',
  rotateLeft: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 3.5v5h5',
  rotateRight: 'M20.5 12a8.5 8.5 0 1 1-2.6-6.1M20.5 3.5v5h-5',
  heart: 'M12 20s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z',
  sleep: 'M3.5 10.5h7l-7 8.5h7M14 4.5h6l-6 7h6',
  food: 'M7 3v7M4.5 3v4.5a2.5 2.5 0 0 0 5 0V3M7 10v11M17.5 21V3c-2.5 1.2-3.5 4-3.5 7.5V14h3.5',
  drop: 'M12 3.2s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  bubbles: 'M14 14.5a5 5 0 1 1-10 0a5 5 0 1 1 10 0zM20.5 7.5a3 3 0 1 1-6 0a3 3 0 1 1 6 0zM20.5 17a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0z',
  sun: 'M16 12a4 4 0 1 1-8 0a4 4 0 1 1 8 0zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  moon: 'M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z',
  pause: 'M9 5v14M15 5v14',
  speech: 'M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H11l-5 3.5V17H4.5A1.5 1.5 0 0 1 3 15.5V7a1.5 1.5 0 0 1 1.5-1.5z',
  bolt: 'M13.5 2.5L5 13.5h6.5l-1 8 8.5-11h-6.5z',
  send: 'M12 19.5v-15M5.5 11L12 4.5l6.5 6.5',
  close: 'M6 6l12 12M18 6L6 18',
  toilet: 'M7 3.5h8v6.5M5 10h14a7 7 0 0 1-7 7a7 7 0 0 1-7-7zM9.5 16.5l-1 4h7l-1-4',
  eye: 'M2.5 12c1-2.5 4.5-7 9.5-7s8.5 4.5 9.5 7c-1 2.5-4.5 7-9.5 7s-8.5-4.5-9.5-7zM15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0z',
  eyeOff: 'M3 3l18 18M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 8.5 4.5 9.5 7a13 13 0 0 1-2.6 3.7M6.6 6.6C4.5 8 3.1 10 2.5 12c1 2.5 4.5 7 9.5 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0V13M17 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a7 7 0 0 1-5.6-2.8L4 15.5a1.6 1.6 0 0 1 2.4-2.1L8 15',
  keyboard: 'M4 6h16a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 20 18H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 6zM7 10h.01M11 10h.01M15 10h.01M7.5 14h9',
  clock: 'M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0zM12 7v5l3 2',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  sparkles: 'M11 3l1.8 4.7 4.7 1.8-4.7 1.8L11 16l-1.8-4.7L4.5 9.5l4.7-1.8zM18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
  user: 'M16 8a4 4 0 1 1-8 0a4 4 0 1 1 8 0zM4.5 20.5a7.5 7.5 0 0 1 15 0',
  alert: 'M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0zM12 7.5v5M12 16.2h.01',
  stop: 'M7.5 7.5h9v9h-9z',
  chair: 'M6 11V7.5A2.5 2.5 0 0 1 8.5 5h7A2.5 2.5 0 0 1 18 7.5V11M4 11a2 2 0 0 1 2 2v2h12v-2a2 2 0 1 1 4 0v4H2v-4a2 2 0 0 1 2-2zM5 17v2.5M19 17v2.5',
  move: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3',
  book: 'M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5zM6.5 8h2M15.5 8h2',
  smile: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM8.2 14.2c1 1.4 2.3 2.1 3.8 2.1s2.8-.7 3.8-2.1M9 9.6v.6M15 9.6v.6',
  pot: 'M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM2 10h2M20 10h2M9 6.5c0-1 1-1 1-2M14 6.5c0-1 1-1 1-2',
  chevron: 'M9 6l6 6-6 6',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}
