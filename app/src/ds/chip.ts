// ============================================================================
// <cmd-chip> — un interruttore che si legge come un'etichetta.
//
// Serve dove la scelta e' fra molte cose brevi e ne valgono piu' d'una:
// a quali partite si da' una mano, quali servizi copre un turno, quali codici
// stanno in una quota. Una fila di caselle di spunta occuperebbe cinque volte
// lo spazio e si leggerebbe peggio.
//
// E' un BOTTONE con aria-pressed, non una casella: chi usa un lettore di
// schermo sente «attivo/non attivo» e non «selezionato», che e' la parola
// giusta perche' premendolo si accende, non si sceglie fra alternative.
//
// Nel codice di oggi questo pattern esiste gia' in cinque schermate, scritto a
// mano cinque volte come .chip-toggle. Erano gia' partiti ad allontanarsi fra
// loro: in una fila i chip avevano 5px di riempimento, in un'altra 8.
// ============================================================================
import { html, css, type TemplateResult } from 'lit';
import { Elemento } from './base.ts';

export class Chip extends Elemento {
  static override properties = {
    acceso: { type: Boolean, reflect: true },
    disabilitato: { type: Boolean, reflect: true },
  };

  declare acceso: boolean;
  declare disabilitato: boolean;

  constructor() {
    super();
    this.acceso = false;
    this.disabilitato = false;
  }

  static override styles = [Elemento.styles, css`
    :host{display:inline-flex;}
    button{
      display:inline-flex;align-items:center;gap:6px;
      min-height:32px;padding:6px 11px;
      background:transparent;border:1px solid var(--line-strong);border-radius:var(--radius-pill);
      color:var(--paper);font-family:var(--font-body);font-weight:600;font-size:var(--text-sm);
      line-height:1.2;cursor:pointer;
      transition:background-color var(--tempo-istante) var(--curva),
                 border-color var(--tempo-istante) var(--curva),
                 color var(--tempo-istante) var(--curva),
                 transform var(--tempo-istante) var(--curva);
    }
    @media (pointer:coarse){ button{min-height:36px;padding:8px 12px;} }
    button:hover:not(:disabled){border-color:var(--brass);}
    button:active:not(:disabled){transform:scale(0.96);}
    button:disabled{opacity:0.4;cursor:default;}
    :host([acceso]) button{background:var(--copper);border-color:var(--copper);color:var(--ink);font-weight:700;}
    :host([acceso]) button:hover:not(:disabled){background:var(--copper-light);border-color:var(--copper-light);}
  `];

  /* NON SI ACCENDE DA SOLO. Dice cosa vorrebbe diventare, e aspetta.
     Prima faceva `this.acceso = !this.acceso` e poi avvisava. Sembra
     comodo — un chip che funziona anche da solo — ma qui NESSUNO lo usa da
     solo: tutti gli danno `?acceso` dall'esterno, perche' lo stato vero sta
     nei dati (l'allergene e' nell'elenco? il modo scelto e' questo?).
     Con due padroni si rompe, e in un modo che sembra un difetto della
     schermata: Lit non riscrive una proprieta' che secondo lui non e'
     cambiata, quindi dopo che il chip si e' acceso da solo Lit non lo
     rispegne piu'. Sui tre modi delle «ore che avanzano» — che sono
     alternativi — restavano accesi tutti e tre insieme.
     L'evento porta il valore DESIDERATO, cosi' chi lo usa come interruttore
     legge `detail.acceso` e sa gia' cosa fare. */
  private premuto(): void {
    if (this.disabilitato) return;
    this.emetti('cmd-chip', { acceso: !this.acceso });
  }

  override render(): TemplateResult {
    return html`
      <button type="button"
              aria-pressed=${this.acceso ? 'true' : 'false'}
              ?disabled=${this.disabilitato}
              @click=${this.premuto}>
        <slot></slot>
      </button>`;
  }
}

customElements.define('cmd-chip', Chip);

declare global {
  interface HTMLElementTagNameMap { 'cmd-chip': Chip }
}
