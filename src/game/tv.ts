/**
 * La télé du salon : allumée, son écran passe un petit programme dessiné à la volée (dessin
 * animé, météo, aquarium) et éclaire la pièce d'une lueur qui change avec l'image ; éteinte,
 * l'écran est noir et le voyant de veille rouge. Les chaînes défilent seules, ou au menu.
 */
import * as THREE from 'three';
import { lightAllPasses } from './postfx';
import type { WorldItem } from './items/carry';

/** Taille de l'image dessinée (px), images par seconde, secondes par chaîne. */
const W = 192;
const H = 108;
const FPS = 15;
const CHANNEL_S = 12;
/** Lueur de l'écran : force, portée (m). */
const GLOW_I = 1.6;
const GLOW_RANGE = 4.5;

export const CHANNELS = ['dessin animé', 'météo', 'aquarium'];

export class Tv {
  on = false;
  channel = 0;
  private t = 0;
  private sinceDraw = 1;
  private sinceZap = 0;
  private g: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private onMat: THREE.MeshBasicMaterial;
  private offMat: THREE.Material;
  private screen: THREE.Mesh;
  readonly light: THREE.PointLight;
  private avg = new THREE.Color();

  constructor(readonly item: WorldItem) {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    this.g = cv.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    // un peu au-dessus de 1 : le bloom fait luire l'écran
    this.onMat = new THREE.MeshBasicMaterial({ map: this.tex, color: new THREE.Color(1.25, 1.25, 1.25) });
    this.screen = item.part('ecran') as THREE.Mesh;
    this.offMat = this.screen.material as THREE.Material;
    // lumière toujours là (éteinte à 0) : pas de recompilation des matériaux quand on allume
    this.light = lightAllPasses(new THREE.PointLight(0x9fc4ff, 0, GLOW_RANGE, 2));
  }

  set(on: boolean): void {
    this.on = on;
    this.screen.material = on ? this.onMat : this.offMat;
    const led = this.item.part('voyant');
    if (led) led.visible = !on;
    this.sinceDraw = 1;
    this.sinceZap = 0;
  }

  zap(): void {
    this.channel = (this.channel + 1) % CHANNELS.length;
    this.sinceZap = 0;
    this.sinceDraw = 1;
  }

  tick(dt: number): void {
    // la lueur suit la télé (on peut la déplacer), juste devant l'écran
    this.screen.updateWorldMatrix(true, false);
    const at = new THREE.Vector3(0, 0, 0.35).applyMatrix4(this.screen.matrixWorld);
    this.light.position.copy(at);
    if (!this.on) {
      this.light.intensity = 0;
      return;
    }
    this.t += dt;
    this.sinceZap += dt;
    if (this.sinceZap > CHANNEL_S) this.zap();
    this.sinceDraw += dt;
    if (this.sinceDraw >= 1 / FPS) {
      this.sinceDraw = 0;
      this.draw();
      this.tex.needsUpdate = true;
    }
    this.light.color.copy(this.avg);
    this.light.intensity = GLOW_I * (0.85 + 0.15 * Math.sin(this.t * 7.3) * Math.sin(this.t * 2.1));
  }

  /** Dessine l'image de la chaîne en cours, et retient sa couleur moyenne pour la lueur. */
  private draw(): void {
    const g = this.g, t = this.t;
    if (this.sinceZap < 0.35) {
      // neige entre deux chaînes
      const img = g.createImageData(W, H);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      this.avg.setRGB(0.6, 0.6, 0.65);
      return;
    }
    if (this.channel === 0) {
      // dessin animé : ciel, soleil, collines, une balle qui rebondit
      g.fillStyle = '#7cc6ff';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#ffd84a';
      g.beginPath();
      g.arc(30 + ((t * 8) % (W - 60)), 22, 12, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      for (let k = 0; k < 3; k++) {
        const x = ((t * (10 + k * 4) + k * 70) % (W + 60)) - 30;
        g.beginPath();
        g.ellipse(x, 18 + k * 9, 16, 6, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#5bbf4a';
      g.beginPath();
      g.ellipse(50, H, 90, 40, 0, Math.PI, 0);
      g.ellipse(150, H, 80, 32, 0, Math.PI, 0);
      g.fill();
      const bx = (t * 40) % (W + 20) - 10;
      const by = H - 30 - Math.abs(Math.sin(t * 4)) * 40;
      g.fillStyle = '#e8463a';
      g.beginPath();
      g.arc(bx, by, 8, 0, Math.PI * 2);
      g.fill();
      this.avg.setRGB(0.55, 0.8, 1);
    } else if (this.channel === 1) {
      // météo : carte, soleils et nuages, bandeau titre
      g.fillStyle = '#1d4f8a';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#6fae5a';
      g.beginPath();
      g.moveTo(40, 20); g.lineTo(130, 14); g.lineTo(160, 50); g.lineTo(140, 92); g.lineTo(60, 96); g.lineTo(30, 60);
      g.closePath();
      g.fill();
      g.fillStyle = '#ffd84a';
      for (const [x, y] of [[70, 40], [120, 70]]) {
        g.beginPath();
        g.arc(x, y, 7 + Math.sin(t * 3) * 1.5, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#e9eef5';
      const cx = 95 + Math.sin(t * 0.6) * 20;
      g.beginPath();
      g.ellipse(cx, 55, 14, 7, 0, 0, Math.PI * 2);
      g.ellipse(cx + 9, 50, 9, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#c0392b';
      g.fillRect(0, 0, W, 13);
      g.fillStyle = '#ffffff';
      g.font = 'bold 10px sans-serif';
      g.fillText('MÉTÉO', 6, 10);
      this.avg.setRGB(0.4, 0.6, 0.9);
    } else {
      // aquarium : eau bleue, bulles, poissons qui nagent
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#2fa6c9');
      grad.addColorStop(1, '#0c3c5e');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#d9c38a';
      g.fillRect(0, H - 10, W, 10);
      g.fillStyle = '#3f8f4a';
      for (let k = 0; k < 6; k++) {
        const x = 15 + k * 32;
        g.fillRect(x + Math.sin(t * 2 + k) * 2, H - 34, 4, 26);
      }
      const fish = (x: number, y: number, dir: number, color: string) => {
        g.fillStyle = color;
        g.beginPath();
        g.ellipse(x, y, 10, 6, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(x - dir * 9, y);
        g.lineTo(x - dir * 17, y - 6);
        g.lineTo(x - dir * 17, y + 6);
        g.closePath();
        g.fill();
      };
      fish(((t * 25) % (W + 40)) - 20, 40 + Math.sin(t * 2) * 6, 1, '#ff8c2a');
      fish(W - (((t * 18) % (W + 40)) - 20), 66 + Math.sin(t * 1.5) * 5, -1, '#ffd84a');
      g.fillStyle = 'rgba(255,255,255,0.7)';
      for (let k = 0; k < 5; k++) {
        const y = H - ((t * 20 + k * 22) % H);
        g.beginPath();
        g.arc(150 + Math.sin(t * 3 + k) * 3, y, 2, 0, Math.PI * 2);
        g.fill();
      }
      this.avg.setRGB(0.3, 0.7, 0.9);
    }
  }
}
