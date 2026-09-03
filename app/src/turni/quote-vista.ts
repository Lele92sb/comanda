// ============================================================================
// <cmd-quote> — quanti turni di ciascun tipo fa ognuno, in una settimana.
//
// E' la scheda che il proprietario aveva dato per mancante («ti sei
// dimenticata di mettere quote persona»), quando invece era solo fuori dal
// bordo destro dello schermo. Ora che si vede, vale la pena che sia buona.
//
// UNA COSA CHE CAMBIA DAVVERO, e non e' l'aspetto: il numero di turni si
// salvava a OGNI TASTO PREMUTO. Sul browser non si notava; in cucina, con i
// dati sul cloud, scrivere «12» erano due salvataggi di rete, e «10» seguito da
// un ripensamento erano quattro. Qui si salva quando si esce dal campo — una
// volta, col numero finito.
//
// I gruppi sono agganciati alla loro POSIZIONE, che e' l'unica cosa che li
// distingue: due gruppi «3 SP» sono identici in tutto. Per questo il campo del
// numero riceve il valore come attributo e non come proprieta': una volta che
// ci hai scritto dentro, il browser smette di ascoltare l'attributo e quello
// che vedi resta quello che hai scritto.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { t } from '../core/lingua.ts';
import '../ds/avviso.ts';
import '../ds/bottone.ts';
import '../ds/chip.ts';
import '../ds/riquadro.ts';
import '../ds/vuoto.ts';

export interface GruppoQuota {
  /** Quanti turni di questo gruppo in una settimana. */
  conteggio: number;
  /** I codici ammessi: piu' d'uno vuol dire «uno a caso fra questi». */
  codici: string[];
}

export interface CodiceTurno {
  codice: string;
  etichetta: string;
}

export interface QuotaPersona {
  id: string;
  nome: string;
  /** Id delle partite che sa fare. */
  stazioni: string[];
  gruppi: GruppoQuota[];
  /**
   * Cosa non va in questa quota, gia' scritto in italiano da chi passa i dati.
   * Il componente NON calcola la regola: sette e' una regola sui dati e vive in
   * `lib/logic.js`, dove ha dei test e dove la vede anche il generatore. Una
   * schermata che se la calcolasse da sola sarebbe una seconda verita', e la
   * seconda verita' prima o poi litiga con la prima.
   */
  problemi?: string[];
  /** Vero se questi problemi impediscono di generare i turni. */
  blocca?: boolean;
}

export interface StazioneScelta { id: string; nome: string }

export class Quote extends LitElement {
  static override properties = {
    persone: { type: Array },
    stazioni: { type: Array },
    codici: { type: Array },
    soloLettura: { type: Boolean, reflect: true, attribute: 'solo-lettura' },
  };

  declare persone: QuotaPersona[];
  declare stazioni: StazioneScelta[];
  declare codici: CodiceTurno[];
  declare soloLettura: boolean;

  constructor() {
    super();
    this.persone = [];
    this.stazioni = [];
    this.codici = [];
    this.soloLettura = false;
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}

    .etichetta{
      display:block;font-family:var(--font-body);font-weight:600;font-size:var(--text-xs);
      color:var(--brass);
      margin:var(--space-3) 0 var(--space-1);
    }
    .etichetta:first-child{margin-top:0;}
    .chips{display:flex;flex-wrap:wrap;gap:6px;}

    .gruppo{
      background:var(--bg-elev2);border-radius:var(--radius-md);
      padding:var(--space-3);margin-bottom:var(--space-2);
    }
    .testa-gruppo{display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-2);}
    input[type=number]{
      width:92px;flex-shrink:0;
      background:var(--bg);border:1px solid var(--line-strong);color:var(--paper);
      padding:8px 10px;border-radius:var(--radius-sm);
      font-family:var(--font-mono);font-size:var(--text-md);
    }
    input[type=number]:focus{outline:var(--fuoco);outline-offset:var(--fuoco-stacco);border-color:var(--copper);}
    @media (pointer:coarse){ input[type=number]{min-height:var(--tocco-min);} }
    .per{font-family:var(--font-body);font-size:var(--text-xs);color:var(--brass);flex:1;}

    .nota{
      font-family:var(--font-body);font-size:var(--text-sm);color:var(--brass);
      line-height:1.6;margin:var(--space-2) 0 0;
    }
    /* Il totale accanto al nome: sette e' la settimana, e vedere 6/7 o 8/7 e'
       l'unico modo di accorgersi dello sbaglio senza contare a mano. */
    .totale{font-family:var(--font-mono);font-size:var(--text-sm);}
    .totale.giusto{color:var(--sage);}
    .totale.storto{color:var(--alert);font-weight:700;}
  `;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private gruppo(p: QuotaPersona, g: GruppoQuota, i: number): TemplateResult {
    return html`
      <div class="gruppo">
        <div class="testa-gruppo">
          <input type="number" min="0" value=${String(g.conteggio)}
                 aria-label=${t('Quanti turni di questo gruppo')}
                 ?disabled=${this.soloLettura}
                 @change=${(e: Event) => this.manda('quota-conteggio', {
                   personaId: p.id, indice: i,
                   valore: parseInt((e.target as HTMLInputElement).value, 10) || 0,
                 })}>
          <span class="per">${t('turni a settimana')}</span>
          ${this.soloLettura ? nothing : html`
            <cmd-bottone misura="piccolo" variante="pericolo"
                         @click=${() => this.manda('quota-gruppo-rimuovi', { personaId: p.id, indice: i })}
            >✕ ${t('Rimuovi')}</cmd-bottone>`}
        </div>
        <div class="chips">
          ${this.codici.map(c => html`
            <cmd-chip ?acceso=${g.codici.includes(c.codice)}
                      ?disabilitato=${this.soloLettura}
                      title=${c.etichetta}
                      @cmd-chip=${(e: CustomEvent<{ acceso: boolean }>) => this.manda('quota-codice', {
                        personaId: p.id, indice: i, codice: c.codice, acceso: e.detail.acceso,
                      })}
            >${c.codice}</cmd-chip>`)}
        </div>
        ${g.codici.length > 1 ? html`
          <p class="nota">${t('Più codici accesi: a ogni turno di questo gruppo il generatore ne sceglie uno.')}</p>` : nothing}
      </div>`;
  }

  private scheda(p: QuotaPersona): TemplateResult {
    const totale = p.gruppi.reduce((s, g) => s + (g.conteggio || 0), 0);
    const problemi = p.problemi ?? [];
    const classe = problemi.length ? 'storto' : 'giusto';
    return html`
      <cmd-riquadro titolo=${p.nome}>
        <span slot="azioni" class="totale ${classe}">${totale}/7</span>

        ${problemi.length ? html`
          <cmd-avviso tono=${p.blocca ? 'allarme' : 'nota'}>${problemi.join(' · ')}</cmd-avviso>`
        : nothing}

        <span class="etichetta">${t('Partite che sa fare')}</span>
        ${this.stazioni.length ? html`
          <div class="chips">
            ${this.stazioni.map(st => html`
              <cmd-chip ?acceso=${p.stazioni.includes(st.id)}
                        ?disabilitato=${this.soloLettura}
                        @cmd-chip=${(e: CustomEvent<{ acceso: boolean }>) => this.manda('quota-stazione', {
                          personaId: p.id, stazioneId: st.id, acceso: e.detail.acceso,
                        })}
              >${st.nome}</cmd-chip>`)}
          </div>`
        : html`<p class="nota">${t('Nessuna partita creata: falle in Impostazioni cucina → Stazioni.')}</p>`}

        <span class="etichetta">${t('Gruppi di turni')}</span>
        ${p.gruppi.length
          ? repeat(p.gruppi, (_g, i) => i, (g, i) => this.gruppo(p, g, i))
          : html`<p class="nota">${t('Nessun gruppo: il generatore non le assegnerebbe niente.')}</p>`}
        ${this.soloLettura ? nothing : html`
          <cmd-bottone misura="piccolo" variante="fantasma"
                       @click=${() => this.manda('quota-gruppo-aggiungi', { personaId: p.id })}
          >+ ${t('Gruppo di turni')}</cmd-bottone>`}
      </cmd-riquadro>`;
  }

  override render(): TemplateResult {
    if (!this.persone.length) {
      return html`
        <cmd-vuoto simbolo="🗓" titolo=${t('Nessuna quota da impostare')}
                   spiega=${t('Le quote dicono quanti turni di ciascun tipo fa ogni persona in una settimana. Prima serve qualcuno in brigata.')}>
        </cmd-vuoto>`;
    }
    // IL RIASSUNTO IN CIMA non e' un doppione dell'avviso su ogni scheda: con
    // trenta persone in brigata, quella che fa 6/7 sta a meta' schermata e non
    // la trova nessuno scorrendo. Qui si legge subito quante sono; sotto, dove
    // si ripara, c'e' scritto cosa.
    const bloccanti = this.persone.filter(p => p.blocca);
    return html`
      ${bloccanti.length ? html`
        <cmd-avviso tono="allarme">${bloccanti.length === 1
          ? t('La quota di una persona non fa 7: finché resta così il generatore non parte.')
          : t('Le quote di {n} persone non fanno 7: finché restano così il generatore non parte.',
              { n: bloccanti.length })} ${bloccanti.map(p => p.nome).join(', ')}</cmd-avviso>` : nothing}
      ${repeat(this.persone, p => p.id, p => this.scheda(p))}`;
  }
}

customElements.define('cmd-quote', Quote);

declare global {
  interface HTMLElementTagNameMap { 'cmd-quote': Quote }
}
