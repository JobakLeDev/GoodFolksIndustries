/* ============================================================
   Goodfolks Industries — inscriptions au week-end
   Charge par inscription.html et admin.html, APRES common/config.js.

   Que des fonctions PURES : rien ici ne touche a Firestore ni au DOM.
   Ca permet de les verifier avec node, sur des donnees fictives :
     node -e "const I = require('./common/inscription.js'); ..."

   LE PRINCIPE
   -----------
   Le participant choisit son MENU (vegan, vegetarien, viande) puis son
   niveau de BOISSONS (sans alcool, biere & vin, alcool fort). Toutes les
   combinaisons sont permises :
       prix = prix du menu + supplement des boissons
   Le sandwich du samedi midi doit etre compatible avec le menu : un
   vegetarien n'a pas de jambon beurre, un vegan n'a que le vegan.
   ============================================================ */

/* Ordre de compatibilite des regimes : un menu donne droit a tout ce qui est
   de rang inferieur ou egal. */
const DIET_RANK = { vegan: 0, vegetarien: 1, viande: 2 };

/* Libelles EXACTS attendus par le classeur d'organisation (onglet
   Participants). Ses formules comparent ces textes : ils ne suivent pas les
   libelles reglables du formulaire. */
const SHEET_MENU = { vegan: 'Vegan', vegetarien: 'Végétarien', viande: 'Viande' };

/* Ce que dit la colonne « Pack » pour chaque niveau de boissons :
   « Viande · alcool fort », « Vegan · sans alcool »… */
const SHEET_DRINKS_SHORT = { sans: 'sans alcool', biere_vin: 'bière & vin', fort: 'alcool fort' };

/** Le niveau de boissons qui donne acces a l'alcool fort (colonne « Alcool fort »). */
const STRONG_DRINKS = 'fort';

/* Statuts : les memes libelles que le classeur. */
const INSCRIPTION_STATUS = ['Intéressé', 'Inscrit', 'Confirmé', 'Annulé'];
const STATUS_NEW       = 'Inscrit';   // le seul statut qu'un participant peut ecrire
const STATUS_CANCELLED = 'Annulé';    // exclu de l'export et de la creation des joueurs

/* Repas et nuits : fixes, car ce sont des colonnes du classeur. */
const MEALS = [
  { id: 'friDinner',    label: 'Ven dîner' },
  { id: 'satBreakfast', label: 'Sam petit-déj' },
  { id: 'satLunch',     label: 'Sam déjeuner' },   // le repas du sandwich
  { id: 'satDinner',    label: 'Sam dîner' },
  { id: 'sunBrunch',    label: 'Dim brunch' }
];
const NIGHTS = [
  { id: 'fri', label: 'Nuit ven' },
  { id: 'sat', label: 'Nuit sam' }
];
/** Le repas ou l'on sert le sandwich. */
const SANDWICH_MEAL = 'satLunch';

/* Longueurs maximales : les memes que dans firestore.rules. */
const INSCRIPTION_MAX = {
  firstName: 60, lastName: 60, pseudo: 40, phone: 30, email: 120, notes: 1000
};

/* ---------- Reglages ---------- */

/**
 * Reglages effectifs : les valeurs par defaut de config.js, surchargees par
 * le document /config/inscription. Les menus et les boissons gardent les
 * identifiants des valeurs par defaut — on ne surcharge que leurs libelles,
 * descriptions et prix. Les sandwiches, eux, sont une liste libre.
 */
function inscriptionConfig(stored, defaults){
  const def = defaults || {};
  const s = stored || {};
  const overlay = (list, over) => (list || []).map(item => {
    const o = (over || []).find(x => x && x.id === item.id) || {};
    return Object.assign({}, item, pickDefined(o, ['label', 'desc', 'price', 'extra']));
  });
  return {
    open:       s.open === undefined ? def.open !== false : s.open !== false,
    intro:      s.intro !== undefined ? String(s.intro || '') : String(def.intro || ''),
    menuNote:   s.menuNote !== undefined ? String(s.menuNote || '') : String(def.menuNote || ''),
    menus:      overlay(def.menus, s.menus),
    drinks:     overlay(def.drinks, s.drinks),
    sandwiches: Array.isArray(s.sandwiches) ? s.sandwiches.slice() : (def.sandwiches || []).slice()
  };
}

/** Copie les seules cles demandees qui sont definies. */
function pickDefined(o, keys){
  const out = {};
  keys.forEach(k => { if (o[k] !== undefined && o[k] !== null) out[k] = o[k]; });
  return out;
}

const findInList = (list, id) => (list || []).find(x => x.id === id) || null;

/** Prix d'une inscription : menu + supplement boissons. null si un choix manque. */
function inscriptionPrice(cfg, menuId, drinksId){
  const m = findInList(cfg.menus, menuId), d = findInList(cfg.drinks, drinksId);
  if (!m || !d) return null;
  return (Number(m.price) || 0) + (Number(d.extra) || 0);
}

/** Les sandwiches qu'un menu autorise, dans l'ordre de la liste. */
function sandwichesFor(cfg, menuId){
  const rank = DIET_RANK[menuId];
  if (rank === undefined) return [];
  return (cfg.sandwiches || []).filter(s =>
    DIET_RANK[s.diet] !== undefined && DIET_RANK[s.diet] <= rank);
}

/** Ce sandwich est-il permis avec ce menu ? */
function sandwichAllowed(cfg, menuId, sandwichId){
  return sandwichesFor(cfg, menuId).some(s => s.id === sandwichId);
}

/** « 45 € » (virgule decimale s'il le faut). */
function euros(n){
  const v = Number(n) || 0;
  return (Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',')) + ' €';
}

/** « Viande · alcool fort » : la combinaison, telle que le classeur l'attend. */
function packLabel(menuId, drinksId){
  return (SHEET_MENU[menuId] || menuId || '?') + ' · ' +
         (SHEET_DRINKS_SHORT[drinksId] || drinksId || '?');
}

/** Nom du joueur cree a partir d'une inscription : le pseudo, sinon « Prenom Nom ». */
function inscriptionPlayerName(ins){
  const pseudo = String(ins.pseudo || '').trim();
  if (pseudo) return pseudo;
  return (String(ins.firstName || '').trim() + ' ' + String(ins.lastName || '').trim()).trim();
}

/** Nom du sandwich d'une inscription : d'apres la liste actuelle, sinon le nom retenu a l'envoi. */
function inscriptionSandwichName(cfg, ins){
  if (!ins.sandwich) return '';
  const s = findInList(cfg.sandwiches, ins.sandwich);
  return s ? String(s.name || '') : String(ins.sandwichName || '');
}

/** Horodatage Firestore, nombre ou Date -> millisecondes (0 si absent). */
function tsMs(v){
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (v.toMillis) return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}

/** ms -> « 20/11/2026 14:32 », que la version francaise d'Excel lit comme une date. */
function frDateTime(ms){
  if (!ms) return '';
  const d = new Date(ms), p = n => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' +
         p(d.getHours()) + ':' + p(d.getMinutes());
}

/* ============================================================
   EXPORT VERS LE CLASSEUR
   Colonnes dans l'ordre EXACT de l'onglet Participants (A -> AC), puis deux
   colonnes en plus (AD, AE). Les colonnes V -> AC sont des formules ou des
   saisies du classeur : on les laisse VIDES pour ne rien ecraser au collage.
   ============================================================ */
const CSV_HEADERS = [
  'Prénom', 'Nom', 'Pseudo', 'Téléphone', 'Email', 'Statut',                // A-F
  'Pack', 'Menu', 'Alcool fort', 'Allergies / remarques',                   // G-J
  'Ven dîner', 'Sam petit-déj', 'Sam déjeuner', 'Sandwich (sam midi)',      // K-N
  'Sam dîner', 'Dim brunch', 'Nuit ven', 'Nuit sam',                        // O-R
  'Couchage', 'Prix pack (€)', 'Ajustement',                                // S-U
  'Total dû', 'Payé', 'Reste', 'Statut paiement', 'Moyen paiement',         // V-Z
  'Date paiement', 'Encaissé par', 'Actif',                                 // AA-AC
  'Boissons', 'Inscrit le'                                                  // AD-AE (en plus)
];

/** Excel francais : point-virgule, guillemets si le champ en contient un, ou un saut de ligne. */
function csvCell(v){
  const s = String(v == null ? '' : v);
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * Un texte saisi par un participant ne doit pas devenir une formule dans
 * Excel (« =HYPERLINK(...) », « +33 6… » lu comme un calcul). On le
 * neutralise par une apostrophe, comme on le ferait a la main.
 */
function csvText(v){
  const s = String(v == null ? '' : v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

const yesNo = b => b ? 'Oui' : 'Non';

/** Prix au format Excel francais : virgule decimale, sans symbole. */
const csvNumber = n => {
  const v = Number(n);
  if (n === null || n === undefined || n === '' || isNaN(v)) return '';
  return Number.isInteger(v) ? String(v) : String(v).replace('.', ',');
};

/** Une ligne du classeur pour une inscription. */
function inscriptionRow(cfg, ins){
  const meals = ins.meals || {}, nights = ins.nights || {};
  const drinks = findInList(cfg.drinks, ins.drinks);
  const atLunch = !!meals[SANDWICH_MEAL];
  return [
    csvText(ins.firstName), csvText(ins.lastName), csvText(ins.pseudo),
    csvText(ins.phone), csvText(ins.email), ins.status || STATUS_NEW,
    packLabel(ins.menu, ins.drinks),
    SHEET_MENU[ins.menu] || '',
    yesNo(ins.drinks === STRONG_DRINKS),
    csvText(ins.notes),
    yesNo(meals.friDinner), yesNo(meals.satBreakfast), yesNo(atLunch),
    atLunch ? inscriptionSandwichName(cfg, ins) : '',
    yesNo(meals.satDinner), yesNo(meals.sunBrunch),
    yesNo(nights.fri), yesNo(nights.sat),
    '',                                   // S Couchage : a remplir dans le classeur
    csvNumber(ins.price),                 // T Prix pack (€)
    '',                                   // U Ajustement
    '', '', '', '', '', '', '', '',       // V -> AC : formules et saisies du classeur
    drinks ? drinks.label : (ins.drinks || ''),
    frDateTime(tsMs(ins.createdAt))
  ];
}

/**
 * Le fichier CSV complet, pret a telecharger : BOM UTF-8 (sinon Excel lit les
 * accents de travers), separateur « ; », fins de ligne Windows. Une ligne par
 * inscription NON annulee, de la plus ancienne a la plus recente.
 */
function inscriptionsCsv(list, cfg){
  const rows = (list || [])
    .filter(ins => ins.status !== STATUS_CANCELLED)
    .slice()
    .sort((a, b) => tsMs(a.createdAt) - tsMs(b.createdAt))
    .map(ins => inscriptionRow(cfg, ins));
  return '﻿' + [CSV_HEADERS].concat(rows)
    .map(r => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

/* Pour node (verification hors navigateur). Dans le navigateur, tout est global. */
if (typeof module !== 'undefined' && module.exports){
  module.exports = {
    DIET_RANK, SHEET_MENU, SHEET_DRINKS_SHORT, STRONG_DRINKS, INSCRIPTION_STATUS,
    STATUS_NEW, STATUS_CANCELLED, MEALS, NIGHTS, SANDWICH_MEAL, INSCRIPTION_MAX, CSV_HEADERS,
    inscriptionConfig, inscriptionPrice, sandwichesFor, sandwichAllowed, euros, packLabel,
    inscriptionPlayerName, inscriptionSandwichName, tsMs, frDateTime,
    csvCell, csvText, inscriptionRow, inscriptionsCsv
  };
}
