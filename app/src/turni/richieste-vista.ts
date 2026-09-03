// ============================================================================
// <cmd-richieste> — ferie, riposi e servizi preferiti.
//
// E' l'unica schermata dell'app che cambia FORMA a seconda di chi la guarda, e
// non e' una questione di permessi nascosti: sono proprio due schermate.
//
//   il titolare   registra richieste per chiunque, e quelle che scrive lui
//                 valgono subito — vincolano il generatore senza passare da
//                 nessuna approvazione, perche' e' lui che approva.
//   la brigata    manda la propria, e resta in attesa.
//
// E c'e' un terzo caso, quello che si dimentica sempre: chi ha un account ma
// non e' stato COLLEGATO a nessuna persona della brigata. Non puo' mandare
// niente, e la schermata deve dirgli perche' e a chi chiedere — invece di
// mostrargli un modulo che non funziona.
//
// LA RISERVATEZZA NON STA QUI. Chi non e' titolare vede solo le proprie
// richieste perche' il database non gli manda le altre (policy requests_select):
// questo componente disegna quello che gli arriva. Nascondere un riquadro non
// nasconde niente — chi apre la console legge tutto quello che e' arrivato al
// telefono.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { t } from '../core/lingua.ts';
import '../ds/avviso.ts';
import '../ds/bottone.ts';
import '../ds/campo.ts';
import '../ds/chip.ts';
import '../ds/etichetta.ts';
import '../ds/riquadro.ts';
import '../ds/scelta.ts';
import '../ds/scheda.ts';
import '../ds/vuoto.ts';
import type { Opzione } from '../ds/scelta.ts';

export type StatoRichiesta = 'in_attesa' | 'approvata' | 'rifiutata';

export interface RichiestaVista {
  id: string;
  /** Il nome di chi l'ha chiesta. */
  chi: string;
  /** «Ferie», «Riposo», «solo: Pranzo, Cena». */
  dettaglio: string;
  /** «gio 3 settembre» oppure «3 set → 9 set (7 giorni)». */
  periodo: string;
  nota: string;
  stato: StatoRichiesta;
}

export class Richieste extends LitElement {
  static override properties = {
    sonoTitolare: { type: Boolean },
    mioNome: { type: String },
    collegato: { type: Boolean },
    persone: { type: Array },
    servizi: { type: Array },
    richieste: { type: Array },
    // La bozza del modulo, tutta qui dentro: chi annulla o cambia scheda non
    // lascia niente in giro.
    perChi: { type: String, state: true },
    dal: { type: String, state: true },
    al: { type: String, state: true },
    tipo: { type: String, state: true },
    serviziScelti: { type: Array, state: true },
    errore: { type: String, state: true },
  };

  declare sonoTitolare: boolean;
  /** Il nome della persona di brigata collegata a chi sta guardando. */
  declare mioNome: string;
  /** Chi guarda è collegato a una persona della brigata (o è il titolare). */
  declare collegato: boolean;
  declare persone: Opzione[];
  declare servizi: Opzione[];
  declare richieste: RichiestaVista[];
  declare perChi: string;
  declare dal: string;
  declare al: string;
  declare tipo: string;
  declare serviziScelti: string[];
  declare errore: string;

  constructor() {
    super();
    this.sonoTitolare = false;
    this.mioNome = '';
    this.collegato = false;
    this.persone = [];
    this.servizi = [];
    this.richieste = [];
    this.perChi = '';
    this.dal = '';
    this.al = '';
    this.tipo = 'riposo';
    this.serviziScelti = [];
    this.errore = '';
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}
    .due{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);}
    @media(max-width:560px){ .due{grid-template-columns:1fr;} }
    .chips{display:flex;flex-wrap:wrap;gap:6px;}
    .etichetta{display:block;font-family:var(--font-body);font-weight:600;font-size:var(--text-xs);
      color:var(--brass);
      margin:var(--space-4) 0 var(--space-1);}
    .riga{font-family:var(--font-body);font-size:var(--text-sm);color:var(--brass);
      line-height:1.6;margin-top:3px;overflow-wrap:anywhere;}
    .nome{font-weight:600;}
    .comandi{display:flex;flex-direction:column;align-items:flex-end;gap:var(--space-1);}
  `;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private get tipiRichiesta(): Opzione[] {
    return [
      { valore: 'riposo', etichetta: t('Giorno di riposo') },
      { valore: 'ferie', etichetta: t('Ferie') },
      { valore: 'servizio', etichetta: t('Solo certi servizi') },
    ];
  }

  private invia(): void {
    const dal = this.dal;
    if (!dal) { this.errore = t('Indica almeno il giorno di inizio'); return; }
    const al = this.al || dal;
    if (al < dal) { this.errore = t('La data finale è prima di quella iniziale'); return; }
    if (this.tipo === 'servizio' && !this.serviziScelti.length) {
      this.errore = t('Scegli almeno un servizio');
      return;
    }
    const perChi = this.sonoTitolare ? (this.perChi || this.persone[0]?.valore || '') : '';
    if (this.sonoTitolare && !perChi) {
      this.errore = t('Manca la persona a cui riferire la richiesta');
      return;
    }
    this.errore = '';
    const nota = this.renderRoot.querySelector<HTMLInputElement>('#r-nota');
    this.manda('richiesta-crea', {
      staffId: perChi, dal, al, tipo: this.tipo,
      servizi: this.serviziScelti.slice(), nota: (nota?.value ?? '').trim(),
    });
    if (nota) nota.value = '';
    this.serviziScelti = [];
  }

  private scheda(r: RichiestaVista): TemplateResult {
    const tono = r.stato === 'approvata' ? 'ok' : r.stato === 'rifiutata' ? 'allarme' : 'neutro';
    const parola = r.stato === 'approvata' ? t('approvata')
                 : r.stato === 'rifiutata' ? t('rifiutata') : t('in attesa');
    return html`
      <cmd-scheda incolonna>
        <span slot="titolo" class="nome">${r.chi} — ${r.dettaglio}</span>
        <cmd-etichetta slot="stato" tono=${tono}>${parola}</cmd-etichetta>
        <div class="riga">${r.periodo}${r.nota ? ' · ' + r.nota : ''}</div>
        ${this.sonoTitolare && r.stato === 'in_attesa' ? html`
          <cmd-bottone slot="azioni" misura="piccolo" variante="principale"
                       @click=${() => this.manda('richiesta-decidi', { id: r.id, esito: 'approvata' })}
          >${t('Approva')}</cmd-bottone>
          <cmd-bottone slot="azioni" misura="piccolo" variante="fantasma"
                       @click=${() => this.manda('richiesta-decidi', { id: r.id, esito: 'rifiutata' })}
          >${t('Rifiuta')}</cmd-bottone>` : nothing}
        <cmd-bottone slot="azioni" misura="piccolo" variante="pericolo"
                     @click=${() => this.manda('richiesta-elimina', { id: r.id })}
        >${t('Elimina')}</cmd-bottone>
      </cmd-scheda>`;
  }

  override render(): TemplateResult {
    const inAttesa = this.richieste.filter(r => r.stato === 'in_attesa');
    const decise = this.richieste.filter(r => r.stato !== 'in_attesa');
    const puoInviare = this.sonoTitolare || this.collegato;

    return html`
      <cmd-riquadro
        titolo=${this.sonoTitolare ? t('Registra una richiesta') : t('Nuova richiesta')}
        sottotitolo=${this.sonoTitolare
          ? t('Le richieste che registri tu sono già approvate: valgono subito per il generatore. Quelle inviate dalla brigata restano in attesa finché non decidi.')
          : t('La richiesta arriva a chi gestisce la cucina. Diventa vincolante per i turni solo quando viene approvata.')}>

        ${this.sonoTitolare
          ? html`
            <cmd-campo etichetta=${t('Per chi')}>
              <cmd-scelta .opzioni=${this.persone} valore=${this.perChi || this.persone[0]?.valore || ''}
                          cercabile segnaposto=${t('scegli una persona')}
                          @cmd-cambio=${(e: CustomEvent<{ valore: string }>) => { this.perChi = e.detail.valore; }}></cmd-scelta>
            </cmd-campo>`
          : this.collegato
            ? html`<p class="riga">${t('Richiesta a nome di')} <b>${this.mioNome}</b>.</p>`
            : html`
              <cmd-avviso tono="allarme">${t('Non risulti collegato a nessuna persona della brigata: chiedi a chi gestisce la cucina di collegarti, così potrai inviare le tue richieste.')}</cmd-avviso>`}

        <div class="due">
          <cmd-campo etichetta=${t('Dal giorno')} style="margin:0">
            <input type="date" .value=${this.dal}
                   @change=${(e: Event) => { this.dal = (e.target as HTMLInputElement).value; }}>
          </cmd-campo>
          <cmd-campo etichetta=${t('Al giorno')}
                     aiuto=${t('Lascialo vuoto per un giorno solo.')} style="margin:0">
            <input type="date" .value=${this.al}
                   @change=${(e: Event) => { this.al = (e.target as HTMLInputElement).value; }}>
          </cmd-campo>
        </div>

        <cmd-campo etichetta=${t('Tipo di richiesta')}>
          <cmd-scelta .opzioni=${this.tipiRichiesta} valore=${this.tipo}
                      @cmd-cambio=${(e: CustomEvent<{ valore: string }>) => { this.tipo = e.detail.valore; }}></cmd-scelta>
        </cmd-campo>

        ${this.tipo === 'servizio' ? html`
          <span class="etichetta">${t('Servizi che posso fare in questi giorni')}</span>
          <div class="chips">
            ${this.servizi.map(sv => html`
              <cmd-chip ?acceso=${this.serviziScelti.includes(sv.valore)}
                        @cmd-chip=${(e: CustomEvent<{ acceso: boolean }>) => {
                          this.serviziScelti = e.detail.acceso
                            ? this.serviziScelti.concat(sv.valore)
                            : this.serviziScelti.filter(x => x !== sv.valore);
                        }}>${sv.etichetta}</cmd-chip>`)}
          </div>` : nothing}

        <cmd-campo etichetta=${t('Nota (facoltativa)')} errore=${this.errore}>
          <input type="text" id="r-nota" placeholder="es. visita medica, matrimonio…">
        </cmd-campo>

        <cmd-bottone variante="principale" pieno ?disabilitato=${!puoInviare}
                     @click=${this.invia}
        >${this.sonoTitolare ? t('Registra') : t('Invia richiesta')}</cmd-bottone>
      </cmd-riquadro>

      <cmd-riquadro titolo=${this.sonoTitolare ? t('Tutte le richieste') : t('Le mie richieste')}>
        ${this.richieste.length ? html`
          ${inAttesa.length ? html`
            <span class="etichetta">${t('Da decidere')} (${inAttesa.length})</span>
            ${repeat(inAttesa, r => r.id, r => this.scheda(r))}` : nothing}
          ${decise.length ? html`
            <span class="etichetta">${t('Già decise')}</span>
            ${repeat(decise, r => r.id, r => this.scheda(r))}` : nothing}`
        : html`
          <cmd-vuoto simbolo="✋" titolo=${t('Nessuna richiesta')}
                     spiega=${this.sonoTitolare
                       ? t('Qui arrivano le richieste della brigata: ferie, giorni di riposo, servizi preferiti. Quelle approvate diventano vincoli per il generatore.')
                       : t('Qui restano le richieste che mandi. Quando vengono approvate, il generatore le rispetta.')}></cmd-vuoto>`}
      </cmd-riquadro>`;
  }
}

customElements.define('cmd-richieste', Richieste);

declare global {
  interface HTMLElementTagNameMap { 'cmd-richieste': Richieste }
}
