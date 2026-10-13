/**
 * Fichiers échangés avec l'ordinateur du joueur : télécharger un texte JSON (une carte exportée),
 * relire un fichier choisi (une carte à importer).
 */

/** Fait télécharger `json` sous le nom `nom` (par un lien caché, le temps d'un clic). */
export function telechargerJson(nom: string, json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // laissé un moment : certains navigateurs lisent l'adresse après le clic
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Le texte d'un fichier choisi par le joueur. */
export function lireTexte(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}
