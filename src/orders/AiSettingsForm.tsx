import { useState } from 'react';
import { type AiSettings, loadSettings, saveSettings } from './ai';

/** Clé OpenRouter et modèle des ordres libres (rangés dans le menu). */
export function AiSettingsForm({ onSaved }: { onSaved?: () => void }) {
  const [settings, setSettings] = useState<AiSettings>(loadSettings);
  const [saved, setSaved] = useState(false);
  const onClaude = Boolean((window as unknown as { claude?: unknown }).claude);
  return (
    <form
      className="menu-form"
      onSubmit={(e) => {
        e.preventDefault();
        saveSettings(settings);
        setSaved(true);
        onSaved?.();
      }}
    >
      <label>
        Clé OpenRouter
        <input type="password" value={settings.apiKey} placeholder="sk-or-…" onChange={(e) => { setSaved(false); setSettings({ ...settings, apiKey: e.target.value.trim() }); }} />
      </label>
      <label>
        Modèle (ordres libres)
        <input value={settings.model} onChange={(e) => { setSaved(false); setSettings({ ...settings, model: e.target.value.trim() }); }} />
      </label>
      <small>Gardée dans ce navigateur seulement.</small>
      {onClaude && <small>Sur claude.ai, OpenRouter est injoignable : les ordres libres passent par Claude.</small>}
      <button type="submit">{saved ? 'Enregistré ✓' : 'Enregistrer'}</button>
    </form>
  );
}
