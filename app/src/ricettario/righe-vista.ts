// ============================================================================
// <cmd-righe-ricetta> — i componenti di una ricetta, riga per riga.
//
// E' il pezzo piu' riusato del ricettario: le sub-ricette e i piatti hanno
// esattamente lo stesso elenco, e infatti gia' prima era una funzione sola
// (renderItemRows). Qui diventa un componente, e la differenza si vede in due
// punti.
//
// 1. LA RICERCA. Prima era un <datalist> del browser: disegnato dal sistema, e
//    con la pretesa della corrispondenza ESATTA — scrivendo «asparagi» con
//    «Punte di asparagi» in anagrafica rispondeva «nessuna corrispondenza».
//    Adesso e' <cmd-scelta cercabile>: si cerca per contenuto e si sceglie da
//    un elenco, quindi una riga con un riferimento sbagliato non e' piu'
//    possibile.
//
// 2. IL COSTO DELLA RIGA. Ce l'aveva gia', ma solo dopo il ridisegno: qui
//    arriva dal collante a ogni modifica, che e' l'unico che sa quanto costa
//    un ingrediente dopo lo scarto e quanto una sub-ricetta dopo il calo.
//
// TRE TIPI DI RIGA, e sono tre cose diverse:
//   ingrediente  una voce dell'anagrafica, col suo costo e la sua resa
//   sub          un'altra ricetta usata dentro questa (un fondo, una salsa)
//   libera       una voce scritta a mano col suo prezzo, per quello che in
//                anagrafica non c'e' e non vale la pena di metterci
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { t } from '../core/lingua.ts';
import '../ds/bottone.ts';
import '../ds/scelta.ts';
import type { Opzione } from '../ds/scelta.ts';

export type TipoRiga = 'ingredient' | 'sub' | 'custom';

export interface RigaRicetta {
  /** Chiave stabile, assegnata da chi passa i dati: serve a non far saltare i
      campi mentre si scrive quando una riga viene tolta piu' su. */
  chiave: string;
  tipo: TipoRiga;
  /** Id dell'ingrediente o della sub-ricetta. '' se non ancora scelto. */
  refId: string;
  /** Nome della voce libera. */
  nome: string;
  qta: string;
  unita: string;
  /** Prezzo per unita' della voce libera. */
  costoUnitario: string;
  /** Costo della riga, gia' calcolato da chi passa i dati. */
  costoRiga: number;
  unitaPossibili: string[];
}

export class RigheRicetta extends LitElement {
  static override properties = {
    righe: { type: Array },
    ingredienti: { type: Array },
    sottoricette: { type: Array },
    soloLettura: { type: Boolean, reflect: true, attribute: 'solo-lettura' },
  };

  declare righe: RigaRicetta[];
  declare ingredienti: Opzione[];
  declare sottoricette: Opzione[];
  declare soloLettura: boolean;

  constructor() {
    super();
    this.righe = [];
    this.ingredienti = [];
    this.sottoricette = [];
    this.soloLettura = false;
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}

    .riga{
      display:grid;gap:var(--space-2);align-items:center;
      grid-template-columns:126px 1fr 84px 92px auto;
      background:var(--bg-elev2);border-radius:var(--radius-sm);
      padding:var(--space-2);margin-bottom:var(--space-2);
    }
    /* Sotto i 700px la riga si spezza: tipo e voce sopra, quantita' e unita'
       sotto. Comprimendo tutto su una riga sola la tendina dell'ingrediente
       scendeva a 60px e non ci stava nemmeno «Asp…». */
    @media(max-width:700px){
      .riga{grid-template-columns:1fr 1fr auto;}
      .riga .tipo{grid-column:1/3;}
      .riga .voce{grid-column:1/-1;}
    }

    input{
      width:100%;
      background:var(--bg);border:1px solid var(--line-strong);color:var(--paper);
      padding:8px 10px;border-radius:var(--radius-sm);
      font-family:var(--font-body);font-size:var(--text-sm);
    }
    input:focus{outline:var(--fuoco);outline-offset:var(--fuoco-stacco);border-color:var(--copper);}
    input.numero{font-family:var(--font-mono);text-align:right;}
    @media (pointer:coarse){ input{min-height:var(--tocco-min);} }

    .costo{
      grid-column:1/-1;
      font-family:var(--font-mono);font-size:var(--text-xs);color:var(--brass);
      text-align:right;
    }
    .costo.manca{color:var(--alert);}
    .vuoto{
      font-family:var(--font-mono);font-size:var(--text-sm);color:var(--brass);
      border:1px dashed var(--line-strong);border-radius:var(--radius-md);
      padding:var(--space-3);text-align:center;margin-bottom:var(--space-2);
    }
  `;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private cambia(i: number, campo: string, valore: string): void {
    this.manda('riga-cambia', { indice: i, campo, valore });
  }

  private riga(r: RigaRicetta, i: number): TemplateResult {
    const opzioniTipo: Opzione[] = [
      { valore: 'ingredient', etichetta: t('Ingrediente') },
      { valore: 'sub', etichetta: t('Sub-ricetta') },
      { valore: 'custom', etichetta: t('Voce libera') },
    ];
    const opzioniVoce = r.tipo === 'ingredient' ? this.ingredienti : this.sottoricette;
    const opzioniUnita: Opzione[] = r.unitaPossibili.map(u => ({ valore: u, etichetta: u }));

    return html`
      <div class="riga">
        <cmd-scelta class="tipo" .opzioni=${opzioniTipo} valore=${r.tipo}
                    etichetta=${t('Tipo di riga')}
                    ?disabilitato=${this.soloLettura}
                    @cmd-cambio=${(e: CustomEvent<{ valore: string }>) => this.cambia(i, 'tipo', e.detail.valore)}></cmd-scelta>

        ${r.tipo === 'custom'
          ? html`<input class="voce" type="text" .value=${r.nome} placeholder=${t('nome voce')}
                        aria-label=${t('Nome della voce')}
                        ?disabled=${this.soloLettura}
                        @change=${(e: Event) => this.cambia(i, 'nome', (e.target as HTMLInputElement).value)}>`
          : html`<cmd-scelta class="voce" cercabile .opzioni=${opzioniVoce} valore=${r.refId}
                            segnaposto=${r.tipo === 'ingredient' ? t('scegli un ingrediente') : t('scegli una sub-ricetta')}
                            etichetta=${r.tipo === 'ingredient' ? t('Ingrediente') : t('Sub-ricetta')}
                            ?disabilitato=${this.soloLettura}
                            @cmd-cambio=${(e: CustomEvent<{ valore: string }>) => this.cambia(i, 'refId', e.detail.valore)}></cmd-scelta>`}

        <input class="numero" type="number" step="0.001" value=${r.qta} placeholder=${t('qtà')}
               aria-label=${t('Quantità')}
               ?disabled=${this.soloLettura}
               @input=${(e: Event) => this.cambia(i, 'qta', (e.target as HTMLInputElement).value)}>

        <cmd-scelta .opzioni=${opzioniUnita} valore=${r.unita} etichetta=${t('Unità')}
                    ?disabilitato=${this.soloLettura}
                    @cmd-cambio=${(e: CustomEvent<{ valore: string }>) => this.cambia(i, 'unita', e.detail.valore)}></cmd-scelta>

        ${this.soloLettura ? nothing : html`
          <cmd-bottone misura="piccolo" variante="pericolo"
                       etichetta=${t('Togli questa riga')}
                       @click=${() => this.manda('riga-togli', { indice: i })}>✕</cmd-bottone>`}

        ${r.tipo === 'custom'
          ? html`<input class="numero costo-libero" type="number" step="0.01" value=${r.costoUnitario}
                        placeholder="€/unità" aria-label=${t('Prezzo per unità')}
                        style="grid-column:1/-1"
                        ?disabled=${this.soloLettura}
                        @input=${(e: Event) => this.cambia(i, 'costoUnitario', (e.target as HTMLInputElement).value)}>`
          : html`<div class="costo ${r.refId ? '' : 'manca'}">${r.refId
              ? t('costo riga') + ': € ' + r.costoRiga.toFixed(3)
              : '⚠ ' + t('scegli una voce, altrimenti questa riga non conta niente')}</div>`}
      </div>`;
  }

  override render(): TemplateResult {
    return html`
      ${this.righe.length
        ? repeat(this.righe, r => r.chiave, (r, i) => this.riga(r, i))
        : html`<div class="vuoto">${t('Nessun componente ancora.')}</div>`}
      ${this.soloLettura ? nothing : html`
        <cmd-bottone misura="piccolo" variante="fantasma"
                     @click=${() => this.manda('riga-aggiungi', {})}>+ ${t('Componente')}</cmd-bottone>`}`;
  }
}

customElements.define('cmd-righe-ricetta', RigheRicetta);

declare global {
  interface HTMLElementTagNameMap { 'cmd-righe-ricetta': RigheRicetta }
}
