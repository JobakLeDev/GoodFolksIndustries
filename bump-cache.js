#!/usr/bin/env node
/* ============================================================
   bump-cache.js — anti-cache par empreinte de contenu

   Pourquoi : les pages référencent common/app.js et common/style.css sans
   version. GitHub Pages et les navigateurs mobiles mettent ça en cache très
   agressivement — un joueur peut rester bloqué tout un week-end sur une
   version périmée, sans aucun moyen de forcer le rechargement depuis son
   téléphone.

   Ce que fait le script : il ajoute « ?v=<md5 sur 8 caractères> » à chaque
   asset LOCAL référencé dans les .html. L'empreinte vient du CONTENU du
   fichier, donc :
     · le fichier ne change pas  -> l'URL ne change pas  -> le cache sert,
       et c'est très bien ;
     · le fichier change         -> l'URL change         -> le navigateur
       redemande, sans que personne ait à vider quoi que ce soit.

   Idempotent : relancer sans avoir rien modifié ne touche aucun fichier.
   Les URLs absolues (CDN, Google Fonts) sont ignorées.

   Usage :
     node bump-cache.js            met à jour les .html
     node bump-cache.js --check    ne modifie rien ; sort en code 1 s'il
                                   reste des versions périmées (pour un
                                   hook de pré-commit ou la CI)
   ============================================================ */

const fs   = require('fs');
const path = require('path');
const { createHash } = require('crypto');

const ROOT  = __dirname;
const CHECK = process.argv.includes('--check');

/* Types versionnés. Le JSON en est absent : il est chargé par fetch() avec
   cache:'no-cache', pas par une balise HTML. */
const VERSIONED = new Set(['.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico']);

/** Tous les .html du dépôt, hors .git et node_modules. */
function htmlFiles(dir, out = []){
  for (const e of fs.readdirSync(dir, { withFileTypes:true })){
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) htmlFiles(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const hash = file => createHash('md5')
  .update(fs.readFileSync(file)).digest('hex').slice(0, 8);

/** Une URL qu'on ne touche pas : externe, inline, ancre. */
const external = u => /^(https?:)?\/\//i.test(u) ||
  /^(data:|mailto:|tel:|#|\/)/i.test(u);

let changed = 0, stale = [], scanned = 0;

for (const file of htmlFiles(ROOT)){
  const before = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);

  const after = before.replace(
    /\b(src|href)="([^"]+)"/g,
    (whole, attr, url) => {
      if (external(url)) return whole;
      const [clean, query = ''] = url.split('?');
      if (!VERSIONED.has(path.extname(clean).toLowerCase())) return whole;

      const target = path.join(dir, decodeURIComponent(clean));
      if (!fs.existsSync(target)) return whole;   // référence cassée : le dire ailleurs
      scanned++;

      // on préserve d'éventuels autres paramètres, on ne remplace que v=
      const params = new URLSearchParams(query);
      const old = params.get('v');
      const now = hash(target);
      if (old === now) return whole;              // déjà à jour : on ne touche pas

      params.set('v', now);
      stale.push(path.relative(ROOT, target).replace(/\\/g,'/') +
                 (old ? '  ' + old + ' → ' + now : '  (non versionné) → ' + now));
      return attr + '="' + clean + '?' + params.toString() + '"';
    });

  if (after !== before){
    changed++;
    if (!CHECK) fs.writeFileSync(file, after);
  }
}

const rel = f => path.relative(ROOT, f).replace(/\\/g,'/');

if (!stale.length){
  console.log('Cache à jour — ' + scanned + ' référence(s) vérifiée(s), rien à faire.');
  process.exit(0);
}

console.log((CHECK ? 'Versions périmées :' : 'Mises à jour :'));
stale.forEach(s => console.log('  ' + s));
console.log('\n' + changed + ' fichier(s) HTML ' + (CHECK ? 'à corriger' : 'réécrit(s)') + '.');

if (CHECK){
  console.log('Lance « node bump-cache.js » puis recommite.');
  process.exit(1);
}
