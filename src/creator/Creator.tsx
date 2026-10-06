import { useEffect, useMemo, useRef, useState } from 'react';
import { CreatorScene, type Framing } from './CreatorScene';
import { EXPRESSIONS } from './expressions';
import {
  ageYears, CLOTHES, defaultRecipe, EYE_COLORS, EYEBROW_LABELS, HAIR_COLORS, HAIR_LABELS, MIN_AGE,
  randomRecipe, SHAPE_SLIDERS, sliderMin, SKIN_TONES, type Macro, type Recipe, type Tab,
} from './recipe';
import './creator.css';

const STORAGE_KEY = 'rp-island.recipe';

type PanelTab = 'corps' | Tab | 'apparence' | 'tenue';
const TABS: Array<[PanelTab, string]> = [
  ['corps', 'Corps'], ['tete', 'Tête'], ['visage', 'Visage'], ['silhouette', 'Silhouette'], ['apparence', 'Apparence'], ['tenue', 'Tenue'],
];

const GESTURES: Array<[string, string]> = [
  ['idle', 'Repos'], ['walk', 'Marche'], ['run', 'Course'], ['agree', 'Oui'], ['headShake', 'Non'], ['sad_pose', 'Abattu'], ['sneak_pose', 'Discret'],
];

export function loadSavedRecipe(): Recipe | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Recipe) : null;
  } catch {
    return null;
  }
}

function save(r: Recipe): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
  } catch {
    /* stockage indisponible (navigation privée...) : la recette reste en mémoire */
  }
}

/** Créateur de personnage : aperçu 3D + panneau de réglages. */
export function Creator({ initial, onDone }: { initial: Recipe | null; onDone: (r: Recipe) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CreatorScene | null>(null);
  const [recipe, setRecipe] = useState<Recipe>(() => initial ?? loadSavedRecipe() ?? defaultRecipe(0.15));
  const [tab, setTab] = useState<PanelTab>('corps');
  const [framing, setFraming] = useState<Framing>('corps');
  const [expression, setExpression] = useState('neutre');
  const [gesture, setGesture] = useState('idle');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [height, setHeight] = useState(170);

  useEffect(() => {
    if (!host.current) return;
    const s = new CreatorScene(host.current);
    sceneRef.current = s;
    (window as unknown as { creator: CreatorScene }).creator = s;
    s.setRecipe(recipe).then(() => {
      setLoading(false);
      setHeight(s.height * 100);
    }).catch((e) => {
      console.error(e);
      setError('Le créateur n’a pas pu se charger.');
    });
    return () => {
      s.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // chaque changement de recette : modèle mis à jour (à l'image suivante) + sauvegarde
  const pending = useRef(0);
  useEffect(() => {
    if (loading) return;
    cancelAnimationFrame(pending.current);
    pending.current = requestAnimationFrame(() => {
      const s = sceneRef.current;
      if (!s) return;
      s.setRecipe(recipe);
      setHeight(s.height * 100);
    });
    save(recipe);
  }, [recipe, loading]);

  useEffect(() => sceneRef.current?.setFraming(framing), [framing]);
  useEffect(() => sceneRef.current?.setExpression(expression), [expression, loading]);
  useEffect(() => sceneRef.current?.play(gesture), [gesture, loading]);

  const setMacro = (k: keyof Macro, v: number) => setRecipe((r) => ({ ...r, macro: { ...r.macro, [k]: v } }));
  const setEthnic = (k: 'african' | 'asian' | 'caucasian', v: number) =>
    setRecipe((r) => {
      // les trois origines font toujours 100 % : les deux autres se partagent le reste
      const others = (['african', 'asian', 'caucasian'] as const).filter((x) => x !== k);
      const rest = others.reduce((s, x) => s + r.macro[x], 0);
      const m = { ...r.macro, [k]: v };
      for (const x of others) m[x] = rest > 1e-6 ? (r.macro[x] / rest) * (1 - v) : (1 - v) / 2;
      return { ...r, macro: m };
    });
  const setShape = (id: string, v: number) => setRecipe((r) => ({ ...r, shape: { ...r.shape, [id]: v } }));
  const wear = (slot: string, id: string | null) =>
    setRecipe((r) => {
      const keep = r.clothes.filter((c) => CLOTHES[c]?.slot !== slot && !(slot === 'tenue' && ['haut', 'bas'].includes(CLOTHES[c]?.slot)) && !(['haut', 'bas'].includes(slot) && CLOTHES[c]?.slot === 'tenue'));
      return { ...r, clothes: id ? [...keep, id] : keep };
    });

  const sections = useMemo(() => {
    const m = new Map<string, typeof SHAPE_SLIDERS[number][]>();
    for (const s of SHAPE_SLIDERS) {
      if (s.tab !== tab) continue;
      if (!m.has(s.section)) m.set(s.section, []);
      m.get(s.section)!.push(s);
    }
    return [...m];
  }, [tab]);

  const exportRecipe = () => {
    const blob = new Blob([JSON.stringify(recipe, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${recipe.name || 'perso'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importRecipe = (f: File) =>
    f.text().then((t) => {
      const r = JSON.parse(t) as Recipe;
      if (r?.macro && r?.shape) setRecipe({ ...defaultRecipe(), ...r });
    }).catch(() => setError('Fichier de perso illisible.'));

  const m = recipe.macro;
  return (
    <div className="creator">
      <div ref={host} className="creator-view" />
      <div className="creator-top">
        <input className="creator-name" value={recipe.name} maxLength={24} aria-label="Nom du personnage"
          onChange={(e) => setRecipe((r) => ({ ...r, name: e.target.value }))} />
        <span className="creator-stat">{Math.round(ageYears(m.age))} ans · {Math.round(height)} cm</span>
      </div>
      <div className="creator-tools">
        <div className="seg">
          <button className={framing === 'corps' ? 'on' : ''} onClick={() => setFraming('corps')}>Corps</button>
          <button className={framing === 'visage' ? 'on' : ''} onClick={() => setFraming('visage')}>Visage</button>
        </div>
        <div className="chips">
          {GESTURES.map(([k, label]) => (
            <button key={k} className={gesture === k ? 'on' : ''} onClick={() => setGesture(k)}>{label}</button>
          ))}
        </div>
        <div className="chips">
          {Object.entries(EXPRESSIONS).map(([k, e]) => (
            <button key={k} className={expression === k ? 'on' : ''} onClick={() => setExpression(k)}>{e.label}</button>
          ))}
        </div>
      </div>

      <aside className="creator-panel">
        <nav className="tabs">
          {TABS.map(([k, label]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); if (k === 'tete' || k === 'visage') setFraming('visage'); else if (k !== 'apparence') setFraming('corps'); }}>{label}</button>
          ))}
        </nav>
        <div className="panel-body">
          {tab === 'corps' && (
            <>
              <h3>Général</h3>
              <Slider label="Femme ↔ Homme" value={m.gender} min={0} max={1} onChange={(v) => setMacro('gender', v)} reset={0.5} />
              <Slider label={`Âge (${Math.round(ageYears(m.age))} ans)`} value={m.age} min={MIN_AGE} max={1} onChange={(v) => setMacro('age', v)} reset={0.5} />
              <Slider label="Muscles" value={m.muscle} min={0} max={1} onChange={(v) => setMacro('muscle', v)} reset={0.5} />
              <Slider label="Poids" value={m.weight} min={0} max={1} onChange={(v) => setMacro('weight', v)} reset={0.5} />
              <Slider label="Taille" value={m.height} min={0} max={1} onChange={(v) => setMacro('height', v)} reset={0.5} />
              <Slider label="Proportions (banales ↔ idéales)" value={m.proportions} min={0} max={1} onChange={(v) => setMacro('proportions', v)} reset={0.5} />
              <h3>Origine (traits)</h3>
              <Slider label="Africaine" value={m.african} min={0} max={1} onChange={(v) => setEthnic('african', v)} reset={1 / 3} />
              <Slider label="Asiatique" value={m.asian} min={0} max={1} onChange={(v) => setEthnic('asian', v)} reset={1 / 3} />
              <Slider label="Européenne" value={m.caucasian} min={0} max={1} onChange={(v) => setEthnic('caucasian', v)} reset={1 / 3} />
              <h3>Poitrine</h3>
              <Slider label="Volume" value={m.breastSize} min={0} max={1} onChange={(v) => setMacro('breastSize', v)} reset={0.5} />
              <Slider label="Fermeté" value={m.breastFirmness} min={0} max={1} onChange={(v) => setMacro('breastFirmness', v)} reset={0.5} />
            </>
          )}
          {sections.map(([title, sliders]) => (
            <div key={title}>
              <h3>{title}</h3>
              {sliders.map((s) => (
                <Slider key={s.id} label={s.label} value={recipe.shape[s.id] ?? 0} min={sliderMin(s)} max={1} reset={0} onChange={(v) => setShape(s.id, v)} />
              ))}
            </div>
          ))}
          {tab === 'apparence' && (
            <>
              <h3>Peau</h3>
              <Swatches colors={SKIN_TONES} value={recipe.skinColor} onChange={(c) => setRecipe((r) => ({ ...r, skinColor: c }))} />
              <h3>Yeux</h3>
              <div className="chips wrap">
                {EYE_COLORS.map(([k, label]) => (
                  <button key={k} className={recipe.eyeColor === k ? 'on' : ''} onClick={() => setRecipe((r) => ({ ...r, eyeColor: k }))}>{label}</button>
                ))}
              </div>
              <h3>Cheveux</h3>
              <div className="chips wrap">
                <button className={!recipe.hair ? 'on' : ''} onClick={() => setRecipe((r) => ({ ...r, hair: null }))}>Chauve</button>
                {Object.entries(HAIR_LABELS).map(([k, label]) => (
                  <button key={k} className={recipe.hair === k ? 'on' : ''} onClick={() => setRecipe((r) => ({ ...r, hair: k }))}>{label}</button>
                ))}
              </div>
              <Swatches colors={HAIR_COLORS} value={recipe.hairColor} onChange={(c) => setRecipe((r) => ({ ...r, hairColor: c }))} />
              <h3>Sourcils</h3>
              <div className="chips wrap">
                {Object.entries(EYEBROW_LABELS).map(([k, label]) => (
                  <button key={k} className={recipe.eyebrows === k ? 'on' : ''} onClick={() => setRecipe((r) => ({ ...r, eyebrows: k }))}>{label}</button>
                ))}
              </div>
            </>
          )}
          {tab === 'tenue' && (
            <>
              {(['tenue', 'haut', 'bas', 'chaussures', 'chapeau'] as const).map((slot) => {
                const items = Object.entries(CLOTHES).filter(([, c]) => c.slot === slot);
                const worn = recipe.clothes.find((c) => CLOTHES[c]?.slot === slot) ?? null;
                return (
                  <div key={slot}>
                    <h3>{slot[0].toUpperCase() + slot.slice(1)}</h3>
                    <div className="chips wrap">
                      <button className={!worn ? 'on' : ''} onClick={() => wear(slot, null)}>Aucun</button>
                      {items.map(([id, c]) => (
                        <button key={id} className={worn === id ? 'on' : ''} onClick={() => wear(slot, id)}>{c.label}</button>
                      ))}
                    </div>
                    {worn && (
                      <label className="tint">
                        Teinte
                        <input type="color" value={recipe.clothesTint[worn] ?? '#ffffff'}
                          onChange={(e) => setRecipe((r) => ({ ...r, clothesTint: { ...r.clothesTint, [worn]: e.target.value } }))} />
                      </label>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
        <footer className="panel-actions">
          <button onClick={() => setRecipe(randomRecipe())}>🎲 Au hasard</button>
          <button onClick={() => setRecipe(defaultRecipe(m.gender))}>Réinitialiser</button>
          <button onClick={exportRecipe}>Exporter</button>
          <label className="file-btn">Importer<input type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && importRecipe(e.target.files[0])} /></label>
          <button className="primary" onClick={() => onDone(recipe)}>Jouer →</button>
        </footer>
      </aside>
      {(loading || error) && <div className="hud-loading">{error ?? 'Chargement du créateur…'}</div>}
    </div>
  );
}

function Slider({ label, value, min, max, onChange, reset }: { label: string; value: number; min: number; max: number; reset: number; onChange: (v: number) => void }) {
  return (
    <label className="slider" onDoubleClick={() => onChange(reset)} title="Double-clic : remettre à zéro">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={0.01} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Swatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button key={c} className={value === c ? 'on' : ''} style={{ background: c }} aria-label={c} onClick={() => onChange(c)} />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Autre couleur" />
    </div>
  );
}
