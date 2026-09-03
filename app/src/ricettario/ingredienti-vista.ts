// ============================================================================
// <cmd-ingredienti> e <cmd-scheda-ingrediente> — l'anagrafica della materia
// prima, che e' il fondo su cui poggia tutto il food cost.
//
// LA RESA E' LA COSA CHE SI SBAGLIA. Un chilo di asparagi non e' un chilo di
// asparagi: pulendoli se ne perde un terzo, quindi il chilo che arriva nel
// piatto costa la meta' in piu' di quello che dice la fattura. Il modulo lo
// calcola MENTRE si scrive, sotto ai campi, invece di farlo scoprire dopo nel
// costo di un piatto che non torna. E' l'unico numero che si vede prima di
// salvare, ed e' apposta: e' l'unico che nessuno ha in testa.
//
// Il calcolo sta nel componente e non nel collante perche' e' aritmetica pura
// sui valori che si stanno scrivendo — non tocca i dati salvati e non deve
// aspettare un salvataggio per comparire.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { t } from '../core/lingua.ts';
import '../ds/bottone.ts';
import '../ds/campo.ts';
import '../ds/etichetta.ts';
import '../ds/scelta.ts';
import '../ds/scheda.ts';
import '../ds/vuoto.ts';
import type { Opzione } from '../ds/scelta.ts';

export interface IngredienteVista {
  id: string;
  nome: string;
  fornitore: string;
  unita: string;
  /** Prezzo d'acquisto per unita', come testo: '' vuol dire mancante. */
  prezzo: string;
  /** Percentuale di parte edibile. 100 = niente scarto. */
  resa: number;
  /** Costo reale per unita', gia' calcolato da chi passa i dati. */
  costoEffettivo: number;
  /** La resa e' stata stimata dall'assistente, non inserita a mano. */
  resaStimata: boolean;
}

export interface IngredienteModifica {
  id: string;
  nome: string;
  fornitore: string;
  unita: string;
  prezzo: string;
  resa: string;
}

const NUOVO_FORNITORE = '__nuovo__';

/* ------------------------------------------------------------------ ELENCO */

export class Ingredienti extends LitElement {
  static override properties = {
    ingredienti: { type: Array },
    soloLettura: { type: Boolean, reflect: true, attribute: 'solo-lettura' },
  };

  declare ingredienti: IngredienteVista[];
  declare soloLettura: boolean;

  constructor() {
    super();
    this.ingredienti = [];
    this.soloLettura = false;
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}
    .riga{font-family:var(--font-body);font-size:var(--text-sm);color:var(--brass);
      line-height:1.6;margin-top:3px;overflow-wrap:anywhere;}
    .riga.costo{color:var(--copper-light);}
  `;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private scheda(i: IngredienteVista): TemplateResult {
    const prezzo = parseFloat(i.prezzo) || 0;
    const scarto = Math.max(0, 100 - i.resa);
    return html`
      <cmd-scheda titolo=${i.nome}>
        ${!prezzo ? html`<cmd-etichetta slot="stato" tono="allarme">${t('prezzo mancante')}</cmd-etichetta>` : nothing}
        ${i.resaStimata ? html`<cmd-etichetta slot="stato" tono="ok">${t('resa stimata AI')}</cmd-etichetta>` : nothing}

        <div class="riga">${i.fornitore || '—'} · € ${prezzo.toFixed(3)}/${i.unita} ${t('acquisto')}
          · ${t('resa')} ${i.resa}% · ${t('scarto')} ${scarto.toFixed(0)}%</div>
        <div class="riga costo">${t('costo effettivo')}: € ${i.costoEffettivo.toFixed(3)}/${i.unita}</div>

        ${this.soloLettura ? nothing : html`
          <cmd-bottone slot="azioni" misura="piccolo" variante="fantasma"
                       @click=${() => this.manda('ingrediente-modifica', { id: i.id })}>${t('Modifica')}</cmd-bottone>
          <cmd-bottone slot="azioni" misura="piccolo" variante="pericolo"
                       @click=${() => this.manda('ingrediente-elimina', { id: i.id })}>${t('Elimina')}</cmd-bottone>`}
      </cmd-scheda>`;
  }

  override render(): TemplateResult {
    if (!this.ingredienti.length) {
      return html`
        <cmd-vuoto simbolo="🥬" titolo=${t('Nessun ingrediente')}
                   spiega=${t('L\'anagrafica della materia prima è il fondo del food cost: prezzo d\'acquisto e resa di ogni ingrediente. Da lì si calcola quanto costa davvero un piatto.')}>
          ${this.soloLettura ? nothing : html`
            <cmd-bottone variante="principale"
                         @click=${() => this.manda('ingrediente-nuovo', {})}>${t('Aggiungi il primo')}</cmd-bottone>`}
        </cmd-vuoto>`;
    }
    return html`${repeat(this.ingredienti, i => i.id, i => this.scheda(i))}`;
  }
}

customElements.define('cmd-ingredienti', Ingredienti);

/* ------------------------------------------------------------------ MODULO */

export class SchedaIngrediente extends LitElement {
  static override properties = {
    ingrediente: { type: Object },
    fornitori: { type: Array },
    unita: { type: Array },
    nuovo: { type: Boolean },
    bozza: { type: Object, state: true },
    errore: { type: String, state: true },
  };

  declare ingrediente: IngredienteModifica;
  declare fornitori: string[];
  declare unita: string[];
  declare nuovo: boolean;
  declare bozza: IngredienteModifica;
  declare errore: string;

  constructor() {
    super();
    this.ingrediente = { id: '', nome: '', fornitore: '', unita: 'kg', prezzo: '', resa: '100' };
    this.fornitori = [];
    this.unita = ['kg', 'l', 'pz'];
    this.nuovo = true;
    this.bozza = { ...this.ingrediente };
    this.errore = '';
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}
    .scatola{background:var(--bg-elev);border:1px solid var(--line);
      border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-4);}
    h3{margin:0 0 var(--space-3);font-family:var(--font-display);
      font-size:var(--text-lg);font-weight:600;}
    .tre{display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-3);}
    @media(max-width:560px){ .tre{grid-template-columns:1fr;} }
    .azioni{display:flex;gap:var(--space-3);margin-top:var(--space-4);}

    /* Il costo effettivo mentre si scrive. Non e' una nota a margine: e' il
       numero per cui questa scheda esiste, quindi si vede come un numero. */
    .conto{
      display:flex;align-items:baseline;flex-wrap:wrap;gap:var(--space-2);
      background:var(--bg-elev2);border-radius:var(--radius-md);
      padding:var(--space-3);margin-top:var(--space-3);
    }
    .conto .valore{font-family:var(--font-display);font-size:24px;font-weight:700;
      color:var(--copper-light);}
    .conto .spiega{font-family:var(--font-body);font-size:var(--text-xs);
      color:var(--brass);line-height:1.6;}
  `;

  override willUpdate(cambi: Map<string, unknown>): void {
    if (cambi.has('ingrediente')) this.bozza = { ...this.ingrediente };
  }

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private scrivi<K extends keyof IngredienteModifica>(campo: K, valore: IngredienteModifica[K]): void {
    this.bozza = { ...this.bozza, [campo]: valore };
  }

  private get fornitoreNuovo(): boolean {
    return this.bozza.fornitore === NUOVO_FORNITORE
      || (Boolean(this.bozza.fornitore) && !this.fornitori.includes(this.bozza.fornitore));
  }

  private salva(): void {
    const nome = this.bozza.nome.trim();
    if (!nome) {
      this.errore = t('Serve il nome');
      this.renderRoot.querySelector<HTMLInputElement>('#g-nome')?.focus();
      return;
    }
    this.errore = '';
    let fornitore = this.bozza.fornitore;
    if (fornitore === NUOVO_FORNITORE) {
      fornitore = (this.renderRoot.querySelector<HTMLInputElement>('#g-fornitore-nuovo')?.value ?? '').trim();
    }
    this.manda('ingrediente-salva', { ingrediente: { ...this.bozza, nome, fornitore } });
  }

  override render(): TemplateResult {
    const prezzo = parseFloat(this.bozza.prezzo) || 0;
    const resa = parseFloat(this.bozza.resa) || 100;
    const effettivo = resa > 0 ? prezzo / (resa / 100) : 0;
    const scarto = Math.max(0, 100 - resa);

    const opzioniFornitore: Opzione[] = [
      { valore: '', etichetta: t('— nessuno —') },
      ...this.fornitori.map(f => ({ valore: f, etichetta: f })),
      { valore: NUOVO_FORNITORE, etichetta: '+ ' + t('Nuovo fornitore…') },
    ];
    const opzioniUnita: Opzione[] = this.unita.map(u => ({ valore: u, etichetta: u }));

    return html`
      <div class="scatola">
        <h3>${this.nuovo ? t('Nuovo ingrediente') : t('Modifica ingrediente')}</h3>

        <cmd-campo etichetta=${t('Nome ingrediente')} obbligatorio errore=${this.errore}>
          <input type="text" id="g-nome" .value=${this.bozza.nome} placeholder="es. Asparagi extra"
                 @input=${(e: Event) => this.scrivi('nome', (e.target as HTMLInputElement).value)}>
        </cmd-campo>

        <cmd-campo etichetta=${t('Fornitore')}>
          <cmd-scelta .opzioni=${opzioniFornitore}
                      valore=${this.fornitoreNuovo ? NUOVO_FORNITORE : this.bozza.fornitore}
                      @cmd-cambio=${(e: CustomEvent<{ valore: string }>) => this.scrivi('fornitore', e.detail.valore)}></cmd-scelta>
        </cmd-campo>
        ${this.fornitoreNuovo ? html`
          <cmd-campo etichetta=${t('Nome del nuovo fornitore')}
                     aiuto=${t('Viene creato in anagrafica insieme all\'ingrediente.')}>
            <input type="text" id="g-fornitore-nuovo"
                   .value=${this.bozza.fornitore === NUOVO_FORNITORE ? '' : this.bozza.fornitore}>
          </cmd-campo>` : nothing}

        <div class="tre">
          <cmd-campo etichetta=${t('Unità d\'acquisto')} style="margin:0">
            <cmd-scelta .opzioni=${opzioniUnita} valore=${this.bozza.unita}
                        @cmd-cambio=${(e: CustomEvent<{ valore: string }>) => this.scrivi('unita', e.detail.valore)}></cmd-scelta>
          </cmd-campo>
          <cmd-campo etichetta=${t('Prezzo acquisto (€/unità)')} style="margin:0">
            <input type="number" step="0.001" .value=${this.bozza.prezzo}
                   @input=${(e: Event) => this.scrivi('prezzo', (e.target as HTMLInputElement).value)}>
          </cmd-campo>
          <cmd-campo etichetta=${t('Resa / parte edibile (%)')} style="margin:0">
            <input type="number" step="1" min="1" max="100" .value=${this.bozza.resa}
                   @input=${(e: Event) => this.scrivi('resa', (e.target as HTMLInputElement).value)}>
          </cmd-campo>
        </div>

        <div class="conto">
          <span class="valore">€ ${effettivo.toFixed(3)}</span>
          <span class="spiega">${t('per')} ${this.bozza.unita} ${t('nel piatto')} — ${t('scarto')} ${scarto.toFixed(0)}%.
            ${scarto > 0
              ? t('Un {u} pagato € {p} ne rende {r} di parte edibile: quello che finisce nel piatto costa di più.',
                  { u: this.bozza.unita, p: prezzo.toFixed(3), r: (resa / 100).toFixed(2) })
              : t('Niente scarto: quello che paghi è quello che usi.')}</span>
        </div>

        <div class="azioni">
          <cmd-bottone variante="principale" @click=${this.salva}>${t('Salva')}</cmd-bottone>
          <cmd-bottone variante="fantasma"
                       @click=${() => this.manda('ingrediente-annulla', {})}>${t('Annulla')}</cmd-bottone>
        </div>
      </div>`;
  }
}

customElements.define('cmd-scheda-ingrediente', SchedaIngrediente);

declare global {
  interface HTMLElementTagNameMap {
    'cmd-ingredienti': Ingredienti;
    'cmd-scheda-ingrediente': SchedaIngrediente;
  }
}
