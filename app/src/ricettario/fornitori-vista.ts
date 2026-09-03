// ============================================================================
// <cmd-fornitori> e <cmd-scheda-fornitore> — chi porta la merce.
//
// E' l'anagrafica piu' semplice dell'app, ed e' quella che si riempie da sola:
// importando una fattura elettronica il fornitore viene creato col nome, la
// partita IVA e l'indirizzo che stanno dentro l'XML. Per questo il vuoto lo
// dice invece di chiedere di compilare a mano — chi ha le fatture non deve
// scrivere niente.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { t } from '../core/lingua.ts';
import '../ds/bottone.ts';
import '../ds/campo.ts';
import '../ds/scheda.ts';
import { SOGLIA_RICERCA, filtra } from '../core/cerca.ts';
import '../ds/ricerca.ts';
import '../ds/vuoto.ts';

export interface FornitoreVista {
  id: string;
  nome: string;
  piva: string;
  telefono: string;
  email: string;
  indirizzo: string;
}

/* ------------------------------------------------------------------ ELENCO */

export class Fornitori extends LitElement {
  static override properties = {
    /* Lo stato del campo di ricerca. `state:true` e non una proprieta'
       pubblica: e' roba della schermata, non un dato che il collante
       debba conoscere o salvare. */
    filtro: { state: true },
    fornitori: { type: Array },
    soloLettura: { type: Boolean, reflect: true, attribute: 'solo-lettura' },
  };

  declare filtro: string;
  declare fornitori: FornitoreVista[];
  declare soloLettura: boolean;

  constructor() {
    super();
    this.filtro = '';
    this.fornitori = [];
    this.soloLettura = false;
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}
    .riga{font-family:var(--font-body);font-size:var(--text-sm);color:var(--brass);
      line-height:1.6;margin-top:3px;overflow-wrap:anywhere;}
  
    /* Quando la ricerca non trova niente. Non e' <cmd-vuoto>: quello dice «non
       c'e' ancora niente, comincia» ed e' il primo passo. Questo dice «c'e'
       roba, ma non questa», ed e' un vicolo cieco temporaneo — due messaggi
       diversi, e scambiarli manda a creare una cosa che esiste gia'. */
    .niente-trovato{
      font-family:var(--font-body);font-size:var(--text-md);color:var(--brass);
      padding:var(--space-4) 0;text-align:center;
    }
  `;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private scheda(f: FornitoreVista): TemplateResult {
    const contatti = [
      f.telefono ? '📞 ' + f.telefono : '',
      f.email ? '✉ ' + f.email : '',
    ].filter(Boolean).join(' · ');
    return html`
      <cmd-scheda titolo=${f.nome}>
        ${f.piva ? html`<div class="riga">P.IVA ${f.piva}</div>` : nothing}
        ${contatti ? html`<div class="riga">${contatti}</div>` : nothing}
        ${f.indirizzo ? html`<div class="riga">${f.indirizzo}</div>` : nothing}
        ${this.soloLettura ? nothing : html`
          <cmd-bottone slot="azioni" misura="piccolo" variante="fantasma"
                       @click=${() => this.manda('fornitore-modifica', { id: f.id })}>${t('Modifica')}</cmd-bottone>
          <cmd-bottone slot="azioni" misura="piccolo" variante="pericolo"
                       @click=${() => this.manda('fornitore-elimina', { id: f.id })}>${t('Elimina')}</cmd-bottone>`}
      </cmd-scheda>`;
  }

  override render(): TemplateResult {
    if (!this.fornitori.length) {
      return html`
        <cmd-vuoto simbolo="🚚" titolo=${t('Nessun fornitore')}
                   spiega=${t('Si creano da soli importando le fatture elettroniche: nome, partita IVA e indirizzo stanno già dentro l\'XML. Oppure aggiungili a mano.')}>
          ${this.soloLettura ? nothing : html`
            <cmd-bottone variante="principale"
                         @click=${() => this.manda('fornitore-nuovo', {})}>${t('Aggiungi a mano')}</cmd-bottone>`}
        </cmd-vuoto>`;
    }
    const visti = filtra(this.fornitori, this.filtro, f => [f.nome, f.piva, f.email, f.indirizzo]);
    return html`
      ${this.fornitori.length >= SOGLIA_RICERCA ? html`
        <cmd-ricerca .valore=${this.filtro} segnaposto=${t('Cerca per nome o partita IVA')}
                     quante=${visti.length} totale=${this.fornitori.length}
                     @cmd-ricerca=${(e: CustomEvent<{ valore: string }>) =>
                       { this.filtro = e.detail.valore; }}></cmd-ricerca>` : nothing}
      ${visti.length === 0
        ? html`<p class="niente-trovato">${t('Niente che corrisponda a «{cosa}».', { cosa: this.filtro })}</p>`
        : repeat(visti, f => f.id, f => this.scheda(f))}`;
  }
}

customElements.define('cmd-fornitori', Fornitori);

/* ------------------------------------------------------------------ MODULO */

export class SchedaFornitore extends LitElement {
  static override properties = {
    fornitore: { type: Object },
    nuovo: { type: Boolean },
    bozza: { type: Object, state: true },
    errore: { type: String, state: true },
  };

  declare fornitore: FornitoreVista;
  declare nuovo: boolean;
  declare bozza: FornitoreVista;
  declare errore: string;

  constructor() {
    super();
    this.fornitore = { id: '', nome: '', piva: '', telefono: '', email: '', indirizzo: '' };
    this.nuovo = true;
    this.bozza = { ...this.fornitore };
    this.errore = '';
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}
    .scatola{background:var(--bg-elev);border:1px solid var(--line);
      border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-4);}
    h3{margin:0 0 var(--space-3);font-family:var(--font-display);
      font-size:var(--text-lg);font-weight:600;}
    .due{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);}
    @media(max-width:560px){ .due{grid-template-columns:1fr;} }
    .azioni{display:flex;gap:var(--space-3);margin-top:var(--space-4);}
  `;

  override willUpdate(cambi: Map<string, unknown>): void {
    if (cambi.has('fornitore')) this.bozza = { ...this.fornitore };
  }

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private scrivi<K extends keyof FornitoreVista>(campo: K, valore: FornitoreVista[K]): void {
    this.bozza = { ...this.bozza, [campo]: valore };
  }

  private salva(): void {
    const nome = this.bozza.nome.trim();
    if (!nome) {
      this.errore = t('Serve il nome del fornitore');
      this.renderRoot.querySelector<HTMLInputElement>('#f-nome')?.focus();
      return;
    }
    this.errore = '';
    this.manda('fornitore-salva', {
      fornitore: {
        ...this.bozza,
        nome,
        piva: this.bozza.piva.trim(),
        telefono: this.bozza.telefono.trim(),
        email: this.bozza.email.trim(),
        indirizzo: this.bozza.indirizzo.trim(),
      },
    });
  }

  override render(): TemplateResult {
    return html`
      <div class="scatola">
        <h3>${this.nuovo ? t('Nuovo fornitore') : t('Modifica fornitore')}</h3>

        <cmd-campo etichetta=${t('Nome / Ragione sociale')} obbligatorio errore=${this.errore}>
          <input type="text" id="f-nome" .value=${this.bozza.nome}
                 @input=${(e: Event) => this.scrivi('nome', (e.target as HTMLInputElement).value)}>
        </cmd-campo>

        <div class="due">
          <cmd-campo etichetta=${t('Partita IVA')} style="margin:0">
            <input type="text" .value=${this.bozza.piva}
                   @input=${(e: Event) => this.scrivi('piva', (e.target as HTMLInputElement).value)}>
          </cmd-campo>
          <cmd-campo etichetta=${t('Telefono')} style="margin:0">
            <input type="tel" .value=${this.bozza.telefono}
                   @input=${(e: Event) => this.scrivi('telefono', (e.target as HTMLInputElement).value)}>
          </cmd-campo>
        </div>

        <cmd-campo etichetta=${t('Email')}>
          <input type="email" .value=${this.bozza.email}
                 @input=${(e: Event) => this.scrivi('email', (e.target as HTMLInputElement).value)}>
        </cmd-campo>
        <cmd-campo etichetta=${t('Indirizzo')}>
          <input type="text" .value=${this.bozza.indirizzo}
                 @input=${(e: Event) => this.scrivi('indirizzo', (e.target as HTMLInputElement).value)}>
        </cmd-campo>

        <div class="azioni">
          <cmd-bottone variante="principale" @click=${this.salva}>${t('Salva')}</cmd-bottone>
          <cmd-bottone variante="fantasma"
                       @click=${() => this.manda('fornitore-annulla', {})}>${t('Annulla')}</cmd-bottone>
        </div>
      </div>`;
  }
}

customElements.define('cmd-scheda-fornitore', SchedaFornitore);

declare global {
  interface HTMLElementTagNameMap {
    'cmd-fornitori': Fornitori;
    'cmd-scheda-fornitore': SchedaFornitore;
  }
}
