// ============================================================================
// <cmd-menu> e <cmd-scheda-menu> — un menu e' un insieme di piatti, e la sola
// domanda che deve rispondere e': quanto costa e quanto rende, tutto insieme.
//
// Il food cost medio e' il numero per cui questa schermata esiste: un piatto
// per volta puo' essere in linea e il menu completo no, perche' quello che
// tira giu' la media e' sempre la portata che sembra innocua.
// Sopra il 35% la cifra si accende in rosso — e' la stessa soglia della
// dashboard, e viene da li': una regola sola, in un posto solo.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { t } from '../core/lingua.ts';
import '../ds/bottone.ts';
import '../ds/campo.ts';
import '../ds/chip.ts';
import '../ds/comanda.ts';
import '../ds/vuoto.ts';

export interface PortataVista {
  id: string;
  nome: string;
  prezzo: number;
}

export interface MenuVista {
  id: string;
  nome: string;
  numero: string;
  portate: PortataVista[];
  costoTotale: number;
  prezzoTotale: number;
  /** Null quando nessuna portata ha un prezzo: la media non esiste. */
  foodCostMedio: number | null;
  fuoriLinea: boolean;
}

const stile = css`
  :host{display:block;font-family:var(--font-body);color:var(--paper);}
  *,*::before,*::after{box-sizing:border-box;}
  .portate{margin:8px 0 0;padding:0;list-style:none;font-size:var(--text-md);}
  .portate li{display:flex;justify-content:space-between;gap:8px;
    padding:4px 0;border-bottom:1px solid var(--line);}
  .portate .prezzo{font-family:var(--font-mono);color:var(--brass);white-space:nowrap;}
  .conti{display:flex;gap:14px;flex-wrap:wrap;margin:10px 0 0;}
  .conto{font-family:var(--font-mono);font-size:var(--text-sm);}
  .conto b{display:block;font-size:var(--text-lg);}
  .conto.buono b{color:var(--sage);}
  .conto.storto b{color:var(--alert);}
`;

/* ------------------------------------------------------------------ ELENCO */

export class Menu extends LitElement {
  static override properties = {
    menu: { type: Array },
    soloLettura: { type: Boolean, reflect: true, attribute: 'solo-lettura' },
  };

  declare menu: MenuVista[];
  declare soloLettura: boolean;

  constructor() {
    super();
    this.menu = [];
    this.soloLettura = false;
  }

  static override styles = stile;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private carta(m: MenuVista): TemplateResult {
    return html`
      <cmd-comanda titolo=${m.nome} numero=${m.numero}
                   categoria=${m.portate.length + ' ' + (m.portate.length === 1 ? t('portata') : t('portate'))}>
        <ul class="portate">
          ${m.portate.map(p => html`
            <li><span>${p.nome}</span><span class="prezzo">€${p.prezzo.toFixed(2)}</span></li>`)}
        </ul>
        <div class="conti">
          <span class="conto">${t('Costo totale')}<b>€ ${m.costoTotale.toFixed(2)}</b></span>
          <span class="conto">${t('Prezzo totale')}<b>€ ${m.prezzoTotale.toFixed(2)}</b></span>
          <span class="conto ${m.foodCostMedio === null ? '' : m.fuoriLinea ? 'storto' : 'buono'}">
            ${t('Food cost medio')}<b>${m.foodCostMedio === null ? '—' : m.foodCostMedio.toFixed(1) + '%'}</b></span>
        </div>
        ${this.soloLettura ? nothing : html`
          <cmd-bottone slot="comandi" misura="piccolo" variante="pericolo"
                       @click=${() => this.manda('menu-elimina', { id: m.id })}>${t('Elimina')}</cmd-bottone>`}
      </cmd-comanda>`;
  }

  override render(): TemplateResult {
    if (!this.menu.length) {
      return html`
        <cmd-vuoto simbolo="📜" titolo=${t('Nessun menu')}
                   spiega=${t('Un menu mette insieme dei piatti del ricettario e ne fa il conto: costo, prezzo e food cost medio di tutta la sequenza.')}>
          ${this.soloLettura ? nothing : html`
            <cmd-bottone variante="principale"
                         @click=${() => this.manda('menu-nuovo', {})}>${t('Componi il primo')}</cmd-bottone>`}
        </cmd-vuoto>`;
    }
    return html`${repeat(this.menu, m => m.id, m => this.carta(m))}`;
  }
}

customElements.define('cmd-menu', Menu);

/* ------------------------------------------------------------------ MODULO */

export class SchedaMenu extends LitElement {
  static override properties = {
    piatti: { type: Array },
    scelti: { type: Array, state: true },
    nome: { type: String, state: true },
    errore: { type: String, state: true },
  };

  declare piatti: PortataVista[];
  declare scelti: string[];
  declare nome: string;
  declare errore: string;

  constructor() {
    super();
    this.piatti = [];
    this.scelti = [];
    this.nome = '';
    this.errore = '';
  }

  static override styles = [stile, css`
    .scatola{background:var(--bg-elev);border:1px solid var(--line);
      border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-4);}
    h3{margin:0 0 var(--space-3);font-family:var(--font-display);
      font-size:var(--text-lg);font-weight:600;}
    .etichetta{display:block;font-family:var(--font-body);font-weight:600;font-size:var(--text-xs);
      color:var(--brass);
      margin:var(--space-3) 0 var(--space-1);}
    .chips{display:flex;flex-wrap:wrap;gap:6px;}
    .azioni{display:flex;gap:var(--space-3);margin-top:var(--space-4);}
    .quante{font-family:var(--font-body);font-size:var(--text-xs);
      color:var(--brass);margin-top:var(--space-2);}
  `];

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private salva(): void {
    const nome = this.nome.trim();
    if (!nome || !this.scelti.length) {
      this.errore = t('Serve un nome e almeno una portata');
      return;
    }
    this.errore = '';
    this.manda('menu-salva', { nome, portate: this.scelti });
  }

  override render(): TemplateResult {
    return html`
      <div class="scatola">
        <h3>${t('Nuovo menu')}</h3>

        <cmd-campo etichetta=${t('Nome menu')} obbligatorio errore=${this.errore}>
          <input type="text" id="m-nome" .value=${this.nome} placeholder="es. Menu degustazione estivo"
                 @input=${(e: Event) => { this.nome = (e.target as HTMLInputElement).value; }}>
        </cmd-campo>

        <span class="etichetta">${t('Le portate')}</span>
        <div class="chips">
          ${this.piatti.map(p => html`
            <cmd-chip ?acceso=${this.scelti.includes(p.id)}
                      @cmd-chip=${(e: CustomEvent<{ acceso: boolean }>) => {
                        this.scelti = e.detail.acceso
                          ? this.scelti.concat(p.id)
                          : this.scelti.filter(x => x !== p.id);
                      }}>${p.nome}</cmd-chip>`)}
        </div>
        <p class="quante">${this.scelti.length
          ? t('{n} scelte', { n: this.scelti.length })
          : t('nessuna scelta ancora')}</p>

        <div class="azioni">
          <cmd-bottone variante="principale" @click=${this.salva}>${t('Salva menu')}</cmd-bottone>
          <cmd-bottone variante="fantasma"
                       @click=${() => this.manda('menu-annulla', {})}>${t('Annulla')}</cmd-bottone>
        </div>
      </div>`;
  }
}

customElements.define('cmd-scheda-menu', SchedaMenu);

declare global {
  interface HTMLElementTagNameMap {
    'cmd-menu': Menu;
    'cmd-scheda-menu': SchedaMenu;
  }
}
