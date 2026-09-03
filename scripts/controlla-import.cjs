// ============================================================================
// DUE CONTROLLI, ENTRAMBI SU COSE CHE NESSUN ALTRO STRUMENTO VEDE.
//
// 1. SIMBOLI NON IMPORTATI (solo nei file .js)
//    Un identificatore usato e mai importato non lo vede ne' il compilatore ne'
//    il bundler: scoppia a schermo, davanti a chi usa l'app. E' gia' successo
//    quattro volte prima che questo controllo esistesse.
//    Vale SOLO per i .js, perche' i .ts li controlla tsc — che fa lo stesso
//    lavoro molto meglio e senza inventarsi problemi che non ci sono. Questo
//    qui e' un cercatore ingenuo: cerca parole. Sul TypeScript trovava «state»
//    dentro `{ type: Boolean, state: true }` e chiedeva di importarlo.
//
// 2. I CONFINI FRA GLI STRATI (tutti i file)
//    Questa e' la parte nuova, e serve a una cosa sola: fare in modo che
//    l'architettura resista alle persone. Una regola scritta in un documento
//    dura finche' qualcuno ha fretta; una regola che fa fallire la pipeline
//    dura sempre.
//
//    Gli strati che contano:
//
//    ds/   il design system. NON SA NIENTE DI COMANDA: non conosce i turni,
//          le cucine, i ruoli, il database. Puo' importare solo `lit` e se
//          stesso. E' cio' che rende ogni componente provabile da solo nel
//          banco, e riusabile in una qualsiasi altra schermata.
//
//    lib/  il motore: turni, fatture, configurazione. Non tocca lo schermo e
//          non importa niente dall'app. E' il motivo per cui logic.js gira
//          dentro Node e ha 153 test: se un giorno importasse una vista, i
//          test si porterebbero dietro il DOM e morirebbero.
//
//    core/ stato, lingua, errori, backup. Puo' scendere in lib/, non salire
//          nelle cartelle delle funzionalita'.
//
//    Chi vuole cambiare un confine cambia la tabella qui sotto, e cosi' la
//    modifica si vede nella revisione invece di succedere di nascosto.
// ============================================================================
const fs = require('fs');
const path = require('path');

const elenca = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? elenca(path.join(d, e.name)) : [path.join(d, e.name)]);

const normalizza = p => p.replace(/\\/g, '/');
const cartellaDi = p => {
  const resto = normalizza(p).split('app/src/')[1] || '';
  return resto.includes('/') ? resto.split('/')[0] : '(radice)';
};

const FILE = elenca('app/src').filter(x => /\.(js|ts)$/.test(x));
let problemi = 0;

/* ========================= 1. SIMBOLI NON IMPORTATI ========================= */

const DA_CONTROLLARE = ['esc', 't', 'lingua', 'toast', 'save', 'state', 'uid', 'Cloud', 'conferma', 'chiediTesto'];

for (const f of FILE.filter(x => x.endsWith('.js'))) {
  const testo = fs.readFileSync(f, 'utf8');
  const corpo = testo.replace(/^import .*$/gm, '')
                     .replace(/\/\*[\s\S]*?\*\//g, ' ')
                     .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

  for (const nome of DA_CONTROLLARE) {
    // "t" è una lettera sola e finisce ovunque: come parametro di una funzione
    // (tips.map(t => ...)) o dentro una stringa. Si conta solo quando viene
    // chiamata con un testo, che è l'unico modo in cui la usiamo davvero.
    const usato = nome === 't'
      ? /(^|[^\w.$])t\(\s*['"`]/.test(corpo)
      : new RegExp('(^|[^\\w.$])' + nome + '(\\s*\\(|[^\\w$])').test(corpo);
    if (!usato) continue;
    const importato = new RegExp('import\\s*\\{[^}]*\\b' + nome + '\\b[^}]*\\}').test(testo);
    const dichiarato = new RegExp('(function|const|let|var)\\s+' + nome + '\\b').test(testo);
    if (!importato && !dichiarato) {
      console.log('  MANCA "' + nome + '" in ' + normalizza(f).replace('app/src/', ''));
      problemi++;
    }
  }
}

/* ============================ 2. I CONFINI ================================= */

// Per ogni strato: dove PUO' arrivare dentro app/src, e quali pacchetti esterni
// puo' usare. Una cartella che non compare qui non e' ancora vincolata.
// `null` in `pacchetti` vuol dire "qualsiasi pacchetto".
const CONFINI = {
  ds:   { dentro: [],      pacchetti: ['lit'] },
  lib:  { dentro: [],      pacchetti: ['@supabase/supabase-js', 'node-forge', 'fast-xml-parser'] },
  core: { dentro: ['lib'], pacchetti: null },
};

// Debiti dichiarati: rotture note dei confini, con la ragione. Stare in questo
// elenco NON vuol dire che vada bene — vuol dire che si sa, e che si vede.
// Un'eccezione senza motivo scritto e' un'eccezione che nessuno togliera' mai.
const ECCEZIONI = [
  {
    da: 'core/backup.js',
    a: 'viste',
    perche: 'Ripristinando un backup la dashboard va ridisegnata. Andra via ' +
            'quando ci sara un canale di eventi e core potra dire "i dati sono ' +
            'cambiati" senza sapere chi ascolta.',
  },
];

const permessa = (daFile, aCartella) =>
  ECCEZIONI.some(e => normalizza(daFile).endsWith(e.da) && e.a === aCartella);

for (const f of FILE) {
  const da = cartellaDi(f);
  const regola = CONFINI[da];
  if (!regola) continue;
  const testo = fs.readFileSync(f, 'utf8');

  for (const m of testo.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const bersaglio = m[1];

    if (bersaglio.startsWith('.')) {
      const risolto = path.normalize(path.join(path.dirname(f), bersaglio));
      const a = cartellaDi(risolto);
      if (a === da || a === '(radice)' && da === '(radice)') continue;
      if (regola.dentro.includes(a) || permessa(f, a)) continue;
      console.log('  CONFINE  ' + normalizza(f).replace('app/src/', '') +
                  '  importa da  ' + a + '/  —  ' + da + '/ non puo\'');
      problemi++;
    } else if (regola.pacchetti) {
      const pacchetto = bersaglio.startsWith('@')
        ? bersaglio.split('/').slice(0, 2).join('/')
        : bersaglio.split('/')[0];
      if (regola.pacchetti.includes(pacchetto)) continue;
      console.log('  CONFINE  ' + normalizza(f).replace('app/src/', '') +
                  '  usa il pacchetto  ' + pacchetto + '  —  ' + da + '/ puo\' usare solo: ' +
                  regola.pacchetti.join(', '));
      problemi++;
    }
  }
}

console.log(problemi
  ? problemi + ' problemi'
  : 'import a posto e confini rispettati (' + FILE.length + ' moduli)');
process.exit(problemi ? 1 : 0);
