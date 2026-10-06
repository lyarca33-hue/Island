/**
 * Données du créateur de personnage (converties depuis MakeHuman par
 * tools/build_creator_assets.py) : maillage de base, formes (« targets »), expressions,
 * squelette Mixamo, poids de peau, cheveux / vêtements / yeux et leurs données d'ajustement.
 *
 * Un seul chargement pour tout le jeu : creator.json (index) + creator.bin.gz (tableaux).
 */

const BASE = `${import.meta.env.BASE_URL}creator/`;

interface ArrayRef {
  type: 'f32' | 'u16' | 'i16' | 'u32' | 'u8';
  offset: number;
  length: number;
}
interface TargetRef {
  indices: ArrayRef;
  deltas: ArrayRef;
}
interface ProxyRef {
  id: string;
  kind: ProxyKind;
  name: string;
  tags: string[];
  license: string | null;
  author: string | null;
  vertexCount: number;
  refs: ArrayRef;
  weights: ArrayRef;
  offsets: ArrayRef;
  toProxy: ArrayRef;
  uv: ArrayRef;
  index: ArrayRef;
  textures: Array<{ name: string; map: string }>;
  zDepth: number;
  deleteVerts?: ArrayRef;
}
interface Manifest {
  vertexCount: number;
  basePositions: ArrayRef;
  body: { toBase: ArrayRef; uv: ArrayRef; index: ArrayRef };
  targets: Record<string, TargetRef>;
  expressions: Record<string, TargetRef>;
  bones: Array<{ name: string; parent: string | null; head: number[]; tail: number[] }>;
  skinIndex: ArrayRef;
  skinWeight: ArrayRef;
  skin: { female: string; male: string };
  proxies: ProxyRef[];
}

export type ProxyKind = 'hair' | 'eyebrows' | 'eyelashes' | 'eyes' | 'teeth' | 'clothes';

/** Forme décodée : sommets touchés + écarts (mètres, xyz à la suite). */
export interface Target {
  indices: Uint16Array;
  deltas: Float32Array;
}

export interface ProxyAsset {
  id: string;
  kind: ProxyKind;
  name: string;
  tags: string[];
  vertexCount: number;
  /** Pour chaque sommet du proxy : 3 sommets du corps, leurs poids, et un décalage (m). */
  refs: Uint16Array;
  weights: Float32Array;
  offsets: Float32Array;
  /** Sommets de rendu (sommet du proxy + uv). */
  toProxy: Uint16Array;
  uv: Float32Array;
  index: Uint32Array;
  /** Textures (URL) ; les yeux en ont une par couleur d'iris. */
  textures: Array<{ name: string; url: string }>;
  /** Ordre d'empilement (sous-vêtements < habits < manteaux). */
  zDepth: number;
  /** Sommets du corps cachés sous ce vêtement (évite que la peau passe à travers). */
  deleteVerts: Uint16Array | null;
}

export interface BoneDef {
  name: string;
  parent: string | null;
  /** Sommets dont la moyenne donne la tête / la queue de l'os (suit les formes). */
  head: number[];
  tail: number[];
}

export interface HumanAssets {
  vertexCount: number;
  basePositions: Float32Array;
  body: { toBase: Uint16Array; uv: Float32Array; index: Uint32Array };
  targets: Map<string, Target>;
  expressions: Map<string, Target>;
  bones: BoneDef[];
  /** 4 os par sommet de base (indices dans `bones`) et poids (0-255). */
  skinIndex: Uint8Array;
  skinWeight: Uint8Array;
  skinTextures: { female: string; male: string };
  proxies: ProxyAsset[];
}

let loading: Promise<HumanAssets> | null = null;

/** Charge (une fois) les données du créateur. */
export function loadHumanAssets(): Promise<HumanAssets> {
  loading ??= load();
  return loading;
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} : ${res.status}`);
  const buf = await res.arrayBuffer();
  const head = new Uint8Array(buf, 0, 2);
  // le serveur peut déjà l'avoir décompressé (Content-Encoding) : on vérifie la signature gzip
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buf;
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

async function load(): Promise<HumanAssets> {
  const [manifest, buf] = await Promise.all([
    fetch(`${BASE}creator.json`).then((r) => r.json() as Promise<Manifest>),
    fetchBytes(`${BASE}creator.bin.gz`),
  ]);
  const arr = <T>(ref: ArrayRef): T => {
    const C = { f32: Float32Array, u16: Uint16Array, i16: Int16Array, u32: Uint32Array, u8: Uint8Array }[ref.type];
    return new C(buf, ref.offset, ref.length) as T;
  };
  const target = (t: TargetRef): Target => {
    const di = arr<Uint16Array>(t.indices);
    const raw = arr<Int16Array>(t.deltas);
    // index stockés en écarts successifs
    const indices = new Uint16Array(di.length);
    let acc = 0;
    for (let i = 0; i < di.length; i++) indices[i] = acc += di[i];
    const deltas = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) deltas[i] = raw[i] / 10000;
    return { indices, deltas };
  };
  const decodeAll = (rec: Record<string, TargetRef>) => new Map(Object.entries(rec).map(([k, v]) => [k, target(v)]));
  return {
    vertexCount: manifest.vertexCount,
    basePositions: arr(manifest.basePositions),
    body: { toBase: arr(manifest.body.toBase), uv: arr(manifest.body.uv), index: arr(manifest.body.index) },
    targets: decodeAll(manifest.targets),
    expressions: decodeAll(manifest.expressions),
    bones: manifest.bones,
    skinIndex: arr(manifest.skinIndex),
    skinWeight: arr(manifest.skinWeight),
    skinTextures: { female: BASE + 'tex/' + manifest.skin.female, male: BASE + 'tex/' + manifest.skin.male },
    proxies: manifest.proxies.map((p) => ({
      id: p.id,
      kind: p.kind,
      name: p.name,
      tags: p.tags,
      vertexCount: p.vertexCount,
      refs: arr(p.refs),
      weights: arr(p.weights),
      offsets: arr(p.offsets),
      toProxy: arr(p.toProxy),
      uv: arr(p.uv),
      index: arr(p.index),
      textures: p.textures.map((t) => ({ name: t.name, url: BASE + 'tex/' + t.map })),
      zDepth: p.zDepth,
      deleteVerts: p.deleteVerts ? arr(p.deleteVerts) : null,
    })),
  };
}
