import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  type FlagKind,
  FLAG_KINDS,
  galleryModels,
  isFlagged,
  loadComments,
  onFlags,
  PACK_SCALE,
  setComment,
  toggleFlag,
  visionneuseUrl,
} from '../game/carteTest';
import { WorldItem } from '../game/items/carry';
import { type ItemDef, ITEMS } from '../game/items/catalog';
import { type Correction, correctionOf } from '../game/items/corriges';
import type { Motion } from '../game/items/rigs';
import { poseMotion } from '../game/items/rigs';
import { loadTripo } from '../game/items/tripo';
import { loadPack, packModel, packRig, preloadPacks } from '../game/packs/assets';
import type { ModelName, PackId } from '../game/packs/manifest';
import { packRigOf } from '../game/packs/rigs';
import { FeedbackPanel } from './FeedbackPanel';
import { TestFlags } from './TestFlags';
import './visionneuse.css';

/**
 * Visionneuse de modèles (`?modeles`) : un seul modèle à la fois, sur un sol quadrillé (1 m), qu'on
 * tourne en glissant et qu'on zoome à la molette (ou à deux doigts). À gauche la liste de tous les
 * modèles (objets du jeu, puis la galerie des packs, comme sur la carte de test) ; à droite ses
 * infos (taille, triangles, pièces qui bougent, ce qu'on peut en faire), un commentaire, et les deux
 * signalements de la carte de test : à supprimer (A), à corriger sur Blender (E), et trop anguleux (T). Les listes partent
 * à Claude avec les commentaires (« Envoyer la liste à Claude »).
 */

interface Entry {
  ref: string;
  label: string;
  group: string;
  def?: ItemDef;
  pack?: PackId;
  model?: string;
  /** Déjà corrigé sur Blender (items/corriges.ts). */
  fixed?: Correction;
}

/** Les modèles, dans l'ordre de la carte de test : objets du jeu, puis la galerie pack par pack. */
function allEntries(): Entry[] {
  const items: Entry[] = [...ITEMS]
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    .map((def) => ({ ref: `objet ${def.id} (${def.name})`, label: def.name, group: 'Objets du jeu', def }));
  const packs = galleryModels().flatMap(({ pack, models }) =>
    models.map((model) => ({ ref: `pack ${pack}/${model}`, label: model, group: `Pack ${pack}`, pack, model })),
  );
  return ([...items, ...packs] as Entry[]).map((e) => ({ ...e, fixed: correctionOf({ objet: e.def?.id, pack: e.pack && `${e.pack}/${e.model}` }) }));
}

/** Les deux onglets de la liste : tous les modèles, ou ceux déjà corrigés sur Blender. */
type Onglet = 'tous' | 'corriges';
const DATE = new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'long', year: 'numeric' });
const dateFr = (d: string) => DATE.format(new Date(`${d}T12:00:00`));
const PR_URL = 'https://github.com/lyarca33-hue/Island/pull/';

/** Une pièce qui bouge (porte, tiroir, flamme…), trouvée dans le modèle. */
interface Part {
  obj: THREE.Object3D;
  motion: Motion;
  play: string;
  period: number;
}

const MOTION_WORD: Record<Motion['kind'], string> = {
  turn: 'pivote',
  slide: 'glisse',
  gather: 'se tasse',
  fold: 'se replie',
  grow: 'pousse',
  glow: 's’allume',
  wave: 'ondule',
  spin: 'tourne',
  fill: 'se remplit',
  shrink: 'se mange',
  reel: 's’enroule',
  path: 'suit un chemin',
};
const PLAY_WORD: Record<string, string> = { once: 'à l’action', loop: 'en boucle', swing: 'va-et-vient', hold: 'selon le jeu' };

/** Ce que la fiche permet (les champs présents) : une phrase courte par champ connu. */
const DEF_WORD: Partial<Record<keyof ItemDef, string>> = {
  portable: 'se porte',
  seat: 'on s’y assoit',
  movable: 'se pousse',
  stack: 's’empile',
  layFlat: 'se pose à plat',
  slots: 'rangement',
  fill: 'se remplit',
  pour: 'remplit un récipient',
  wash: 'point d’eau (se laver)',
  tank: 'réservoir d’eau',
  jug: 'carafe (on verse avec)',
  food: 'se mange',
  dish: 'vaisselle (se salit, se lave)',
  plate: 'on y sert un plat',
  utensil: 'couvert',
  door: 'porte qui s’ouvre',
  drawer: 'tiroir',
  cold: 'garde au froid',
  freezer: 'congèle',
  heats: 'chauffe',
  washes: 'lave',
  blends: 'mixe',
  wipes: 'essuie',
  towel: 'essuie la vaisselle',
  rack: 'égoutte',
  bin: 'poubelle',
  heat: 'source de chaleur',
  cookware: 'ustensile de cuisson',
  cook: 'se cuit',
  cut: 'se coupe',
  board: 'planche à découper',
  knife: 'coupe',
  bed: 'on s’y couche',
  bike: 'on monte dessus',
  lamp: 's’allume',
  screen: 'écran',
  mirror: 'miroir',
  shower: 'douche',
  toilet: 'toilettes',
  stirs: 'remue',
  grates: 'râpe',
  strains: 'égoutte les pâtes',
  spice: 'assaisonne',
  mixes: 'mélange',
  clock: 'donne l’heure',
  window: 'fenêtre',
  table: 'table (on y pose)',
  sweeps: 'balaie',
  mops: 'lave le sol',
  vacuums: 'aspire',
  dusts: 'dépoussière',
  outdoor: 'dehors',
  spray: 'vaporise',
  gloves: 'gants',
  soap: 'savon',
  buildOpen: 'se lit',
};

/** Le modèle à montrer (vide un instant si son pack se charge encore). */
async function buildModel(e: Entry): Promise<THREE.Object3D> {
  if (e.def) return new WorldItem(e.def).object;
  const pack = e.pack!;
  await loadPack(pack);
  const name = e.model as ModelName<typeof pack>;
  const scale = PACK_SCALE[pack] ?? 1;
  if (packRigOf(pack, name)) {
    const rig = packRig(pack, name);
    if (rig) {
      const g = new THREE.Group();
      rig.scale.setScalar(scale);
      g.add(rig);
      return g;
    }
  }
  return packModel(pack, name, { scale });
}

interface Stats {
  size: THREE.Vector3;
  triangles: number;
  meshes: number;
  materials: number;
  textures: number;
  maxTex: number;
}

function statsOf(root: THREE.Object3D): Stats {
  root.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  let triangles = 0, meshes = 0, maxTex = 0;
  const mats = new Set<THREE.Material>(), texs = new Set<THREE.Texture>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.visible) return;
    meshes++;
    const g = o.geometry as THREE.BufferGeometry;
    triangles += (g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)) / 3;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      mats.add(m);
      const map = (m as THREE.MeshToonMaterial).map;
      if (map && !texs.has(map)) {
        texs.add(map);
        const img = map.image as { width?: number } | undefined;
        maxTex = Math.max(maxTex, img?.width ?? 0);
      }
    }
  });
  return { size, triangles: Math.round(triangles), meshes, materials: mats.size, textures: texs.size, maxTex };
}

/**
 * Les pièces qui bougent : celles qui portent leur mouvement (rigs), et la porte ou le tiroir d'un
 * meuble du jeu, que le jeu ouvre lui-même d'après sa fiche (`door`, `drawer` : Game.tickDoors).
 */
function partsOf(root: THREE.Object3D, def?: ItemDef): Part[] {
  const parts: Part[] = [];
  root.traverse((o) => {
    const motion = o.userData.motion as Motion | undefined;
    if (motion) parts.push({ obj: o, motion, play: (o.userData.play as string | undefined) ?? 'once', period: (o.userData.period as number | undefined) ?? 2.5 });
  });
  if (def && (def.door || def.drawer)) {
    for (const [name, side] of [['porte', 1], ['porte-2', -1]] as const) {
      const obj = root.getObjectByName(name);
      if (!obj || parts.some((p) => p.obj === obj)) continue;
      const motion: Motion = def.drawer ? { kind: 'slide', axis: 'z', distance: def.drawer } : { kind: 'turn', axis: def.doorAxis ?? 'y', angle: side * def.door! };
      parts.push({ obj, motion, play: 'once', period: 2.5 });
    }
  }
  return parts;
}

const cm = (m: number) => (m >= 1 ? `${m.toFixed(2)} m` : `${Math.round(m * 100)} cm`);

/** La scène : un modèle sur un sol quadrillé, une caméra qui tourne autour. */
class Viewer {
  readonly renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
  readonly controls: OrbitControls;
  private grid: THREE.GridHelper | null = null;
  model: THREE.Object3D | null = null;
  parts: Part[] = [];
  /** Part des pièces (0 au repos, 1 au bout) quand on ne les joue pas. */
  k = 0;
  playing = false;
  spin = false;
  private lastSize = new THREE.Vector3();
  private clock = new THREE.Clock();
  private raf = 0;
  /** Le modèle a fini de se charger (taille changée) : de nouvelles infos. */
  onChange: (() => void) | null = null;

  constructor(private host: HTMLElement) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xe9e2d3);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    sun.position.set(3, 6, 4);
    const back = new THREE.DirectionalLight(0xdfe8ff, 0.8);
    back.position.set(-4, 3, -3);
    this.scene.add(new THREE.HemisphereLight(0xf2f5ff, 0x7a6a56, 1.5), sun, back);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.autoRotateSpeed = 2;
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    loop();
  }

  resize(): void {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  show(model: THREE.Object3D, def?: ItemDef): void {
    if (this.model) this.scene.remove(this.model);
    this.model = model;
    this.scene.add(model);
    this.parts = partsOf(model, def);
    this.pose(this.k);
    this.lastSize.set(0, 0, 0);
    this.fit();
  }

  /** Recadre la caméra sur le modèle (vu de trois quarts devant) et refait le sol à sa taille. */
  fit(): void {
    if (!this.model) return;
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model);
    if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
    box.getSize(this.lastSize);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const r = Math.max(sphere.radius, 0.05);
    const dist = (r * 1.25) / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const dir = new THREE.Vector3(0.75, 0.55, 1.3).normalize();
    this.controls.target.copy(sphere.center);
    this.camera.position.copy(sphere.center).addScaledVector(dir, dist);
    this.camera.near = Math.max(dist / 200, 0.002);
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = r * 0.3;
    this.controls.maxDistance = dist * 6;
    this.controls.update();
    // le sol : des carreaux de 1 m (10 cm pour un petit objet), un peu plus large que le modèle
    if (this.grid) this.scene.remove(this.grid);
    const cell = r < 0.6 ? 0.1 : 1;
    const n = Math.max(4, Math.ceil((r * 3) / cell) * 2);
    this.grid = new THREE.GridHelper(n * cell, n, 0x9b8a70, 0xc9bda6);
    this.grid.position.y = box.min.y - 0.001;
    this.scene.add(this.grid);
  }

  pose(k: number): void {
    for (const p of this.parts) poseMotion(p.obj, p.motion, k);
  }

  private frame(): void {
    const t = this.clock.getElapsedTime();
    if (this.playing) {
      for (const p of this.parts) {
        const u = t / p.period;
        poseMotion(p.obj, p.motion, p.play === 'loop' ? u % 1 : 0.5 - 0.5 * Math.cos(u * 2 * Math.PI));
      }
    }
    // un pack arrivé après coup (le modèle grandit) : recadré, nouvelles infos
    if (this.model && Math.floor(t * 2) !== Math.floor((t - 0.02) * 2)) {
      const s = new THREE.Box3().setFromObject(this.model).getSize(new THREE.Vector3());
      if (s.distanceTo(this.lastSize) > 1e-4) {
        this.fit();
        this.onChange?.();
      }
    }
    this.controls.autoRotate = this.spin;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

const KIND_LABEL: Record<FlagKind, string> = { retirer: 'Supprimer', corriger: 'Corriger sur Blender', anguleux: 'Trop anguleux' };
const KIND_KEY: Record<FlagKind, string> = { retirer: 'A', corriger: 'E', anguleux: 'T' };

export function Visionneuse() {
  const entries = useMemo(allEntries, []);
  const [index, setIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [onglet, setOnglet] = useState<Onglet>('tous');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [spin, setSpin] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  /** Change à chaque signalement ou commentaire : la liste et les boutons se relisent. */
  const [version, setVersion] = useState(0);
  useEffect(() => onFlags(() => setVersion((v) => v + 1)), []);
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const entry = entries[index];

  // les modèles dont sont faits les objets (aliments, plats, meubles Tripo) : chargés d'abord
  useEffect(() => {
    void Promise.all([preloadPacks(['aliments', 'plats']), loadTripo()]).then(() => setReady(true));
  }, []);

  useEffect(() => {
    const v = new Viewer(host.current!);
    viewer.current = v;
    (window as unknown as { visionneuse: Viewer }).visionneuse = v;
    const ro = new ResizeObserver(() => v.resize());
    ro.observe(host.current!);
    return () => {
      ro.disconnect();
      v.dispose();
      viewer.current = null;
    };
  }, []);

  useEffect(() => {
    const v = viewer.current;
    if (!ready || !v || !entry) return;
    let live = true;
    setBusy(true);
    buildModel(entry)
      .then((model) => {
        if (!live) return;
        v.show(model, entry.def);
        setParts(v.parts);
        setStats(statsOf(model));
        v.onChange = () => setStats(statsOf(model));
      })
      .catch((e) => console.warn(`modèle ${entry.ref} non montré`, e))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [ready, entry]);

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    v.playing = playing;
    v.spin = spin;
    v.k = k;
    if (!playing) v.pose(k);
  }, [playing, spin, k, parts]);

  const notes = useMemo(() => loadComments(), [version]);
  const flagged = (ref: string, kind: FlagKind) => isFlagged(ref, kind);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => onglet === 'tous' || !!e.fixed)
      .filter(({ e }) => !q || e.ref.toLowerCase().includes(q) || e.label.toLowerCase().includes(q))
      .filter(({ e }) => !onlyFlagged || FLAG_KINDS.some((k) => isFlagged(e.ref, k)) || !!notes[e.ref]);
    // (version : relu à chaque signalement)
  }, [entries, onglet, query, onlyFlagged, notes, version]);

  /** Change d'onglet (la recherche repart de zéro) ; dans les corrigés, montre le premier si le modèle choisi n'en est pas. */
  const ouvrir = (o: Onglet) => {
    setOnglet(o);
    setQuery('');
    if (o === 'corriges' && !entries[index]?.fixed) {
      const first = entries.findIndex((e) => e.fixed);
      if (first >= 0) setIndex(first);
    }
  };
  const nbCorriges = useMemo(() => entries.filter((e) => e.fixed).length, [entries]);

  const go = useCallback(
    (step: number) => {
      if (!shown.length) return;
      const at = shown.findIndex(({ i }) => i === index);
      const next = shown[(at < 0 ? 0 : at + step + shown.length) % shown.length].i;
      setIndex(next);
    },
    [shown, index],
  );

  // garde le modèle choisi visible dans la liste, et ses infos reprennent en haut
  const infoRef = useRef<HTMLElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('.vis-item.on')?.scrollIntoView({ block: 'nearest' });
    infoRef.current?.scrollTo({ top: 0 });
  }, [index]);

  // clavier (hors saisie) : ←/→ ou ↑/↓ modèle précédent / suivant, A supprimer, E corriger, R recadrer, Espace jouer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || report !== null) return;
      if (e.code === 'ArrowRight' || e.code === 'ArrowDown') go(1);
      else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') go(-1);
      else if (e.key.toLowerCase() === 'a') toggleFlag(entry.ref, 'retirer');
      else if (e.key.toLowerCase() === 'e') toggleFlag(entry.ref, 'corriger');
      else if (e.key.toLowerCase() === 't') toggleFlag(entry.ref, 'anguleux');
      else if (e.key.toLowerCase() === 'r') viewer.current?.fit();
      else if (e.code === 'Space') setPlaying((p) => !p);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, entry, report]);

  let lastGroup = '';
  const uses = entry?.def ? (Object.keys(DEF_WORD) as Array<keyof ItemDef>).filter((key) => entry.def![key] !== undefined && entry.def![key] !== false) : [];

  return (
    <div className="app vis">
      <aside className="vis-list">
        <div className="vis-list-head">
          <b>Visionneuse</b>
          <span className="vis-count">{shown.length} modèles</span>
        </div>
        <div className="vis-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={onglet === 'tous'} className={onglet === 'tous' ? 'on' : ''} onClick={() => ouvrir('tous')}>
            Tous
          </button>
          <button type="button" role="tab" aria-selected={onglet === 'corriges'} className={onglet === 'corriges' ? 'on' : ''} onClick={() => ouvrir('corriges')}>
            Corrigés sur Blender ({nbCorriges})
          </button>
        </div>
        <input className="vis-search" type="search" placeholder="Chercher un modèle…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="vis-check">
          <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} /> Seulement les signalés ou commentés
        </label>
        <div className="vis-items" ref={listRef}>
          {shown.map(({ e, i }) => {
            const head = e.group !== lastGroup ? e.group : null;
            lastGroup = e.group;
            return (
              <div key={e.ref}>
                {head && <div className="vis-group">{head}</div>}
                <button type="button" className={`vis-item${i === index ? ' on' : ''}`} onClick={() => setIndex(i)} title={e.ref}>
                  <span>{e.label}</span>
                  {flagged(e.ref, 'retirer') && <span className="vis-tag del" title="À supprimer">S</span>}
                  {flagged(e.ref, 'corriger') && <span className="vis-tag fix" title="À corriger sur Blender">B</span>}
                  {flagged(e.ref, 'anguleux') && <span className="vis-tag angle" title="Trop anguleux">◇</span>}
                  {notes[e.ref] && <span className="vis-tag note" title={notes[e.ref]}>✎</span>}
                  {e.fixed && <span className="vis-tag done" title={`Corrigé sur Blender le ${dateFr(e.fixed.date)}`}>✓</span>}
                </button>
              </div>
            );
          })}
        </div>
        <a className="vis-back" href={visionneuseUrl(false)}>Retour à l’île</a>
      </aside>

      <main className="vis-stage">
        <div className="vis-canvas" ref={host} />
        <div className="vis-stage-bar">
          <button type="button" onClick={() => go(-1)} title="Modèle précédent (←)">◀</button>
          <span className="vis-title">{entry?.label}</span>
          <button type="button" onClick={() => go(1)} title="Modèle suivant (→)">▶</button>
        </div>
        <div className="vis-stage-tools">
          <button type="button" onClick={() => viewer.current?.fit()} title="Recadrer (R)">Recadrer</button>
          <button type="button" className={spin ? 'on' : ''} onClick={() => setSpin((s) => !s)} aria-pressed={spin}>
            Tourner seul
          </button>
        </div>
        {(!ready || busy) && <div className="vis-loading">Chargement…</div>}
        <p className="vis-help">Glisser : tourner · Molette ou deux doigts : zoomer · Clic droit : déplacer · A : supprimer · E : Blender · T : trop anguleux</p>
      </main>

      <aside className="vis-info" ref={infoRef}>
        {entry && (
          <>
            <h2>{entry.label}</h2>
            <code className="vis-ref">{entry.ref}</code>
            {entry.fixed && (
              <div className="vis-fixed">
                <b>✓ Corrigé sur Blender</b> le {dateFr(entry.fixed.date)} :{' '}
                {entry.fixed.quoi} (
                <a href={`${PR_URL}${entry.fixed.pr}`} target="_blank" rel="noreferrer">
                  PR #{entry.fixed.pr}
                </a>
                )
                {flagged(entry.ref, 'corriger') && (
                  <p>
                    Encore dans ta liste à corriger.{' '}
                    <button type="button" className="save-link" onClick={() => toggleFlag(entry.ref, 'corriger')}>
                      L’en retirer
                    </button>
                  </p>
                )}
              </div>
            )}
            <div className="vis-flags">
              {FLAG_KINDS.map((kind) => {
                const on = flagged(entry.ref, kind);
                return (
                  <button key={kind} type="button" className={`vis-flag ${kind}${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggleFlag(entry.ref, kind)}>
                    {on ? '✓ ' : ''}
                    {KIND_LABEL[kind]} <kbd>{KIND_KEY[kind]}</kbd>
                  </button>
                );
              })}
            </div>
            <label className="vis-comment">
              Commentaire (part avec les listes)
              <textarea
                key={entry.ref}
                defaultValue={notes[entry.ref] ?? ''}
                placeholder="Ce qui ne va pas, ce qu’il faut corriger…"
                onChange={(e) => setComment(entry.ref, e.target.value)}
                rows={3}
              />
            </label>

            <h3>Infos</h3>
            <dl className="vis-dl">
              <dt>Origine</dt>
              <dd>{entry.def ? 'objet du jeu' : `galerie, pack ${entry.pack}`}</dd>
              {stats && (
                <>
                  <dt>Taille</dt>
                  <dd>
                    {cm(stats.size.x)} × {cm(stats.size.y)} × {cm(stats.size.z)}
                    <small> (largeur × hauteur × profondeur)</small>
                  </dd>
                  <dt>Triangles</dt>
                  <dd>{stats.triangles.toLocaleString('fr')}</dd>
                  <dt>Morceaux</dt>
                  <dd>
                    {stats.meshes} maillage{stats.meshes > 1 ? 's' : ''}, {stats.materials} matériau{stats.materials > 1 ? 'x' : ''}
                  </dd>
                  <dt>Textures</dt>
                  <dd>{stats.textures ? `${stats.textures} (jusqu’à ${stats.maxTex} px)` : 'aucune (couleurs unies)'}</dd>
                </>
              )}
              {entry.def && (
                <>
                  <dt>Durabilité</dt>
                  <dd>
                    {entry.def.durability ?? 100} pts, fragilité {entry.def.fragility ?? 5}/10
                  </dd>
                </>
              )}
            </dl>

            <h3>Animations ({parts.length})</h3>
            {parts.length ? (
              <>
                <ul className="vis-parts">
                  {parts.map((p, n) => (
                    <li key={n}>
                      <b>{p.obj.name || 'pièce'}</b> {MOTION_WORD[p.motion.kind]}, {PLAY_WORD[p.play] ?? p.play}
                    </li>
                  ))}
                </ul>
                <div className="vis-play">
                  <button type="button" className={playing ? 'on' : ''} onClick={() => setPlaying((p) => !p)} title="Jouer (Espace)">
                    {playing ? '❚❚ Arrêter' : '▶ Jouer'}
                  </button>
                  <input type="range" min={0} max={1} step={0.01} value={k} disabled={playing} onChange={(e) => setK(+e.target.value)} aria-label="Position des pièces" />
                </div>
              </>
            ) : (
              <p className="vis-muted">Aucune pièce qui bouge : le modèle est d’un seul bloc.</p>
            )}

            {entry.def && (
              <>
                <h3>Ce qu’on peut en faire</h3>
                {uses.length ? (
                  <ul className="vis-uses">
                    {uses.map((key) => (
                      <li key={key}>{DEF_WORD[key]}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="vis-muted">Rien de particulier : décor.</p>
                )}
              </>
            )}

            <h3>Listes à envoyer</h3>
            <div className="vis-lists">
              {FLAG_KINDS.map((kind) => (
                <TestFlags key={kind} kind={kind} onSend={setReport} />
              ))}
            </div>
          </>
        )}
      </aside>
      {report !== null && <FeedbackPanel initial={report} onClose={() => setReport(null)} />}
    </div>
  );
}
