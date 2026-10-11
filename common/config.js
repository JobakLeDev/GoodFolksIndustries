/* ============================================================
   Goodfolks Industries — configuration

   firebaseConfig identifie le projet ; ce ne sont pas des secrets, ces
   valeurs partent de toute facon dans le navigateur de chaque joueur.
   Ce qui protege la base, ce sont les regles Firestore — et elles sont
   ouvertes pour le week-end. Voir la section Securite du README.
   ============================================================ */

window.firebaseConfig = {
  apiKey:            "AIzaSyBTW3oLATagP80u1HLPgLon_z1wC7BTsoI",
  authDomain:        "goodfolks-industries.firebaseapp.com",
  projectId:         "goodfolks-industries",
  storageBucket:     "goodfolks-industries.firebasestorage.app",
  messagingSenderId: "1079348547652",
  appId:             "1:1079348547652:web:d3167eece7302468faac11"
};

/* Code d'acces du guichet / console organisation (admin.html) */
window.GPC_ADMIN_CODE = "1234";

/* Reglages de partie (surchargeables en direct via /config/game dans Firestore) */
window.GPC_DEFAULTS = {
  gameName:   "Goodfolks Industries",
  tagline:    "so much better together",

  /* Vocabulaire de la part - adapte-le a ton univers */
  unit:       "part",
  units:      "parts",

  /* Dotation par defaut d'un nouvel actionnaire */
  startShares: 20,

  /* Nombre d'actionnaires visibles dans le registre public (0 = aucun) */
  registryTop: 10,

  /* Centre de la carte au 1er affichage : [lat, lng] + zoom.
     A regler sur l'hebergement reel depuis la console -> Reglages. */
  mapCenter:  [48.8566, 2.3522],
  mapZoom:    17
};
