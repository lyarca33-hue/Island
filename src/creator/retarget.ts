/**
 * Reciblage des animations Mixamo (clips de « X Bot ») sur les persos du créateur.
 *
 * Même noms d'os, mais pas la même pose de repos (X Bot est en T, MakeHuman en A) ni les mêmes
 * axes d'os. On passe donc par le monde : pour chaque os, rotation animée de la source par
 * rapport à son repos, appliquée à la direction de l'os cible alignée sur celle de la source.
 * Les clips sont échantillonnés une fois (30 images/s) et rejoués normalement.
 */
import * as THREE from 'three';
import type { HumanModel } from './human';

const FPS = 30;
const restCache = new WeakMap<THREE.Object3D, Array<{ b: THREE.Bone; p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>>();

interface Source {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
}

export function retargetClips(src: Source, human: HumanModel): THREE.AnimationClip[] {
  const scene = src.scene;
  const srcBones = new Map<string, THREE.Bone>();
  scene.traverse((o) => {
    if ((o as THREE.Bone).isBone) srcBones.set(o.name, o as THREE.Bone);
  });
  // repos de la source (pose de liaison du fichier), mémorisé au premier passage puis rétabli :
  // le mixeur laisse les os dans la dernière pose jouée
  let rest = restCache.get(scene);
  if (!rest) {
    rest = [...srcBones.values()].map((b) => ({ b, p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
    restCache.set(scene, rest);
  }
  const restore = () => rest!.forEach(({ b, p, q, s }) => (b.position.copy(p), b.quaternion.copy(q), b.scale.copy(s)));
  restore();
  scene.updateMatrixWorld(true);
  const joints = human.restJoints();
  const restQ = new Map<string, THREE.Quaternion>();
  const restPos = new Map<string, THREE.Vector3>();
  for (const [name, b] of srcBones) {
    restQ.set(name, b.getWorldQuaternion(new THREE.Quaternion()));
    restPos.set(name, b.getWorldPosition(new THREE.Vector3()));
  }
  // alignement de repos : rotation qui amène la direction de l'os cible sur celle de la source
  const align = new Map<string, THREE.Quaternion>();
  for (const bone of human.bones) {
    const s = srcBones.get(bone.name);
    const j = joints.get(bone.name);
    if (!s || !j) continue;
    // direction de l'os = vers l'enfant qui le prolonge (Spine2 -> Neck, pas vers une épaule)
    const next = bone.children
      .filter((c) => (c as THREE.Bone).isBone && joints.has(c.name))
      .sort((a, b) => joints.get(a.name)!.head.distanceTo(j.tail) - joints.get(b.name)!.head.distanceTo(j.tail))[0];
    const srcNext = next ? srcBones.get(next.name) : s.children.find((c) => (c as THREE.Bone).isBone);
    const q = new THREE.Quaternion();
    if (srcNext && restPos.has(srcNext.name)) {
      const ds = restPos.get(srcNext.name)!.clone().sub(restPos.get(s.name)!).normalize();
      const dt = (next ? joints.get(next.name)!.head : j.tail).clone().sub(j.head).normalize();
      if (ds.lengthSq() > 0 && dt.lengthSq() > 0) q.setFromUnitVectors(dt, ds);
    }
    align.set(bone.name, q);
  }
  const parents = new Map(human.bones.map((b) => [b.name, (b.parent as THREE.Bone)?.isBone ? b.parent!.name : null]));
  const hipsName = human.bones[0].name;
  const srcHipsY = restPos.get(hipsName)?.y || 1;
  const tgtHips = joints.get(hipsName)!.head;
  const hipScale = tgtHips.y / srcHipsY;

  const mixer = new THREE.AnimationMixer(scene);
  const out: THREE.AnimationClip[] = [];
  const world = new Map<string, THREE.Quaternion>();
  const tmp = new THREE.Quaternion();
  for (const clip of src.clips) {
    const frames = Math.max(2, Math.round(clip.duration * FPS) + 1);
    const times = new Float32Array(frames);
    const quats = new Map<string, Float32Array>();
    for (const b of human.bones) if (align.has(b.name)) quats.set(b.name, new Float32Array(frames * 4));
    const hipPos = new Float32Array(frames * 3);
    const action = mixer.clipAction(clip);
    action.reset().play();
    for (let f = 0; f < frames; f++) {
      const t = Math.min(clip.duration, f / FPS);
      times[f] = t;
      mixer.setTime(t);
      scene.updateMatrixWorld(true);
      world.clear();
      for (const b of human.bones) {
        const s = srcBones.get(b.name);
        const al = align.get(b.name);
        if (!s || !al) continue;
        // monde cible = (monde animé source × repos source⁻¹) × alignement
        const w = s.getWorldQuaternion(new THREE.Quaternion()).multiply(tmp.copy(restQ.get(b.name)!).invert()).multiply(al);
        world.set(b.name, w);
        const p = parents.get(b.name);
        const local = p && world.has(p) ? world.get(p)!.clone().invert().multiply(w) : w.clone();
        local.toArray(quats.get(b.name)!, f * 4);
      }
      const sh = srcBones.get(hipsName);
      if (sh) {
        const wp = sh.getWorldPosition(new THREE.Vector3()).sub(restPos.get(hipsName)!).multiplyScalar(hipScale).add(tgtHips);
        wp.toArray(hipPos, f * 3);
      }
    }
    action.stop();
    mixer.uncacheAction(clip);
    const tracks: THREE.KeyframeTrack[] = [];
    for (const [name, q] of quats) tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, q));
    tracks.push(new THREE.VectorKeyframeTrack(`${hipsName}.position`, times, hipPos));
    out.push(new THREE.AnimationClip(clip.name, clip.duration, tracks));
  }
  mixer.stopAllAction();
  restore();
  return out;
}
