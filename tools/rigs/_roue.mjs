// usage: node _roue.mjs pack model "xlo,ylo,zlo,xhi,yhi,zhi" [x|z] -> centre et rayon d'une roue (essieu le long de z, ou x),
// mesurés par le bas du pneu : son point le plus bas donne le centre en long, la corde à h au-dessus donne le rayon
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [pack, name, box, axis = 'z'] = process.argv.slice(2);
const doc = await io.read(`/home/claude/Island/public/packs/${pack}.glb`);
const node = doc.getRoot().listNodes().find(n => n.getName() === name);
const M = node.getWorldMatrix();
const b = box.split(',').map(Number);
const pts = [];
for (const p of node.getMesh().listPrimitives()) {
  const a = p.getAttribute('POSITION'), v = [];
  for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v);
    const w = [0,1,2].map(r => M[r]*v[0] + M[4+r]*v[1] + M[8+r]*v[2] + M[12+r]);
    if (w.every((x, k) => x >= b[k] && x <= b[k+3])) pts.push(w); }
}
const u = axis === 'z' ? 0 : 2, k = axis === 'z' ? 2 : 0;
const ylo = Math.min(...pts.map(p => p[1]));
const out = {};
for (const h of (process.env.H || "0.03,0.06,0.1").split(",").map(Number)) {
  const band = pts.filter(p => p[1] <= ylo + h);
  const a = Math.min(...band.map(p => p[u])), c = Math.max(...band.map(p => p[u]));
  const w = (c - a) / 2, R = (w * w + h * h) / (2 * h);
  out[h] = { centre: +((a + c) / 2).toFixed(3), R: +R.toFixed(3), y: +(ylo + R).toFixed(3) };
}
console.log(JSON.stringify({ ylo: +ylo.toFixed(3), axe: [Math.min(...pts.map(p => p[k])).toFixed(3), Math.max(...pts.map(p => p[k])).toFixed(3)], ...out }));
