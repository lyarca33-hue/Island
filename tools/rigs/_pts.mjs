// usage: node pts.mjs pack model "xlo,ylo,zlo,xhi,yhi,zhi"  -> stats of vertices in box (model frame) + PCA normal
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [pack, name, box] = process.argv.slice(2);
const doc = await io.read(`/home/claude/Island/public/packs/${pack}.glb`);
const node = doc.getRoot().listNodes().find(n => n.getName() === name);
const M = node.getWorldMatrix();
const b = box ? box.split(',').map(Number) : [-99,-99,-99,99,99,99];
const pts = [];
for (const p of node.getMesh().listPrimitives()) {
  const a = p.getAttribute('POSITION'), v = [];
  for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v);
    const w = [0,1,2].map(r => M[r]*v[0] + M[4+r]*v[1] + M[8+r]*v[2] + M[12+r]);
    if (w.every((x, k) => x >= b[k] && x <= b[k+3])) pts.push(w); }
}
const n = pts.length, mean = [0,1,2].map(k => pts.reduce((s, p) => s + p[k], 0) / n);
const lo = [0,1,2].map(k => Math.min(...pts.map(p => p[k]))), hi = [0,1,2].map(k => Math.max(...pts.map(p => p[k])));
const C = [0,1,2].map(i => [0,1,2].map(j => pts.reduce((s, p) => s + (p[i]-mean[i])*(p[j]-mean[j]), 0) / n));
// plus petite direction propre (itération inverse simple)
const inv = (m) => { const [a,b,c]=m[0],[d,e,f]=m[1],[g,h,i]=m[2]; const A=e*i-f*h,B=-(d*i-f*g),Cc=d*h-e*g; const det=a*A+b*B+c*Cc;
  return [[A/det,-(b*i-c*h)/det,(b*f-c*e)/det],[B/det,(a*i-c*g)/det,-(a*f-c*d)/det],[Cc/det,-(a*h-b*g)/det,(a*e-b*d)/det]]; };
let v = [0.3,0.5,0.8]; const Ci = inv(C.map((r,i)=>r.map((x,j)=>x+(i===j?1e-9:0))));
for (let t = 0; t < 50; t++) { v = [0,1,2].map(i => Ci[i][0]*v[0]+Ci[i][1]*v[1]+Ci[i][2]*v[2]); const l = Math.hypot(...v); v = v.map(x => x/l); }
const f = (a) => a.map(x => x.toFixed(3)).join(', ');
console.log(`n=${n} mean=[${f(mean)}] lo=[${f(lo)}] hi=[${f(hi)}] normal=[${f(v)}]`);
if (process.env.DIR) { const d = process.env.DIR.split(',').map(Number); const pr = pts.map(p => (p[0]-mean[0])*d[0]+(p[1]-mean[1])*d[1]+(p[2]-mean[2])*d[2]); console.log('proj min', Math.min(...pr).toFixed(3), 'max', Math.max(...pr).toFixed(3)); }
