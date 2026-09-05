// ============================================================================
// I DIFETTI CHE SONO GIA' ARRIVATI IN CUCINA
//
// Ogni prova qui dentro e' un difetto vero, trovato dallo chef usando l'app, e
// non da un test. Stanno insieme perche' hanno la stessa forma: il componente
// preso da solo era sano, e a rompersi era il COMPORTAMENTO — chi comanda su
// uno stato, e cosa succede al ridisegno dopo.
//
// Una prova qui non si cancella quando il difetto e' chiuso: e' li' apposta
// per il giorno in cui qualcuno riscrivera' quel pezzo.
// ============================================================================

import { test, expect } from './prova.js';

const ECCEDENZA = '[data-caso="eccedenza-auto"]';

/** Apre «Le ore che avanzano»: nel banco quel riquadro nasce chiuso. */
async function apri(page) {
  await page.goto('/banco.html');
  const riquadro = page.locator(ECCEDENZA + ' cmd-riquadro');
  await riquadro.getByRole('button', { name: /Le ore che avanzano/ }).click();
  await expect(riquadro).toHaveAttribute('aperto', '');
  return riquadro;
}

test('un chip non si accende da solo: lo stato ce l’ha chi lo usa', async ({ page }) => {
  /* IL DIFETTO. cmd-chip faceva `this.acceso = !this.acceso` e poi avvisava.
     Ma nessuno qui lo usa da solo: tutti gli passano ?acceso dall'esterno,
     perche' lo stato vero sta nei dati. Con due padroni si rompe, e in un modo
     che sembra un difetto della schermata — Lit non riscrive una proprieta'
     che secondo lui non e' cambiata, quindi dopo che il chip si e' acceso da
     solo non lo rispegne piu'. Sui tre modi delle ore che avanzano, che sono
     ALTERNATIVI, restavano accesi tutti e tre.

     Nel banco cmd-eccedenza e' senza collante: manda l'evento e nessuno gli
     cambia `modo`. Ed e' proprio questo che rende la prova secca — dopo il
     clic la schermata deve stare esattamente com'era. */
  await apri(page);
  const accesi = page.locator(ECCEDENZA + ' cmd-chip[acceso]');

  await expect(accesi).toHaveCount(1);
  await expect(accesi).toHaveText(/le colloca l|the app places/i);

  await page.locator(ECCEDENZA + ' cmd-chip', { hasText: /scelgo io i giorni|choose the days/i })
            .click();

  await expect(accesi, 'Cliccando un chip se ne sono accesi due').toHaveCount(1);
  await expect(accesi, 'Il chip cliccato si e’ acceso da solo').toHaveText(/le colloca l|the app places/i);
});

test('scegliendo «scelgo io i giorni» i giorni si vedono', async ({ page }) => {
  /* IL DIFETTO, con le parole dello chef: «non appaiono piu' i giorni».
     Lo stato di apertura viveva dentro <cmd-riquadro>, che nasce chiuso, e la
     scelta dei giorni sta DENTRO quel riquadro: si sceglieva «scelgo io i
     giorni» e non compariva niente. Una domanda fatta a sportello chiuso non
     e' una domanda.

     Il gesto e' quello vero del collante: dopo il clic su un chip,
     renderEccedenza() rilegge lo stato e riscrive `modo` da fuori
     (generatore.js:420). Qui si fa la stessa cosa, perche' nel banco il
     collante non c'e'. Senza quel `willUpdate` che apre il riquadro, i sette
     giorni restano nel DOM ma alti zero, ed e' esattamente com'era. */
  await page.goto('/banco.html');
  const caso = page.locator(ECCEDENZA);
  const riquadro = caso.locator('cmd-riquadro');

  await expect(riquadro).not.toHaveAttribute('aperto', '');

  await caso.locator('cmd-eccedenza').evaluate(el => { el.modo = 'giorni'; });

  await expect(riquadro, 'Il riquadro non si e’ aperto da solo').toHaveAttribute('aperto', '');
  // I sette giorni della settimana, quelli che «non apparivano piu'».
  const giorni = caso.locator('cmd-chip').filter({ hasText: 'Lun' });
  await expect(giorni, 'I giorni non si vedono: il riquadro e’ rimasto chiuso').toBeVisible();
  await expect(caso.locator('cmd-chip')).toHaveCount(3 + 7);
});

test('il riquadro aperto a mano regge un ridisegno del collante', async ({ page }) => {
  /* L'altra meta' dello stesso difetto: il collante riscrive le proprieta' a
     ogni salvataggio e a ogni arrivo dal tempo reale — `giorni` e' sempre un
     array nuovo (`.slice()`), quindi cmd-eccedenza ridisegna davvero. Se lo
     stato dell'apertura tornasse a vivere solo dentro <cmd-riquadro>, un
     salvataggio di un collega richiuderebbe il riquadro sotto le mani. */
  const riquadro = await apri(page);

  await page.locator(ECCEDENZA + ' cmd-eccedenza').evaluate(el => {
    el.giorni = [...el.giorni];
    el.giorniPossibili = [...el.giorniPossibili];
  });

  await expect(riquadro, 'Il riquadro si e’ richiuso da solo dopo un ridisegno')
    .toHaveAttribute('aperto', '');
  await expect(page.locator(ECCEDENZA + ' cmd-chip').first()).toBeVisible();
});

test('il dialogo si apre, e Esc lo chiude davvero', async ({ page }) => {
  /* Non e' un difetto passato: e' una promessa scritta in CLAUDE.md — «fuoco
     dentro, Esc, top layer» — che finora nessuno aveva mai verificato. Il
     riquadro fatto a mano di prima aveva solo Esc, scritto a mano: se un
     giorno <cmd-dialogo> tornasse a essere un <div>, tutto sembrerebbe uguale
     e sparirebbe solo quello che non si vede. */
  await page.goto('/banco.html');
  const caso = page.locator('[data-caso="dialogo"]');
  const dialogo = caso.locator('cmd-dialogo');

  await caso.getByRole('button', { name: /elimina una partita/i }).click();
  await expect(dialogo).toHaveAttribute('aperto', '');
  // Il fuoco deve stare DENTRO: e' meta' del motivo per cui si usa <dialog>.
  await expect(caso.locator('dialog')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialogo, 'Esc non ha chiuso il dialogo').not.toHaveAttribute('aperto', '');
});

test('l’app si apre senza un errore in console', async ({ page }) => {
  /* Senza account l'app mostra la schermata d'accesso, e va bene cosi': quello
     che conta e' che i moduli si carichino tutti e che nessuna funzione si
     fermi a meta'. Il resto lo dice il guardiano in prova.js. */
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('cmd-accesso, #app, main').first()).toBeVisible({ timeout: 10_000 });
});
