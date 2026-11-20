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

/* Formulaire d'inscription au week-end (inscription.html).
   Surchargeable en direct via /config/inscription (console orga → onglet
   Inscriptions). Les IDENTIFIANTS des menus et des boissons sont fixes : les
   regles Firestore et l'export vers le classeur s'appuient dessus. Libelles,
   descriptions et prix, eux, se changent librement.
   Prix d'une inscription = prix du menu + supplement des boissons. */
window.GPC_INSCRIPTION_DEFAULTS = {
  open:  true,     // false = « inscriptions fermees », pas de formulaire
  intro: "",       // texte d'accueil facultatif, en tete du formulaire

  /* Ordre de compatibilite : vegan < vegetarien < viande */
  menuNote: "Tout le monde partage la même base vegan ; les protéines animales sont servies à part.",
  menus: [
    { id: "vegan",      label: "Vegan",      price: 40,
      desc: "La base commune, 100 % végétale." },
    { id: "vegetarien", label: "Végétarien", price: 45,
      desc: "La base vegan, plus œufs, fromage et feta." },
    { id: "viande",     label: "Viande",     price: 50,
      desc: "La base vegan, plus œufs, fromage, viande et poisson." }
  ],

  drinks: [
    { id: "sans",      label: "Sans alcool",              extra: 0,
      desc: "Softs, jus, sirops." },
    { id: "biere_vin", label: "Bière & vin",              extra: 0,
      desc: "Bière et vin à volonté." },
    { id: "fort",      label: "Bière, vin & alcool fort", extra: 10,
      desc: "Bière, vin, et l'accès au bar à alcools forts." }
  ],

  /* Sandwich du samedi midi. diet = le menu minimum pour y avoir droit. */
  sandwiches: [
    { id: "houmous",       name: "Houmous & légumes grillés", diet: "vegan",
      desc: "Houmous, légumes grillés, roquette" },
    { id: "mozza",         name: "Mozza tomate pesto",        diet: "vegetarien",
      desc: "Mozzarella, tomate, pesto, roquette" },
    { id: "jambon-beurre", name: "Jambon beurre",             diet: "viande",
      desc: "Jambon, beurre, cornichons" },
    { id: "poulet-curry",  name: "Poulet curry",              diet: "viande",
      desc: "Poulet, sauce curry, crudités" }
  ]
};
