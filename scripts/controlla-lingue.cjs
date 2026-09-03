#!/usr/bin/env node
/* ============================================================================
   LE TRADUZIONI SI CONTANO, NON SI SPERANO.

   Fino a ieri i dizionari erano scritti a mano e nessuno sapeva quanto
   coprissero. Una frase nuova nel codice non rompeva niente: compariva in
   italiano dentro l'app inglese, e per accorgersene bisognava aprire quella
   schermata in quella lingua. E' cosi' che una traduzione muore — non tutta
   insieme, una frase alla volta.

   Questo passa il codice e raccoglie OGNI frase traducibile:

     t('...')            nelle chiamate, comprese quelle con {segnaposti}
     frase('...')        dove il testo e' un DATO e si traduce molto dopo —
                         le etichette della navigazione, per esempio
     data-t              nel markup, dove la chiave e' il testo italiano stesso
     data-t-title        e data-t-placeholder, che sono attributi

   Poi confronta con i dizionari e dice cosa manca e cosa avanza. Le voci che
   AVANZANO contano quanto quelle che mancano: sono frasi cambiate nel codice
   che hanno lasciato indietro la loro traduzione, e restano li' a far credere
   che sia coperta.

   Non fallisce se manca qualcosa — le traduzioni si completano nel tempo, e
   bloccare la pubblicazione per una frase non tradotta fermerebbe il lavoro
   vero. Fallisce solo se un dizionario e' ROTTO (non e' JSON, o ha una voce
   vuota): quello si', perche' e' un guasto, non un lavoro a meta'.

       node scripts/controlla-lingue.cjs            il riassunto
       node scripts/controlla-lingue.cjs --mancanti elenca cosa manca
       node scripts/controlla-lingue.cjs --scrivi   riempie i buchi con
                                                    l'italiano, da tradurre
   ============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const RADICE = path.join(__dirname, '..');
const SORGENTI = path.join(RADICE, 'app');
const DIZIONARI = path.join(RADICE, 'app', 'src', 'lingue');

function file(dir, filtro, trovati = []) {
  for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, voce.name);
    if (voce.isDirectory()) {
      if (voce.name === 'node_modules' || voce.name === 'lingue') continue;
      file(p, filtro, trovati);
    } else if (filtro.test(voce.name)) trovati.push(p);
  }
  return trovati;
}

/* Le chiamate a t(). Si accettano apici singoli, doppi e backtick, con gli
   apici sfuggiti dentro — «t('Non c\'e' niente')» e' la forma piu' comune in
   un'app scritta in italiano, e una regex che non la prevede perde proprio le
   frasi piu' lunghe. Un backtick con ${...} dentro si SALTA: quella non e' una
   frase, e' un pezzo di frase, e va sistemata nel codice con {segnaposto}. */
const CHIAMATE = /(?:\bt|\bfrase)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`([^`$]*)`)\s*[,)]/g;

function daiSorgenti() {
  const frasi = new Map(); // frase -> insieme di file
  const aggiungi = (frase, dove) => {
    const f = frase.trim();
    if (!f) return;
    if (!frasi.has(f)) frasi.set(f, new Set());
    frasi.get(f).add(path.relative(RADICE, dove).replace(/\\/g, '/'));
  };

  for (const p of file(SORGENTI, /\.(js|ts)$/)) {
    if (p.includes(`${path.sep}banco${path.sep}`)) continue; // il banco non si traduce
    const testo = fs.readFileSync(p, 'utf8');
    let m;
    CHIAMATE.lastIndex = 0;
    while ((m = CHIAMATE.exec(testo))) {
      const grezza = m[1] ?? m[2] ?? m[3] ?? '';
      // Le sequenze sfuggite tornano com'erano: la chiave e' la frase VERA.
      aggiungi(grezza.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\'), p);
    }
  }

  for (const p of file(SORGENTI, /\.html$/)) {
    const testo = fs.readFileSync(p, 'utf8');
    // data-t sul contenuto: la chiave e' il testo dentro l'elemento.
    for (const m of testo.matchAll(/<([a-z0-9-]+)([^>]*\bdata-t\b[^>]*)>([\s\S]*?)<\/\1>/gi)) {
      const attributi = m[2];
      if (/data-t-(title|placeholder)/.test(attributi) && !/\bdata-t(?=[\s>])/.test(attributi)) continue;
      const dentro = m[3].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      if (dentro && !dentro.includes('{{')) aggiungi(dentro, p);
    }
    // data-t-title e data-t-placeholder: la chiave e' il valore dell'attributo.
    for (const attributo of ['title', 'placeholder']) {
      const re = new RegExp(`<[a-z0-9-]+[^>]*\\b${attributo}="([^"]*)"[^>]*\\bdata-t-${attributo}\\b`, 'gi');
      for (const m of testo.matchAll(re)) aggiungi(m[1], p);
      const re2 = new RegExp(`<[a-z0-9-]+[^>]*\\bdata-t-${attributo}\\b[^>]*\\b${attributo}="([^"]*)"`, 'gi');
      for (const m of testo.matchAll(re2)) aggiungi(m[1], p);
    }
  }
  return frasi;
}

function leggiDizionario(codice) {
  const p = path.join(DIZIONARI, codice + '.json');
  if (!fs.existsSync(p)) return null;
  let d;
  try { d = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return { rotto: 'non e\' JSON valido: ' + e.message }; }
  if (d === null || typeof d !== 'object' || Array.isArray(d)) {
    return { rotto: 'deve essere un oggetto {frase: traduzione}' };
  }
  for (const [k, v] of Object.entries(d)) {
    if (typeof v !== 'string' || !v.trim()) {
      return { rotto: `la voce «${k}» non ha una traduzione` };
    }
  }
  return { voci: d, percorso: p };
}

function main() {
  const argomenti = process.argv.slice(2);
  const elenca = argomenti.includes('--mancanti');
  const scrivi = argomenti.includes('--scrivi');

  const frasi = daiSorgenti();
  const chiavi = [...frasi.keys()].sort((a, b) => a.localeCompare(b, 'it'));
  const lingue = fs.existsSync(DIZIONARI)
    ? fs.readdirSync(DIZIONARI).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
    : [];

  console.log(`Frasi traducibili nel codice: ${chiavi.length}`);
  let guasto = false;

  for (const codice of lingue) {
    const d = leggiDizionario(codice);
    if (d.rotto) { console.error(`  ${codice}: DIZIONARIO ROTTO — ${d.rotto}`); guasto = true; continue; }

    const mancanti = chiavi.filter(k => !(k in d.voci));
    const avanzate = Object.keys(d.voci).filter(k => !frasi.has(k));
    const coperte = chiavi.length - mancanti.length;
    const pct = chiavi.length ? Math.round(coperte / chiavi.length * 100) : 100;

    console.log(`  ${codice}: ${coperte}/${chiavi.length} (${pct}%)` +
      (mancanti.length ? `, ${mancanti.length} da tradurre` : '') +
      (avanzate.length ? `, ${avanzate.length} non piu' nel codice` : ''));

    if (elenca && mancanti.length) {
      console.log(`\n  --- ${codice}: da tradurre ---`);
      for (const k of mancanti) console.log(`    ${JSON.stringify(k)}`);
    }
    if (elenca && avanzate.length) {
      console.log(`\n  --- ${codice}: non piu' nel codice (la frase e' cambiata?) ---`);
      for (const k of avanzate) console.log(`    ${JSON.stringify(k)}`);
    }
    if (scrivi && mancanti.length) {
      // Si riempie con l'ITALIANO, non con una stringa vuota: una voce vuota a
      // schermo e' un buco, l'italiano e' almeno leggibile — la stessa ragione
      // per cui la chiave e' la frase italiana e non un codice.
      const nuovo = {};
      for (const k of [...new Set([...Object.keys(d.voci), ...chiavi])].sort((a, b) => a.localeCompare(b, 'it'))) {
        nuovo[k] = d.voci[k] ?? k;
      }
      fs.writeFileSync(d.percorso, JSON.stringify(nuovo, null, 2) + '\n', 'utf8');
      console.log(`  ${codice}: aggiunte ${mancanti.length} voci da tradurre (per ora in italiano)`);
    }
  }

  if (!lingue.length) console.log('  nessun dizionario in app/src/lingue/');
  if (guasto) process.exit(1);
}

main();
