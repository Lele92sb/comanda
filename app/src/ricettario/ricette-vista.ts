// ============================================================================
// <cmd-sub-ricette> e <cmd-piatti> — le due schermate che si guardano come si
// guarda una comanda sul passe.
//
// Stanno insieme perche' sono la stessa carta con dentro conti diversi: una
// sub-ricetta ha una resa e un calo peso, un piatto ha un prezzo e un margine.
// Il resto — il titolo, il numero d'ordine, l'elenco dei componenti, i comandi
// in fondo — e' identico, ed e' <cmd-comanda>.
//
// I CONTI ARRIVANO GIA' FATTI, come stringhe. Non e' pigrizia: quanto costa un
// ingrediente dopo lo scarto, quanto una sub-ricetta dopo il calo, e quale
// food cost sia «alto» sono decisioni che stanno nel motore e nel collante.
// Un componente che le sapesse smetterebbe di essere un componente.
//
// IL TONO DI UN NUMERO SI', QUELLO LO SA: e' una faccenda di colore, e il
// colore e' il suo mestiere. Chi passa i dati dice «questo e' storto», il
// componente decide che storto vuol dire rosso.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { t } from '../core/lingua.ts';
import '../ds/bottone.ts';
import '../ds/comanda.ts';
import '../ds/etichetta.ts';
import '../ds/vuoto.ts';

export interface Metrica {
  etichetta: string;
  valore: string;
  tono?: 'buono' | 'storto';
}

export interface VoceRicetta {
  nome: string;
  /** «500g · €9.50», gia' composto. */
  quantita: string;
}

export interface SubRicettaVista {
  id: string;
  nome: string;
  numero: string;
  /** «resa 2 kg · calo peso 40%». */
  resa: string;
  voci: VoceRicetta[];
  metriche: Metrica[];
  note: string;
}

export interface PiattoVista {
  id: string;
  nome: string;
  numero: string;
  /** «Primi · 220g porzione · 25 min». */
  categoria: string;
  /** Data URL della foto, '' se non c'e'. */
  foto: string;
  voci: VoceRicetta[];
  metriche: Metrica[];
  allergeni: string[];
  procedimento: string;
  note: string;
}

const stile = css`
  :host{display:block;font-family:var(--font-body);color:var(--paper);}
  *,*::before,*::after{box-sizing:border-box;}

  img{max-width:100%;border-radius:var(--radius-md);margin-bottom:10px;display:block;}

  .metriche{display:flex;gap:14px;flex-wrap:wrap;margin:10px 0;}
  .metrica{font-family:var(--font-mono);font-size:var(--text-sm);}
  .metrica b{display:block;font-size:var(--text-lg);font-family:var(--font-mono);}
  .metrica.buono b{color:#3f6b3a;}
  .metrica.storto b{color:var(--alert);}

  .voci{margin:8px 0 0;padding:0;list-style:none;font-size:var(--text-md);}
  .voci li{display:flex;justify-content:space-between;gap:8px;
    padding:4px 0;border-bottom:1px solid rgba(29,27,24,0.08);}
  .voci .nome{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .voci .quanto{font-family:var(--font-mono);color:rgba(29,27,24,0.6);white-space:nowrap;}

  .procedimento{font-size:var(--text-md);line-height:1.55;margin-top:8px;white-space:pre-wrap;}
  .procedimento.note{color:var(--copper);font-style:italic;}
  .allergeni{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;}
`;

function metriche(elenco: Metrica[]): TemplateResult {
  return html`
    <div class="metriche">
      ${elenco.map(m => html`
        <span class="metrica ${m.tono ?? ''}">${m.etichetta}<b>${m.valore}</b></span>`)}
    </div>`;
}

function voci(elenco: VoceRicetta[]): TemplateResult {
  return html`
    <ul class="voci">
      ${elenco.map(v => html`
        <li><span class="nome">${v.nome}</span><span class="quanto">${v.quantita}</span></li>`)}
    </ul>`;
}

/* --------------------------------------------------------- LE SUB-RICETTE */

export class SubRicette extends LitElement {
  static override properties = {
    sottoricette: { type: Array },
    soloLettura: { type: Boolean, reflect: true, attribute: 'solo-lettura' },
  };

  declare sottoricette: SubRicettaVista[];
  declare soloLettura: boolean;

  constructor() {
    super();
    this.sottoricette = [];
    this.soloLettura = false;
  }

  static override styles = stile;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  override render(): TemplateResult {
    if (!this.sottoricette.length) {
      return html`
        <cmd-vuoto simbolo="🥄" titolo=${t('Nessuna sub-ricetta')}
                   spiega=${t('Fondi, salse, basi, composte: tutto quello che si prepara una volta e finisce dentro più piatti. Il costo si calcola una volta sola e vale per tutti.')}>
          ${this.soloLettura ? nothing : html`
            <cmd-bottone variante="principale"
                         @click=${() => this.manda('sub-nuova', {})}>${t('Crea la prima')}</cmd-bottone>`}
        </cmd-vuoto>`;
    }
    return html`${repeat(this.sottoricette, s => s.id, s => html`
      <cmd-comanda titolo=${s.nome} categoria=${s.resa} numero=${s.numero}>
        ${voci(s.voci)}
        ${metriche(s.metriche)}
        ${s.note ? html`<div class="procedimento">${s.note}</div>` : nothing}
        ${this.soloLettura ? nothing : html`
          <cmd-bottone slot="comandi" misura="piccolo" variante="fantasma"
                       @click=${() => this.manda('sub-modifica', { id: s.id })}>${t('Modifica')}</cmd-bottone>
          <cmd-bottone slot="comandi" misura="piccolo" variante="pericolo"
                       @click=${() => this.manda('sub-elimina', { id: s.id })}>${t('Elimina')}</cmd-bottone>`}
      </cmd-comanda>`)}`;
  }
}

customElements.define('cmd-sub-ricette', SubRicette);

/* --------------------------------------------------------------- I PIATTI */

export class Piatti extends LitElement {
  static override properties = {
    piatti: { type: Array },
    soloLettura: { type: Boolean, reflect: true, attribute: 'solo-lettura' },
  };

  declare piatti: PiattoVista[];
  declare soloLettura: boolean;

  constructor() {
    super();
    this.piatti = [];
    this.soloLettura = false;
  }

  static override styles = stile;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  override render(): TemplateResult {
    if (!this.piatti.length) {
      return html`
        <cmd-vuoto simbolo="🍽" titolo=${t('Nessun piatto')}
                   spiega=${t('Una scheda tecnica mette insieme i componenti, il costo della materia prima e il prezzo: da lì esce il food cost reale, quello che dice se il piatto paga la cucina che lo fa.')}>
          ${this.soloLettura ? nothing : html`
            <cmd-bottone variante="principale"
                         @click=${() => this.manda('piatto-nuovo', {})}>${t('Crea la prima scheda')}</cmd-bottone>`}
        </cmd-vuoto>`;
    }
    return html`${repeat(this.piatti, p => p.id, p => html`
      <cmd-comanda titolo=${p.nome} categoria=${p.categoria} numero=${p.numero}>
        ${p.foto ? html`<img src=${p.foto} alt=${t('Foto di {nome}', { nome: p.nome })}>` : nothing}
        ${metriche(p.metriche)}
        ${p.allergeni.length ? html`
          <div class="allergeni">
            ${p.allergeni.map(a => html`<cmd-etichetta tono="allarme">${a}</cmd-etichetta>`)}
          </div>` : nothing}
        ${voci(p.voci)}
        ${p.procedimento ? html`<div class="procedimento">${p.procedimento}</div>` : nothing}
        ${p.note ? html`<div class="procedimento note">${p.note}</div>` : nothing}
        ${this.soloLettura ? nothing : html`
          <cmd-bottone slot="comandi" misura="piccolo" variante="fantasma"
                       @click=${() => this.manda('piatto-modifica', { id: p.id })}>${t('Modifica')}</cmd-bottone>
          <cmd-bottone slot="comandi" misura="piccolo" variante="fantasma"
                       @click=${() => this.manda('piatto-duplica', { id: p.id })}>${t('Duplica')}</cmd-bottone>
          <cmd-bottone slot="comandi" misura="piccolo" variante="pericolo"
                       @click=${() => this.manda('piatto-elimina', { id: p.id })}>${t('Elimina')}</cmd-bottone>`}
      </cmd-comanda>`)}`;
  }
}

customElements.define('cmd-piatti', Piatti);

declare global {
  interface HTMLElementTagNameMap {
    'cmd-sub-ricette': SubRicette;
    'cmd-piatti': Piatti;
  }
}
