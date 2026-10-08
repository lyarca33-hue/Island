/**
 * Le manteau porté : un vrai vêtement, taillé sur le corps du perso et animé avec lui.
 *
 * On mesure le corps dans la pose du moment (les sommets des maillages du perso, déformés par son
 * squelette) : tranche par tranche, du cou jusqu'au-dessus des genoux, la plus grande largeur dans
 * chaque direction donne le tour du manteau, un peu plus large ; de même pour chaque bras, de
 * l'épaule au poignet. Le manteau est un maillage à peau (SkinnedMesh) accroché aux os du perso :
 * le buste suit la colonne, les manches suivent les bras, les pans suivent un peu les cuisses.
 * Col montant, boutonnage, poches et revers des manches sont peints sur sa texture.
 */
import * as THREE from 'three';
import type { VRMHumanBoneName } from '@pixiv/three-vrm';
import { LAYER_CHARACTER } from './postfx';
import { createToonMaterial } from './toon';

/** Ce dont le manteau a besoin du perso. */
export interface Wearer {
  root: THREE.Object3D;
  bone(name: VRMHumanBoneName): THREE.Object3D | null;
}

/** Couleurs du manteau : laine, ombre des coutures, boutons, doublure des revers. */
const WOOL = '#7a3b2e';
const SEAM = '#4e2219';
const BUTTON = '#d9c08a';
const CUFF = '#5a2a20';

/** Tranches du buste, directions autour du corps ; anneaux et directions d'une manche. */
const RINGS = 18;
const AROUND = 32;
const SLEEVE_RINGS = 12;
const SLEEVE_AROUND = 14;
/** Aisance (m) : le manteau ne colle pas au corps ; il s'évase vers le bas. */
const EASE = 0.032;
const FLARE = 0.05;
const SLEEVE_EASE = 0.026;

const HUMANOID: VRMHumanBoneName[] = [
  'hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'leftShoulder', 'rightShoulder',
  'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  'leftUpperLeg', 'leftLowerLeg', 'rightUpperLeg', 'rightLowerLeg',
];
/** Où va chaque sommet du corps, selon l'os qui le porte le plus. */
type Part = 'torse' | 'cou' | 'jambe' | 'brasG' | 'brasD' | null;
const PART: Partial<Record<VRMHumanBoneName, Part>> = {
  hips: 'torse', spine: 'torse', chest: 'torse', upperChest: 'torse', leftShoulder: 'torse', rightShoulder: 'torse',
  neck: 'cou', leftUpperLeg: 'jambe', rightUpperLeg: 'jambe',
  leftUpperArm: 'brasG', leftLowerArm: 'brasG', rightUpperArm: 'brasD', rightLowerArm: 'brasD',
};

/** Texture du buste : u fait le tour (le devant au milieu), v descend du col à l'ourlet. */
function coatTexture(collarV: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  g.fillStyle = WOOL;
  g.fillRect(0, 0, 256, 256);
  // fines rayures de tissage
  g.fillStyle = 'rgba(0,0,0,0.06)';
  for (let x = 0; x < 256; x += 4) g.fillRect(x, 0, 1, 256);
  // le col, plus sombre
  g.fillStyle = CUFF;
  g.fillRect(0, 0, 256, collarV * 256);
  // le boutonnage : la bordure de devant, les boutons
  g.fillStyle = SEAM;
  g.fillRect(126, collarV * 256, 3, 256);
  g.fillStyle = BUTTON;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.arc(136, collarV * 256 + 14 + i * 30, 4, 0, Math.PI * 2);
    g.fill();
  }
  // deux poches à rabat, les coutures des côtés, l'ourlet
  g.fillStyle = SEAM;
  for (const x of [72, 160]) {
    g.fillRect(x, 182, 26, 3);
    g.fillRect(x, 182, 2, 22);
    g.fillRect(x + 24, 182, 2, 22);
  }
  g.fillRect(63, collarV * 256, 2, 256);
  g.fillRect(191, collarV * 256, 2, 256);
  g.fillRect(0, 248, 256, 8);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Texture des manches : la laine, et le revers au poignet (v = 1). */
function sleeveTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  g.fillStyle = WOOL;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(0,0,0,0.06)';
  for (let x = 0; x < 64; x += 4) g.fillRect(x, 0, 1, 64);
  g.fillStyle = CUFF;
  g.fillRect(0, 54, 64, 10);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Lisse une boucle de valeurs (rayons autour du corps) : les trous prennent la valeur des voisins. */
function smoothLoop(r: number[], passes = 2): number[] {
  const n = r.length;
  let out = r.slice();
  // trous : la moyenne des voisins connus
  for (let k = 0; k < n && out.some((v) => v <= 0); k++) {
    out = out.map((v, i) => (v > 0 ? v : Math.max(0, (out[(i + n - 1) % n] + out[(i + 1) % n]) / ((out[(i + n - 1) % n] > 0 ? 1 : 0) + (out[(i + 1) % n] > 0 ? 1 : 0) || 1))));
  }
  for (let p = 0; p < passes; p++) {
    // un peu de « max » d'abord (pas de creux entre deux bosses), puis une moyenne
    const grown = out.map((v, i) => Math.max(v, (out[(i + n - 1) % n] + out[(i + 1) % n]) / 2));
    out = grown.map((v, i) => (grown[(i + n - 1) % n] + 2 * v + grown[(i + 1) % n]) / 4);
  }
  return out;
}

/**
 * Taille et coud le manteau sur `who` dans sa pose du moment. Rend le maillage, déjà accroché au
 * perso (à retirer avec removeFromParent), ou null sans perso du créateur.
 */
export function wearCoat(who: Wearer): THREE.SkinnedMesh | null {
  const bone = (n: VRMHumanBoneName) => who.bone(n);
  const hips = bone('hips'), neck = bone('neck');
  const armG = [bone('leftUpperArm'), bone('leftLowerArm'), bone('leftHand')];
  const armD = [bone('rightUpperArm'), bone('rightLowerArm'), bone('rightHand')];
  const knee = bone('leftLowerLeg') ?? bone('rightLowerLeg');
  if (!hips || !neck || !knee || armG.includes(null) || armD.includes(null)) return null;

  who.root.updateMatrixWorld(true);
  // tout se mesure dans le repère du perso (haut +Y, devant +Z)
  const toRoot = who.root.matrixWorld.clone().invert();
  const local = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(toRoot);

  // les os du perso par nom, et pour chaque os (même secondaire : jupe, cheveux) l'os humain dont il dépend
  const named = new Map<THREE.Object3D, VRMHumanBoneName>();
  for (const n of HUMANOID) {
    const b = bone(n);
    if (b) named.set(b, n);
  }
  const partOf = new Map<THREE.Object3D, Part>();
  const partOfBone = (b: THREE.Object3D): Part => {
    if (partOf.has(b)) return partOf.get(b)!;
    let o: THREE.Object3D | null = b;
    while (o && !named.has(o)) o = o.parent;
    const p = o ? (PART[named.get(o)!] ?? null) : null;
    partOf.set(b, p);
    return p;
  };

  // les sommets du corps, rangés par partie
  const pts: Record<Exclude<Part, null>, THREE.Vector3[]> = { torse: [], cou: [], jambe: [], brasG: [], brasD: [] };
  let host: THREE.Object3D | null = null;
  const v = new THREE.Vector3();
  // les maillages d'un même modèle partagent souvent leurs sommets : chacun n'est lu qu'une fois
  const seen = new Set<THREE.BufferAttribute | THREE.InterleavedBufferAttribute>();
  who.root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || !m.visible || m.name === 'manteau-porte') return;
    host ??= m.parent;
    const idx = m.geometry.getAttribute('skinIndex'), w = m.geometry.getAttribute('skinWeight');
    const pos = m.geometry.getAttribute('position');
    if (!idx || !w || !pos || seen.has(pos)) return;
    seen.add(pos);
    const bones = m.skeleton.bones;
    // un maillage qui ne tient qu'à la tête (les cheveux) ne compte pas
    if (!bones.some((b) => partOfBone(b))) return;
    const toLocal = new THREE.Matrix4().multiplyMatrices(toRoot, m.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      let best = 0;
      for (let k = 1; k < 4; k++) if (w.getComponent(i, k) > w.getComponent(i, best)) best = k;
      const b = bones[idx.getComponent(i, best)];
      const p = b && partOfBone(b);
      if (!p) continue;
      m.getVertexPosition(i, v);
      m.applyBoneTransform(i, v);
      pts[p].push(v.clone().applyMatrix4(toLocal));
    }
  });
  if (!host || pts.torse.length < 50) return null;

  const H = local(hips), N = local(neck), K = local(knee);
  const u = N.y - H.y;
  const yTop = N.y - 0.06 * u;
  const yBot = THREE.MathUtils.lerp(H.y, K.y, 0.6);

  // ——— le buste : un anneau par tranche, un rayon par direction ———
  const body = [...pts.torse, ...pts.jambe];
  const slab = (yTop - yBot) / (RINGS - 1);
  const rings: Array<{ y: number; c: THREE.Vector2; r: number[] }> = [];
  for (let k = 0; k < RINGS; k++) {
    const y = yTop - k * slab;
    const near = body.filter((p) => Math.abs(p.y - y) < slab * 0.75);
    const c = new THREE.Vector2();
    if (near.length) {
      for (const p of near) c.add(new THREE.Vector2(p.x, p.z));
      c.divideScalar(near.length);
    } else c.set(H.x, H.z);
    const r = new Array<number>(AROUND).fill(0);
    for (const p of near) {
      const dx = p.x - c.x, dz = p.z - c.y;
      const a = Math.atan2(dx, dz);
      const i = Math.round(((a + Math.PI) / (Math.PI * 2)) * AROUND) % AROUND;
      r[i] = Math.max(r[i], Math.hypot(dx, dz));
    }
    rings.push({ y, c, r: smoothLoop(r) });
  }
  // pas de tranche vide : on prend la voisine
  for (let k = 0; k < RINGS; k++) if (rings[k].r.every((x) => x <= 0)) rings[k].r = (rings[k - 1] ?? rings[k + 1]).r.slice();
  // lissage de haut en bas, puis les pans ne rentrent pas sous le bassin (le manteau tombe droit, évasé)
  const raw = rings.map((g) => g.r.slice());
  for (let k = 1; k < RINGS - 1; k++) for (let i = 0; i < AROUND; i++) rings[k].r[i] = Math.max(raw[k][i], (raw[k - 1][i] + raw[k][i] + raw[k + 1][i]) / 3);
  const hipRing = rings.findIndex((g) => g.y < H.y);
  for (let k = Math.max(1, hipRing); k < RINGS; k++) {
    const t = (H.y - rings[k].y) / (H.y - yBot);
    for (let i = 0; i < AROUND; i++) rings[k].r[i] = Math.max(rings[k].r[i], rings[k - 1].r[i]) + FLARE * t * slab * 2;
  }

  // le col : deux anneaux qui se resserrent autour du cou puis remontent un peu
  const neckPts = pts.cou.filter((p) => Math.abs(p.y - N.y) < 0.12 * u);
  const neckR = neckPts.length ? Math.max(...neckPts.map((p) => Math.hypot(p.x - N.x, p.z - N.z))) : 0.12 * u;
  const top = rings[0];
  const collar = [
    { y: yTop + 0.1 * u, c: new THREE.Vector2(N.x, N.z), r: new Array<number>(AROUND).fill(neckR + 0.012) },
    { y: yTop + 0.2 * u, c: new THREE.Vector2(N.x, N.z), r: new Array<number>(AROUND).fill(neckR + 0.02) },
  ];
  // entre le haut du buste et le col : les épaules, à mi-chemin
  const shoulder = { y: yTop + 0.05 * u, c: top.c.clone().lerp(collar[0].c, 0.5), r: top.r.map((x) => (x + EASE + neckR) / 2 + 0.01) };
  const torso = [collar[1], collar[0], shoulder, ...rings.map((g) => ({ ...g, r: g.r.map((x) => x + EASE) }))];

  // ——— les os du manteau, et le poids de chacun sur un sommet ———
  const skin: THREE.Bone[] = [];
  const slot = new Map<THREE.Object3D, number>();
  const use = (n: VRMHumanBoneName) => {
    const b = bone(n);
    if (!b) return -1;
    if (!slot.has(b)) {
      slot.set(b, skin.length);
      skin.push(b as THREE.Bone);
    }
    return slot.get(b)!;
  };
  const spineChain = (['hips', 'spine', 'chest', 'upperChest', 'neck'] as VRMHumanBoneName[])
    .map((n) => ({ i: use(n), y: bone(n) ? local(bone(n)!).y : NaN }))
    .filter((b) => b.i >= 0);
  const legG = use('leftUpperLeg'), legD = use('rightUpperLeg');
  const legGx = bone('leftUpperLeg') ? local(bone('leftUpperLeg')!).x - H.x : 1;
  /** Poids du buste à la hauteur y : entre les deux os de la colonne qui l'encadrent. */
  const torsoWeights = (y: number): Array<[number, number]> => {
    if (y <= spineChain[0].y) return [[spineChain[0].i, 1]];
    for (let j = 0; j < spineChain.length - 1; j++) {
      const a = spineChain[j], b = spineChain[j + 1];
      if (y <= b.y) {
        const t = (y - a.y) / (b.y - a.y);
        return [[a.i, 1 - t], [b.i, t]];
      }
    }
    return [[spineChain[spineChain.length - 1].i, 1]];
  };

  const positions: number[] = [], uvs: number[] = [], skinIndex: number[] = [], skinWeight: number[] = [], index: number[] = [];
  const pushWeights = (ws: Array<[number, number]>) => {
    const merged = new Map<number, number>();
    for (const [i, w] of ws) if (i >= 0 && w > 0) merged.set(i, (merged.get(i) ?? 0) + w);
    const list = [...merged].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = list.reduce((s, [, w]) => s + w, 0) || 1;
    for (let k = 0; k < 4; k++) {
      skinIndex.push(list[k]?.[0] ?? 0);
      skinWeight.push((list[k]?.[1] ?? 0) / sum);
    }
  };

  // buste : (AROUND + 1) sommets par anneau (couture dans le dos), le devant au milieu de la texture
  const collarV = 0.08;
  torso.forEach((g, k) => {
    const vv = k < 2 ? (k / 2) * collarV : collarV + ((k - 2) / (torso.length - 3)) * (1 - collarV);
    for (let i = 0; i <= AROUND; i++) {
      const a = (i / AROUND) * Math.PI * 2 - Math.PI;
      const r = g.r[i % AROUND];
      const x = g.c.x + Math.sin(a) * r, z = g.c.y + Math.cos(a) * r;
      positions.push(x, g.y, z);
      uvs.push(i / AROUND, 1 - vv);
      const ws = torsoWeights(g.y);
      // sous le bassin, les pans suivent un peu la cuisse de leur côté
      if (g.y < H.y) {
        const t = THREE.MathUtils.clamp((H.y - g.y) / (H.y - yBot), 0, 1);
        const side = THREE.MathUtils.clamp(Math.abs(Math.sin(a)), 0, 1);
        const leg = 0.45 * t * (0.4 + 0.6 * side);
        ws.forEach((p) => (p[1] *= 1 - leg));
        ws.push([(x - H.x > 0) === (legGx > 0) ? legG : legD, leg]);
      }
      pushWeights(ws);
    }
  });
  const ringLen = AROUND + 1;
  for (let k = 0; k < torso.length - 1; k++) {
    for (let i = 0; i < AROUND; i++) {
      const a = k * ringLen + i, b = a + 1, c = a + ringLen, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  const torsoCount = index.length;

  // ——— les manches ———
  const sleeve = (chain: Array<THREE.Object3D | null>, arm: THREE.Vector3[], names: [VRMHumanBoneName, VRMHumanBoneName], shoulderName: VRMHumanBoneName) => {
    const [A, B, C] = chain.map((o) => local(o!));
    // l'épaule commence un peu vers le cou, pour rejoindre le buste ; le poignet s'arrête avant la main
    const start = A.clone().lerp(N, 0.12);
    const end = B.clone().lerp(C, 0.9);
    const iU = use(names[0]), iL = use(names[1]), iS = use(shoulderName) >= 0 ? use(shoulderName) : spineChain[spineChain.length - 2]?.i ?? 0;
    const base = positions.length / 3;
    const half = SLEEVE_RINGS / 2;
    for (let k = 0; k <= SLEEVE_RINGS; k++) {
      const upper = k <= half;
      const t = upper ? k / half : (k - half) / half;
      const p0 = upper ? start : B, p1 = upper ? B : end;
      const at = p0.clone().lerp(p1, t);
      const dir = p1.clone().sub(p0).normalize();
      // repère de l'anneau : un côté vers le devant du perso
      const side = new THREE.Vector3(0, 0, 1).cross(dir);
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0).cross(dir);
      side.normalize();
      const fwd = dir.clone().cross(side).normalize();
      // le bras autour de cet anneau
      const len = p1.distanceTo(p0);
      const r = new Array<number>(SLEEVE_AROUND).fill(0);
      for (const q of arm) {
        const d = q.clone().sub(at);
        if (Math.abs(d.dot(dir)) > Math.max(0.03, len / half)) continue;
        const x = d.dot(side), y = d.dot(fwd);
        // un sommet loin de l'axe du bras n'est pas le bras (pan de vêtement, mèche)
        if (Math.hypot(x, y) > 0.3 * u) continue;
        const i = Math.round(((Math.atan2(x, y) + Math.PI) / (Math.PI * 2)) * SLEEVE_AROUND) % SLEEVE_AROUND;
        r[i] = Math.max(r[i], Math.hypot(x, y));
      }
      const fill = r.some((x) => x > 0) ? smoothLoop(r) : new Array<number>(SLEEVE_AROUND).fill(0.075 * u);
      // l'épaule : plus large, pour rejoindre le buste ; le revers : un peu évasé
      const extra = SLEEVE_EASE + (k === 0 ? 0.015 : 0) + (k === SLEEVE_RINGS ? 0.006 : 0);
      for (let i = 0; i <= SLEEVE_AROUND; i++) {
        const a = (i / SLEEVE_AROUND) * Math.PI * 2 - Math.PI;
        // au moins une manche ample : large à l'épaule, plus étroite au poignet (les manches bouffantes passent dessous)
        const rr = Math.max(fill[i % SLEEVE_AROUND], THREE.MathUtils.lerp(0.22, 0.15, k / SLEEVE_RINGS) * u) + extra;
        const pnt = at.clone().addScaledVector(side, Math.sin(a) * rr).addScaledVector(fwd, Math.cos(a) * rr);
        positions.push(pnt.x, pnt.y, pnt.z);
        uvs.push(i / SLEEVE_AROUND, 1 - k / SLEEVE_RINGS);
        // l'épaule entre le buste et le bras, le coude entre le haut et le bas du bras
        const elbow = THREE.MathUtils.smoothstep(k, half - 1.5, half + 1.5);
        if (k === 0) pushWeights([[iS, 0.5], [iU, 0.5]]);
        else pushWeights([[iU, 1 - elbow], [iL, elbow]]);
      }
    }
    const n = SLEEVE_AROUND + 1;
    for (let k = 0; k < SLEEVE_RINGS; k++) {
      for (let i = 0; i < SLEEVE_AROUND; i++) {
        const a = base + k * n + i, b = a + 1, c = a + n, d = c + 1;
        index.push(a, c, b, b, c, d);
      }
    }
  };
  sleeve(armG, pts.brasG, ['leftUpperArm', 'leftLowerArm'], 'leftShoulder');
  sleeve(armD, pts.brasD, ['rightUpperArm', 'rightLowerArm'], 'rightShoulder');

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  geo.setIndex(index);
  geo.addGroup(0, torsoCount, 0);
  geo.addGroup(torsoCount, index.length - torsoCount, 1);
  geo.computeVertexNormals();

  const mats = [createToonMaterial({ color: 0xffffff, map: coatTexture(collarV), rimStrength: 0.2 }), createToonMaterial({ color: 0xffffff, map: sleeveTexture(), rimStrength: 0.2 })];
  // on voit l'intérieur sous l'ourlet et dans les manches
  for (const m of mats) m.side = THREE.DoubleSide;
  const coat = new THREE.SkinnedMesh(geo, mats);
  coat.name = 'manteau-porte';
  coat.castShadow = true;
  coat.receiveShadow = true;
  coat.frustumCulled = false;
  coat.layers.enable(LAYER_CHARACTER);
  // le maillage est fait dans le repère du perso : il y est posé tel quel, et lié aux os dans cette pose
  const parent = host as THREE.Object3D;
  parent.updateMatrixWorld(true);
  coat.applyMatrix4(new THREE.Matrix4().multiplyMatrices(parent.matrixWorld.clone().invert(), who.root.matrixWorld));
  parent.add(coat);
  coat.updateMatrixWorld(true);
  coat.bind(new THREE.Skeleton(skin), coat.matrixWorld);
  return coat;
}
