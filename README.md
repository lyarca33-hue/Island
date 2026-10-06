# Rp Island

![Aperçu](apercu.png)

Monde de RP en 3D dans le navigateur. Première étape : une map vide (un sol d'herbe) et un
personnage 3D en cel shading, avec le rendu HD-2D d'Arena Tactic.

## Lancer le jeu

```bash
npm install
npm run dev
```

Puis ouvrir http://localhost:5173.

- Clic sur le sol : le perso y marche (Maj + clic : il court)
- ZQSD, WASD ou flèches : marcher (Maj : courir)
- Molette : zoom
- Boutons en haut à droite : tourner la caméra d'un quart de tour

`npm run build` produit une version publiable dans `dist/`.

## Organisation

| Fichier | Rôle |
| --- | --- |
| `src/game/Game.ts` | Scène, caméra iso d'Arena Tactic (30°, 45°, orthographique), lumière, commandes |
| `src/game/postfx.ts` | Post-traitement HD-2D repris d'Arena Tactic : contours encrés, bloom, étalonnage, vignettage, + flou de profondeur |
| `src/game/toon.ts` | Matériau cel shading (3 paliers nets + liseré de lumière) |
| `src/game/character.ts` | Perso glTF au squelette Mixamo, animations repos / marche / course |
| `src/game/ground.ts` | Sol d'herbe (texture peinte par programme) |
| `src/game/motes.ts` | Poussières de lumière qui flottent (ambiance) |
| `src/App.tsx` | Interface React par-dessus la scène |

## Le perso

Le modèle de départ est « X Bot » de Mixamo (fourni dans les exemples de three.js). Il a
déjà quelques gestes utiles pour le RP plus tard : `agree` (acquiescer), `headShake` (non de
la tête), `sad_pose`, `sneak_pose`. Il utilise le même squelette (noms d'os Mixamo) que les
héros d'Arena Tactic, donc un modèle de ce type peut le remplacer sans changer le code.
