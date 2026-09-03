// ============================================================================
// <cmd-servizi> e <cmd-tipi-turno> — i momenti di lavoro della cucina e le
// sigle che li coprono.
//
// Stanno nello stesso file perche' sono due meta' della stessa domanda: un
// servizio senza un turno che lo copre non lo fa nessuno, e un turno che non
// copre nessun servizio il generatore non lo usa mai. Ognuna delle due schede
// lo dice guardando l'altra, ed e' la ragione per cui si aprono insieme.
//
// LE FRECCE. Il proprietario aveva segnalato il difetto vero: con due servizi
// comparivano DUE frecce in su e nessuna che scendesse. La regola giusta e' che
// il primo scende soltanto, l'ultimo sale soltanto, quelli in mezzo fanno tutte
// e due — e una freccia che non porta da nessuna parte non si mostra nemmeno
// spenta, perche' far credere che ci sia un ordine da cambiare dove non c'e' e'
// peggio che non offrirlo.
//
// LE SIGLE SONO CORTE E NON SI POSSONO SBAGLIARE IN SILENZIO: la verifica —
// vuota, riservata, gia' usata — non sta qui dentro. Sta nel collante, che e'
// l'unico che sa quali sigle esistono nella cucina e quali sono riservate dal
// motore. Il componente riceve l'esito e lo mostra sotto il campo.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { t } from '../core/lingua.ts';
import '../ds/bottone.ts';
import '../ds/campo.ts';
import '../ds/chip.ts';
import '../ds/riquadro.ts';
import '../ds/vuoto.ts';

export interface ServizioVista {
  id: string;
  nome: string;
  /** Le sigle dei turni che coprono questo servizio. */
  copertoDa: string[];
}

export interface TipoTurnoVista {
  id: string;
  sigla: string;
  /** L'orario scritto a mano, es. «9:00–17:00». */
  orario: string;
  ore: number;
  /** Sempre #rrggbb: il selettore nativo non accetta altro. */
  colore: string;
  /** Id dei servizi coperti. */
  servizi: string[];
  /** Se la sigla e' stata rifiutata, il perche'. */
  errore?: string;
}

const stile = css`
  :host{display:block;font-family:var(--font-body);color:var(--paper);}
  *,*::before,*::after{box-sizing:border-box;}

  .aggiungi{display:grid;grid-template-columns:1fr auto;gap:var(--space-2);
    align-items:end;margin-bottom:var(--space-4);}
  @media(max-width:560px){
    .aggiungi{grid-template-columns:1fr;}
    .aggiungi cmd-bottone{display:flex;}
    .aggiungi cmd-bottone::part(bottone){width:100%;}
  }

  .nota{font-family:var(--font-mono);font-size:11px;color:var(--brass);
    line-height:1.6;margin:var(--space-2) 0 0;}
  .nota.allarme{color:var(--alert);}
  .etichetta{display:block;font-family:var(--font-mono);font-size:var(--text-xs);
    letter-spacing:0.5px;text-transform:uppercase;color:var(--brass);
    margin:var(--space-3) 0 var(--space-1);}
  .chips{display:flex;flex-wrap:wrap;gap:6px;}

  input[type=text],input[type=number]{
    width:100%;
    background:var(--bg-elev2);border:1px solid var(--line-strong);color:var(--paper);
    padding:9px 10px;border-radius:var(--radius-sm);
    font-family:var(--font-body);font-size:var(--text-md);
  }
  input[type=text]:focus,input[type=number]:focus{
    outline:var(--fuoco);outline-offset:var(--fuoco-stacco);border-color:var(--copper);}
  @media (pointer:coarse){ input[type=text],input[type=number]{min-height:var(--tocco-min);} }

  /* Il selettore nativo e' un rettangolo grigio col bordo di sistema: qui e' un
     pallino della stessa forma della sigla che comparira' nella griglia. */
  input[type=color]{
    width:30px;height:30px;flex-shrink:0;padding:0;
    border:1px solid var(--line-strong);border-radius:50%;
    background:none;cursor:pointer;
  }
  input[type=color]::-webkit-color-swatch-wrapper{padding:2px;}
  input[type=color]::-webkit-color-swatch{border:0;border-radius:50%;}
  input[type=color]::-moz-color-swatch{border:0;border-radius:50%;}

  .comandi{display:flex;gap:var(--space-2);align-items:center;flex-shrink:0;}
  .comandi cmd-bottone.freccia::part(bottone){width:36px;padding-left:0;padding-right:0;}
  @media(max-width:560px){ .comandi cmd-bottone.freccia::part(bottone){width:40px;} }
`;

/* -------------------------------------------------------------- I SERVIZI */

export class Servizi extends LitElement {
  static override properties = {
    servizi: { type: Array },
    soloLettura: { type: Boolean, reflect: true, attribute: 'solo-lettura' },
  };

  declare servizi: ServizioVista[];
  declare soloLettura: boolean;

  constructor() {
    super();
    this.servizi = [];
    this.soloLettura = false;
  }

  static override styles = stile;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private aggiungi(): void {
    const campo = this.renderRoot.querySelector<HTMLInputElement>('#nuovo-servizio');
    const nome = (campo?.value ?? '').trim();
    if (!nome) { this.manda('servizio-nome-vuoto', {}); campo?.focus(); return; }
    this.manda('servizio-aggiungi', { nome });
    if (campo) { campo.value = ''; campo.focus(); }
  }

  private scheda(sv: ServizioVista, i: number): TemplateResult {
    const primo = i === 0;
    const ultimo = i === this.servizi.length - 1;
    return html`
      <cmd-riquadro>
        <div class="riga" style="display:flex;gap:var(--space-3);align-items:center">
          <input type="text" .value=${sv.nome} aria-label=${t('Nome del servizio')}
                 style="flex:1;min-width:0;font-weight:600"
                 ?disabled=${this.soloLettura}
                 @change=${(e: Event) => this.manda('servizio-rinomina', {
                   id: sv.id, nome: (e.target as HTMLInputElement).value })}>
          ${this.soloLettura ? nothing : html`
            <div class="comandi">
              ${this.servizi.length > 1 && !primo ? html`
                <cmd-bottone class="freccia" misura="piccolo" variante="fantasma"
                             etichetta=${t('Sposta {nome} su', { nome: sv.nome })}
                             @click=${() => this.manda('servizio-sposta', { id: sv.id, verso: -1 })}>▲</cmd-bottone>` : nothing}
              ${this.servizi.length > 1 && !ultimo ? html`
                <cmd-bottone class="freccia" misura="piccolo" variante="fantasma"
                             etichetta=${t('Sposta {nome} giù', { nome: sv.nome })}
                             @click=${() => this.manda('servizio-sposta', { id: sv.id, verso: 1 })}>▼</cmd-bottone>` : nothing}
              <cmd-bottone misura="piccolo" variante="pericolo"
                           @click=${() => this.manda('servizio-elimina', { id: sv.id })}
              >${t('Elimina')}</cmd-bottone>
            </div>`}
        </div>
        <p class="nota ${sv.copertoDa.length ? '' : 'allarme'}">${sv.copertoDa.length
          ? t('coperto dai turni:') + ' ' + sv.copertoDa.join(', ')
          : '⚠ ' + t('nessun turno lo copre: nessuno lavorerà in questo servizio')}</p>
      </cmd-riquadro>`;
  }

  override render(): TemplateResult {
    return html`
      ${this.soloLettura ? nothing : html`
        <div class="aggiungi">
          <cmd-campo etichetta=${t('Nuovo servizio')} style="margin:0">
            <input type="text" id="nuovo-servizio" placeholder="es. Aperitivo"
                   @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this.aggiungi(); }}>
          </cmd-campo>
          <cmd-bottone variante="principale" @click=${this.aggiungi}>${t('Aggiungi')}</cmd-bottone>
        </div>`}
      ${this.servizi.length
        ? repeat(this.servizi, sv => sv.id, (sv, i) => this.scheda(sv, i))
        : html`
          <cmd-vuoto simbolo="🕐" titolo=${t('Nessun servizio')}
                     spiega=${t('I servizi sono i momenti di lavoro della giornata: pranzo, cena, un aperitivo. Il fabbisogno e i turni si appoggiano tutti su questi.')}>
          </cmd-vuoto>`}`;
  }
}

customElements.define('cmd-servizi', Servizi);

/* --------------------------------------------------------- I TIPI DI TURNO */

export class TipiTurno extends LitElement {
  static override properties = {
    tipi: { type: Array },
    servizi: { type: Array },
    soloLettura: { type: Boolean, reflect: true, attribute: 'solo-lettura' },
  };

  declare tipi: TipoTurnoVista[];
  declare servizi: ServizioVista[];
  declare soloLettura: boolean;

  constructor() {
    super();
    this.tipi = [];
    this.servizi = [];
    this.soloLettura = false;
  }

  static override styles = [stile, css`
    .griglia{display:grid;grid-template-columns:90px 1fr 80px 44px;gap:var(--space-2);align-items:end;}
    @media(max-width:560px){ .griglia{grid-template-columns:1fr 1fr;} }
    .colore{display:flex;align-items:center;height:40px;}
    .sigla input{font-family:var(--font-mono);text-transform:uppercase;font-weight:700;}
  `];

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private scheda(tt: TipoTurnoVista): TemplateResult {
    return html`
      <cmd-riquadro>
        <div class="griglia">
          <cmd-campo class="sigla" etichetta=${t('Sigla')} errore=${tt.errore ?? ''} style="margin:0">
            <input type="text" maxlength="4" .value=${tt.sigla}
                   ?disabled=${this.soloLettura}
                   @change=${(e: Event) => this.manda('turno-sigla', {
                     id: tt.id, sigla: (e.target as HTMLInputElement).value })}>
          </cmd-campo>
          <cmd-campo etichetta=${t('Orario')} style="margin:0">
            <input type="text" .value=${tt.orario} placeholder="es. 9:00–17:00"
                   ?disabled=${this.soloLettura}
                   @change=${(e: Event) => this.manda('turno-orario', {
                     id: tt.id, orario: (e.target as HTMLInputElement).value })}>
          </cmd-campo>
          <cmd-campo etichetta=${t('Ore')} style="margin:0">
            <input type="number" step="0.5" min="0" .value=${String(tt.ore)}
                   ?disabled=${this.soloLettura}
                   @change=${(e: Event) => this.manda('turno-ore', {
                     id: tt.id, ore: parseFloat((e.target as HTMLInputElement).value) || 0 })}>
          </cmd-campo>
          <div class="colore">
            <input type="color" .value=${tt.colore}
                   title=${t('Colore della sigla nella griglia')}
                   aria-label=${t('Colore di {nome}', { nome: tt.sigla })}
                   ?disabled=${this.soloLettura}
                   @change=${(e: Event) => this.manda('turno-colore', {
                     id: tt.id, colore: (e.target as HTMLInputElement).value })}>
          </div>
        </div>

        <span class="etichetta">${t('Servizi coperti')}</span>
        ${this.servizi.length ? html`
          <div class="chips">
            ${this.servizi.map(sv => html`
              <cmd-chip ?acceso=${tt.servizi.includes(sv.id)}
                        ?disabilitato=${this.soloLettura}
                        @cmd-chip=${(e: CustomEvent<{ acceso: boolean }>) => this.manda('turno-servizio', {
                          id: tt.id, servizioId: sv.id, acceso: e.detail.acceso })}
              >${sv.nome}</cmd-chip>`)}
          </div>`
        : html`<p class="nota">${t('Crea prima i servizi.')}</p>`}

        ${tt.servizi.length > 1 ? html`
          <p class="nota">${t('Turno spezzato: una persona sola copre {n} servizi.', { n: tt.servizi.length })}</p>` : nothing}
        ${!tt.servizi.length ? html`
          <p class="nota allarme">⚠ ${t('Non copre nessun servizio: il generatore non lo userà mai.')}</p>` : nothing}

        ${this.soloLettura ? nothing : html`
          <cmd-bottone slot="azioni" misura="piccolo" variante="pericolo"
                       @click=${() => this.manda('turno-elimina', { id: tt.id })}
          >${t('Elimina turno')}</cmd-bottone>`}
      </cmd-riquadro>`;
  }

  override render(): TemplateResult {
    return html`
      ${this.soloLettura ? nothing : html`
        <cmd-bottone variante="principale" class="mb"
                     style="margin-bottom:var(--space-4)"
                     @click=${() => this.manda('turno-aggiungi', {})}
        >+ ${t('Tipo di turno')}</cmd-bottone>`}
      ${this.tipi.length
        ? repeat(this.tipi, tt => tt.id, tt => this.scheda(tt))
        : html`
          <cmd-vuoto simbolo="🎫" titolo=${t('Nessun tipo di turno')}
                     spiega=${t('Un tipo di turno è una sigla con delle ore e i servizi che copre: P per il pranzo, SP per lo spezzato. Senza, il generatore non ha niente da assegnare.')}>
          </cmd-vuoto>`}`;
  }
}

customElements.define('cmd-tipi-turno', TipiTurno);

declare global {
  interface HTMLElementTagNameMap {
    'cmd-servizi': Servizi;
    'cmd-tipi-turno': TipiTurno;
  }
}
