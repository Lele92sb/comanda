// Lettore di supabase/admin.sql per i test.
//
// Il SQL non lo si può eseguire da qui: non ci sono credenziali, e non devono
// esserci. Ma le regole che questo progetto ha già pagato care — "mai FOR ALL",
// "il controllo dei permessi come prima istruzione", "il registro non si
// modifica" — sono verificabili sul testo, e sul testo vanno verificate: sono
// esattamente il genere di riga che sparisce in una modifica frettolosa.
//
// Quello che qui NON si dimostra, e va provato a mano sul database vero, sta
// scritto in fondo a supabase/admin.sql, nella sezione di verifica manuale.
import { readFileSync } from 'node:fs';

export const SORGENTE = readFileSync('supabase/admin.sql', 'utf8');

// Il testo senza commenti: "-- for all" dentro una spiegazione non è una policy,
// e un test che non lo distingue diventa un test che si aggira scrivendo prosa.
export const CODICE = SORGENTE
  .split('\n')
  .map(riga => riga.replace(/--.*$/, ''))
  .join('\n');

/**
 * Le funzioni definite nel file, con intestazione e corpo separati.
 * @returns {{nome:string, parametri:string, intestazione:string, corpo:string}[]}
 */
export function funzioni() {
  const re = /create or replace function\s+public\.([a-z0-9_]+)\s*\(([^)]*)\)\s*([\s\S]*?)\bas\s*\$\$([\s\S]*?)\$\$;/gi;
  const trovate = [];
  let m;
  while ((m = re.exec(CODICE)) !== null) {
    trovate.push({ nome: m[1], parametri: m[2], intestazione: m[3], corpo: m[4] });
  }
  return trovate;
}

/** Le funzioni che un utente autenticato può davvero chiamare. */
export function funzioniConcesse() {
  return funzioni().filter(f =>
    new RegExp(`grant execute on function\\s+public\\.${f.nome}\\s*\\([^)]*\\)\\s*\\n?\\s*to [^;]*authenticated`, 'i')
      .test(CODICE));
}

/**
 * La prima istruzione eseguibile del corpo: si salta il blocco `declare`, che
 * dichiara e basta, e i righi vuoti.
 */
export function primaIstruzione(corpo) {
  const senzaDeclare = /\bbegin\b/i.test(corpo)
    ? corpo.slice(corpo.search(/\bbegin\b/i) + 'begin'.length)
    : corpo;                                  // funzioni sql: il corpo è la query
  return senzaDeclare.trim().split(';')[0].replace(/\s+/g, ' ').trim();
}

/** Le policy dichiarate nel file: nome, tabella, operazione. */
export function policy() {
  const re = /create policy\s+([a-z0-9_]+)\s+on\s+public\.([a-z0-9_]+)\s+for\s+([a-z ]+?)\s+(using|with check)/gi;
  const trovate = [];
  let m;
  while ((m = re.exec(CODICE)) !== null) {
    trovate.push({ nome: m[1], tabella: m[2], operazione: m[3].trim().toLowerCase() });
  }
  return trovate;
}
