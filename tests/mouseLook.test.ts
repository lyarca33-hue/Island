import { describe, expect, it } from 'vitest';
import { MouseLookFilter, captureBlocked } from '../src/game/mouseLook';

describe('souris capturée à la première personne', () => {
  it('ignore un saut parasite à contre-sens pendant un glisser vers la droite', () => {
    const f = new MouseLookFilter();
    let x = 0;
    for (const dx of [8, 10, 12, -550, 9, 11]) x += f.filter(dx, 0).x;
    expect(x).toBe(50);
  });

  it('ignore aussi le saut parasite vers le haut en regardant vers le bas', () => {
    const f = new MouseLookFilter();
    let y = 0;
    for (const dy of [6, 7, -480, 6]) y += f.filter(0, dy).y;
    expect(y).toBe(19);
  });

  it('garde un geste rapide dans le sens du mouvement, plafonné', () => {
    const f = new MouseLookFilter();
    expect(f.filter(20, 0).x).toBe(20);
    expect(f.filter(900, 0).x).toBe(400);
  });

  it('accepte un vrai demi-tour rapide après un seul évènement ignoré', () => {
    const f = new MouseLookFilter();
    f.filter(30, 0);
    f.filter(30, 0);
    expect(f.filter(-200, 0).x).toBe(0);
    expect(f.filter(-200, 0).x).toBe(-200);
  });
});

describe('capture de la souris qui bute à droite et en bas', () => {
  const ffLinux = 'Mozilla/5.0 (X11; Linux x86_64; rv:158.0) Gecko/20100101 Firefox/158.0';
  it('coupée pour Firefox sous Linux en haute définition', () => {
    expect(captureBlocked(ffLinux, 2)).toBe(true);
    expect(captureBlocked(ffLinux, 1.5)).toBe(true);
  });
  it('gardée partout ailleurs', () => {
    expect(captureBlocked(ffLinux, 1)).toBe(false);
    expect(captureBlocked(ffLinux, 1.25)).toBe(false);
    expect(captureBlocked('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', 2)).toBe(false);
    expect(captureBlocked('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:158.0) Gecko/20100101 Firefox/158.0', 2)).toBe(false);
    expect(captureBlocked('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:158.0) Gecko/20100101 Firefox/158.0', 1.5)).toBe(false);
    expect(captureBlocked('Mozilla/5.0 (Android 14; Mobile; rv:158.0) Gecko/158.0 Firefox/158.0', 3)).toBe(false);
  });
});
