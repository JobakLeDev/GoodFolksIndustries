/* ============================================================
   Goodfolks Industries — socle commun
   Charge par index.html, perso.html, admin.html
   Depend de : firebase-app-compat + firebase-firestore-compat, common/config.js

   LE JEU
   ------
   30 joueurs, 5 equipes. Chacun detient des PARTS de l'entreprise. Chaque
   equipe a un objectif secret pour l'avenir de la boite et doit faire gagner
   sa vision au vote du dimanche.

   UNE PART, DEUX FORMES
     · en banque — sur le compte, dans l'app. Paie le shop, les peages,
       alimente la cagnotte d'equipe, et peut voter dans l'app.
     · en jetons — physique, au porteur. Invisible de l'app par construction :
       circule a la main (paris, beer pong, casino) sans laisser de trace.
   Le GUICHET de l'orga convertit dans les deux sens.

   LE VOTE EST HYBRIDE (dimanche)
     · jetons physiques deposes dans l'URNE d'une equipe -> l'orga saisit le
       comptage par urne ;
     · parts en banque converties en voix dans l'app, repartition libre.
     Total d'une equipe = urne + voix de l'app. Personne n'est lese selon la
     forme ou il a laisse ses parts.

   LA CAGNOTTE D'EQUIPE
     Alimentee par les versements des membres et par les peages encaisses.
     Toute depense passe par une MOTION : les membres ont 5 minutes pour
     voter, et le SILENCE VAUT ACCORD. Qui dort laisse decider les autres.
   ============================================================ */

firebase.initializeApp(window.firebaseConfig);
const db = firebase.firestore();

/* ---------- Collections ---------- */
const COL = {
  players:    'players',     // /players/{slug}       compte (shares, engaged, team)
  teams:      'teams',       // /teams/{id}           equipe : cagnotte, objectif secret, urne
  motions:    'motions',     // /motions/{auto}       depense d'equipe soumise aux membres
  activities: 'activities',  // /activities/{auto}    activite possedee par une equipe (peage)
  ledger:     'ledger',      // /ledger/{auto}        un mouvement de parts
  requests:   'requests',    // /requests/{auto}      demande de retrait/depot au guichet
  ballots:    'ballots',     // /ballots/{playerId}   bulletin : { alloc:{teamId:n}, total }
  orders:     'orders',      // /orders/{auto}        commande shop a remettre
  shop:       'shop',        // /shop/catalog         { items:[...] }
  journal:    'journal',     // /journal/public       { entries:[...] }
  schedule:   'schedule',    // /schedule/data        { items:[...] }  le programme
  map:        'map',         // /map/data             { pois:[...] }
  vote:       'vote',        // /vote/current         le scrutin
  config:     'config'       // /config/game, /config/treasury
};

/* Types de mouvement du grand livre */
const MV = {
  transfer: 'transfer',   // joueur -> joueur (en banque)
  withdraw: 'withdraw',   // compte -> jetons physiques (guichet)
  deposit:  'deposit',    // jetons physiques -> compte (guichet)
  issue:    'issue',      // creation de parts nouvelles (dilution)
  grant:    'grant',      // tresorerie -> joueur
  reclaim:  'reclaim',    // joueur -> tresorerie
  shop:     'shop',       // achat perso
  potIn:    'pot_in',     // joueur -> cagnotte d'equipe
  potOut:   'pot_out',    // cagnotte -> depense validee
  toll:     'toll',       // joueur -> cagnotte, peage d'activite
  vote:     'vote',       // compte -> voix engagees au scrutin
  release:  'release'     // voix rendues au compte
};

/* Contreparties qui ne sont pas des joueurs */
const PARTY = {
  company:  '__company__',
  tokens:   '__tokens__',
  issuance: '__issuance__',
  urn:      '__urn__'
};
const PARTY_NAME = {
  __company__:  'Direction',
  __tokens__:   'Jetons en circulation',
  __issuance__: 'Émission',
  __urn__:      'Scrutin'
};
/** Les cagnottes sont des contreparties « team:<id> ». */
const potParty = teamId => 'team:' + teamId;

/* Etats du scrutin */
const VOTE_STATUS = {
  draft:     'draft',      // invisible des joueurs
  announced: 'announced',  // question + heure d'ouverture visibles, vote impossible
  open:      'open',       // conversion des parts en voix possible
  closed:    'closed'      // depouille, resultats et visions reveles
};

/** Couleurs d'equipe par defaut, prises dans la palette du logo. */
const TEAM_COLORS = ['#2b6cb0','#cf4a7e','#cf7318','#7c4dbd','#3f8f54','#1b3a57'];

/** Duree d'une motion de depense : le silence vaut accord au bout de ce delai. */
const MOTION_MS = 5 * 60 * 1000;

/* ---------- Reglages de partie ---------- */
let GAME = Object.assign({}, window.GPC_DEFAULTS);

async function loadGame(){
  try{
    const s = await db.collection(COL.config).doc('game').get();
    if (s.exists) GAME = Object.assign({}, window.GPC_DEFAULTS, s.data());
  }catch(e){ console.warn('config/game indisponible', e); }
  return GAME;
}

/* ---------- Utilitaires d'affichage ---------- */

/** Echappe le HTML. A utiliser sur TOUTE donnee venant de Firestore. */
function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/** « Jean-Luc R. » -> « jean-luc-r » */
function slugify(s){
  return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

/** 1234 -> « 1 234 ». */
function num(n){
  return (Math.round(Number(n)||0)).toLocaleString('fr-FR').replace(/ /g,' ');
}

/** 143 -> « 143 parts » ; 1 -> « 1 part ». */
function parts(n){
  const v = Math.round(Number(n)||0);
  return num(v) + ' ' + (Math.abs(v) === 1 ? (GAME.unit||'part') : (GAME.units||'parts'));
}

/** « 12 voix » (invariable). */
function voix(n){ return num(n) + ' voix'; }

/** Part d'un total, en pourcentage lisible. */
function pctOf(n, total){
  const t = Number(total)||0;
  if (!t) return '—';
  const p = (Number(n)||0) / t * 100;
  return (p >= 10 ? p.toFixed(0) : p.toFixed(1)).replace('.', ',') + ' %';
}

/** ms -> « sam. 14:32 ». */
function when(ts){
  const ms = !ts ? 0 : (typeof ts === 'number' ? ts : (ts.toMillis ? ts.toMillis() : 0));
  if (!ms) return '—';
  return new Date(ms).toLocaleString('fr-FR',
    { weekday:'short', hour:'2-digit', minute:'2-digit' });
}

/** ms -> « dimanche 09:00 ». */
function whenLong(ts){
  const ms = Number(ts)||0;
  if (!ms) return '—';
  return new Date(ms).toLocaleString('fr-FR',
    { weekday:'long', hour:'2-digit', minute:'2-digit' });
}

/** Duree restante : « 3 h 12 », « 4 min », « 48 s », « terminé ». */
function countdown(toMs){
  const d = Number(toMs) - Date.now();
  if (!toMs || isNaN(d)) return '';
  if (d <= 0) return 'terminé';
  const h = Math.floor(d / 3600000), m = Math.floor((d % 3600000) / 60000);
  if (h >= 24){ const j = Math.floor(h/24); return j + ' j ' + (h % 24) + ' h'; }
  if (h) return h + ' h ' + String(m).padStart(2,'0');
  if (m) return m + ' min';
  return Math.max(0, Math.floor(d/1000)) + ' s';
}

/** Nom affichable d'une contrepartie de mouvement. */
function partyName(id, fallback, teams){
  if (PARTY_NAME[id]) return PARTY_NAME[id];
  if (String(id||'').startsWith('team:')){
    const t = (teams||[]).find(x => x.id === String(id).slice(5));
    return 'Cagnotte ' + (t ? t.name : String(id).slice(5));
  }
  return fallback || id || '?';
}

/** Parts detenues par un joueur : en banque + engagees au scrutin. */
function held(p){
  if (!p) return 0;
  return (Number(p.shares)||0) + (Number(p.engaged)||0);
}

/** Affiche un message dans un conteneur (type 'ok' | 'err'). */
function say(el, text, type){
  const n = typeof el === 'string' ? document.getElementById(el) : el;
  if (!n) return;
  if (!text){ n.innerHTML = ''; return; }
  n.innerHTML = '<div class="msg msg-' + (type === 'ok' ? 'ok' : 'err') + '">' + esc(text) + '</div>';
}

/** Markdown minimal : ### titre, - liste, **gras**, paragraphes. */
function miniMd(src){
  const lines = String(src||'').split('\n');
  let out = '', inUl = false;
  const inline = t => esc(t).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  const closeUl = () => { if (inUl){ out += '</ul>'; inUl = false; } };
  for (const raw of lines){
    const l = raw.trim();
    if (!l){ closeUl(); continue; }
    if (/^#{1,3}\s/.test(l)){ closeUl(); out += '<h3>' + inline(l.replace(/^#{1,3}\s+/,'')) + '</h3>'; }
    else if (/^[-*]\s/.test(l)){ if(!inUl){ out += '<ul>'; inUl = true; } out += '<li>' + inline(l.slice(2)) + '</li>'; }
    else { closeUl(); out += '<p>' + inline(l) + '</p>'; }
  }
  closeUl();
  return out;
}

/* ---------- Session ---------- */
const SESSION_KEY = 'gpc_session';

function setSession(id, code){
  try{ localStorage.setItem(SESSION_KEY, JSON.stringify({ id, code })); }catch(e){}
}
function getSession(){
  const q = new URLSearchParams(location.search).get('id');
  if (q) return { id: slugify(q), code: null };   // ?id= pour l'orga et les tests
  try{ return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }catch(e){ return null; }
}
function clearSession(){ try{ localStorage.removeItem(SESSION_KEY); }catch(e){} }

async function login(pseudo, code){
  const id = slugify(pseudo);
  if (!id)   return { ok:false, error:'Entre ton nom.' };
  if (!code) return { ok:false, error:'Entre ton code d’accès.' };
  let snap;
  try{ snap = await db.collection(COL.players).doc(id).get(); }
  catch(e){ return { ok:false, error:'Connexion au serveur impossible. Réessaie.' }; }
  if (!snap.exists) return { ok:false, error:'Nom inconnu. Vérifie l’orthographe.' };
  const d = snap.data();
  if (String(d.code||'') !== String(code).trim())
    return { ok:false, error:'Code d’accès incorrect.' };
  if (d.active === false)
    return { ok:false, error:'Ce compte est suspendu. Vois avec l’orga.' };
  setSession(id, String(code).trim());
  return { ok:true, id, data:d };
}

function requireSession(){
  const s = getSession();
  if (!s || !s.id){ location.replace('index.html'); return null; }
  return s;
}

/* ============================================================
   TRESORERIE — /config/treasury = { issued, circulating, company }

   Invariant comptable :
     issued = Σ (shares + engaged)  +  Σ cagnottes  +  circulating  +  company
   ============================================================ */
const treasuryRef = () => db.collection(COL.config).doc('treasury');

async function loadTreasury(){
  try{
    const s = await treasuryRef().get();
    const d = s.exists ? s.data() : {};
    return { issued:Number(d.issued)||0, circulating:Number(d.circulating)||0,
             company:Number(d.company)||0 };
  }catch(e){ return { issued:0, circulating:0, company:0 }; }
}

/** Ecrit une ligne de grand livre (dans une transaction si tx est fourni). */
function ledgerEntry(tx, entry){
  const ref = db.collection(COL.ledger).doc();
  const data = Object.assign({ ts: Date.now() }, entry);
  if (tx) tx.set(ref, data); else ref.set(data);
  return ref.id;
}

/**
 * Operation atomique sur le compte d'UN joueur et sur la tresorerie.
 * @param {number} dShares variation du compte (signee)
 * @param {object} dTres   variation de tresorerie, ex. { circulating:+5 }
 */
async function shareOp(playerId, dShares, dTres, entry){
  const pRef = db.collection(COL.players).doc(playerId);
  const tRef = treasuryRef();
  try{
    await db.runTransaction(async tx => {
      const [ps, ts] = await Promise.all([tx.get(pRef), tx.get(tRef)]);
      if (!ps.exists) throw new Error('Joueur introuvable.');
      const cur = Number(ps.data().shares)||0, next = cur + dShares;
      if (next < 0) throw new Error('Parts en banque insuffisantes.');
      const t = ts.exists ? ts.data() : {};
      const tNext = {
        issued:      (Number(t.issued)||0)      + (Number(dTres.issued)||0),
        circulating: (Number(t.circulating)||0) + (Number(dTres.circulating)||0),
        company:     (Number(t.company)||0)     + (Number(dTres.company)||0)
      };
      if (tNext.circulating < 0) throw new Error('Plus de jetons en circulation que ça.');
      if (tNext.company     < 0) throw new Error('La trésorerie de la direction est à sec.');
      if (tNext.issued      < 0) throw new Error('Émission négative impossible.');
      tx.update(pRef, { shares: next });
      tx.set(tRef, tNext, { merge:true });
      ledgerEntry(tx, Object.assign({
        shares: Math.abs(dShares), playerName: ps.data().pseudo || playerId
      }, entry));
    });
    return { ok:true };
  }catch(e){ return { ok:false, error: e.message || 'Opération refusée.' }; }
}

/* ---------- Cession entre joueurs ---------- */
async function transferShares(fromId, toId, qty, label){
  const n = Math.round(Number(qty)||0);
  if (n <= 0)          return { ok:false, error:'Nombre de parts invalide.' };
  if (fromId === toId) return { ok:false, error:'Tu ne peux pas te céder des parts à toi-même.' };
  const fromRef = db.collection(COL.players).doc(fromId);
  const toRef   = db.collection(COL.players).doc(toId);
  try{
    await db.runTransaction(async tx => {
      const [fs, ts] = await Promise.all([tx.get(fromRef), tx.get(toRef)]);
      if (!fs.exists) throw new Error('Émetteur introuvable.');
      if (!ts.exists) throw new Error('Destinataire introuvable.');
      const fb = Number(fs.data().shares)||0;
      if (fb < n) throw new Error('Tu n’as pas assez de parts en banque.');
      tx.update(fromRef, { shares: fb - n });
      tx.update(toRef,   { shares: (Number(ts.data().shares)||0) + n });
      ledgerEntry(tx, {
        type: MV.transfer, shares: n,
        from: fromId, fromName: fs.data().pseudo || fromId,
        to:   toId,   toName:   ts.data().pseudo || toId,
        label: String(label||'Cession de parts').slice(0,120)
      });
    });
    return { ok:true };
  }catch(e){ return { ok:false, error: e.message || 'Cession refusée.' }; }
}

/* ---------- Guichet : compte <-> jetons physiques ---------- */
function withdrawTokens(playerId, qty){
  const n = Math.round(Number(qty)||0);
  if (n <= 0) return Promise.resolve({ ok:false, error:'Nombre de jetons invalide.' });
  return shareOp(playerId, -n, { circulating: +n }, {
    type: MV.withdraw, from: playerId, to: PARTY.tokens, toName: PARTY_NAME.__tokens__,
    label: 'Retrait de ' + n + ' jeton' + (n>1?'s':'')
  });
}
function depositTokens(playerId, qty){
  const n = Math.round(Number(qty)||0);
  if (n <= 0) return Promise.resolve({ ok:false, error:'Nombre de jetons invalide.' });
  return shareOp(playerId, +n, { circulating: -n }, {
    type: MV.deposit, from: PARTY.tokens, fromName: PARTY_NAME.__tokens__, to: playerId,
    label: 'Dépôt de ' + n + ' jeton' + (n>1?'s':'')
  });
}

/* ---------- Leviers de l'orga ---------- */
function issueShares(playerId, qty, label){
  const n = Math.round(Number(qty)||0);
  if (n <= 0) return Promise.resolve({ ok:false, error:'Nombre de parts invalide.' });
  return shareOp(playerId, +n, { issued: +n }, {
    type: MV.issue, from: PARTY.issuance, fromName: PARTY_NAME.__issuance__, to: playerId,
    label: String(label||'Émission de parts nouvelles').slice(0,120)
  });
}
function grantShares(playerId, qty, label){
  const n = Math.round(Number(qty)||0);
  if (n <= 0) return Promise.resolve({ ok:false, error:'Nombre de parts invalide.' });
  return shareOp(playerId, +n, { company: -n }, {
    type: MV.grant, from: PARTY.company, fromName: PARTY_NAME.__company__, to: playerId,
    label: String(label||'Prime de la direction').slice(0,120)
  });
}
function reclaimShares(playerId, qty, label){
  const n = Math.round(Number(qty)||0);
  if (n <= 0) return Promise.resolve({ ok:false, error:'Nombre de parts invalide.' });
  return shareOp(playerId, -n, { company: +n }, {
    type: MV.reclaim, from: playerId, to: PARTY.company, toName: PARTY_NAME.__company__,
    label: String(label||'Reprise par la direction').slice(0,120)
  });
}

/* ============================================================
   EQUIPES ET CAGNOTTES
   ============================================================ */

/** Versement d'un membre vers la cagnotte de son equipe. */
async function contributeToPot(playerId, teamId, qty, label){
  const n = Math.round(Number(qty)||0);
  if (n <= 0) return { ok:false, error:'Nombre de parts invalide.' };
  const pRef = db.collection(COL.players).doc(playerId);
  const tRef = db.collection(COL.teams).doc(teamId);
  try{
    await db.runTransaction(async tx => {
      const [ps, ts] = await Promise.all([tx.get(pRef), tx.get(tRef)]);
      if (!ps.exists) throw new Error('Compte introuvable.');
      if (!ts.exists) throw new Error('Équipe introuvable.');
      if (ps.data().team !== teamId) throw new Error('Tu n’es pas dans cette équipe.');
      const bal = Number(ps.data().shares)||0;
      if (bal < n) throw new Error('Tu n’as pas assez de parts en banque.');
      tx.update(pRef, { shares: bal - n });
      tx.update(tRef, { pot: (Number(ts.data().pot)||0) + n });
      ledgerEntry(tx, {
        type: MV.potIn, shares: n,
        from: playerId, fromName: ps.data().pseudo || playerId,
        to: potParty(teamId), toName: 'Cagnotte ' + (ts.data().name || teamId),
        label: String(label||'Versement à la cagnotte').slice(0,120)
      });
    });
    return { ok:true };
  }catch(e){ return { ok:false, error: e.message || 'Versement refusé.' }; }
}

/** L'orga crédite une cagnotte (defi gagne, prime collective). */
async function creditPot(teamId, qty, label){
  const n = Math.round(Number(qty)||0);
  if (n <= 0) return { ok:false, error:'Nombre de parts invalide.' };
  const tRef = db.collection(COL.teams).doc(teamId);
  try{
    await db.runTransaction(async tx => {
      const [ts, trs] = await Promise.all([tx.get(tRef), tx.get(treasuryRef())]);
      if (!ts.exists) throw new Error('Équipe introuvable.');
      const tr = trs.exists ? trs.data() : {};
      const co = Number(tr.company)||0;
      if (co < n) throw new Error('La trésorerie de la direction n’a que ' + co + ' parts.');
      tx.update(tRef, { pot: (Number(ts.data().pot)||0) + n });
      tx.set(treasuryRef(), { company: co - n }, { merge:true });
      ledgerEntry(tx, {
        type: MV.grant, shares: n,
        from: PARTY.company, fromName: PARTY_NAME.__company__,
        to: potParty(teamId), toName: 'Cagnotte ' + (ts.data().name || teamId),
        label: String(label||'Prime à l’équipe').slice(0,120)
      });
    });
    return { ok:true };
  }catch(e){ return { ok:false, error: e.message || 'Crédit refusé.' }; }
}

/* ============================================================
   MOTIONS — toute depense de cagnotte passe par les membres

   Cinq minutes pour voter. LE SILENCE VAUT ACCORD : la motion passe sauf si
   une majorite des votes exprimes s'y oppose. Qui dort laisse decider les
   autres — c'est voulu, ca force les equipes a se parler vite.
   ============================================================ */

/**
 * @param {object} spend { label, amount, itemId?, ownable?, icon?, desc? }
 */
async function proposeSpend(teamId, proposerId, proposerName, spend){
  const amount = Math.round(Number(spend.amount)||0);
  if (amount <= 0)    return { ok:false, error:'Montant invalide.' };
  if (!spend.label)   return { ok:false, error:'Il faut dire à quoi ça sert.' };
  try{
    const ts = await db.collection(COL.teams).doc(teamId).get();
    if (!ts.exists) return { ok:false, error:'Équipe introuvable.' };
    if ((Number(ts.data().pot)||0) < amount)
      return { ok:false, error:'La cagnotte n’a que ' + (Number(ts.data().pot)||0) + ' parts.' };
    const open = await db.collection(COL.motions)
      .where('teamId','==',teamId).where('status','==','open').get();
    if (!open.empty) return { ok:false, error:'Une motion est déjà en cours dans ton équipe.' };

    const votes = {}; votes[proposerId] = 'for';   // proposer, c'est voter pour
    await db.collection(COL.motions).add({
      teamId, proposerId, proposerName,
      label: String(spend.label).slice(0,120),
      amount,
      itemId:  spend.itemId  || null,
      ownable: !!spend.ownable,
      icon:    spend.icon || '',
      desc:    spend.desc || '',
      votes, status:'open',
      createdAt: Date.now(), expiresAt: Date.now() + MOTION_MS
    });
    return { ok:true };
  }catch(e){ return { ok:false, error: e.message || 'Motion refusée.' }; }
}

async function voteMotion(motionId, playerId, choice){
  if (choice !== 'for' && choice !== 'against') return { ok:false, error:'Vote invalide.' };
  try{
    const upd = {}; upd['votes.' + playerId] = choice;
    await db.collection(COL.motions).doc(motionId).update(upd);
    return { ok:true };
  }catch(e){ return { ok:false, error: e.message || 'Vote refusé.' }; }
}

/** Decompte d'une motion : { pour, contre, verdict }. */
function motionTally(m){
  const v = m.votes || {};
  let pour = 0, contre = 0;
  for (const k in v){ if (v[k] === 'for') pour++; else if (v[k] === 'against') contre++; }
  // le silence vaut accord : il faut une majorite d'opposants pour bloquer
  return { pour, contre, verdict: contre > pour ? 'rejected' : 'approved' };
}

/**
 * Cloture une motion arrivee a terme et execute la depense si elle passe.
 * Idempotent : n'importe quel ecran peut l'appeler, le premier gagne.
 */
async function resolveMotion(motionId){
  const mRef = db.collection(COL.motions).doc(motionId);
  try{
    let outcome = null;
    await db.runTransaction(async tx => {
      const ms = await tx.get(mRef);
      if (!ms.exists) throw new Error('Motion introuvable.');
      const m = ms.data();
      if (m.status !== 'open') return;                    // deja resolue ailleurs
      const { verdict } = motionTally(m);

      if (verdict === 'rejected'){
        tx.update(mRef, { status:'rejected', resolvedAt: Date.now() });
        outcome = 'rejected'; return;
      }
      const tRef = db.collection(COL.teams).doc(m.teamId);
      const ts = await tx.get(tRef);
      const pot = ts.exists ? (Number(ts.data().pot)||0) : 0;
      if (pot < m.amount){
        tx.update(mRef, { status:'failed', failReason:'Cagnotte insuffisante au moment de la clôture.',
                          resolvedAt: Date.now() });
        outcome = 'failed'; return;
      }
      tx.update(tRef, { pot: pot - m.amount });
      tx.update(mRef, { status:'approved', resolvedAt: Date.now() });
      ledgerEntry(tx, {
        type: MV.potOut, shares: m.amount,
        from: potParty(m.teamId), fromName: 'Cagnotte ' + (ts.data().name || m.teamId),
        to: PARTY.company, toName: PARTY_NAME.__company__,
        label: m.label
      });
      // une activite achetee devient exploitable par l'equipe
      if (m.ownable){
        tx.set(db.collection(COL.activities).doc(), {
          name: m.label, desc: m.desc || '', icon: m.icon || '',
          itemId: m.itemId || null, teamId: m.teamId,
          fee: 0, revenue: 0, plays: 0, ts: Date.now()
        });
      }
      // une commande a remettre, pour que l'orga sache quoi livrer
      tx.set(db.collection(COL.orders).doc(), {
        teamId: m.teamId, teamName: ts.data().name || m.teamId,
        playerId: null, playerName: 'Cagnotte ' + (ts.data().name || m.teamId),
        itemId: m.itemId || null, itemName: m.label, qty:1,
        unitPrice: m.amount, total: m.amount,
        status:'pending', ts: Date.now()
      });
      outcome = 'approved';
    });
    return { ok:true, outcome };
  }catch(e){ return { ok:false, error: e.message }; }
}

/** Cloture toutes les motions arrivees a terme. A appeler periodiquement. */
async function sweepMotions(){
  try{
    const qs = await db.collection(COL.motions).where('status','==','open').get();
    const due = qs.docs.filter(d => Date.now() > Number(d.data().expiresAt||0));
    for (const d of due) await resolveMotion(d.id);
    return { ok:true, resolved: due.length };
  }catch(e){ return { ok:false, error:e.message }; }
}

/* ============================================================
   ACTIVITES ET PEAGES
   ============================================================ */

/** N'importe quel membre de l'equipe proprietaire fixe le tarif. */
async function setActivityFee(activityId, fee, playerId, playerTeam){
  const f = Math.max(0, Math.round(Number(fee)||0));
  try{
    const ref = db.collection(COL.activities).doc(activityId);
    const s = await ref.get();
    if (!s.exists) return { ok:false, error:'Activité introuvable.' };
    if (s.data().teamId !== playerTeam)
      return { ok:false, error:'Cette activité n’est pas à ton équipe.' };
    await ref.update({ fee:f, feeBy:playerId, feeAt:Date.now() });
    return { ok:true };
  }catch(e){ return { ok:false, error:e.message }; }
}

/** Paiement d'un peage : les parts tombent dans la cagnotte proprietaire. */
async function payToll(playerId, activityId){
  const aRef = db.collection(COL.activities).doc(activityId);
  const pRef = db.collection(COL.players).doc(playerId);
  try{
    await db.runTransaction(async tx => {
      const [as_, ps] = await Promise.all([tx.get(aRef), tx.get(pRef)]);
      if (!as_.exists) throw new Error('Activité introuvable.');
      if (!ps.exists)  throw new Error('Compte introuvable.');
      const a = as_.data();
      const fee = Math.round(Number(a.fee)||0);
      if (fee <= 0) throw new Error('Cette activité est gratuite.');
      if (ps.data().team === a.teamId) throw new Error('C’est l’activité de ton équipe.');
      const bal = Number(ps.data().shares)||0;
      if (bal < fee) throw new Error('Tu n’as que ' + bal + ' part(s) en banque.');

      const tRef = db.collection(COL.teams).doc(a.teamId);
      const ts = await tx.get(tRef);
      if (!ts.exists) throw new Error('Équipe propriétaire introuvable.');

      tx.update(pRef, { shares: bal - fee });
      tx.update(tRef, { pot: (Number(ts.data().pot)||0) + fee });
      tx.update(aRef, { revenue: (Number(a.revenue)||0) + fee, plays: (Number(a.plays)||0) + 1 });
      ledgerEntry(tx, {
        type: MV.toll, shares: fee,
        from: playerId, fromName: ps.data().pseudo || playerId,
        to: potParty(a.teamId), toName: 'Cagnotte ' + (ts.data().name || a.teamId),
        label: 'Péage — ' + (a.name || 'activité')
      });
    });
    return { ok:true };
  }catch(e){ return { ok:false, error: e.message || 'Paiement refusé.' }; }
}

/* ---------- Achat personnel au shop ---------- */
async function purchase(playerId, itemId, qty){
  const n = Math.max(1, Math.round(Number(qty)||1));
  const pRef = db.collection(COL.players).doc(playerId);
  const sRef = db.collection(COL.shop).doc('catalog');
  const tRef = treasuryRef();
  try{
    await db.runTransaction(async tx => {
      const [ps, ss, ts] = await Promise.all([tx.get(pRef), tx.get(sRef), tx.get(tRef)]);
      if (!ps.exists) throw new Error('Compte introuvable.');
      if (!ss.exists) throw new Error('Catalogue indisponible.');
      const items = (ss.data().items || []).slice();
      const i = items.findIndex(x => x.id === itemId);
      if (i < 0) throw new Error('Article introuvable.');
      const it = Object.assign({}, items[i]);
      if (it.scope === 'team') throw new Error('Cet article s’achète sur la cagnotte d’équipe.');
      const tracked = it.stock !== undefined && it.stock !== null;
      if (tracked && Number(it.stock) < n) throw new Error('Stock insuffisant.');
      const total = (Number(it.price)||0) * n;
      const bal = Number(ps.data().shares)||0;
      if (bal < total) throw new Error('Tu n’as pas assez de parts en banque.');

      if (tracked){ it.stock = Number(it.stock) - n; items[i] = it; tx.update(sRef, { items }); }
      tx.update(pRef, { shares: bal - total });
      const t = ts.exists ? ts.data() : {};
      tx.set(tRef, { company: (Number(t.company)||0) + total }, { merge:true });
      tx.set(db.collection(COL.orders).doc(), {
        playerId, playerName: ps.data().pseudo || playerId, teamId: ps.data().team || null,
        itemId, itemName: it.name || itemId, qty:n,
        unitPrice: Number(it.price)||0, total, status:'pending', ts: Date.now()
      });
      ledgerEntry(tx, {
        type: MV.shop, shares: total,
        from: playerId, fromName: ps.data().pseudo || playerId,
        to: PARTY.company, toName: PARTY_NAME.__company__,
        label: (it.name || itemId) + (n > 1 ? ' ×' + n : '')
      });
    });
    return { ok:true };
  }catch(e){ return { ok:false, error: e.message || 'Achat refusé.' }; }
}

/* ---------- Guichet : file d'attente ---------- */
async function fileRequest(playerId, playerName, kind, qty){
  const n = Math.round(Number(qty)||0);
  if (n <= 0) return { ok:false, error:'Nombre de jetons invalide.' };
  if (kind !== 'withdraw' && kind !== 'deposit') return { ok:false, error:'Type inconnu.' };
  try{
    const dup = await db.collection(COL.requests)
      .where('playerId','==',playerId).where('status','==','pending').get();
    if (!dup.empty) return { ok:false, error:'Tu as déjà une demande en attente au guichet.' };
    await db.collection(COL.requests).add({
      playerId, playerName, kind, qty:n, status:'pending', ts: Date.now()
    });
    return { ok:true };
  }catch(e){ return { ok:false, error: e.message || 'Demande refusée.' }; }
}

/* ============================================================
   SCRUTIN HYBRIDE — urnes physiques + voix de l'app

   Les OPTIONS sont les EQUIPES. Chaque joueur peut :
     · deposer ses jetons physiques dans l'urne d'une equipe (l'orga saisit
       le comptage par urne au depouillement) ;
     · ET convertir ses parts en banque en voix dans l'app, reparties
       librement, en UN SEUL passage definitif.
   Total d'une equipe = urne + voix de l'app.
   ============================================================ */
const voteRef = () => db.collection(COL.vote).doc('current');

async function castBallot(playerId, playerName, alloc){
  const clean = {}; let total = 0;
  for (const k in (alloc||{})){
    const n = Math.max(0, Math.round(Number(alloc[k])||0));
    if (n > 0){ clean[k] = n; total += n; }
  }
  if (total <= 0) return { ok:false, error:'Engage au moins une part.' };

  const pRef = db.collection(COL.players).doc(playerId);
  const bRef = db.collection(COL.ballots).doc(playerId);
  const vRef = voteRef();
  try{
    await db.runTransaction(async tx => {
      const [ps, bs, vs] = await Promise.all([tx.get(pRef), tx.get(bRef), tx.get(vRef)]);
      if (!ps.exists) throw new Error('Compte introuvable.');
      if (!vs.exists || vs.data().status !== VOTE_STATUS.open)
        throw new Error('Le scrutin n’est pas ouvert.');
      const v = vs.data();
      if (v.closesAt && Date.now() > Number(v.closesAt)) throw new Error('Le scrutin est clos.');
      if (bs.exists) throw new Error('Tu as déjà voté. Le bulletin est définitif.');
      const avail = Number(ps.data().shares)||0;
      if (total > avail)
        throw new Error('Tu n’as que ' + avail + ' part(s) en banque. ' +
          'Dépose tes jetons au guichet pour en convertir plus, ou mets-les dans une urne.');

      tx.update(pRef, { shares: avail - total, engaged: (Number(ps.data().engaged)||0) + total });
      tx.set(bRef, { playerId, playerName, alloc: clean, total, ts: Date.now() });
      const upd = {}; upd['voted.' + playerId] = total;   // le poids, pas le detail
      tx.update(vRef, upd);
      ledgerEntry(tx, {
        type: MV.vote, shares: total,
        from: playerId, fromName: playerName || playerId,
        to: PARTY.urn, toName: PARTY_NAME.__urn__,
        label: 'Conversion en ' + total + ' voix'
      });
    });
    return { ok:true };
  }catch(e){ return { ok:false, error: e.message || 'Vote refusé.' }; }
}

async function myBallot(playerId){
  try{
    const s = await db.collection(COL.ballots).doc(playerId).get();
    return s.exists ? s.data() : null;
  }catch(e){ return null; }
}

/** L'orga saisit le comptage d'une urne physique. */
async function setUrn(teamId, count){
  const n = Math.max(0, Math.round(Number(count)||0));
  try{
    const upd = {}; upd['urns.' + teamId] = n;
    await voteRef().set(upd, { merge:true });
    return { ok:true };
  }catch(e){ return { ok:false, error:e.message }; }
}

/**
 * Depouillement : urnes + voix de l'app, puis restitution des parts engagees.
 */
async function tallyVote(){
  try{
    const vs = await voteRef().get();
    if (!vs.exists) return { ok:false, error:'Aucun scrutin.' };
    const v = vs.data();
    const [bs, ps, tms] = await Promise.all([
      db.collection(COL.ballots).get(),
      db.collection(COL.players).get(),
      db.collection(COL.teams).get()
    ]);
    const active = {};
    ps.docs.forEach(d => { if (d.data().active !== false) active[d.id] = true; });

    const byTeam = {};
    tms.docs.forEach(d => {
      byTeam[d.id] = { name: d.data().name || d.id, color: d.data().color || '',
                       vision: d.data().secret || '', app:0, urn:0, total:0, voters:0 };
    });

    let voters = 0, voidShares = 0;
    bs.docs.forEach(d => {
      const b = d.data();
      if (!active[b.playerId]) return;
      let counted = false;
      for (const k in (b.alloc||{})){
        const n = Math.max(0, Math.round(Number(b.alloc[k])||0));
        if (!n) continue;
        if (byTeam[k]){ byTeam[k].app += n; byTeam[k].voters += 1; counted = true; }
        else voidShares += n;                      // equipe supprimee depuis
      }
      if (counted) voters++;
    });

    const urns = v.urns || {};
    for (const k in byTeam){
      byTeam[k].urn   = Math.max(0, Math.round(Number(urns[k])||0));
      byTeam[k].total = byTeam[k].app + byTeam[k].urn;
    }
    const ranked = Object.keys(byTeam).map(id => Object.assign({ id }, byTeam[id]))
      .sort((a,b) => b.total - a.total);
    const expressed = ranked.reduce((a,o) => a + o.total, 0);
    const tie = !!(ranked.length > 1 && ranked[0].total === ranked[1].total && ranked[0].total > 0);
    const winner = (ranked.length && ranked[0].total > 0 && !tie) ? ranked[0] : null;

    await voteRef().set({
      status: VOTE_STATUS.closed, closedAt: Date.now(),
      results: { ranked, expressed, voters, voidShares,
                 winnerId: winner ? winner.id : null, tie, ts: Date.now() }
    }, { merge:true });

    const rel = await releaseEngaged();
    return { ok:true, voters, expressed, released: rel.released };
  }catch(e){ return { ok:false, error: e.message || 'Dépouillement impossible.' }; }
}

/** Rend les parts engagees (shares += engaged). Idempotent. */
async function releaseEngaged(){
  try{
    const ps = await db.collection(COL.players).get();
    const todo = ps.docs.filter(d => (Number(d.data().engaged)||0) > 0);
    if (!todo.length) return { ok:true, released:0 };
    let released = 0;
    for (let i = 0; i < todo.length; i += 200){
      const batch = db.batch();
      todo.slice(i, i+200).forEach(d => {
        const n = Number(d.data().engaged)||0;
        batch.update(d.ref, { shares: (Number(d.data().shares)||0) + n, engaged: 0 });
        batch.set(db.collection(COL.ledger).doc(), {
          type: MV.release, shares:n, ts: Date.now(),
          from: PARTY.urn, fromName: PARTY_NAME.__urn__,
          to: d.id, toName: d.data().pseudo || d.id,
          label: 'Parts rendues après le scrutin'
        });
        released += n;
      });
      await batch.commit();
    }
    return { ok:true, released };
  }catch(e){ return { ok:false, error: e.message }; }
}

/** Remet le scrutin a zero (bulletins, urnes, resultats). */
async function resetVote(){
  try{
    await releaseEngaged();
    const bs = await db.collection(COL.ballots).get();
    for (let i = 0; i < bs.docs.length; i += 400){
      const batch = db.batch();
      bs.docs.slice(i, i+400).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    await voteRef().set({
      status: VOTE_STATUS.draft,
      voted:   firebase.firestore.FieldValue.delete(),
      urns:    firebase.firestore.FieldValue.delete(),
      results: firebase.firestore.FieldValue.delete()
    }, { merge:true });
    return { ok:true };
  }catch(e){ return { ok:false, error: e.message }; }
}
