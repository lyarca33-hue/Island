import { useEffect, useRef, useState } from 'react';
import { MODELS, MODEL_BY_ID, thumbUrl, type Gender } from './catalog';
import { ACC_COLORS, ACCESSORIES, ACCESSORY_BY_ID, SLOTS, type AccSlot } from './accessories';
import { CreatorScene, type Framing } from './CreatorScene';
import { EXPRESSIONS } from './expressions';
import {
  BODY_RANGE, CLOTH_COLORS, DEFAULT_BODY, defaultRecipe, EYE_COLORS, FANTASY_SKINS, HAIR_COLORS, NAMES, NO_CLOTHES, randomRecipe, sanitizeRecipe,
  SKIN_TONES, type Body, type Clothes, type Recipe,
} from './recipe';
import { BLUSH_COLORS, BROW_COLORS, FACE_MARKS, LIP_COLORS, MARK_COLORS, NO_MAKEUP, PATTERNS, SHADOW_COLORS, type Makeup } from './looks';
import { prefetchModel } from './vrm';
import './creator.css';

const STORAGE_KEY = 'rp-island.recipe';

type PanelTab = 'style' | 'visage' | 'coiffure' | 'accessoires' | 'corps' | 'couleurs';
const TABS: Array<[PanelTab, string]> = [
  ['style', 'Tenue'], ['visage', 'Visage'], ['coiffure', 'Coiffure'], ['accessoires', 'Accessoires'], ['corps', 'Corps'], ['couleurs', 'Couleurs'],
];

const CLOTHES: Array<[keyof Clothes, string]> = [['top', 'Haut'], ['bottom', 'Bas'], ['shoes', 'Chaussures']];

const GESTURES: Array<[string, string]> = [
  ['idle', 'Repos'], ['walk', 'Marche'], ['run', 'Course'], ['agree', 'Oui'], ['headShake', 'Non'], ['sad_pose', 'Abattu'], ['sneak_pose', 'Discret'],
  // poses Quaternius (CC0)
  ['Walk_Formal_Loop', 'Défilé'], ['Dance_Loop', 'Danse'], ['Idle_Talking_Loop', 'Bavarder'], ['Idle_FoldArms_Loop', 'Bras croisés'],
  ['Idle_TalkingPhone_Loop', 'Téléphone'], ['Consume', 'Grignoter'], ['Crouch_Idle_Loop', 'Accroupi'], ['Spell_Simple_Idle_Loop', 'Magie'],
];

export function loadSavedRecipe(): Recipe | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeRecipe(JSON.parse(raw)) : null;
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
  const [recipe, setRecipe] = useState<Recipe>(() => initial ?? loadSavedRecipe() ?? defaultRecipe('f'));
  const [tab, setTab] = useState<PanelTab>('style');
  const [framing, setFraming] = useState<Framing>('corps');
  const [expression, setExpression] = useState('neutre');
  const [gesture, setGesture] = useState('idle');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [height, setHeight] = useState(160);

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

  // chaque changement de recette : perso mis à jour (rechargé si une pièce change) + sauvegarde
  useEffect(() => {
    if (loading) return;
    const s = sceneRef.current;
    if (!s) return;
    let live = true;
    const t = window.setTimeout(() => live && setBusy(true), 120);
    s.setRecipe(recipe).then(() => live && setHeight(s.height * 100)).catch((e) => {
      console.error(e);
      setError('Cette pièce n’a pas pu se charger.');
    }).finally(() => {
      clearTimeout(t);
      if (live) setBusy(false);
    });
    save(recipe);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [recipe, loading]);

  useEffect(() => sceneRef.current?.setFraming(framing), [framing]);
  useEffect(() => sceneRef.current?.setExpression(expression), [expression, loading]);
  useEffect(() => sceneRef.current?.play(gesture), [gesture, loading]);

  // les autres modèles se téléchargent en avance : changer de pièce est ensuite quasi immédiat
  useEffect(() => {
    if (loading) return;
    for (const m of MODELS) prefetchModel(m.id);
  }, [loading]);

  const set = (patch: Partial<Recipe>) => setRecipe((r) => ({ ...r, ...patch }));
  const setBody = (k: keyof Body, v: number) => setRecipe((r) => ({ ...r, body: { ...r.body, [k]: v } }));
  const setCloth = (k: keyof Clothes, c: string | null) => setRecipe((r) => ({ ...r, clothes: { ...NO_CLOTHES, ...r.clothes, [k]: c } }));
  const setAcc = (slot: AccSlot, id: string | null, color?: string) =>
    setRecipe((r) => {
      const acc = { ...r.accessories };
      const a = id ? ACCESSORY_BY_ID.get(id) : null;
      if (a) acc[slot] = { id: a.id, color: color ?? (acc[slot]?.id === a.id ? acc[slot]!.color : a.color) };
      else delete acc[slot];
      return { ...r, accessories: acc };
    });
  const setMakeup = (patch: Partial<Makeup>) => setRecipe((r) => ({ ...r, makeup: { ...NO_MAKEUP, ...r.makeup, ...patch } }));
  const toggleMark = (id: string) =>
    setRecipe((r) => {
      const marks = r.makeup?.marks ?? [];
      return { ...r, makeup: { ...NO_MAKEUP, ...r.makeup, marks: marks.includes(id) ? marks.filter((m) => m !== id) : [...marks, id] } };
    });
  const setPattern = (k: keyof Clothes, id: string | null, color?: string) =>
    setRecipe((r) => {
      const patterns = { ...r.patterns };
      if (id) patterns[k] = { id, color: color ?? patterns[k]?.color ?? '#f4efe6' };
      else delete patterns[k];
      return { ...r, patterns };
    });
  const randomName = () => {
    const names = NAMES[recipe.gender].filter((n) => n !== recipe.name);
    set({ name: names[Math.floor(Math.random() * names.length)] });
  };
  const setGender = (g: Gender) =>
    setRecipe((r) => {
      if (r.gender === g) return r;
      const d = defaultRecipe(g);
      return { ...r, gender: g, outfit: d.outfit, face: d.face, hair: d.hair };
    });

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
      const r = sanitizeRecipe(JSON.parse(t));
      if (r) setRecipe(r);
      else setError('Fichier de perso illisible.');
    }).catch(() => setError('Fichier de perso illisible.'));

  const same = MODELS.filter((m) => m.gender === recipe.gender);
  const chooseTab = (k: PanelTab) => {
    setTab(k);
    setFraming(k === 'visage' || k === 'coiffure' || k === 'accessoires' ? 'visage' : 'corps');
  };

  return (
    <div className="creator">
      <div ref={host} className="creator-view" />
      <div className="creator-top">
        <input className="creator-name" value={recipe.name} maxLength={24} aria-label="Nom du personnage"
          onChange={(e) => set({ name: e.target.value })} />
        <button className="creator-dice" onClick={randomName} title="Prénom au hasard" aria-label="Prénom au hasard">🎲</button>
        <span className="creator-stat">{Math.round(height)} cm{busy ? ' · chargement…' : ''}</span>
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
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => chooseTab(k)}>{label}</button>
          ))}
        </nav>
        <div className="panel-body">
          {tab === 'style' && (
            <>
              <h3>Corps</h3>
              <div className="seg">
                <button className={recipe.gender === 'f' ? 'on' : ''} onClick={() => setGender('f')}>Féminin</button>
                <button className={recipe.gender === 'm' ? 'on' : ''} onClick={() => setGender('m')}>Masculin</button>
              </div>
              <h3>Tenue</h3>
              <div className="picks list">
                {same.map((m) => (
                  <button key={m.id} className={recipe.outfit === m.id ? 'on' : ''} onClick={() => set({ outfit: m.id })}>
                    <span>{m.outfit}</span>
                    <small>de {m.label}</small>
                  </button>
                ))}
              </div>
              {CLOTHES.map(([k, label]) => {
                const p = recipe.patterns?.[k];
                return (
                  <div key={k}>
                    <h3>Motif · {label}</h3>
                    <div className="chips wrap">
                      <button className={!p ? 'on' : ''} onClick={() => setPattern(k, null)}>Uni</button>
                      {PATTERNS.map((pt) => (
                        <button key={pt.id} className={p?.id === pt.id ? 'on' : ''} onClick={() => setPattern(k, pt.id)}>{pt.label}</button>
                      ))}
                    </div>
                    {p && <Swatches colors={CLOTH_COLORS} value={p.color} onChange={(c) => setPattern(k, p.id, c ?? '#f4efe6')} />}
                  </div>
                );
              })}
              <p className="hint">La couleur du fond se choisit dans l’onglet Couleurs.</p>
            </>
          )}
          {tab === 'visage' && (
            <>
              <h3>Visage</h3>
              <div className="picks">
                {same.map((m) => (
                  <Pick key={m.id} id={m.id} label={m.label} on={recipe.face === m.id} onClick={() => set({ face: m.id })} />
                ))}
              </div>
              <p className="hint">Les yeux, la bouche et les expressions viennent avec le visage.</p>
              <h3>Joues roses</h3>
              <Swatches colors={BLUSH_COLORS} value={recipe.makeup?.blush ?? null} none="Aucune" onChange={(c) => setMakeup({ blush: c })} />
              <h3>Fard à paupières</h3>
              <Swatches colors={SHADOW_COLORS} value={recipe.makeup?.shadow ?? null} none="Aucun" onChange={(c) => setMakeup({ shadow: c })} />
              <h3>Rouge à lèvres</h3>
              <Swatches colors={LIP_COLORS} value={recipe.makeup?.lips ?? null} none="Aucun" onChange={(c) => setMakeup({ lips: c })} />
              <h3>Sourcils</h3>
              <Swatches colors={BROW_COLORS} value={recipe.makeup?.brows ?? null} onChange={(c) => setMakeup({ brows: c })} />
              <h3>Cils et contour des yeux</h3>
              <Swatches colors={BROW_COLORS} value={recipe.makeup?.lashes ?? null} onChange={(c) => setMakeup({ lashes: c })} />
              <h3>Détails et dessins</h3>
              <div className="chips wrap">
                {FACE_MARKS.map((m) => (
                  <button key={m.id} className={recipe.makeup?.marks.includes(m.id) ? 'on' : ''} onClick={() => toggleMark(m.id)}>{m.label}</button>
                ))}
              </div>
              {recipe.makeup?.marks.some((id) => FACE_MARKS.find((m) => m.id === id)?.tinted) && (
                <>
                  <h3>Couleur des dessins</h3>
                  <Swatches colors={MARK_COLORS} value={recipe.makeup.markColor} onChange={(c) => setMakeup({ markColor: c ?? NO_MAKEUP.markColor })} noOrigin />
                </>
              )}
            </>
          )}
          {tab === 'coiffure' && (
            <>
              <h3>Coiffure</h3>
              <div className="picks">
                {[...same, ...MODELS.filter((m) => m.gender !== recipe.gender)].map((m) => (
                  <Pick key={m.id} id={m.id} label={m.hair} on={recipe.hair === m.id} onClick={() => set({ hair: m.id })} />
                ))}
              </div>
              <h3>Couleur des cheveux</h3>
              <Swatches colors={HAIR_COLORS} value={recipe.hairColor} onChange={(c) => set({ hairColor: c })} />
            </>
          )}
          {tab === 'accessoires' && (
            <>
              {SLOTS.map(([slot, label]) => {
                const worn = recipe.accessories?.[slot];
                return (
                  <div key={slot}>
                    <h3>{label}</h3>
                    <div className="chips wrap">
                      <button className={!worn ? 'on' : ''} onClick={() => setAcc(slot, null)}>Aucun</button>
                      {ACCESSORIES.filter((a) => a.slot === slot).map((a) => (
                        <button key={a.id} className={worn?.id === a.id ? 'on' : ''} onClick={() => { setAcc(slot, a.id); setFraming(slot === 'dos' || slot === 'queue' ? 'corps' : 'visage'); }}>{a.label}</button>
                      ))}
                    </div>
                    {worn && (
                      <Swatches colors={ACC_COLORS} value={worn.color} onChange={(c) => setAcc(slot, worn.id, c ?? ACCESSORY_BY_ID.get(worn.id)!.color)} />
                    )}
                  </div>
                );
              })}
            </>
          )}
          {tab === 'corps' && (
            <>
              <h3>Proportions</h3>
              {(Object.keys(BODY_RANGE) as Array<keyof Body>).map((k) => (
                <Slider key={k} label={BODY_RANGE[k][2]} value={recipe.body[k]} min={BODY_RANGE[k][0]} max={BODY_RANGE[k][1]}
                  reset={DEFAULT_BODY[k]} onChange={(v) => setBody(k, v)} />
              ))}
              <p className="hint">Double-clic sur un curseur : valeur d’origine.</p>
            </>
          )}
          {tab === 'couleurs' && (
            <>
              <h3>Peau</h3>
              <Swatches colors={SKIN_TONES.slice(1)} value={recipe.skinTone} onChange={(c) => set({ skinTone: c })} />
              <h3>Peau fantaisie</h3>
              <Swatches colors={FANTASY_SKINS} value={recipe.skinTone} onChange={(c) => set({ skinTone: c })} />
              <h3>Yeux</h3>
              <Swatches colors={EYE_COLORS} value={recipe.eyeColor} onChange={(c) => set({ eyeColor: c })} />
              <h3>Cheveux</h3>
              <Swatches colors={HAIR_COLORS} value={recipe.hairColor} onChange={(c) => set({ hairColor: c })} />
              {CLOTHES.map(([k, label]) => (
                <div key={k}>
                  <h3>{label}</h3>
                  <Swatches colors={CLOTH_COLORS} value={recipe.clothes?.[k] ?? null} onChange={(c) => setCloth(k, c)} />
                </div>
              ))}
            </>
          )}
        </div>
        <footer className="panel-actions">
          <button onClick={() => setRecipe(randomRecipe())}>🎲 Au hasard</button>
          <button onClick={() => setRecipe(defaultRecipe(recipe.gender))}>Réinitialiser</button>
          <button onClick={exportRecipe}>Exporter</button>
          <label className="file-btn">Importer<input type="file" accept="application/json" onChange={(e) => e.target.files?.[0] && importRecipe(e.target.files[0])} /></label>
          <button className="primary" onClick={() => onDone(recipe)}>Jouer →</button>
        </footer>
      </aside>
      {(loading || error) && <div className="hud-loading" onClick={() => setError(null)}>{error ?? 'Chargement du créateur…'}</div>}
    </div>
  );
}

function Pick({ id, label, on, onClick }: { id: string; label: string; on: boolean; onClick: () => void }) {
  return (
    <button className={on ? 'on' : ''} onClick={onClick} title={MODEL_BY_ID.get(id)?.label}>
      <img src={thumbUrl(id)} alt="" loading="lazy" />
      <span>{label}</span>
    </button>
  );
}

function Slider({ label, value, min, max, onChange, reset }: { label: string; value: number; min: number; max: number; reset: number; onChange: (v: number) => void }) {
  return (
    <label className="slider" onDoubleClick={() => onChange(reset)} title="Double-clic : valeur d’origine">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={0.005} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** Pastilles de couleur ; « Origine » = couleurs du modèle. */
function Swatches({ colors, value, onChange, none = 'Origine', noOrigin = false }: {
  colors: string[];
  value: string | null;
  onChange: (c: string | null) => void;
  /** Libellé du choix « null ». */
  none?: string;
  /** Pas de choix « null » (une couleur est toujours choisie). */
  noOrigin?: boolean;
}) {
  return (
    <div className="swatches">
      {!noOrigin && <button className={`origin${value === null ? ' on' : ''}`} onClick={() => onChange(null)}>{none}</button>}
      {colors.map((c) => (
        <button key={c} className={value === c ? 'on' : ''} style={{ background: c }} aria-label={c} onClick={() => onChange(c)} />
      ))}
      <input type="color" value={value ?? '#ffffff'} onChange={(e) => onChange(e.target.value)} aria-label="Autre couleur" />
    </div>
  );
}
