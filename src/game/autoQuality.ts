/**
 * Qualité « auto » (réglage par défaut) : le plafond de pixels de l'image 3D suit la fluidité du
 * jeu. Un ordinateur rapide garde la qualité normale ; un vieux portable, ou un navigateur qui
 * dessine sans carte graphique (Firefox sous Linux quand le pilote est mis de côté), descend tout
 * seul jusqu'à ce que le jeu tienne ses ~50 images par seconde. Seule la finesse de l'image change
 * (le navigateur agrandit l'image) : éclairage, contours et effets restent les mêmes.
 */

/** Plafond le plus fin (celui de la qualité normale) et le plus grossier en mode auto. */
export const AUTO_MAX = 1.4e6;
export const AUTO_MIN = 0.45e6;
/** Départ quand le navigateur dessine sans carte graphique : inutile de commencer par ramer. */
export const AUTO_SOFTWARE_START = 0.6e6;

/** Sous ce nombre d'images par seconde, le jeu rame : on baisse la finesse. */
const SLOW_FPS = 45;
/** Au-dessus, il a de la marge (écran à 60 Hz) : on peut remonter, prudemment. */
const FAST_FPS = 56;
/** Relevés (une demi-seconde chacun) ignorés au lancement : chargement des modèles et shaders. */
const WARMUP = 8;

export class AutoQuality {
  /** Plafond de pixels actuel. */
  budget: number;
  /** Plafond où le jeu a ramé : on ne remonte que sous lui, pour ne pas osciller. */
  private ceiling = AUTO_MAX;
  private slow = 0;
  private fast = 0;
  private skip = WARMUP;

  constructor(start = AUTO_MAX) {
    this.budget = Math.min(AUTO_MAX, Math.max(AUTO_MIN, start));
  }

  /** Relevé d'images par seconde (toutes les demi-secondes) ; vrai si le plafond change. */
  sample(fps: number): boolean {
    if (this.skip > 0) {
      this.skip--;
      return false;
    }
    if (fps < SLOW_FPS) {
      this.fast = 0;
      // une seconde lente d'affilée (pas un simple à-coup) avant de baisser
      if (++this.slow < 2 || this.budget <= AUTO_MIN) return false;
      this.slow = 0;
      this.ceiling = this.budget;
      // plus le jeu rame, plus on descend d'un coup (le coût suit à peu près les pixels)
      const drop = Math.max(0.55, Math.min(0.8, fps / SLOW_FPS));
      this.budget = Math.max(AUTO_MIN, this.budget * drop);
      return true;
    }
    this.slow = 0;
    if (fps < FAST_FPS) {
      this.fast = 0;
      return false;
    }
    this.fast++;
    const limit = Math.min(AUTO_MAX, this.ceiling * 0.9);
    // trois secondes fluides : un cran de plus, sans retourner là où il ramait
    if (this.fast % 6 === 0 && this.budget < limit) {
      this.budget = Math.min(limit, this.budget * 1.15);
      return true;
    }
    // vingt secondes fluides tout près de ce plafond : la scène a dû s'alléger, on le relâche
    if (this.fast >= 40 && this.ceiling < AUTO_MAX) {
      this.fast = 0;
      this.ceiling = Math.min(AUTO_MAX, this.ceiling * 1.2);
    }
    return false;
  }
}

/** Nom de la carte graphique vue par le navigateur, et s'il dessine sans elle (rendu logiciel). */
export function gpuInfo(gl: WebGLRenderingContext | WebGL2RenderingContext): { name: string; software: boolean } {
  let name = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
  } catch {
    // navigateur qui cache sa carte graphique : nom inconnu
  }
  return { name, software: /llvmpipe|softpipe|swiftshader|software|basic render/i.test(name) };
}
