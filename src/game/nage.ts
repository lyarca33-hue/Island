/**
 * Nager dans l'étang : où l'on nage (l'eau, loin des rives et du ponton), où l'on se tient sur la
 * rive pour y plonger, où l'on remonte sur la rive en sortant.
 */
import * as THREE from 'three';
import { DOCK_W, POND } from './items/plein-air';

/** Part du rayon de l'étang où l'on nage (au-delà, la rive : on sort de l'eau). */
const SWIM = 0.86;
/** Part du rayon où l'on se tient sur la rive (pour plonger, ou en sortant de l'eau). */
const BANK = 1.12;
/** Où l'on arrive en plongeant, en part du rayon. */
const DIVE = 0.68;
/** Marge autour du ponton (m) : on ne nage pas dessous. */
const DOCK_ROOM = 0.45;

export class Pond {
  /** `dock` : milieu du ponton en X et son bout côté eau en Z (null : pas de ponton). */
  constructor(private dock: { x: number; end: number } | null) {}

  /** Distance au centre rapportée au bord de l'eau (1 : la rive). */
  private reach(x: number, z: number): number {
    return Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz);
  }

  private underDock(x: number, z: number): boolean {
    const d = this.dock;
    return !!d && Math.abs(x - d.x) < DOCK_W / 2 + DOCK_ROOM && z < d.end + DOCK_ROOM;
  }

  /** Peut-on nager là ? */
  swimmable(p: THREE.Vector3): boolean {
    return this.reach(p.x, p.z) < SWIM && !this.underDock(p.x, p.z);
  }

  /** Le point à la part `k` du rayon, dans la direction de `p` depuis le centre. */
  private at(p: THREE.Vector3, k: number): THREE.Vector3 {
    const r = this.reach(p.x, p.z) || 1;
    return new THREE.Vector3(POND.x + ((p.x - POND.x) / r) * k, 0, POND.z + ((p.z - POND.z) / r) * k);
  }

  /** Points de la rive autour de l'étang, en commençant face à `from`, puis de plus en plus loin. */
  private *around(from: THREE.Vector3): Generator<THREE.Vector3> {
    const a0 = Math.atan2((from.z - POND.z) / POND.rz, (from.x - POND.x) / POND.rx);
    for (let i = 0; i < 24; i++) {
      const a = a0 + Math.ceil(i / 2) * (i % 2 ? 1 : -1) * (Math.PI / 12);
      yield new THREE.Vector3(POND.x + Math.cos(a) * POND.rx, 0, POND.z + Math.sin(a) * POND.rz);
    }
  }

  /**
   * Où plonger depuis `from` : sur la rive face au perso (ou à côté si la place est prise,
   * `free`), et où l'on arrive dans l'eau. Null : pas de place.
   */
  entry(from: THREE.Vector3, free: (p: THREE.Vector3) => boolean): { bank: THREE.Vector3; water: THREE.Vector3 } | null {
    for (const edge of this.around(from)) {
      const bank = this.at(edge, BANK), water = this.at(edge, DIVE);
      if (this.swimmable(water) && !this.underDock(bank.x, bank.z) && free(bank)) return { bank, water };
    }
    return null;
  }

  /** La rive la plus proche de `p` (dans l'eau) où remonter (`free`) ; null s'il n'y en a pas. */
  shore(p: THREE.Vector3, free: (p: THREE.Vector3) => boolean): THREE.Vector3 | null {
    for (const edge of this.around(p)) {
      const bank = this.at(edge, BANK);
      if (!this.underDock(bank.x, bank.z) && free(bank)) return bank;
    }
    return null;
  }

  /** Où remonter sur la rive en nageant vers `p` (null : le ponton barre la route). */
  exit(p: THREE.Vector3): THREE.Vector3 | null {
    if (this.underDock(p.x, p.z)) return null;
    const bank = this.at(p, BANK);
    return this.underDock(bank.x, bank.z) ? null : bank;
  }
}
