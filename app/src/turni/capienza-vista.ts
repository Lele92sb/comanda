// ============================================================================
// <cmd-capienza> — il conto che lo chef fa a mente prima di cominciare.
//
// «Io NON guardo giorno per giorno, prima mi faccio un'idea in testa e poi
// inizio.» L'idea in testa e' un'aritmetica: per ogni partita quanti posti
// servono nel periodo, quanti ne coprono le quote di chi la sa fare, e quindi
// quanti turni extra saranno inevitabili.
//
// COMPARE IN DUE POSTI, ed e' il motivo per cui e' un componente: nella scheda
// Fabbisogno, dove i numeri si cambiano, e sopra il pulsante «Genera turni»,
// dove la decisione si prende. Prima erano la stessa stringa di HTML infilata
// in due contenitori — e siccome dentro c'erano un `id="conto-dettagli"` e un
// `id="btn-conto-dettagli"`, nella pagina finivano DUE elementi con lo stesso
// id. Funzionava per caso, perche' chi li cercava lo faceva sempre partendo dal
// contenitore; ma document.getElementById ne trovava uno solo, e qualunque
// legame di accessibilita' fatto per id avrebbe puntato al riquadro sbagliato.
// Dentro uno shadow DOM il problema non esiste: gli id sono affari privati del
// componente, e due copie non si vedono fra loro.
//
// L'UNITA' E' IL POSTO-SERVIZIO, non la giornata: «due al lavaggio» a pranzo e
// a cena fanno 4 posti in un giorno, 28 in una settimana. Chi conta in giornate
// trova 14 dove lo chef ne conta 28, e la riga direbbe una cosa falsa.
//
// LA BARRA NON E' DECORAZIONE: e' l'unica cosa che si vede senza leggere. Il
// pieno verde e' quello che le quote coprono, il fondo rosso e' il buco. Al
// primo giro era il contrario, il pieno rosso: si leggeva «rosso = tanto
// coperto», cioe' l'opposto di quel che voleva dire.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { t } from '../core/lingua.ts';
import '../ds/bottone.ts';

export interface RigaCapienza {
  nome: string;
  colore: string;
  /** Posti-servizio richiesti nel periodo. */
  domanda: number;
  /** Posti che le quote riescono a coprire. */
  coperti: number;
  mancanti: number;
  /** Quanti dei coperti arrivano dalla mano di un'altra partita. */
  rimbalzo: number;
  /** Quante persone in brigata la sanno fare. */
  qualificati: number;
  /** I nomi delle partite che le danno una mano. */
  donatori: string[];
  /** «Pranzo 2 · Cena 2» — nella riga non ci sta, nel suggerimento sì. */
  servizi: string;
}

export interface Conto {
  periodo: string;
  giorni: number;
  righe: RigaCapienza[];
  domanda: number;
  coperti: number;
  extra: number;
  /** Nomi delle partite che nessuno in brigata sa fare. */
  senzaNessuno: string[];
}

export class Capienza extends LitElement {
  static override properties = {
    conto: { type: Object },
    aperto: { type: Boolean, state: true },
  };

  declare conto: Conto | null;
  declare aperto: boolean;

  constructor() {
    super();
    this.conto = null;
    this.aperto = false;
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}
    :host([vuoto]){display:none;}

    .scatola{
      background:var(--bg-elev);border:1px solid var(--line);
      border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-3);
    }
    .sintesi{
      display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);
      flex-wrap:wrap;
    }
    .cifre{font-family:var(--font-body);font-weight:600;font-size:var(--text-xs);
      color:var(--brass);
      overflow-wrap:anywhere;}
    .cifra{font-family:var(--font-display);font-size:26px;font-weight:700;
      color:var(--paper);margin-right:var(--space-1);letter-spacing:0;}
    .cifra.ok{color:var(--sage);}
    .cifra.manca{color:var(--alert);}
    @media(max-width:560px){ .cifra{font-size:22px;} }

    .dettaglio{margin-top:var(--space-3);}
    .nota{font-family:var(--font-body);font-size:var(--text-xs);color:var(--brass);
      line-height:1.6;margin:var(--space-2) 0 0;}
    .nota.allarme{color:var(--alert);}
    .nota b{color:var(--paper-dim);}

    .somma{display:flex;flex-wrap:wrap;gap:var(--space-2) var(--space-4);
      align-items:baseline;margin:var(--space-3) 0;
      font-family:var(--font-body);font-weight:600;font-size:var(--text-xs);
      color:var(--brass);}

    /* Una griglia sola per l'intestazione e per le righe: le colonne restano
       incolonnate perche' sono la STESSA griglia, non due tarature che si
       somigliano finche' qualcuno non tocca un numero. */
    .riga{display:grid;align-items:center;gap:var(--space-1) var(--space-2);
      grid-template-columns:minmax(84px,1.1fr) 46px 46px 46px minmax(56px,1fr) minmax(64px,auto);
      padding:var(--space-2) 0;border-top:1px solid var(--line);}
    .riga.intestazione{border-top:none;padding-bottom:var(--space-1);
      font-family:var(--font-body);font-weight:600;font-size:var(--text-xs);color:var(--brass);}
    .nome{display:flex;align-items:center;gap:6px;min-width:0;
      overflow-wrap:anywhere;font-size:var(--text-sm);}
    .riga.intestazione .nome{font-size:var(--text-xs);}
    .n{font-family:var(--font-mono);font-size:var(--text-md);text-align:right;}
    .riga.intestazione .n{font-size:var(--text-xs);}
    .n.ok{color:var(--brass);}
    .n.manca{color:var(--alert);font-weight:700;}
    .n sup{color:var(--brass);font-size:11px;}
    .pallino{display:inline-block;flex:0 0 auto;width:7px;height:7px;border-radius:50%;}
    .barra{height:6px;border-radius:3px;background:var(--bg);overflow:hidden;display:block;}
    .riga.scoperta .barra{background:var(--alert);}
    .riga.intestazione .barra{background:none;}
    .barra i{display:block;height:100%;background:var(--sage);}
    .chi{font-family:var(--font-body);font-size:var(--text-xs);color:var(--brass);
      text-align:right;overflow-wrap:anywhere;}

    /* Sul telefono le sei colonne non ci stanno: nome e numeri restano sulla
       prima riga — e' il conto — e barra e «chi la sa fare» scendono sotto.
       Nessuna colonna sparisce: quello che si toglie da uno schermo stretto e'
       proprio il dato che serviva a chi guarda il telefono in cucina. */
    @media(max-width:560px){
      .riga{grid-template-columns:1fr 44px 44px 44px;}
      .barra{grid-column:1/3;}
      .chi{grid-column:3/-1;}
      .riga.intestazione .barra,.riga.intestazione .chi{display:none;}
      .riga.intestazione .n{font-size:var(--text-sm);}
    }
  `;

  private riga(r: RigaCapienza): TemplateResult {
    const pieno = r.domanda > 0 ? Math.min(100, Math.round(100 * r.coperti / r.domanda)) : 100;
    const titolo = [
      r.nome + ' — ' + r.servizi + ' ' + t('al giorno'),
      t('{a} posti nel periodo, {b} coperti', { a: r.domanda, b: r.coperti }),
      r.rimbalzo ? t('{n} arrivano dalla mano di {chi}', { n: r.rimbalzo, chi: r.donatori.join(', ') }) : '',
      r.qualificati
        ? r.qualificati + (r.qualificati === 1 ? t(' persona la sa fare') : t(' persone la sanno fare'))
        : t('nessuno in brigata la sa fare'),
    ].filter(Boolean).join(' · ');

    return html`
      <div class="riga ${r.mancanti ? 'scoperta' : ''}" title=${titolo}>
        <span class="nome"><i class="pallino" style="background:${r.colore}"></i>${r.nome}</span>
        <span class="n">${r.domanda}</span>
        <span class="n">${r.coperti}${r.rimbalzo
          ? html`<sup title=${t('di cui dalla mano di un\'altra partita')}>*</sup>` : nothing}</span>
        <span class="n ${r.mancanti ? 'manca' : 'ok'}">${r.mancanti || '—'}</span>
        <span class="barra"><i style="width:${pieno}%"></i></span>
        <span class="chi">${r.qualificati
          ? r.qualificati + (r.qualificati === 1 ? t(' persona') : t(' persone'))
          : t('nessuno la sa fare')}</span>
      </div>`;
  }

  override render(): TemplateResult {
    const c = this.conto;
    // Nessun fabbisogno impostato: non c'e' niente da contare, e un riquadro di
    // zeri occuperebbe lo schermo per dire «non hai ancora deciso niente».
    if (!c || !c.righe.length) {
      this.toggleAttribute('vuoto', true);
      return html``;
    }
    this.toggleAttribute('vuoto', false);

    return html`
      <div class="scatola">
        <div class="sintesi">
          <span class="cifre">
            <b class="cifra">${c.domanda}</b> ${t('servono')} ·
            <b class="cifra ${c.coperti >= c.domanda ? 'ok' : ''}">${c.coperti}</b> ${t('coperti')}${c.extra
              ? html` · <b class="cifra manca">${c.extra}</b> ${c.extra > 1 ? t('extra inevitabili') : t('extra inevitabile')}`
              : nothing}
          </span>
          <cmd-bottone misura="piccolo" variante="fantasma"
                       @click=${() => { this.aperto = !this.aperto; }}
          >${this.aperto ? t('Chiudi') : t('Il conto')}</cmd-bottone>
        </div>

        ${this.aperto ? html`
          <div class="dettaglio">
            <p class="nota">${c.periodo} · ${c.giorni} ${t('giorni')}.
              ${t('Si contano i posti: una persona, su una partita, in un servizio — «due al lavaggio» a pranzo e a cena sono 4 posti al giorno.')}</p>

            <div class="somma">
              <span><b class="cifra">${c.domanda}</b> ${t('servono')}</span>
              <span><b class="cifra ${c.coperti >= c.domanda ? 'ok' : ''}">${c.coperti}</b> ${t('coperti')}</span>
              <span><b class="cifra ${c.extra ? 'manca' : 'ok'}">${c.extra}</b> ${t('extra inevitabili')}</span>
            </div>

            <div class="riga intestazione">
              <span class="nome">${t('Partita')}</span>
              <span class="n">${t('servono')}</span>
              <span class="n">${t('coperti')}</span>
              <span class="n">${t('mancano')}</span>
              <span class="barra"></span>
              <span class="chi">${t('chi la sa fare')}</span>
            </div>
            ${c.righe.map(r => this.riga(r))}

            ${c.extra ? html`
              <p class="nota">${t('Quei {n} posti non li copre nessuna quota: il generatore chiamerà qualcuno oltre la sua quota, e quel turno costa di più. Si tolgono in tre modi — si assume, si alza la quota settimanale di chi già la sa fare, o si abbassa il fabbisogno di quella partita.', { n: c.extra })}</p>` : nothing}

            ${c.senzaNessuno.length ? html`
              <p class="nota allarme">${t('Nessuno in brigata sa fare')} ${c.senzaNessuno.join(', ')}:
                ${t('quei posti restano scoperti comunque, nemmeno un turno extra li chiude. Le partite si assegnano nella scheda della persona, in Brigata.')}</p>` : nothing}

            <p class="nota">${t('È un minimo. Il conto non sa chi sarà in ferie o quali richieste sono approvate: quelle tolgono capienza, non ne aggiungono. Dopo la generazione il riepilogo può dire più extra di così, mai meno.')}</p>
          </div>` : nothing}
      </div>`;
  }
}

customElements.define('cmd-capienza', Capienza);

declare global {
  interface HTMLElementTagNameMap { 'cmd-capienza': Capienza }
}
