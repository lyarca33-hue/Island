/**
 * Le paysage autour de la maison, fait avec les modèles des packs de Quaternius (CC0) :
 * - la route au sud, ses voitures garées, et un taxi qui passe de temps en temps (Realistic Car Pack) ;
 * - le marché du village de l'autre côté de la route, et son vide-grenier (Fantasy Props MegaKit) ;
 * - l'atelier près du coin camping (Fantasy Props MegaKit) ;
 * - la voie ferrée au nord, où passe un train (Train Pack) ;
 * - la station scientifique à l'est, avec son armurerie (Modular SciFi MegaKit, Ultimate Gun Pack).
 *
 * Rien ne s'y prend : c'est du décor, chargé après la maison (les modèles arrivent un instant
 * après le début de la partie). Ce qui bloque le passage est connu tout de suite (obstacles).
 */
import * as THREE from 'three';
import { fitScale, loadPack, packModel, packSize, type Fit } from './packs/assets';
import type { ModelName, PackId } from './packs/manifest';
import { mergeStaticParts } from './items/merge';
import { createToonMaterial } from './toon';

const toon = (color: THREE.ColorRepresentation) => createToonMaterial({ color, rimStrength: 0.1 });

export interface Obstacle {
  box: THREE.Box3;
  pos: THREE.Vector3;
  yaw: number;
}

/** La route : axe (z), largeur, trottoir côté maison. */
export const ROAD = { z: 27, w: 5.2 };
/** La voie ferrée (z). */
export const RAIL_Z = -34;
/** La station scientifique : centre, demi-côté (m). */
export const STATION = { x: 32, z: -12, half: 6 };
/** Longueur de la route et des rails (m), de part et d'autre de x = 0. */
const SPAN = 64;

/** Un véhicule qui passe : son groupe, sa vitesse (m/s), sa ligne (z), son sens, et l'attente avant le prochain passage (s). */
interface Mover {
  group: THREE.Group;
  speed: number;
  dir: 1 | -1;
  /** Longueur (m) : il part et arrive hors de la carte. */
  length: number;
  wait: number;
  every: [number, number];
  x: number;
}

export class Paysage {
  readonly group = new THREE.Group();
  readonly obstacles: Obstacle[] = [];
  private movers: Mover[] = [];
  /** Zones regroupées (moins de dessins) une fois leurs packs arrivés. */
  private areas: Array<{ group: THREE.Group; packs: PackId[] }> = [];

  constructor() {
    this.group.name = 'paysage';
    this.road();
    this.market();
    this.fleaMarket();
    this.workshop();
    this.railway();
    this.station();
    for (const a of this.areas) {
      this.group.add(a.group);
      void Promise.all(a.packs.map(loadPack)).then(() => mergeStaticParts(a.group));
    }
  }

  /** À chaque image : les véhicules roulent. */
  update(dt: number): void {
    for (const m of this.movers) {
      if (m.wait > 0) {
        m.wait -= dt;
        m.group.visible = false;
        if (m.wait <= 0) m.x = -m.dir * (SPAN + m.length);
        continue;
      }
      m.group.visible = true;
      m.x += m.dir * m.speed * dt;
      m.group.position.x = m.x;
      if (m.dir * m.x > SPAN + m.length) m.wait = THREE.MathUtils.randFloat(...m.every);
    }
  }

  // ——— outils ———

  /** Le modèle `name`, posé en (x, z) tourné de `yaw`, dans `into` ; `block` : il bloque le passage. */
  private put<P extends PackId>(into: THREE.Group, pack: P, name: ModelName<P>, fit: Fit, x: number, z: number, yaw = 0, block = false, y = 0): THREE.Group {
    const m = packModel(pack, name, fit);
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    into.add(m);
    if (block) {
      const s = packSize(pack, name).multiplyScalar(fitScale(pack, name, fit));
      this.block(x, z, s.x, s.z, yaw, s.y);
    }
    return m;
  }

  /** Un rectangle au sol (largeur x, profondeur z, tourné de `yaw`) qui bloque le passage. */
  private block(x: number, z: number, w: number, d: number, yaw = 0, h = 1): void {
    this.obstacles.push({ box: new THREE.Box3(new THREE.Vector3(-w / 2, 0, -d / 2), new THREE.Vector3(w / 2, h, d / 2)), pos: new THREE.Vector3(x, 0, z), yaw });
  }

  private area(...packs: PackId[]): THREE.Group {
    const g = new THREE.Group();
    this.areas.push({ group: g, packs });
    return g;
  }

  // ——— la route ———

  private road(): void {
    const g = new THREE.Group();
    const len = SPAN * 2;
    const tarmac = new THREE.Mesh(new THREE.PlaneGeometry(len, ROAD.w).rotateX(-Math.PI / 2), toon(0x55585c));
    tarmac.position.set(0, 0.006, ROAD.z);
    tarmac.receiveShadow = true;
    g.add(tarmac);
    // un trottoir de chaque côté
    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 1.4), toon(0xb9b4aa));
      walk.position.set(0, 0.04, ROAD.z + side * (ROAD.w / 2 + 0.7));
      walk.receiveShadow = true;
      g.add(walk);
    }
    // ligne blanche en tirets
    const dash = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.6, 0.14).rotateX(-Math.PI / 2), toon(0xf2efe6), Math.floor(len / 4));
    const m = new THREE.Matrix4();
    for (let i = 0; i < dash.count; i++) dash.setMatrixAt(i, m.makeTranslation(-SPAN + 2 + i * 4, 0.01, ROAD.z));
    g.add(dash);
    this.group.add(g);
    // voitures garées le long du trottoir (le long de x : modèles tournés d'un quart de tour)
    const cars = this.area('voitures');
    const parked: Array<[ModelName<'voitures'>, number]> = [['NormalCar1', -22], ['SUV', -15.5], ['Cop', 14], ['SportsCar', 19.5], ['NormalCar2', 26], ['SportsCar2', -30]];
    for (const [name, x] of parked) this.put(cars, 'voitures', name, { scale: 1 }, x, ROAD.z - ROAD.w / 4, name === 'Cop' ? -Math.PI / 2 : Math.PI / 2, true);
    // le taxi passe sur l'autre voie
    const taxi = new THREE.Group();
    taxi.add(this.put(new THREE.Group(), 'voitures', 'Taxi', { scale: 1 }, 0, 0, -Math.PI / 2));
    taxi.position.z = ROAD.z + ROAD.w / 4;
    this.group.add(taxi);
    this.movers.push({ group: taxi, speed: 9, dir: -1, length: 5, wait: 20, every: [40, 120], x: 0 });
  }

  // ——— le marché et le vide-grenier ———

  private market(): void {
    const g = this.area('fantasy');
    const z = ROAD.z + ROAD.w / 2 + 3.4;
    // deux étals tournés vers le chemin (vers -Z), les cagettes devant
    this.put(g, 'fantasy', 'Stall_Empty', { height: 2.4 }, -3, z, Math.PI, true);
    this.put(g, 'fantasy', 'Stall_Cart_Empty', { height: 2.4 }, 1.2, z, Math.PI, true);
    this.put(g, 'fantasy', 'FarmCrate_Apple', { width: 0.6 }, -3.4, z - 0.85, Math.PI);
    this.put(g, 'fantasy', 'FarmCrate_Carrot', { width: 0.6 }, -2.6, z - 0.85, Math.PI);
    this.put(g, 'fantasy', 'FarmCrate_Empty', { width: 0.6 }, 0.6, z - 0.8, Math.PI + 0.2);
    this.put(g, 'fantasy', 'Barrel_Apples', { height: 0.8 }, -4.6, z + 0.1, 0, true);
    this.put(g, 'fantasy', 'Barrel', { height: 0.8 }, 2.9, z - 0.2, 0.4, true);
    this.put(g, 'fantasy', 'Bucket_Wooden_1', { height: 0.28 }, 2.4, z - 0.7, 0);
    this.put(g, 'fantasy', 'Bucket_Metal', { height: 0.32 }, -1.9, z - 0.7, 0.5);
    this.put(g, 'fantasy', 'Carrot', { height: 0.22 }, -2.3, z - 1.1, 1.2);
    this.put(g, 'fantasy', 'Banner_1', { height: 2.4 }, -5.6, z + 0.4, Math.PI, true);
    this.put(g, 'fantasy', 'Banner_2', { height: 2.2 }, 4.0, z + 0.4, Math.PI, true);
    this.put(g, 'fantasy', 'Bag', { height: 0.5 }, 3.4, z + 0.5, 0.3);
    this.put(g, 'fantasy', 'Pouch_Large', { height: 0.14 }, -3.2, z - 0.25, 0, false, 0.92);
    this.put(g, 'fantasy', 'Coin_Pile', { width: 0.2 }, 1.0, z - 0.3, 0, false, 0.92);
  }

  /** Le vide-grenier, à l'ouest du marché : des tables chargées de vieilleries, des meubles posés dans l'herbe. */
  private fleaMarket(): void {
    const g = this.area('fantasy');
    const z = ROAD.z + ROAD.w / 2 + 3.8;
    const x0 = -12;
    const TOP = 0.81;
    // trois grandes tables
    for (const dx of [0, 3.4, 6.8]) this.put(g, 'fantasy', 'Table_Large', { height: TOP }, x0 + dx, z, 0, true);
    const on = (name: ModelName<'fantasy'>, fit: Fit, x: number, dz: number, yaw = 0) => this.put(g, 'fantasy', name, fit, x0 + x, z + dz, yaw, false, TOP);
    // table 1 : vaisselle, bougies, bouteilles
    on('Mug', { height: 0.12 }, -1.0, 0.2);
    on('Chalice', { height: 0.17 }, -0.7, -0.15);
    on('Table_Plate', { width: 0.24 }, -0.3, 0.15);
    on('Table_Fork', { length: 0.18 }, -0.05, 0.15, 0.2);
    on('Table_Knife', { length: 0.2 }, 0.05, 0.15, 0.2);
    on('Table_Spoon', { length: 0.18 }, 0.15, 0.15, 0.2);
    on('CandleStick', { height: 0.1 }, 0.4, -0.2);
    on('CandleStick_Triple', { height: 0.3 }, 0.8, -0.25);
    on('Candle_1', { height: 0.08 }, 0.65, 0.2);
    on('Candle_2', { height: 0.14 }, 0.75, 0.25);
    on('Bottle_1', { height: 0.24 }, 1.05, 0.1);
    on('SmallBottle', { height: 0.09 }, 1.2, -0.1);
    on('SmallBottles_1', { height: 0.1 }, 1.25, 0.25);
    on('Pot_1', { height: 0.14 }, -1.15, -0.25);
    on('Pot_1_Lid', { height: 0.18 }, -0.4, -0.25);
    // table 2 : livres, parchemins, potions, clés
    const t2 = 3.4;
    on('Book_Stack_1', { height: 0.16 }, t2 - 1.1, -0.2);
    on('Book_Stack_2', { height: 0.15 }, t2 - 0.8, 0.2);
    on('Book_5', { width: 0.16 }, t2 - 0.5, -0.1, 0.4);
    on('Book_7', { width: 0.18 }, t2 - 0.25, 0.22, -0.3);
    on('Book_Simplified_Single', { height: 0.2 }, t2, -0.25);
    on('BookGroup_Small_1', { height: 0.2 }, t2 + 0.25, -0.25);
    on('BookGroup_Small_2', { height: 0.2 }, t2 + 0.45, -0.25);
    on('BookGroup_Small_3', { height: 0.2 }, t2 + 0.65, -0.25);
    on('Scroll_1', { width: 0.2 }, t2 + 0.3, 0.2, 0.3);
    on('Scroll_2', { width: 0.2 }, t2 + 0.55, 0.15, -0.2);
    on('Potion_1', { height: 0.1 }, t2 + 0.9, 0.15);
    on('Potion_2', { height: 0.18 }, t2 + 1.05, -0.15);
    on('Potion_4', { height: 0.14 }, t2 + 1.2, 0.2);
    on('Key_Gold', { length: 0.1 }, t2 + 0.8, -0.2, 0.5);
    on('Key_Metal', { length: 0.09 }, t2 + 0.95, -0.3, -0.4);
    on('Coin_Pile_2', { width: 0.2 }, t2 - 1.0, 0.25);
    on('Coin', { height: 0.04 }, t2 - 0.7, -0.3);
    // table 3 : armes de théâtre, bouclier, outils
    const t3 = 6.8;
    on('Sword_Bronze', { height: 0.85 }, t3 - 0.9, 0, 0);
    on('Shield_Wooden', { height: 0.45 }, t3 - 0.3, 0, 0);
    on('Axe_Bronze', { height: 0.6 }, t3 + 0.3, 0.1, 0.3);
    on('Workbench_Drawers', { width: 0.35 }, t3 + 0.85, -0.1);
    on('Whetstone', { height: 0.5 }, t3 + 1.6, 1.0);
    on('Rope_1', { width: 0.4 }, t3 + 1.0, 0.25);
    on('Chain_Coil', { width: 0.45 }, t3 + 0.6, -0.25);
    // les meubles dans l'herbe, derrière les tables
    const back = z + 1.6;
    const floor: Array<[ModelName<'fantasy'>, Fit, number, number]> = [
      ['Bed_Twin1', { length: 2.0 }, -1.2, Math.PI / 2],
      ['Cabinet', { height: 0.9 }, 1.0, Math.PI],
      ['Bookcase_2', { height: 2.0 }, 2.4, Math.PI],
      ['Nightstand_Shelf', { height: 1.0 }, 3.6, Math.PI],
      ['Chair_1', { height: 0.95 }, 4.5, Math.PI + 0.3],
      ['Stool', { height: 0.5 }, 5.2, 0.4],
      ['Chest_Wood', { width: 0.9 }, 6.2, Math.PI],
      ['Cauldron', { height: 0.6 }, 7.4, 0],
      ['Cage_Small', { height: 0.6 }, 8.4, 0.4],
      ['Vase_2', { height: 0.45 }, 9.1, 0],
      ['Vase_4', { height: 0.4 }, 9.6, 0.2],
      ['BookStand', { height: 1.2 }, -2.6, Math.PI],
      ['CandleStick_Stand', { height: 1.2 }, -3.3, 0],
      ['Shelf_Arch', { height: 1.4 }, 0.1, Math.PI],
      ['Bed_Twin2', { length: 2.0 }, 10.6, Math.PI / 2],
    ];
    for (const [name, fit, dx, yaw] of floor) this.put(g, 'fantasy', name, fit, x0 + dx, back, yaw, true);
    // ce qui garnit les étagères et le lit
    this.put(g, 'fantasy', 'BookGroup_Medium_1', { width: 0.8 }, x0 + 2.4, back, Math.PI, false, 0.95);
    this.put(g, 'fantasy', 'BookGroup_Medium_2', { width: 0.8 }, x0 + 2.4, back, Math.PI, false, 1.42);
    this.put(g, 'fantasy', 'BookGroup_Medium_3', { width: 0.8 }, x0 + 2.4, back, Math.PI, false, 0.45);
    this.put(g, 'fantasy', 'Shelf_Small_Bottles', { width: 0.8 }, x0 + 0.1, back + 0.1, Math.PI, false, 0);
    this.put(g, 'fantasy', 'Shelf_Simple', { width: 0.8 }, x0 + 9.4, back + 0.6, Math.PI, true);
    this.put(g, 'fantasy', 'Vase_Rubble_Medium', { width: 0.5 }, x0 + 8.9, back - 0.8, 0.6);
    this.put(g, 'fantasy', 'Chandelier', { height: 0.9 }, x0 + 4.6, back - 1.0, 0.2);
    this.put(g, 'fantasy', 'Lantern_Wall', { height: 0.6 }, x0 + 10, back - 1.0, 0);
    this.put(g, 'fantasy', 'Torch_Metal', { height: 0.4 }, x0 + 7.4, back - 1.1, 0.3);
    this.put(g, 'fantasy', 'Banner_1_Cloth', { height: 1.6 }, x0 - 1.8, z - 0.2, Math.PI);
    this.put(g, 'fantasy', 'Banner_2_Cloth', { height: 1.4 }, x0 + 8.4, z - 0.2, Math.PI);
  }

  /** L'atelier, à côté du coin camping : établi, enclume, tonneaux, outils. */
  private workshop(): void {
    const g = this.area('fantasy');
    const x = -17.5, z = 13;
    this.put(g, 'fantasy', 'Workbench', { width: 1.8 }, x, z, Math.PI / 2, true);
    this.put(g, 'fantasy', 'Anvil_Log', { height: 0.9 }, x + 1.6, z - 1.4, 0.4, true);
    this.put(g, 'fantasy', 'Anvil', { width: 0.7 }, x + 1.2, z + 1.6, 0.2, true);
    this.put(g, 'fantasy', 'Barrel_Holder', { height: 1.1 }, x - 0.4, z + 2.4, Math.PI / 2, true);
    this.put(g, 'fantasy', 'Crate_Wooden', { height: 0.8 }, x + 0.2, z - 2.3, 0.3, true);
    this.put(g, 'fantasy', 'Crate_Metal', { height: 0.75 }, x + 1.1, z - 2.6, -0.2, true);
    this.put(g, 'fantasy', 'Pickaxe_Bronze', { height: 0.8 }, x + 0.25, z + 0.2, Math.PI / 2, false, 0.9);
    this.put(g, 'fantasy', 'Rope_2', { width: 0.5 }, x + 0.2, z - 0.5, 0, false, 0.9);
    this.put(g, 'fantasy', 'Rope_3', { width: 0.7 }, x + 2.1, z + 0.2, 0.4);
    this.put(g, 'fantasy', 'Peg_Rack', { width: 1.0 }, x - 0.7, z, Math.PI / 2, false, 1.3);
    this.put(g, 'fantasy', 'WeaponStand', { height: 1.0 }, x + 2.6, z + 2.2, -0.5, true);
    this.put(g, 'fantasy', 'Dummy', { height: 1.7 }, x + 4.0, z + 1.0, -0.8, true);
  }

  // ——— la voie ferrée ———

  private railway(): void {
    const g = this.area('trains');
    const seg = packSize('trains', 'RailwayTrack_Straight').x;
    for (let x = -SPAN; x < SPAN + seg; x += seg) this.put(g, 'trains', 'RailwayTrack_Straight', { scale: 1 }, x, RAIL_Z);
    // le ballast sous les rails, et une barrière le long de la voie
    const ballast = new THREE.Mesh(new THREE.BoxGeometry(SPAN * 2 + seg, 0.06, 3), toon(0x8a8178));
    ballast.position.set(0, 0.02, RAIL_Z);
    ballast.receiveShadow = true;
    this.group.add(ballast);
    this.block(0, RAIL_Z + 2.4, SPAN * 2, 0.2, 0, 1);
    const fence = new THREE.Mesh(new THREE.BoxGeometry(SPAN * 2, 0.06, 0.06), toon(0xe8e2d6));
    fence.position.set(0, 0.85, RAIL_Z + 2.4);
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), toon(0xe8e2d6), Math.floor(SPAN / 2));
    const m = new THREE.Matrix4();
    for (let i = 0; i < posts.count; i++) posts.setMatrixAt(i, m.makeTranslation(-SPAN + i * 4, 0.45, RAIL_Z + 2.4));
    this.group.add(fence, posts);
    // trois trains : vapeur, marchandises, grande vitesse, l'un après l'autre
    const trains: Array<{ cars: ModelName<'trains'>[]; speed: number }> = [
      { cars: ['Locomotive_Front', 'Locomotive_CoalTender', 'Locomotive_PassengerWagon', 'Locomotive_Wagon', 'Locomotive_PassengerWagon'], speed: 11 },
      { cars: ['CargoTrain_Front', 'CargoTrain_Container', 'CargoTrain_CoalContainer', 'CargoTrain_WagonOpenContainer', 'CargoTrain_Wagon', 'CargoTrain_WagonEmpty'], speed: 14 },
      { cars: ['HighSpeed_Front', 'HighSpeed_Wagon', 'HighSpeed_Wagon'], speed: 26 },
    ];
    trains.forEach((t, k) => {
      const train = new THREE.Group();
      // la locomotive regarde vers -X : le train roule vers -X, les wagons derrière elle
      let x = 0;
      for (const name of t.cars) {
        const len = packSize('trains', name).x;
        const car = packModel('trains', name);
        car.position.x = x + len / 2;
        x += len + 0.4;
        train.add(car);
      }
      train.position.z = RAIL_Z;
      train.visible = false;
      this.group.add(train);
      this.movers.push({ group: train, speed: t.speed, dir: -1, length: x, wait: 30 + k * 70, every: [150, 260], x: 0 });
    });
  }

  // ——— la station scientifique ———

  private station(): void {
    const g = this.area('scifi', 'armes');
    const { x: cx, z: cz, half } = STATION;
    // le sol : 3 × 3 dalles de 4 m
    const plates: ModelName<'scifi'>[] = ['Platform_Metal', 'Platform_Simple', 'Platform_Metal', 'Platform_Squares', 'Platform_CenterPlate', 'Platform_Squares', 'Platform_Metal', 'Platform_Simple', 'Platform_Metal'];
    plates.forEach((name, i) => this.put(g, 'scifi', name, { scale: 1 }, cx - 4 + (i % 3) * 4, cz - 4 + Math.floor(i / 3) * 4, 0, false, 0.015));
    // les murs : hauts au nord et à l'ouest (porte côté maison), bas au sud et à l'est, côté
    // caméra, pour qu'on voie dedans
    for (let k = 0; k < 3; k++) {
      const t = -4 + k * 4;
      const wall: ModelName<'scifi'> = k === 1 ? 'WallWindow_Straight' : 'WallBand_Straight';
      this.put(g, 'scifi', wall, { scale: 1 }, cx + t, cz - half, -Math.PI / 2, true);
      if (k !== 1) this.put(g, 'scifi', wall, { scale: 1 }, cx - half, cz + t, 0, true);
      this.put(g, 'scifi', 'ShortWall_MetalPlates_Straight', { scale: 1 }, cx + half, cz + t, Math.PI, false);
      this.put(g, 'scifi', 'ShortWall_MetalPlates_Straight', { scale: 1 }, cx + t, cz + half, Math.PI / 2, false);
      this.block(cx + half, cz + t, 0.3, 4, 0, 1);
      this.block(cx + t, cz + half, 4, 0.3, 0, 1);
    }
    this.put(g, 'scifi', 'Door_Frame_Square', { scale: 0.8 }, cx - half, cz, Math.PI / 2);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) this.put(g, 'scifi', 'Column_Round', { height: 3.2 }, cx + sx * half, cz + sz * half, 0, true);
    // le labo : ordinateurs, caisses, lumières, câbles
    this.put(g, 'scifi', 'Prop_Computer', { height: 1.6 }, cx + half - 0.6, cz - 3, -Math.PI / 2, true);
    this.put(g, 'scifi', 'Prop_Computer', { height: 1.6 }, cx + half - 0.6, cz - 1.8, -Math.PI / 2, true);
    this.put(g, 'scifi', 'Prop_AccessPoint', { scale: 1 }, cx - half + 0.4, cz + 1.6, Math.PI / 2, false, 1.2);
    this.put(g, 'scifi', 'Prop_Crate3', { scale: 0.9 }, cx + 4.6, cz + 4.4, 0.2, true);
    this.put(g, 'scifi', 'Prop_Crate4', { scale: 0.8 }, cx + 3.4, cz + 4.7, -0.3, true);
    this.put(g, 'scifi', 'Prop_Barrel_Large', { height: 1.1 }, cx + 4.7, cz + 3.0, 0, true);
    this.put(g, 'scifi', 'Prop_Chest', { width: 1.2 }, cx - 4.6, cz + 4.6, 0, true);
    this.put(g, 'scifi', 'Prop_ItemHolder', { scale: 1 }, cx - 4.8, cz + 3.2, Math.PI / 2, true);
    this.put(g, 'scifi', 'Prop_Fan_Small', { scale: 1 }, cx + 3.0, cz - 4.6, 0);
    this.put(g, 'scifi', 'Prop_Light_Floor', { scale: 1 }, cx - 4.8, cz - 4.6, 0);
    this.put(g, 'scifi', 'Prop_Light_Wide', { scale: 1 }, cx, cz - 5.6, 0);
    this.put(g, 'scifi', 'Prop_Cable_1', { scale: 1 }, cx + 4.3, cz - 1.0, 0.4);
    this.put(g, 'scifi', 'Prop_Vent_Big', { scale: 1 }, cx + 1.5, cz + 2.0, 0, false, 0.03);
    this.put(g, 'scifi', 'Prop_PipeHolder', { scale: 0.8 }, cx - 2.2, cz - 5.2, 0, true);
    for (const [name, x, z] of [['Decal_Logo', 0, 0], ['Decal_Line_Straight', -2, -2], ['Decal_Sign', 2.6, 2.6]] as const) this.put(g, 'scifi', name, { scale: 1 }, cx + x, cz + z, 0, false, 0.04);
    // les trois spécimens, sous verre
    const specimens: Array<[ModelName<'scifi'>, number, number, number]> = [['Alien_Cyclop', -2.2, 2.6, 1.7], ['Alien_Oculichrysalis', 0, 3.4, 1.5], ['Alien_Scolitex', 2.2, 2.6, 1.8]];
    const glass = createToonMaterial({ color: 0xbfe6ff, rimStrength: 0.3 });
    glass.transparent = true;
    glass.opacity = 0.25;
    glass.depthWrite = false;
    for (const [name, x, z, h] of specimens) {
      this.put(g, 'scifi', name, { height: h * 0.8 }, cx + x, cz + z, 0.3, false, 0.15);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.15, 16), toon(0x3a3f46));
      base.position.set(cx + x, 0.075, cz + z);
      const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, h, 16, 1, true), glass);
      dome.position.set(cx + x, 0.15 + h / 2, cz + z);
      g.add(base, dome);
      this.block(cx + x, cz + z, 1.1, 1.1);
    }
    this.armory(g);
  }

  /** L'armurerie de la station : les armes sous clé, sur des râteliers le long du mur nord. */
  private armory(g: THREE.Group): void {
    const { x: cx, z: cz, half } = STATION;
    const rack = toon(0x2a2e33);
    const trim = toon(0x8a939c);
    const z = cz - half + 0.55;
    const shelves = [0.55, 1.05, 1.55, 2.05];
    // deux râteliers de 2,6 m, quatre planches chacun
    for (const x of [cx - 1.6, cx + 1.6]) {
      const frame = new THREE.Group();
      frame.position.set(x, 0, z);
      frame.add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.3, 0.08), rack).translateY(1.15).translateZ(-0.2));
      for (const y of shelves) frame.add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.04, 0.42), trim).translateY(y));
      for (const sx of [-1.28, 1.28]) frame.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.3, 0.42), rack).translateX(sx).translateY(1.15));
      g.add(frame);
      this.block(x, z, 2.6, 0.5, 0, 2.3);
    }
    // les armes couchées sur les planches (le canon vers +X), les longues en bas
    const real: Record<string, number> = { Pistol: 0.22, Revolver: 0.28, SubmachineGun: 0.6, AssaultRifle: 0.95, AssaultRifle2: 0.95, Bullpup: 0.75, Shotgun: 1.05, SniperRifle: 1.2 };
    const guns = (Object.keys(PACK_GUNS) as Array<ModelName<'armes'>>).sort((a, b) => lengthOf(a, real) - lengthOf(b, real));
    const rows: Array<Array<ModelName<'armes'>>> = [[], [], [], [], [], [], [], []];
    // huit rangées (deux râteliers × quatre planches) : on remplit chaque rangée jusqu'à 2,4 m
    let r = 0, used = 0;
    for (const name of guns.reverse()) {
      const len = lengthOf(name, real) + 0.08;
      if (used + len > 2.4 && r < rows.length - 1) {
        r++;
        used = 0;
      }
      rows[r].push(name);
      used += len;
    }
    rows.forEach((row, i) => {
      const x0 = (i < 4 ? cx - 1.6 : cx + 1.6) - 1.2;
      const y = shelves[i % 4] + 0.02;
      let x = x0;
      for (const name of row) {
        const len = lengthOf(name, real);
        const m = this.put(g, 'armes', name, { width: len }, x + len / 2, z + 0.05, 0, false, y);
        // couchée sur le flanc
        m.rotation.set(Math.PI / 2, 0, 0);
        x += len + 0.08;
      }
    });
    // les accessoires dans une vitrine basse au milieu
    const case_ = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 0.5), rack);
    case_.position.set(cx, 0.4, z);
    g.add(case_);
    ACCESSORIES.forEach((name, i) => {
      this.put(g, 'armes', name, { size: 0.16 }, cx - 0.4 + (i % 5) * 0.2, z - 0.15 + Math.floor(i / 5) * 0.15, 0.3, false, 0.8);
    });
  }
}

/** Les accessoires du pack d'armes. */
const ACCESSORIES: Array<ModelName<'armes'>> = ['Bayonet', 'Bayonet_2', 'Bipod', 'Flashlight', 'Grip', 'Scope_1', 'Scope_2', 'Scope_3', 'Silencer_1', 'Silencer_2', 'Silencer_3', 'Silencer_Short', 'Silencer_long', 'Stock', 'Tripod'];
const PACK_GUNS = Object.fromEntries(
  (['AssaultRifle2_1', 'AssaultRifle2_2', 'AssaultRifle2_3', 'AssaultRifle2_4', 'AssaultRifle_1', 'AssaultRifle_2', 'AssaultRifle_3', 'AssaultRifle_4', 'AssaultRifle_5', 'Bullpup_1', 'Bullpup_2', 'Bullpup_3', 'Pistol_1', 'Pistol_2', 'Pistol_3', 'Pistol_4', 'Pistol_5', 'Pistol_6', 'Revolver_1', 'Revolver_2', 'Revolver_3', 'Revolver_4', 'Revolver_5', 'Shotgun_1', 'Shotgun_2', 'Shotgun_3', 'Shotgun_4', 'Shotgun_SawedOff', 'Shotgun_ShortStock', 'SniperRifle_1', 'SniperRifle_2', 'SniperRifle_3', 'SniperRifle_4', 'SniperRifle_5', 'SniperRifle_6', 'SubmachineGun_1', 'SubmachineGun_2', 'SubmachineGun_3', 'SubmachineGun_4', 'SubmachineGun_5'] as const).map((n) => [n, true]),
) as Record<ModelName<'armes'>, true>;

/** Longueur réelle (m) d'une arme : d'après sa famille, à l'échelle de sa taille dans le pack. */
function lengthOf(name: ModelName<'armes'>, real: Record<string, number>): number {
  const family = name.replace(/_.*$/, '');
  const base = real[family] ?? 0.5;
  // les variantes plus courtes ou plus longues de la même famille gardent leur proportion
  const ref = { Pistol: 1.82, Revolver: 1.98, SubmachineGun: 4.0, AssaultRifle: 5.4, AssaultRifle2: 5.0, Bullpup: 5.2, Shotgun: 5.6, SniperRifle: 7.2 }[family] ?? 2;
  const s = packSize('armes', name).x;
  return Math.round(base * (s / ref) * 100) / 100;
}
