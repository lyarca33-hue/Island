# Compte Google et sauvegarde

La partie se sauvegarde toute seule dans le navigateur, toutes les 20 secondes et quand on
quitte la page : l'heure et la date, les besoins, l'humeur, la compétence cuisine, la place du
perso, et chaque objet de la maison (où il est, rempli, sale, cuit, entamé, usé…). Rien à régler.

Pour retrouver sa partie sur un autre ordinateur, on se connecte avec son compte Google
(Menu → Partie → « Se connecter avec Google »). La première connexion crée le compte : il n'y a
pas d'inscription à part. La partie est alors aussi envoyée dans le compte (une fois par minute,
et quand on quitte la page). Si le compte a une partie plus récente (jouée ailleurs), le jeu
demande laquelle garder.

Ce qui est en cours au moment de sauver ne l'est pas : on retrouve les feux éteints, les portes
fermées, et ce qu'on tenait en main posé à ses pieds.

Code : `src/game/save.ts` (la sauvegarde), `src/game/cloud.ts` (le compte), `src/ui/SavePanel.tsx`
(le menu).

## Régler la connexion Google (une seule fois)

La connexion passe par Firebase, le service gratuit de Google pour ça. Il faut un projet Firebase
à soi :

1. Aller sur https://console.firebase.google.com et se connecter avec son compte Google.
2. **Créer un projet** : nom « island » (ou autre), Google Analytics pas utile → Créer.
3. Menu de gauche : **Créer → Authentication → Commencer**. Onglet **Méthode de connexion** →
   **Google** → activer, choisir son e-mail d'assistance → **Enregistrer**.
4. Menu de gauche : **Créer → Firestore Database → Créer une base de données**. Emplacement en
   Europe (par ex. `eur3`), mode **production** → Créer. Puis onglet **Règles**, tout remplacer
   par ceci et **Publier** (chacun ne lit et n'écrit que sa propre partie) :

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /parties/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

5. Roue dentée en haut à gauche → **Paramètres du projet** → en bas, **Vos applications** →
   icône **`</>`** (Web). Surnom « island », pas besoin de Hosting → **Enregistrer l'application**.
   Firebase montre un bloc `const firebaseConfig = { apiKey: "…", authDomain: "…", … }` :
   le copier.
6. Dans le jeu : **Menu → Partie → « Connexion Google : à régler une fois »**, coller le bloc,
   **Enregistrer et recharger**. Le bouton « Se connecter avec Google » apparaît.

Au lieu de l'étape 6 (pour que ce soit réglé sur tous les navigateurs de l'ordinateur), on peut
mettre ces lignes dans le fichier `.env.local` à la racine du projet, puis relancer `npm run dev` :

```
VITE_FIREBASE_API_KEY=…
VITE_FIREBASE_AUTH_DOMAIN=….firebaseapp.com
VITE_FIREBASE_PROJECT_ID=…
VITE_FIREBASE_APP_ID=…
```

`.env.local` n'est pas envoyé sur GitHub. Ces valeurs ne sont pas des mots de passe (elles se
retrouvent dans la page du jeu) : ce sont les règles de l'étape 4 qui protègent les parties.

Si le jeu est ouvert ailleurs que sur `localhost` (en ligne, ou depuis un autre ordinateur du
réseau), ajouter cette adresse dans Firebase : **Authentication → Paramètres → Domaines
autorisés → Ajouter un domaine**. Sinon le jeu le signale à la connexion.
