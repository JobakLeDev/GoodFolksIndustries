# Goodfolks Industries

> *so much better together*

Hub web d'un week-end de jeux et de fête pour **30 joueurs répartis en 5 équipes**.
Chacun détient des **parts** de l'entreprise ; chaque équipe a un **objectif
secret** pour son avenir. On gagne, mise, échange et dépense des parts tout le
week-end — puis **dimanche, le vote tranche** : l'équipe qui récolte le plus de
parts impose sa vision.

Le roleplay reste léger : l'entreprise est un prétexte, et une justification au
système de parts.

- **Hébergement** : GitHub Pages
- **Base de données** : Firebase Firestore (temps réel, SDK compat v9)
- **Pas de build, pas de framework** : HTML / CSS / JS vanilla

---

## Le modèle de jeu

### Une part, deux formes

| | Où | L'app la voit ? | Sert à |
|---|---|---|---|
| **En jetons** | dans la poche | non, jamais | paris, beer pong, casino, deals |
| **En banque** | sur le compte | oui | shop, péages, cagnotte, vote dans l'app |

Le **guichet de l'orga** convertit dans les deux sens. Le jeton circule sans
trace ; la part en banque paie dans l'app. Arbitrer entre les deux est le nerf
du jeu.

### Les équipes

Chaque équipe a un **objectif secret** (visible de ses seuls membres, révélé à
tous au dépouillement), une **couleur**, et une **cagnotte collective**.

La cagnotte se remplit de deux façons : les **versements des membres** — du
poids perso en moins, de la force collective en plus — et les **péages
encaissés** sur ses activités. L'orga peut aussi la créditer après un défi.

### Les dépenses d'équipe : la motion à 5 minutes

Toute dépense sur la cagnotte passe par une **motion**. N'importe quel membre
propose ; les autres ont **5 minutes** pour voter.

> **Le silence vaut accord.** Sans majorité d'opposants à la fin du délai, la
> dépense part. Qui dort laisse décider les autres.

Une seule motion ouverte à la fois par équipe. Le proposant vote « pour »
d'office. À l'expiration, le premier écran qui s'en aperçoit clôt la motion —
`resolveMotion` est idempotent, et `sweepMotions` tourne toutes les 15-20 s sur
chaque appareil connecté.

### Posséder une activité, et la faire payer

Un article du shop marqué **« activité »** s'achète sur la cagnotte et devient
la propriété de l'équipe. Elle lui fixe alors un **tarif d'entrée** librement
modifiable, et les autres joueurs paient depuis leur téléphone — les parts
tombent directement dans la cagnotte propriétaire.

Le tarif affiché est le **prix officiel** ; rien n'empêche un arrangement en
jetons à côté. C'est voulu : la trace quand on la veut, la roublardise quand on
la préfère.

### Le vote du dimanche : hybride

Deux façons de peser, **elles s'additionnent** :

- **Les jetons physiques** vont dans l'**urne** de l'équipe soutenue. L'orga
  compte et saisit le total par urne dans la console.
- **Les parts en banque** se convertissent en **voix dans l'app**, réparties
  librement entre plusieurs équipes si le joueur veut couvrir ses paris.

Dans l'app : **un seul passage, définitif**. Les parts converties sont
**bloquées** (champ `engaged`) puis **rendues** au dépouillement — voter ne
coûte rien.

> **Pourquoi bloquer ?** Sans blocage, on voterait avec 10 parts puis on les
> céderait à quelqu'un qui revoterait avec les mêmes. Le verrou est ce qui rend
> le décompte exact.

Personne n'est lésé selon la forme où il a laissé ses parts, et la scène des
urnes garde son enjeu.

---

## Mise en route

### 1. Créer le projet Firebase

1. [console.firebase.google.com](https://console.firebase.google.com) → **Ajouter un projet**
2. **Build → Firestore Database → Créer une base** (mode production, région `europe-west`)
3. **⚙ Paramètres du projet → Vos applications → `</>` Application Web** → enregistrer l'app
4. Copier l'objet `firebaseConfig` affiché

### 2. Brancher la config

Dans `common/config.js` : remplacer les `"A_REMPLACER"` par les valeurs copiées,
et changer `GPC_ADMIN_CODE` (le code d'accès à la console orga).

### 3. Publier les règles de sécurité

Console Firebase → **Firestore Database → Règles** → coller `firestore.rules` → **Publier**.

> ⚠️ **À republier chaque fois qu'une collection est ajoutée** : la règle
> fourre-tout en fin de fichier refuse tout ce qui n'est pas listé.

### 4. Activer GitHub Pages

Repo → **Settings → Pages** → Source `Deploy from a branch`, branche `main`, dossier `/ (root)`.
Site en ligne sur `https://jobakledev.github.io/GoodFolksIndustries/`.

### 5. Créer les équipes, puis les joueurs

**D'abord les 5 équipes** (onglet Équipes) : nom, couleur, devise publique, et
surtout l'**objectif secret**. Elles deviennent automatiquement les options du
vote et les urnes du dimanche.

**Ensuite les 30 joueurs** (onglet Joueurs → Création en série) :

```
Camille Dubreuil;Les Continuateurs
Anaïs Berger;Les Continuateurs;4821
Victor Pann;Les Bâtisseurs;;18
```

Format : `Nom` · `Nom;équipe` · `Nom;équipe;code` · `Nom;équipe;code;parts`.
L'équipe est reconnue par son nom. Code vide = tiré au hasard. Parts vides =
dotation par défaut.

La page affiche le **tableau des codes à distribuer**, et le bouton **🖨 Codes**
en ouvre une version imprimable pour les badges.

---

## Les pages

| Fichier | Qui | Quoi |
|---|---|---|
| `index.html` | joueurs | Accueil + connexion (nom + code) |
| `perso.html` | joueurs | Le hub, 6 onglets en bas d'écran |
| `admin.html` | orga | Guichet, équipes, joueurs, shop, commandes, fil, vote, carte, réglages |

**Onglets joueur** : **Parts** (solde, guichet, cessions, relevé) · **Équipe**
(objectif secret, cagnotte, motions, activités, classement) · **Shop** (perso,
équipe, péages) · **Fil** (programme + journal officiel) · **Vote** · **Infos**
(plan, classement, règles).

Tout est en temps réel : une prime accordée depuis la console apparaît sur le
téléphone du joueur sans rechargement.

---

## Le guichet, en pratique

Avec 30 personnes, la file est le goulot. Deux chemins :

1. **Le joueur pose sa demande** depuis son téléphone (Parts → Guichet) :
   « retirer 12 jetons ». Elle apparaît dans la file de la console avec son
   solde. Tu comptes, tu cliques une fois. Une seule demande en attente par
   joueur.
2. **Conversion directe** : pour qui arrive sans avoir rien posé.

Le compteur rouge sur l'onglet **Guichet** indique le nombre de personnes en
attente.

---

## Les leviers de l'orga

Onglet **Guichet**, le raccourci que tu utiliseras cent fois : **Primes &
pénalités** — un joueur, un montant, un motif, et ➕ Donner / ➖ Reprendre. C'est
par là que passent les gains de beer pong, de casino, de défis et les gages.

| Où | Action | Effet sur le capital |
|---|---|---|
| Réglages | **Émettre vers la trésorerie** | **augmente** — ta réserve de fondateur |
| Guichet | **Donner / Reprendre** | inchangé — circule entre trésorerie et joueurs |
| Joueurs | **＋ Émettre** sur un joueur | **augmente** — crée des parts, dilue les autres |
| Équipes | **Créditer la cagnotte** | inchangé — prend dans la trésorerie |

En tant que fondateur, tu contrôles la **trésorerie de la direction** : une part
du capital qui ne vote pas, et d'où sort tout ce que tu distribues. Émets-en une
bonne réserve avant le début du week-end.

---

## Le dimanche, côté console

Onglet **Vote** :

1. Rédiger la **question** et les précisions. **Les options sont les équipes** —
   inutile de les saisir, elles sont reprises automatiquement, une urne chacune.
2. Fixer l'**ouverture** (dimanche matin) et la **fermeture des urnes**.
3. **📢 Annoncer** la veille : la question et les équipes en lice deviennent
   visibles, le vote reste fermé. C'est le carburant des tractations du samedi soir.
4. **▶ Ouvrir** le dimanche matin.
5. Compter les urnes et **saisir chaque total** dans « Comptage des urnes ».
6. **◻ Clore et dépouiller** : additionne urnes + voix de l'app, publie le
   résultat, **révèle les objectifs secrets** des 5 équipes, et rend les parts
   engagées.

Pendant le vote, la console affiche le **décompte provisoire** (vue orga
uniquement) et la **liste de ceux qui ne sont pas encore passés par l'app**,
triés par parts en banque.

Si tu dépouilles sans avoir saisi toutes les urnes, l'app te prévient et compte
les manquantes à zéro. Un scrutin clos **ne se réouvre pas** (les parts ont été
rendues) : passer par la remise à zéro.

---

## Charte graphique

Tout est tiré du logo (`img/Logo Goodfolks Industries minimaliste.png`), dont
les déclinaisons web sont générées dans `img/` :

| Couleur | Hex | Usage |
|---|---|---|
| Navy | `#1b3a57` | encre, titres, chiffres, actions irréversibles, parts au vote |
| Pétrole | `#387589` | accent : liens, barres, parts en banque |
| Sauge | `#68876c` | positif, cagnottes, équipe gagnante |
| Ocre | `#b07d2b` | jetons physiques en circulation, vigilance |
| Brique | `#b3503f` | danger, dépassement |

Fond papier `#f4f7f8`, surfaces blanches, filets `#dde7ea`. Typographie :
**Poppins** pour les titres et les chiffres (la géométrie du logotype),
**Inter** pour le texte courant. Les variables vivent en haut de
`common/style.css` — changer la marque, c'est changer ces lignes-là.

Fichiers générés depuis le PNG source (ImageMagick) : `goodfolks-logo.png`
(lockup 760 px, pour l'accueil), `goodfolks-mark.png` (la marque seule, 192 px,
pour les en-têtes), `favicon.png`, `apple-touch-icon.png`.

Chaque équipe a sa propre couleur, choisie à la création : elle teinte son
bandeau, son liseré dans les listes, sa barre au classement et au dépouillement.

---

## Structure

```
index.html            → accueil + login
perso.html            → le hub joueur (6 onglets)
admin.html            → console orga (code: config.js)
common/
  config.js           → firebaseConfig + code orga + réglages par défaut
  app.js              → session, comptabilité des parts, équipes, motions,
                        activités, scrutin
  style.css           → thème clair tiré du logo, mobile-first
data/
  rules.json          → règles par défaut (surchargées par /config/game.rules)
img/                  → logo source + déclinaisons web
firestore.rules       → règles à publier dans la console Firebase
.nojekyll
```

### Fonctions clés de `common/app.js`

| Fonction | Rôle |
|---|---|
| `login` / `getSession` / `requireSession` | Session `localStorage` ; `?id=` court-circuite (tests) |
| `shareOp(pid, dShares, dTres, entry)` | **Le cœur** : opération atomique compte + trésorerie + grand livre |
| `transferShares(from, to, n, label)` | Cession entre joueurs |
| `withdrawTokens` / `depositTokens` | Guichet : compte ⇄ jetons physiques |
| `issueShares` / `grantShares` / `reclaimShares` | Émission (dilution) / prime / reprise |
| `contributeToPot` / `creditPot` | Versement d'un membre / crédit de l'orga à une cagnotte |
| `proposeSpend` / `voteMotion` / `motionTally` | Motion de dépense d'équipe |
| `resolveMotion` / `sweepMotions` | Clôture à l'expiration, **idempotente** |
| `setActivityFee` / `payToll` | Tarif d'une activité possédée / paiement du péage |
| `purchase(pid, itemId, qty)` | Achat perso : débite les parts **et** décrémente le stock |
| `castBallot(pid, nom, alloc)` | Convertit des parts en voix, réparties ; un seul passage |
| `setUrn(teamId, n)` | Comptage d'une urne physique, saisi par l'orga |
| `tallyVote()` | Urnes + app, publie le résultat, **puis rend les parts engagées** |
| `releaseEngaged` / `resetVote` | Restitution (idempotente) / remise à zéro du scrutin |
| `held(p)` | Parts détenues : en banque + engagées au vote |
| `num` `parts` `voix` `pctOf` `when` `whenLong` `countdown` `esc` `slugify` `miniMd` `say` | Formatage et garde-fous d'affichage |

Toutes les opérations sur les parts passent par `db.runTransaction` : deux
personnes qui cliquent en même temps ne peuvent ni dupliquer ni perdre de parts.
Chacune écrit une ligne dans `/ledger`, que les règles rendent non
réinscriptible.

---

## Schéma Firestore

```
/players/{slug}      { pseudo, code, team, shares, engaged, active, createdAt }
                     shares  = parts EN BANQUE (les jetons ne sont pas ici)
                     engaged = parts bloquées au vote, rendues au dépouillement

/teams/{slug}        { name, motto, color, secret, pot, order }
                     secret = l'objectif secret, révélé à tous au dépouillement
                     pot    = la cagnotte collective

/motions/{auto}      { teamId, proposerId, proposerName, label, amount,
                       itemId?, ownable, icon, desc,
                       votes:{playerId:'for'|'against'},
                       status:'open'|'approved'|'rejected'|'failed',
                       createdAt, expiresAt, resolvedAt?, failReason? }

/activities/{auto}   { name, desc, icon, itemId, teamId, fee, revenue, plays }

/config/treasury     { issued, circulating, company }
/ledger/{auto}       { type, shares, from, fromName, to, toName, label, ts }
                     type ∈ transfer | withdraw | deposit | issue | grant
                            | reclaim | shop | pot_in | pot_out | toll
                            | vote | release

/requests/{auto}     { playerId, playerName, kind:'withdraw'|'deposit', qty,
                       status:'pending'|'done'|'cancelled', ts }

/vote/current        { question, detail, options:[{id,label,desc}],
                       status:'draft'|'announced'|'open'|'closed',
                       opensAt, closesAt, openedAt, closedAt,
                       voted:{playerId: nbParts},  ← qui et combien, jamais pour qui
                       urns:{teamId: nbJetons},    ← saisi par l'orga
                       results:{ ranked, expressed, voters, voidShares,
                                 winnerId, tie, ts } }
/ballots/{playerId}  { playerId, playerName, alloc:{teamId:nbVoix}, total, ts }

/orders/{auto}       { playerId?, playerName, teamId?, teamName?, itemId,
                       itemName, qty, unitPrice, total,
                       status:'pending'|'delivered', ts }
/shop/catalog        { items:[{ id, name, desc, price, stock?, icon?, img?,
                                scope:'player'|'team', ownable, hidden }] }
/journal/public      { entries:[{ id, title, text, ts }] }
/schedule/data       { items:[{ id, day, time, title, place, desc }] }
/map/data            { pois:[{ id, name, desc, lat, lng }] }
/config/game         { gameName, tagline, unit, units, startShares,
                       registryTop, mapCenter:[lat,lng], mapZoom, rules }
```

### Invariant comptable

```
issued = Σ (shares + engaged)  +  Σ teams.pot  +  circulating  +  company
```

La console l'affiche en permanence sous **« Écart comptable »**. Il doit rester
à `0` : toute autre valeur signale une saisie à la main dans la console
Firebase, ou la suppression d'un joueur / d'une équipe qui détenait des parts.

### Conventions

- **`stock` absent ou `null` = illimité.** Un nombre active le décompte.
- Un article `scope:'team'` ne s'achète **que** par motion sur la cagnotte ;
  `ownable:true` le transforme en activité à péage une fois la motion adoptée.
- Les contreparties `__company__`, `__tokens__`, `__issuance__`, `__urn__` et
  `team:<id>` dans `/ledger` ne sont pas des joueurs.
- Supprimer un joueur ou une équipe ne reprend pas ses parts : **reprends-les
  d'abord** si tu veux garder l'invariant juste.
- API compat v9 : `snap.exists` **sans parenthèses**.

---

## Sécurité : ce que ça garantit, ce que ça ne garantit pas

La connexion est vérifiée **dans le navigateur**, sans Firebase Auth. Firestore
ne sait pas qui écrit, et les règles sont ouvertes. Concrètement : un joueur
curieux qui ouvre la console de son navigateur peut lire les codes des autres,
**lire les objectifs secrets des 5 équipes**, lire les bulletins avant le
dépouillement, et modifier son nombre de parts.

C'est tenable pour un week-end entre gens consentants, à deux conditions :

1. **Aucune donnée personnelle réelle** dans ces documents.
2. **Après le week-end**, repasser les règles en `allow read, write: if false;`
   ou supprimer le projet Firebase.

Le **grand livre est la garantie pratique** : il n'est pas réinscriptible par
les règles, donc une part qui apparaît sans ligne de mouvement se repère.
L'« écart comptable » de la console sert exactement à ça.

Pour une vraie étanchéité : Firebase Auth anonyme + `uid` dans `/players/{id}` +
Cloud Functions seules habilitées à écrire `shares`, `teams.secret`, `/ledger`
et `/vote`.

---

## Avant le début du jeu — liste de contrôle

**Technique**

- [ ] `common/config.js` rempli (firebaseConfig + code orga changé)
- [ ] `firestore.rules` publié dans la console Firebase
- [ ] GitHub Pages actif, site ouvert depuis un téléphone **en 4G**
- [ ] **Réseau vérifié sur place** — à la campagne c'est le vrai risque. Pas de
      réseau, pas de jeu : teste la couverture dans la pièce du guichet et
      prévois un partage de connexion ou un point Wi-Fi de secours
- [ ] Centre de la carte réglé sur l'hébergement, points posés (guichet, salles,
      zones interdites)

**Contenu**

- [ ] Les **5 équipes** créées, avec leur objectif secret rédigé
- [ ] Les **30 joueurs** créés et répartis, codes imprimés sur les badges
- [ ] **Trésorerie de la direction** alimentée — ta réserve de fondateur, tout
      ce que tu distribues en sort
- [ ] Catalogue du shop rempli : articles perso **et** articles d'équipe, dont
      quelques **activités à péage** (c'est le moteur économique du week-end)
- [ ] Programme saisi dans l'onglet Fil
- [ ] Question du vote rédigée, horaires d'ouverture et de fermeture saisis
- [ ] Règles relues et adaptées — les passages entre `[crochets]` dans
      `data/rules.json` sont à remplir (mot d'arrêt, pièces interdites, horaires)

**Matériel**

- [ ] **Jetons physiques comptés** : tu ne pourras pas en remettre plus que tu
      n'en as. 30 joueurs × 20 parts = 600 minimum, prévois large
- [ ] **5 urnes** étiquetées aux couleurs des équipes
- [ ] Un deuxième appareil de guichet (tablette ou PC) pour que la file
      n'attende pas sur un seul écran

**Répétition**

- [ ] Un test complet sur un vrai téléphone : connexion → cession → retrait au
      guichet → dépôt → versement à la cagnotte → **motion de dépense et son
      expiration à 5 min** → achat d'une activité → réglage du tarif → paiement
      du péage par un autre joueur
- [ ] Le vote de bout en bout : annonce → ouverture → vote réparti → saisie des
      urnes → dépouillement, en vérifiant que les parts engagées reviennent
- [ ] Testé qu'un **second vote est refusé** (un seul passage)
