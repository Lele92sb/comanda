// Test della lettura delle fatture elettroniche.
//
// Questo strato non era coperto da niente, e da qui escono i PREZZI D'ACQUISTO:
// un errore non si manifesta come un errore, si manifesta come un food cost
// sbagliato e quindi un prezzo di menu sbagliato. È il posto dove un bug costa
// soldi in silenzio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { leggiFatturaXML, unitaDaFattura } from '../app/src/ricettario/fatture/leggi.ts';

function fattura({ prefisso = '', righe = '', denominazione = 'Ortofrutta Rossi Srl' } = {}) {
  const p = prefisso ? prefisso + ':' : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<${p}FatturaElettronica versione="FPR12"${prefisso ? ` xmlns:${prefisso}="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2"` : ''}>
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>${denominazione}</Denominazione></Anagrafica>
      </DatiAnagrafici>
      <Sede><Indirizzo>Via Roma 1</Indirizzo><CAP>20100</CAP><Comune>Milano</Comune><Provincia>MI</Provincia></Sede>
      <Contatti><Telefono>021234567</Telefono><Email>ordini@rossi.it</Email></Contatti>
    </CedentePrestatore>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali><DatiGeneraliDocumento>
      <TipoDocumento>TD01</TipoDocumento><Numero>2026/447</Numero><Data>2026-08-20</Data>
    </DatiGeneraliDocumento></DatiGenerali>
    <DatiBeniServizi>
      ${righe || `<DettaglioLinee>
        <NumeroLinea>1</NumeroLinea>
        <Descrizione>Pomodoro San Marzano DOP</Descrizione>
        <Quantita>12.00</Quantita><UnitaMisura>KG</UnitaMisura>
        <PrezzoUnitario>2.40000</PrezzoUnitario>
      </DettaglioLinee>`}
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</${p}FatturaElettronica>`;
}

test('legge fornitore, contatti e righe da una FatturaPA', () => {
  const f = leggiFatturaXML(fattura());
  assert.equal(f.fornitore.nome, 'Ortofrutta Rossi Srl');
  assert.equal(f.fornitore.piva, '01234567890');
  assert.equal(f.fornitore.email, 'ordini@rossi.it');
  assert.equal(f.fornitore.indirizzo, 'Via Roma 1 - 20100 - Milano - MI');
  assert.equal(f.numero, '2026/447');
  assert.equal(f.data, '2026-08-20');
  assert.equal(f.righe.length, 1);
  assert.deepEqual(f.righe[0], {
    descrizione: 'Pomodoro San Marzano DOP',
    quantita: 12, unitaMisura: 'KG', prezzoUnitario: 2.4,
  });
});

test('i prefissi di namespace non cambiano il risultato', () => {
  // Ogni gestionale emette con un prefisso diverso (p:, ns2:, nessuno).
  const senza = leggiFatturaXML(fattura());
  const conP  = leggiFatturaXML(fattura({ prefisso: 'p' }));
  const conNs = leggiFatturaXML(fattura({ prefisso: 'ns2' }));
  assert.deepEqual(conP, senza);
  assert.deepEqual(conNs, senza);
});

test('la partita IVA resta testo: gli zeri iniziali non si perdono', () => {
  // Trattandola come numero, "01234567890" diventerebbe 1234567890 e il
  // fornitore non verrebbe più riconosciuto alla fattura successiva.
  const f = leggiFatturaXML(fattura());
  assert.equal(typeof f.fornitore.piva, 'string');
  assert.ok(f.fornitore.piva.startsWith('0'));
});

test('più righe sulla stessa fattura vengono lette tutte', () => {
  const righe = [1, 2, 3].map(n => `<DettaglioLinee>
      <NumeroLinea>${n}</NumeroLinea><Descrizione>Merce ${n}</Descrizione>
      <Quantita>${n}</Quantita><UnitaMisura>KG</UnitaMisura><PrezzoUnitario>${n}.50</PrezzoUnitario>
    </DettaglioLinee>`).join('');
  const f = leggiFatturaXML(fattura({ righe }));
  assert.equal(f.righe.length, 3);
  assert.equal(f.righe[2].prezzoUnitario, 3.5);
});

test('una riga senza quantità vale una unità, non zero', () => {
  // Capita sui servizi (trasporto, imballo): con zero il costo sparirebbe.
  const righe = `<DettaglioLinee><Descrizione>Trasporto</Descrizione><PrezzoUnitario>15.00</PrezzoUnitario></DettaglioLinee>`;
  const f = leggiFatturaXML(fattura({ righe }));
  assert.equal(f.righe[0].quantita, 1);
  assert.equal(f.righe[0].prezzoUnitario, 15);
});

test('le righe senza descrizione vengono ignorate, non importate vuote', () => {
  const righe = `<DettaglioLinee><Descrizione></Descrizione><PrezzoUnitario>9</PrezzoUnitario></DettaglioLinee>
                 <DettaglioLinee><Descrizione>Vera</Descrizione><PrezzoUnitario>3</PrezzoUnitario></DettaglioLinee>`;
  const f = leggiFatturaXML(fattura({ righe }));
  assert.equal(f.righe.length, 1);
  assert.equal(f.righe[0].descrizione, 'Vera');
});

test('un documento non valido viene rifiutato invece di produrre dati a caso', () => {
  assert.equal(leggiFatturaXML('non è xml'), null);
  assert.equal(leggiFatturaXML('<altro><cosa/></altro>'), null);
  // XML formalmente valido ma senza fornitore: non si importa nulla.
  assert.equal(leggiFatturaXML('<FatturaElettronica><FatturaElettronicaHeader/></FatturaElettronica>'), null);
  assert.equal(leggiFatturaXML(fattura({ denominazione: '' })), null);
});

test('le unità di misura delle fatture si riducono a quelle che l\'app sa gestire', () => {
  ['KG', 'Kg.', ' kg ', 'KGM', 'CHILI'].forEach(u =>
    assert.equal(unitaDaFattura(u), 'kg', `${u} doveva essere kg`));
  ['LT', 'L', 'lt.', 'LITRI'].forEach(u =>
    assert.equal(unitaDaFattura(u), 'l', `${u} doveva essere l`));
  ['NR', 'PZ', 'CT', 'CF', ''].forEach(u =>
    assert.equal(unitaDaFattura(u), 'pz', `${u} doveva essere pz`));
});

/* ===================== APPLICAZIONE AI DATI DELLA CUCINA ===================== */

import { applicaFatture } from '../app/src/ricettario/fatture/applica.ts';

let contatore = 0;
const nuovoId = () => 'id' + (++contatore);
const vuoto = () => ({ fornitori: [], ingredienti: [], giaImportati: [], storico: [] });
const doc = (id, xml) => ({ id, xml, etichetta: id });

test('la prima importazione crea fornitore e ingredienti', () => {
  const m = applicaFatture([doc('f1', fattura())], vuoto(), nuovoId);
  assert.equal(m.fornitoriNuovi, 1);
  assert.equal(m.ingredientiNuovi, 1);
  assert.equal(m.ingredienti[0].name, 'Pomodoro San Marzano DOP');
  assert.equal(m.ingredienti[0].price, 2.4);
  assert.equal(m.ingredienti[0].unit, 'kg');
  assert.equal(m.ingredienti[0].yieldPct, 100, 'la resa parte da 100 e la stima l\'AI dopo');
});

test('la stessa fattura importata due volte non duplica niente', () => {
  // È il caso che conta quando l'import diventerà automatico e girerà ogni
  // giorno sullo stesso periodo.
  const primo = applicaFatture([doc('f1', fattura())], vuoto(), nuovoId);
  const secondo = applicaFatture([doc('f1', fattura())], {
    fornitori: primo.fornitori, ingredienti: primo.ingredienti,
    giaImportati: primo.giaImportati, storico: primo.storico,
  }, nuovoId);
  assert.equal(secondo.saltatiPerchéGiàImportati, 1);
  assert.equal(secondo.ingredientiNuovi, 0);
  assert.equal(secondo.fornitoriNuovi, 0);
  assert.equal(secondo.ingredienti.length, 1);
});

test('una fattura nuova dello stesso fornitore aggiorna il prezzo, non duplica', () => {
  const primo = applicaFatture([doc('f1', fattura())], vuoto(), nuovoId);
  const rincaro = fattura({ righe: `<DettaglioLinee>
      <Descrizione>Pomodoro San Marzano DOP</Descrizione>
      <Quantita>10</Quantita><UnitaMisura>KG</UnitaMisura><PrezzoUnitario>3.00</PrezzoUnitario>
    </DettaglioLinee>` });
  const secondo = applicaFatture([doc('f2', rincaro)], {
    fornitori: primo.fornitori, ingredienti: primo.ingredienti,
    giaImportati: primo.giaImportati, storico: primo.storico,
  }, nuovoId);
  assert.equal(secondo.ingredientiNuovi, 0);
  assert.equal(secondo.ingredientiAggiornati, 1);
  assert.equal(secondo.ingredienti.length, 1);
  assert.equal(secondo.ingredienti[0].price, 3);
  assert.ok(secondo.resoconto[0].includes('+25%'), 'il rincaro va detto: ' + secondo.resoconto[0]);
});

test('il fornitore è riconosciuto dalla partita IVA anche se cambia la grafia del nome', () => {
  // "Ortofrutta Rossi Srl" e "ORTOFRUTTA ROSSI S.R.L." sono la stessa azienda:
  // senza questo, ogni fattura creerebbe un fornitore nuovo.
  const primo = applicaFatture([doc('f1', fattura())], vuoto(), nuovoId);
  const secondo = applicaFatture(
    [doc('f2', fattura({ denominazione: 'ORTOFRUTTA ROSSI S.R.L.' }))],
    { fornitori: primo.fornitori, ingredienti: primo.ingredienti,
      giaImportati: primo.giaImportati, storico: primo.storico },
    nuovoId);
  assert.equal(secondo.fornitoriNuovi, 0, 'la partita IVA coincide: è lo stesso fornitore');
  assert.equal(secondo.fornitori.length, 1);
});

test('lo stesso prodotto da due fornitori resta due ingredienti distinti', () => {
  // Hanno prezzi diversi: accorparli renderebbe impossibile confrontarli.
  const primo = applicaFatture([doc('f1', fattura())], vuoto(), nuovoId);
  const altro = fattura({ denominazione: 'Mercato Bianchi Spa' })
    .replace('01234567890', '09876543210');
  const secondo = applicaFatture([doc('f2', altro)], {
    fornitori: primo.fornitori, ingredienti: primo.ingredienti,
    giaImportati: primo.giaImportati, storico: primo.storico,
  }, nuovoId);
  assert.equal(secondo.fornitoriNuovi, 1);
  assert.equal(secondo.ingredientiNuovi, 1);
  assert.equal(secondo.ingredienti.length, 2);
});

test('un file illeggibile viene contato e non ferma gli altri', () => {
  const m = applicaFatture(
    [doc('rotto', 'non xml'), doc('buono', fattura())], vuoto(), nuovoId);
  assert.equal(m.scartati, 1);
  assert.equal(m.ingredientiNuovi, 1, 'la fattura buona va importata lo stesso');
  assert.ok(m.resoconto.some(r => r.includes('rotto')));
});

test('i dati di partenza non vengono modificati: la funzione è pura', () => {
  const dati = vuoto();
  applicaFatture([doc('f1', fattura())], dati, nuovoId);
  assert.equal(dati.fornitori.length, 0);
  assert.equal(dati.ingredienti.length, 0);
  assert.equal(dati.giaImportati.length, 0);
});

/* ===================== RIGHE DI SERVIZIO ===================== */

import { èRigaDiServizio } from '../app/src/ricettario/fatture/servizi.ts';

test('le voci di servizio vengono riconosciute', () => {
  ['Trasporto', 'Trasporto refrigerato', 'Imballo', 'Spese di trasporto',
   'Contributo CONAI', 'Cauzione bancali', 'Bollo', 'Arrotondamento',
   'Costi di consegna', 'Sconto'
  ].forEach(d => assert.equal(èRigaDiServizio(d), true, `"${d}" doveva essere servizio`));
});

test('la merce vera non viene scambiata per servizio', () => {
  // Nel dubbio si importa: scartare della merce fa sparire un costo dal food
  // cost, importare una voce di troppo è solo un fastidio.
  ['Pomodoro San Marzano DOP', 'Gambero rosso di Mazara', 'Vongole veraci',
   'Bollito misto di carne', 'Cassata siciliana',
   'Trasportino per aragoste vive', 'Riso Carnaroli invecchiato 12 mesi',
   'Spese pazze IGP', 'Casse di mele Golden'
  ].forEach(d => assert.equal(èRigaDiServizio(d), false, `"${d}" NON doveva essere servizio`));
});

test('le righe di servizio non entrano in anagrafica ma finiscono nel resoconto', () => {
  const righe = `<DettaglioLinee><Descrizione>Merluzzo fresco</Descrizione><Quantita>5</Quantita><UnitaMisura>KG</UnitaMisura><PrezzoUnitario>14.00</PrezzoUnitario></DettaglioLinee>
                 <DettaglioLinee><Descrizione>Trasporto refrigerato</Descrizione><UnitaMisura>NR</UnitaMisura><PrezzoUnitario>25.00</PrezzoUnitario></DettaglioLinee>
                 <DettaglioLinee><Descrizione>Contributo CONAI</Descrizione><UnitaMisura>NR</UnitaMisura><PrezzoUnitario>0.50</PrezzoUnitario></DettaglioLinee>`;
  const m = applicaFatture([doc('f1', fattura({ righe }))], vuoto(), nuovoId);
  assert.equal(m.ingredientiNuovi, 1, 'solo il merluzzo è merce');
  assert.equal(m.righeDiServizio, 2);
  assert.equal(m.ingredienti[0].name, 'Merluzzo fresco');
  // Non spariscono in silenzio: se il riconoscimento sbaglia, si vede.
  assert.ok(m.resoconto.some(r => r.includes('Trasporto refrigerato') && r.includes('servizio')));
});

/* ===================== ANNULLARE UN'IMPORTAZIONE ===================== */

import { annullaImportazione } from '../app/src/ricettario/fatture/annulla.ts';

test('annullare toglie ciò che l\'importazione aveva creato', () => {
  const m = applicaFatture([doc('f1', fattura())], vuoto(), nuovoId);
  assert.equal(m.storico.length, 1);

  const a = annullaImportazione(m.storico[0], {
    fornitori: m.fornitori, ingredienti: m.ingredienti,
    giaImportati: m.giaImportati, storico: m.storico,
  });
  assert.equal(a.ingredientiRimossi, 1);
  assert.equal(a.fornitoriRimossi, 1);
  assert.equal(a.ingredienti.length, 0);
  assert.equal(a.fornitori.length, 0);
  // Tolta l'impronta, la fattura si può reimportare corretta.
  assert.equal(a.giaImportati.length, 0);
  assert.equal(a.storico.length, 0);
});

test('annullare riporta indietro i prezzi che aveva cambiato', () => {
  const primo = applicaFatture([doc('f1', fattura())], vuoto(), nuovoId);
  const rincaro = fattura({ righe: `<DettaglioLinee>
      <Descrizione>Pomodoro San Marzano DOP</Descrizione>
      <Quantita>10</Quantita><UnitaMisura>KG</UnitaMisura><PrezzoUnitario>9.99</PrezzoUnitario>
    </DettaglioLinee>` });
  const secondo = applicaFatture([doc('f2', rincaro)], {
    fornitori: primo.fornitori, ingredienti: primo.ingredienti,
    giaImportati: primo.giaImportati, storico: primo.storico,
  }, nuovoId);
  assert.equal(secondo.ingredienti[0].price, 9.99);

  const traccia = secondo.storico.find(s => s.id === 'f2');
  const a = annullaImportazione(traccia, {
    fornitori: secondo.fornitori, ingredienti: secondo.ingredienti,
    giaImportati: secondo.giaImportati, storico: secondo.storico,
  });
  assert.equal(a.prezziRipristinati, 1);
  assert.equal(a.ingredienti[0].price, 2.4, 'il prezzo torna quello di prima');
  assert.equal(a.ingredienti.length, 1, 'l\'ingrediente non va cancellato: non l\'aveva creato questa fattura');
  assert.ok(a.giaImportati.includes('f1'), 'la prima fattura resta importata');
});

test('il fornitore resta se ha ancora ingredienti collegati', () => {
  // Due fatture dello stesso fornitore: annullando la prima, il fornitore
  // serve ancora agli ingredienti della seconda.
  const primo = applicaFatture([doc('f1', fattura())], vuoto(), nuovoId);
  const altraMerce = fattura({ righe: `<DettaglioLinee>
      <Descrizione>Basilico genovese</Descrizione><Quantita>2</Quantita>
      <UnitaMisura>KG</UnitaMisura><PrezzoUnitario>8.00</PrezzoUnitario>
    </DettaglioLinee>` });
  const secondo = applicaFatture([doc('f2', altraMerce)], {
    fornitori: primo.fornitori, ingredienti: primo.ingredienti,
    giaImportati: primo.giaImportati, storico: primo.storico,
  }, nuovoId);

  const a = annullaImportazione(secondo.storico.find(s => s.id === 'f1'), {
    fornitori: secondo.fornitori, ingredienti: secondo.ingredienti,
    giaImportati: secondo.giaImportati, storico: secondo.storico,
  });
  assert.equal(a.fornitoriRimossi, 0);
  assert.equal(a.fornitori.length, 1);
  assert.ok(a.lasciateComeStavano.some(x => x.includes('ha ancora ingredienti')));
});

test('annullare non calpesta un ingrediente eliminato a mano dopo', () => {
  const m = applicaFatture([doc('f1', fattura())], vuoto(), nuovoId);
  // lo chef lo elimina per conto suo
  const senza = m.ingredienti.filter(i => i.name !== 'Pomodoro San Marzano DOP');
  const a = annullaImportazione(m.storico[0], {
    fornitori: m.fornitori, ingredienti: senza,
    giaImportati: m.giaImportati, storico: m.storico,
  });
  assert.equal(a.ingredientiRimossi, 0, 'non c\'era più niente da togliere');
  assert.equal(a.ingredienti.length, 0);
});

test('i dati di partenza non vengono modificati dall\'annullamento', () => {
  const m = applicaFatture([doc('f1', fattura())], vuoto(), nuovoId);
  const dati = {
    fornitori: m.fornitori, ingredienti: m.ingredienti,
    giaImportati: m.giaImportati, storico: m.storico,
  };
  annullaImportazione(m.storico[0], dati);
  assert.equal(dati.ingredienti.length, 1);
  assert.equal(dati.fornitori.length, 1);
});
