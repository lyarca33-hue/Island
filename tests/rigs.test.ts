import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { poseMotion, poseRig, ROOM_RIGS } from '../src/game/items/rigs';

describe('pièces mobiles des autres pièces', () => {
  it('une porte tourne comme celles du jeu, de 0 à son angle', () => {
    const door = new THREE.Group();
    const m = ROOM_RIGS.armoire.look.parts!.porte.motion!;
    poseMotion(door, m, 0);
    expect(door.rotation.y).toBe(0);
    poseMotion(door, m, 1);
    expect(door.rotation.y).toBeCloseTo(ROOM_RIGS.armoire.def.door!);
  });

  it("l'abattant des toilettes, modélisé relevé, est rabattu fermé et revient relevé ouvert", () => {
    const lid = new THREE.Group();
    const m = ROOM_RIGS.toilettes.look.parts!.couvercle.motion!;
    poseMotion(lid, m, 0);
    expect(lid.rotation.x).toBeCloseTo(Math.PI / 2);
    poseMotion(lid, m, 1);
    expect(lid.rotation.x).toBeCloseTo(0);
  });

  it('un tiroir glisse depuis sa place et y revient', () => {
    const drawer = new THREE.Group();
    drawer.position.set(0.1, 0.3, 0.05);
    const m = ROOM_RIGS['table-de-nuit'].look.parts!.porte.motion!;
    poseMotion(drawer, m, 0.5);
    expect(drawer.position.z).toBeCloseTo(0.05 + 0.12);
    poseMotion(drawer, m, 0);
    expect(drawer.position.toArray()).toEqual([0.1, 0.3, 0.05]);
  });

  it('le rideau se tasse ouvert et reprend sa largeur tiré', () => {
    const curtain = new THREE.Group();
    const m = ROOM_RIGS.rideau.look.parts!.rideau.motion!;
    poseMotion(curtain, m, 0);
    expect(curtain.scale.x).toBeCloseTo(0.25);
    poseMotion(curtain, m, 1);
    expect(curtain.scale.x).toBe(1);
  });

  it('poseRig joue le mouvement donné à la pièce, et rien sans mouvement', () => {
    const box = new THREE.Group();
    const flag = new THREE.Group();
    flag.name = 'drapeau';
    box.add(flag);
    expect(poseRig(box, 'drapeau', 1)).toBe(false);
    flag.userData.motion = ROOM_RIGS['boite-lettres'].look.parts!.drapeau.motion;
    expect(poseRig(box, 'drapeau', 1)).toBe(true);
    expect(flag.rotation.z).toBeCloseTo(Math.PI);
  });

  it('chaque pièce qui tourne ou se tasse a son axe dans le modèle', () => {
    for (const [name, rig] of Object.entries(ROOM_RIGS)) {
      expect(rig.look.model, name).toBe(name);
      for (const [part, p] of Object.entries(rig.look.parts ?? {})) {
        if (p.motion && p.motion.kind !== 'slide') expect(p.pivot, `${name} : ${part}`).toBeDefined();
      }
    }
  });

  it("une `porte` tourne ou glisse comme le jeu la bouge d'après sa fiche", () => {
    for (const [name, rig] of Object.entries(ROOM_RIGS)) {
      const m = rig.look.parts?.porte?.motion;
      if (!m) continue;
      if (m.kind === 'slide') expect(rig.def.drawer, name).toBe(m.distance);
      else if (m.kind === 'turn') {
        expect(rig.def.door, name).toBeCloseTo(m.angle);
        expect(rig.def.doorAxis ?? 'y', name).toBe(m.axis);
      }
    }
  });
});
