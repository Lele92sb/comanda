// Test della valuta (app/src/core/valuta.ts).
//
// Perche' questi test esistono: il difetto che hanno trovato non era «manca il
// dollaro», era «il numero e' scritto in inglese». `'€ ' + n.toFixed(2)` dava
// «€ 18.00» anche in italiano, dove si scrive «18,00 €». Un errore che si vede
// solo se qualcuno lo guarda con attenzione, e che nessuno guarda perche' i
// prezzi sembrano prezzi.
//
// Si controlla il RISULTATO, non che sia stata chiamata la funzione giusta:
// una cosa che si puo' controllare solo eseguendo, ed e' il motivo per cui
// questo modulo non tocca il DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { VALUTE, VALUTA_PREDEFINITA, cifreDi, formatta, impostaLingua,
         impostaValuta, simboloDi, soldi, soldiUnitari, valuta,
         valutaValida } from '../app/src/core/valuta.ts';

// Gli spazi che Intl usa fra numero e simbolo sono spazi UNIFICATORI
// (U+00A0, U+202F), non lo spazio della barra: confrontarli con uno spazio
// normale farebbe fallire i test per un motivo che non c'entra niente.
const piatto = s => s.replace(/[   ]/g, ' ');

test('in italiano l\'euro si scrive con la virgola e il segno in fondo', () => {
  assert.equal(piatto(formatta(18, 'EUR', 'it')), '18,00 €');
  // Il punto delle migliaia in italiano parte da CINQUE cifre, non da quattro:
  // «1234,50 €» e «12.345,00 €» sono tutti e due giusti. Il primo tentativo di
  // questo test pretendeva «1.234,50 €» e falliva — sbagliava il test, non il
  // codice. E' esattamente il genere di regola che nessuno ricorda e che non
  // ha senso riscrivere a mano: la sa gia' il browser.
  assert.equal(piatto(formatta(1234.5, 'EUR', 'it')), '1234,50 €');
  assert.equal(piatto(formatta(12345, 'EUR', 'it')), '12.345,00 €');
});

test('in inglese lo stesso importo si scrive col punto e il segno davanti', () => {
  assert.equal(piatto(formatta(18, 'EUR', 'en')), '€18.00');
  assert.equal(piatto(formatta(18, 'USD', 'en')), '$18.00');
  assert.equal(piatto(formatta(18, 'GBP', 'en')), '£18.00');
});

test('lo yen non ha decimali, e non glieli si mettono', () => {
  // E' il caso che una tabella scritta a mano sbaglia sempre.
  assert.equal(cifreDi('JPY'), 0);
  assert.equal(piatto(formatta(1800, 'JPY', 'ja')), '￥1,800');
  // Anche letto in italiano resta senza decimali: le cifre le decide la
  // VALUTA, non chi la guarda.
  assert.ok(!piatto(formatta(1800, 'JPY', 'it')).includes(',00'),
            'lo yen non deve avere centesimi');
});

test('i prezzi al chilo hanno una cifra in piu\' di quelli normali', () => {
  // 2,847 al chilo per venti chili fa sei centesimi di differenza fra la terza
  // cifra tenuta e la terza cifra buttata: sui costi si vede.
  assert.equal(piatto(formatta(2.847, 'EUR', 'it', 1)), '2,847 €');
  assert.equal(piatto(formatta(2.847, 'EUR', 'it', 0)), '2,85 €');
  // E anche dove le cifre di partenza sono zero.
  assert.equal(cifreDi('JPY') + 1, 1);
});

test('un codice valuta sconosciuto non fa sparire il prezzo', () => {
  const r = formatta(18, 'ZZZ', 'it');
  assert.ok(r.includes('18'), 'il numero deve restare leggibile: ' + r);
});

test('valutaValida riconosce i codici veri e rifiuta il resto', () => {
  assert.equal(valutaValida('EUR'), true);
  assert.equal(valutaValida('JPY'), true);
  assert.equal(valutaValida('eur'), false, 'ISO 4217 e\' maiuscolo');
  assert.equal(valutaValida('EURO'), false);
  assert.equal(valutaValida(''), false);
  assert.equal(valutaValida(null), false);
  assert.equal(valutaValida(undefined), false);
  assert.equal(valutaValida(42), false);
});

test('una valuta sbagliata non rompe l\'app: si torna all\'euro', () => {
  // Un dato guasto nel database non deve lasciare i prezzi senza segno.
  impostaValuta('MARZIANO');
  assert.equal(valuta(), VALUTA_PREDEFINITA);
  impostaValuta(null);
  assert.equal(valuta(), VALUTA_PREDEFINITA);
});

test('cambiare valuta cambia tutti gli importi, senza toccare i numeri', () => {
  impostaLingua('it');
  impostaValuta('EUR');
  assert.equal(piatto(soldi(18)), '18,00 €');
  impostaValuta('GBP');
  assert.ok(piatto(soldi(18)).includes('18,00'), 'il numero non cambia');
  assert.ok(soldi(18).includes('£') || soldi(18).includes('GBP'));
  impostaValuta('EUR');
});

test('cambiare lingua cambia come si scrive, non quanto vale', () => {
  impostaValuta('EUR');
  impostaLingua('it');
  const it = piatto(soldi(1234.5));
  impostaLingua('en');
  const en = piatto(soldi(1234.5));
  assert.equal(it, '1234,50 €');
  assert.equal(en, '€1,234.50');
  impostaLingua('it');
});

test('soldiUnitari tiene una cifra in piu\' di soldi', () => {
  impostaLingua('it'); impostaValuta('EUR');
  assert.equal(piatto(soldi(2.847)), '2,85 €');
  assert.equal(piatto(soldiUnitari(2.847)), '2,847 €');
});

test('un importo non numerico vale zero invece di scrivere NaN', () => {
  impostaLingua('it'); impostaValuta('EUR');
  assert.equal(piatto(soldi(NaN)), '0,00 €');
  assert.equal(piatto(soldi(Infinity)), '0,00 €');
  assert.equal(piatto(soldi(undefined)), '0,00 €');
});

test('il simbolo si ricava dal formato, non da una seconda tabella', () => {
  assert.equal(simboloDi('EUR', 'it'), '€');
  assert.equal(simboloDi('GBP', 'en'), '£');
  assert.equal(simboloDi('USD', 'en'), '$');
});

test('ogni valuta dell\'elenco e\' formattabile davvero', () => {
  // La lista e' scritta a mano: questo e' il controllo che nessuno ci abbia
  // messo un codice inventato, che a schermo diventerebbe un prezzo senza segno.
  for (const v of VALUTE) {
    assert.equal(valutaValida(v.codice), true, v.codice + ' non e\' una valuta valida');
    assert.ok(v.nome && v.nome.length > 2, v.codice + ' senza nome leggibile');
    const r = formatta(1, v.codice, 'it');
    assert.ok(r.includes('1'), v.codice + ' non formatta: ' + r);
  }
  const codici = VALUTE.map(v => v.codice);
  assert.equal(new Set(codici).size, codici.length, 'ci sono valute ripetute');
  assert.ok(codici.includes(VALUTA_PREDEFINITA), 'la predefinita deve stare nell\'elenco');
});
