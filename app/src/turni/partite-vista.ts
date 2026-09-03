// ============================================================================
// <cmd-partite> — la schermata delle partite, come COMPONENTE.
//
// E' la prima schermata dell'app che smette di essere una stringa di HTML.
// Prima erano 148 righe che costruivano il markup a mano e poi riagganciavano
// nove ascoltatori con querySelectorAll; ogni singola modifica — rinominare,
// cambiare colore, spostare su di uno — buttava via tutto e ridisegnava.
// Si vedeva: il selettore del colore si chiudeva da solo, il cursore usciva
// dal campo del nome, la pagina tornava in cima.
//
// NON SA NIENTE DI COMANDA. Riceve delle partite gia' pronte da disegnare e
// manda eventi quando chi guarda vuole cambiare qualcosa. Non conosce `state`,
// non conosce `save`, non sa cosa sia una cucina.
// Il collante sta in stazioni.js, che e' l'unico posto dove questa schermata
// tocca i dati veri. Sono trenta righe, e si leggono tutte insieme.
//
// Il guadagno non e' estetico: questo componente si apre nel banco, da solo,
// senza account e senza database. Chi lavora sull'aspetto delle partite non
// deve piu' avere una cucina vera per vederle.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { t } from '../core/lingua.ts';
import '../ds/bottone.ts';
import '../ds/campo.ts';
import '../ds/chip.ts';
import '../ds/vuoto.ts';

export interface PartitaVista {
  id: string;
  nome: string;
  /** Gia' risolto in #rrggbb da chi passa i dati: la vista non calcola colori. */
  colore: string;
  /** Gli id delle partite a cui chi sta qui da' una mano. */
  copre: string[];
}

export class Partite extends LitElement {
  static override properties = {
    partite: { type: Array },
    soloLettura: { type: Boolean, reflect: true, attribute: 'solo-lettura' },
  };

  declare partite: PartitaVista[];
  declare soloLettura: boolean;

  constructor() {
    super();
    this.partite = [];
    this.soloLettura = false;
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}

    .spiega{
      font-family:var(--font-body);font-size:var(--text-xs);color:var(--brass);
      line-height:1.6;margin:0 0 var(--space-3);
    }
    .aggiungi{display:grid;grid-template-columns:1fr auto;gap:var(--space-2);
      align-items:end;margin-bottom:var(--space-4);}
    /* Su schermo stretto il campo e il bottone si impilano, e il bottone prende
       la riga intera: incolonnato e stretto sembrerebbe uno dei tanti comandi
       della pagina invece dell'unica cosa da fare li'. */
    @media(max-width:560px){
      .aggiungi{grid-template-columns:1fr;}
      .aggiungi cmd-bottone{display:flex;}
      .aggiungi cmd-bottone::part(bottone){width:100%;}
    }

    .scheda{
      background:var(--bg-elev);border:1px solid var(--line);
      border-radius:var(--radius-md);padding:var(--space-3);margin-bottom:var(--space-2);
    }
    .testa{display:flex;align-items:center;gap:var(--space-3);}
    .identita{display:flex;align-items:center;gap:var(--space-3);flex:1;min-width:0;}
    .comandi{display:flex;align-items:center;gap:var(--space-2);flex-shrink:0;}

    /* Il selettore nativo e' un rettangolo grigio col bordo di sistema. Qui e'
       un pallino della stessa forma di quello che poi comparira' nella griglia:
       quello che scegli e quello che vedi sono la stessa cosa. */
    input[type=color]{
      width:30px;height:30px;flex-shrink:0;padding:0;
      border:1px solid var(--line-strong);border-radius:50%;
      background:none;cursor:pointer;
    }
    input[type=color]::-webkit-color-swatch-wrapper{padding:2px;}
    input[type=color]::-webkit-color-swatch{border:0;border-radius:50%;}
    input[type=color]::-moz-color-swatch{border:0;border-radius:50%;}

    input[type=text]{
      flex:1;min-width:0;
      background:var(--bg-elev2);border:1px solid transparent;color:var(--paper);
      padding:8px 10px;border-radius:var(--radius-sm);
      font-family:var(--font-body);font-size:var(--text-md);font-weight:600;
      transition:border-color var(--tempo-istante) var(--curva);
    }
    input[type=text]:hover{border-color:var(--line-strong);}
    input[type=text]:focus{outline:var(--fuoco);outline-offset:var(--fuoco-stacco);border-color:var(--copper);}
    @media (pointer:coarse){ input[type=text]{min-height:var(--tocco-min);} }

    .nota{
      font-family:var(--font-body);font-size:var(--text-sm);color:var(--brass);
      line-height:1.6;margin:var(--space-2) 0 0;
    }
    .nota b{color:var(--paper-dim);}
    .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:var(--space-1);}

    /* Le frecce quadrate, grandi abbastanza per un dito. Spento vuol dire
       «sei gia' in cima»: si vede, invece di non esserci. */
    .freccia::part(bottone){width:36px;}
  `;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private nomiDi(ids: string[]): string {
    return ids
      .map(id => this.partite.find(p => p.id === id)?.nome)
      .filter((x): x is string => Boolean(x))
      .join(' e ');
  }

  private aggiungi(): void {
    const campo = this.renderRoot.querySelector<HTMLInputElement>('#nuova');
    const nome = (campo?.value ?? '').trim();
    if (!nome) {
      this.manda('partita-nome-vuoto', {});
      campo?.focus();
      return;
    }
    this.manda('partita-aggiungi', { nome });
    if (campo) { campo.value = ''; campo.focus(); }
  }

  private scheda(p: PartitaVista, i: number): TemplateResult {
    const ultima = i === this.partite.length - 1;
    const altre = this.partite.filter(x => x.id !== p.id);
    // Chi da' una mano A QUESTA: e' la stessa relazione letta al contrario, ed
    // e' la riga che risponde alla domanda vera del titolare — «al lavaggio chi
    // ci arriva?».
    const riceve = this.partite.filter(x => x.copre.includes(p.id));

    return html`
      <div class="scheda">
        <div class="testa">
          <div class="identita">
            <input type="color" .value=${p.colore}
                   title=${t('Colore del pallino nella griglia')}
                   aria-label=${t('Colore di {nome}', { nome: p.nome })}
                   ?disabled=${this.soloLettura}
                   @change=${(e: Event) =>
                     this.manda('partita-colore', { id: p.id, colore: (e.target as HTMLInputElement).value })}>
            <input type="text" .value=${p.nome}
                   aria-label=${t('Nome della partita')}
                   ?disabled=${this.soloLettura}
                   @change=${(e: Event) =>
                     this.manda('partita-rinomina', { id: p.id, nome: (e.target as HTMLInputElement).value })}>
          </div>
          <div class="comandi">
            ${this.partite.length > 1 && !this.soloLettura ? html`
              ${i > 0 ? html`
                <cmd-bottone class="freccia" misura="piccolo" variante="fantasma"
                             etichetta=${t('Sposta {nome} su', { nome: p.nome })}
                             @click=${() => this.manda('partita-sposta', { id: p.id, verso: -1 })}>▲</cmd-bottone>` : nothing}
              ${!ultima ? html`
                <cmd-bottone class="freccia" misura="piccolo" variante="fantasma"
                             etichetta=${t('Sposta {nome} giù', { nome: p.nome })}
                             @click=${() => this.manda('partita-sposta', { id: p.id, verso: 1 })}>▼</cmd-bottone>` : nothing}` : nothing}
            ${this.soloLettura ? nothing : html`
              <cmd-bottone misura="piccolo" variante="pericolo"
                           @click=${() => this.manda('partita-elimina', { id: p.id })}>${t('Elimina')}</cmd-bottone>`}
          </div>
        </div>

        ${altre.length ? html`
          <p class="nota">${t('Chi lavora qui dà una mano anche a:')}</p>
          <div class="chips">
            ${altre.map(x => html`
              <cmd-chip ?acceso=${p.copre.includes(x.id)}
                        ?disabilitato=${this.soloLettura}
                        @cmd-chip=${(e: CustomEvent<{ acceso: boolean }>) =>
                          this.manda('partita-mano', { da: p.id, a: x.id, acceso: e.detail.acceso })}
              >${x.nome}</cmd-chip>`)}
          </div>
          <p class="nota">${p.copre.length
            ? html`✋ ${t('Nel fabbisogno di')} <b>${this.nomiDi(p.copre)}</b> ${t('chi sta qui conta come presente.')}`
            : t('Nessuna: chi sta qui sta solo qui.')}</p>` : nothing}

        ${riceve.length ? html`
          <p class="nota">↩ ${t('Riceve una mano da:')} <b>${riceve.map(x => x.nome).join(', ')}</b></p>` : nothing}
      </div>`;
  }

  override render(): TemplateResult {
    return html`
      ${this.soloLettura ? nothing : html`
        <div class="aggiungi">
          <cmd-campo etichetta=${t('Nuova partita')} style="margin:0">
            <input type="text" id="nuova" placeholder=${t('Nome stazione, es. Griglia')}
                   @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this.aggiungi(); }}>
          </cmd-campo>
          <cmd-bottone variante="principale" @click=${this.aggiungi}>${t('Aggiungi')}</cmd-bottone>
        </div>`}

      ${this.partite.length === 0
        ? html`
          <cmd-vuoto simbolo="🍳" titolo=${t('Nessuna partita')}
                     spiega=${t('Le partite sono i posti della cucina: pass, antipasti, primi, lavaggio. Il generatore le usa per sapere dove serve qualcuno, e i colori che scegli qui sono i pallini che vedrai nella griglia dei turni.')}>
          </cmd-vuoto>`
        : html`
          ${this.partite.length > 1 ? html`
            <p class="spiega">${t('Una partita può dare una mano a un\'altra senza spostarsi: chi sta alle insalate, mentre ci sta, aiuta anche al lavaggio. Il generatore lo conta fra le persone del lavaggio e lo lascia alle insalate. Se la partita a cui dà una mano ne copre a sua volta una terza, la mano arriva fino in fondo.')}</p>` : nothing}
          ${repeat(this.partite, p => p.id, (p, i) => this.scheda(p, i))}`}`;
  }
}

customElements.define('cmd-partite', Partite);

declare global {
  interface HTMLElementTagNameMap { 'cmd-partite': Partite }
}
