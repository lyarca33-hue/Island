import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { poseMotion, poseRig, type Motion } from '../src/game/items/rigs';
import { PACK_SIZES, type PackId } from '../src/game/packs/manifest';
import { PACK_RIGS, packRigOf } from '../src/game/packs/rigs';
import { cutRig } from '../src/game/packs/assets';

describe('pièces mobiles des modèles des packs', () => {
  it('chaque modèle animé existe dans son pack, et ses pièces sont bien décrites', () => {
    for (const [id, rigs] of Object.entries(PACK_RIGS)) {
      const sizes = PACK_SIZES[id as PackId] as Record<string, unknown>;
      for (const [name, rig] of Object.entries(rigs!)) {
        expect(sizes[name], `${id}/${name}`).toBeDefined();
        for (const [partName, part] of Object.entries(rig!.parts)) {
          // une pièce est découpée dans le modèle, ou faite à côté
          expect(part.boxes || part.make, `${name}.${partName}`).toBeTruthy();
          if (part.on) expect(rig!.parts[part.on], `${name}.${partName} posée sur ${part.on}`).toBeDefined();
          // une pièce qui tourne a son axe ailleurs qu'au pied du modèle
          if (part.motion?.kind === 'turn' && part.boxes) expect(part.pivot, `${name}.${partName}`).toBeDefined();
        }
      }
    }
    expect(packRigOf('ville', 'balancoire')).toBe(PACK_RIGS.ville!.balancoire);
    expect(packRigOf('ville', 'pas-un-modele')).toBeUndefined();
  });

  it('découpe la pièce dans le maillage, avec son axe, et laisse le reste fixe', () => {
    // deux triangles : un en bas (le corps), un en haut (le couvercle)
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0.2, 0, 0, 1, 0, 1, 1, 0, 0, 1.2, 0], 3));
    const src = new THREE.Group();
    src.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial()));
    const out = cutRig(src, {
      parts: { couvercle: { boxes: [[[-1, 0.5, -1], [2, 2, 1]]], pivot: [0, 1, 0], motion: { kind: 'turn', axis: 'z', angle: -Math.PI / 2 } } },
    });
    const lid = out.getObjectByName('couvercle')!;
    expect(lid.position.toArray()).toEqual([0, 1, 0]);
    const lidGeo = (lid.children[0] as THREE.Mesh).geometry;
    expect(lidGeo.getAttribute('position').count).toBe(3);
    // posé sur son axe : ses points sont relatifs à la charnière
    expect(lidGeo.getAttribute('position').getY(0)).toBeCloseTo(0);
    const body = out.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh;
    expect(body.geometry.getAttribute('position').count).toBe(3);
    expect(poseRig(out, 'couvercle', 1)).toBe(true);
    expect(lid.rotation.z).toBeCloseTo(-Math.PI / 2);
  });

  it("un filet d'eau pousse de rien à toute sa taille, et n'est pas là à 0", () => {
    const jet = new THREE.Group();
    poseMotion(jet, { kind: 'grow', axis: 'y' }, 0);
    expect(jet.visible).toBe(false);
    poseMotion(jet, { kind: 'grow', axis: 'y' }, 0.5);
    expect(jet.visible).toBe(true);
    expect(jet.scale.y).toBeCloseTo(0.5);
  });

  it('un verre se remplit en montant et en s’évasant', () => {
    const wine = new THREE.Group();
    poseMotion(wine, { kind: 'fill', from: 0.6 }, 0);
    expect(wine.visible).toBe(false);
    poseMotion(wine, { kind: 'fill', from: 0.6 }, 0.5);
    expect(wine.scale.y).toBeCloseTo(0.5);
    expect(wine.scale.x).toBeCloseTo(0.8);
    poseMotion(wine, { kind: 'fill', from: 0.6 }, 1);
    expect(wine.scale.toArray()).toEqual([1, 1, 1]);
  });

  it("un plat se mange : il rapetisse, puis n'est plus là", () => {
    const dish = new THREE.Group();
    poseMotion(dish, { kind: 'shrink', to: 0.3 }, 0);
    expect(dish.scale.x).toBeCloseTo(1);
    expect(dish.visible).toBe(true);
    poseMotion(dish, { kind: 'shrink', to: 0.3 }, 0.5);
    expect(dish.scale.x).toBeCloseTo(0.65);
    poseMotion(dish, { kind: 'shrink', to: 0.3 }, 1);
    expect(dish.visible).toBe(false);
  });

  it('le seau du puits suit son chemin, et la corde déroule puis enroule', () => {
    const bucket = new THREE.Group();
    bucket.position.set(0, 1, -0.5);
    const path: Motion = { kind: 'path', points: [[0, 0, 0], [0, 0.2, 0], [0, 0.2, 0.5]] };
    poseMotion(bucket, path, 0.5);
    expect(bucket.position.toArray().map((v) => +v.toFixed(3))).toEqual([0, 1.2, -0.5]);
    poseMotion(bucket, path, 0);
    expect(bucket.position.toArray()).toEqual([0, 1, -0.5]);
    const rope = new THREE.Group();
    poseMotion(rope, { kind: 'reel', axis: 'y', sizes: [1, 2, 1] }, 0.5);
    expect(rope.scale.y).toBeCloseTo(2);
  });

  it('les aiguilles tournent sur leur axe de biais', () => {
    const hand = new THREE.Group();
    poseMotion(hand, { kind: 'spin', axis: [0, 0, 1], angle: Math.PI }, 0.5);
    expect(new THREE.Vector3(1, 0, 0).applyQuaternion(hand.quaternion).y).toBeCloseTo(1);
  });
});
