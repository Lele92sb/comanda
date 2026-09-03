// ============================================================================
// <cmd-scheda> — una riga di elenco con dei comandi a destra.
//
// E' lo schema piu' ripetuto dell'app: la brigata, gli ingredienti, i
// fornitori, i piatti, le sub-ricette, i menu. Sei elenchi, sei volte lo stesso
// markup scritto a mano, e si erano gia' allontanati fra loro — in tre di
// questi i comandi stanno in colonna, negli altri in riga, e nessuno ha mai
// deciso che dovessero essere diversi.
//
// Non decide NIENTE del contenuto: nome, dettagli e comandi glieli si mettono
// dentro. Decide solo la forma — dove sta il nome, dove stanno i comandi, e che
// su uno schermo stretto i comandi scendono sotto invece di schiacciare il
// nome a due lettere.
// ============================================================================
import { html, css, nothing, type TemplateResult } from 'lit';
import { Elemento } from './base.ts';

export class Scheda extends Elemento {
  static override properties = {
    titolo: { type: String },
    /** Comandi in colonna a destra invece che in riga. Per elenchi con 3+ azioni. */
    incolonna: { type: Boolean, reflect: true },
    /**
     * La riga si apre: tutta la scheda diventa un bersaglio, e il titolo un
     * bottone vero.
     *
     * IL BOTTONE VERO NON E' PIGNOLERIA. Un <div> con un `onclick` non lo
     * raggiunge il tabulatore, non compare nell'elenco dei comandi di un
     * lettore di schermo, e Invio non lo preme. Qui il titolo E' un
     * <button>: chi usa la tastiera lo trova, chi usa il dito puo' toccare
     * ovunque sulla riga. Due strade, un solo evento.
     */
    apribile: { type: Boolean, reflect: true },
  };

  declare titolo: string;
  declare incolonna: boolean;
  declare apribile: boolean;

  constructor() {
    super();
    this.titolo = '';
    this.incolonna = false;
    this.apribile = false;
  }

  static override styles = [Elemento.styles, css`
    :host{display:block;margin-bottom:var(--space-2);}
    .scatola{
      display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-3);
      background:var(--bg-elev);border:1px solid var(--line);
      border-radius:var(--radius-md);padding:var(--space-3);
    }
    .dati{min-width:0;flex:1;}
    .titolo{
      display:flex;align-items:center;flex-wrap:wrap;gap:var(--space-2);
      font-weight:600;font-size:var(--text-md);line-height:1.35;overflow-wrap:anywhere;
    }
    .azioni{display:flex;gap:var(--space-2);flex-shrink:0;flex-wrap:wrap;justify-content:flex-end;}

    /* SI APRE. Il fondo che si scalda dice «questo si tocca» prima del tocco;
       senza, l'unico modo di scoprirlo e' provarci. Il bersaglio e' tutta la
       riga: su un telefono un titolo di dodici pixel e' un bersaglio da
       bambini, la riga intera no. */
    :host([apribile]) .scatola{cursor:pointer;transition:background-color var(--tempo-istante) var(--curva),border-color var(--tempo-istante) var(--curva);}
    :host([apribile]) .scatola:hover{background:var(--bg-elev2);border-color:var(--line-strong);}
    button.titolo{
      display:flex;align-items:center;flex-wrap:wrap;gap:var(--space-2);
      background:none;border:0;padding:0;margin:0;width:100%;
      color:inherit;font-family:inherit;font-weight:600;font-size:var(--text-md);
      line-height:1.35;text-align:left;cursor:pointer;
    }
    /* Il contorno del fuoco sta sulla SCATOLA e non sul titolo: e' la riga che
       si apre, ed e' la riga che deve dire «sono io quella scelta». */
    button.titolo:focus{outline:none;}
    button.titolo:focus-visible{outline:none;}
    :host([apribile]) .scatola:has(button.titolo:focus-visible){
      outline:var(--fuoco);outline-offset:var(--fuoco-stacco);
    }
    :host([incolonna]) .azioni{flex-direction:column;align-items:flex-end;}

    /* Sotto i 480px i comandi scendono: con due bottoni a destra il nome di un
       ingrediente si riduceva a «Aspar…» su un telefono. */
    @media(max-width:480px){
      .scatola{flex-direction:column;align-items:stretch;}
      .azioni{justify-content:flex-start;}
      :host([incolonna]) .azioni{flex-direction:row;align-items:stretch;}
    }
  `];

  private apri(): void {
    if (!this.apribile) return;
    this.dispatchEvent(new CustomEvent('cmd-scheda-apri', { bubbles: true, composed: true }));
  }

  override render(): TemplateResult {
    // Sul bottone del titolo non c'e' nessun gestore, e va bene cosi': premendo
    // Invio o la barra il browser genera un `click` per conto suo, che risale
    // alla scatola esattamente come quello del dito. Un gestore in piu' qui
    // vorrebbe dire aprire due volte.
    const dentro = html`${this.titolo
      ? html`${this.titolo}<slot name="stato"></slot>`
      : html`<slot name="titolo"></slot><slot name="stato"></slot>`}`;

    return html`
      <div class="scatola" @click=${this.apri}>
        <div class="dati">
          ${this.apribile
            ? html`<button type="button" class="titolo">${dentro}</button>`
            : html`<div class="titolo">${dentro}</div>`}
          <slot></slot>
        </div>
        <!-- I comandi a destra NON aprono la riga: «Elimina» che apre la scheda
             sarebbe il modo piu' veloce di far cancellare la cosa sbagliata. -->
        <div class="azioni" @click=${(e: Event) => e.stopPropagation()}><slot name="azioni"></slot></div>
      </div>`;
  }
}

customElements.define('cmd-scheda', Scheda);

declare global {
  interface HTMLElementTagNameMap { 'cmd-scheda': Scheda }
}
