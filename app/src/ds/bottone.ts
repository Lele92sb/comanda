// ============================================================================
// <cmd-bottone> — il comando.
//
// QUATTRO VARIANTI, E SONO QUATTRO SIGNIFICATI, non quattro gusti:
//   principale  l'azione che la schermata esiste per fare. UNA per schermata.
//   fantasma    un'azione possibile ma non quella che ci si aspetta.
//   pericolo    un'azione che toglie qualcosa e non si torna indietro.
//   piano       un comando di servizio, che non deve rubare l'occhio.
// Chi ne vuole una quinta sta quasi sempre chiedendo una di queste quattro.
//
// TRE COSE CHE PRIMA NON C'ERANO E CHE SI SENTONO:
//
// 1. SI ABBASSA QUANDO LO PREMI. Novanta millesimi di secondo. Non e' un
//    vezzo: e' l'unico modo che ha chi tocca uno schermo di sapere che il
//    tocco e' arrivato, prima ancora che succeda qualcosa.
//
// 2. SA DI STARE LAVORANDO. `inCorso` lo blocca e ci mette una rotellina.
//    Prima si premeva «Genera turni» e per cinque secondi non succedeva
//    niente: chi guardava premeva di nuovo.
//
// 3. SI TOCCA DAVVERO. Su un dispositivo a tocco l'altezza minima e' 44px,
//    la stessa soglia della cella dei turni. Il vecchio .btn ne misurava 37.
//    La condizione guarda il PUNTATORE, non la larghezza dello schermo: un
//    tablet largo si tocca con le dita esattamente come un telefono.
// ============================================================================
import { html, css, nothing, type TemplateResult } from 'lit';
import { Elemento } from './base.ts';

export type VarianteBottone = 'principale' | 'fantasma' | 'pericolo' | 'piano';
export type MisuraBottone = 'normale' | 'piccolo';

export class Bottone extends Elemento {
  /* IL FUOCO ATTRAVERSA IL CONFINE. Senza questo, chiamare .focus() sul
     componente non fa niente: il <button> vero sta dentro lo shadow DOM e da
     fuori non lo si raggiunge. Serve a chi naviga da tastiera e a chi, dopo
     aver riordinato un elenco, deve ritrovare il comando che ha appena premuto
     — vedi l'elenco della brigata. */
  static override shadowRootOptions = { ...Elemento.shadowRootOptions, delegatesFocus: true };

  static override properties = {
    variante: { type: String, reflect: true },
    misura: { type: String, reflect: true },
    pieno: { type: Boolean, reflect: true },
    disabilitato: { type: Boolean, reflect: true },
    inCorso: { type: Boolean, reflect: true, attribute: 'in-corso' },
    tipo: { type: String },
    etichetta: { type: String },
  };

  // `declare` e assegnazione nel costruttore: con `useDefineForClassFields`
  // attivo — che e' il comportamento moderno — un campo di classe normale
  // sovrascriverebbe gli accessori che Lit installa sul prototipo, e la
  // proprieta' smetterebbe di ridisegnare. Non da' nessun errore: semplicemente
  // il componente non si aggiorna piu'.
  declare variante: VarianteBottone;
  declare misura: MisuraBottone;
  declare pieno: boolean;
  declare disabilitato: boolean;
  declare inCorso: boolean;
  declare tipo: 'button' | 'submit';
  /** Descrizione per chi non vede l'icona. Obbligatoria se dentro c'e' solo un simbolo. */
  declare etichetta: string;

  constructor() {
    super();
    this.variante = 'principale';
    this.misura = 'normale';
    this.pieno = false;
    this.disabilitato = false;
    this.inCorso = false;
    this.tipo = 'button';
    this.etichetta = '';
  }

  static override styles = [Elemento.styles, css`
    :host{display:inline-flex;vertical-align:middle;}
    :host([pieno]){display:flex;width:100%;}
    :host([pieno]) button{width:100%;}

    button{
      display:inline-flex;align-items:center;justify-content:center;gap:var(--space-2);
      min-height:40px;padding:10px 16px;
      border:1px solid transparent;border-radius:var(--radius-sm);
      font-family:var(--font-body);font-size:var(--text-md);font-weight:600;letter-spacing:0.2px;
      line-height:1.2;white-space:nowrap;cursor:pointer;
      transition:background-color var(--tempo-istante) var(--curva),
                 border-color var(--tempo-istante) var(--curva),
                 color var(--tempo-istante) var(--curva),
                 transform var(--tempo-istante) var(--curva);
    }
    /* Il dito non e' il mouse: 44px e' la soglia sotto la quale si sbaglia
       bersaglio, e vale su qualunque schermo si tocchi. */
    @media (pointer:coarse){ button{min-height:var(--tocco-min);} }

    button:active:not(:disabled){transform:scale(0.97);}
    button:disabled{cursor:default;opacity:0.45;}

    :host([variante=principale]) button{background:var(--copper);color:var(--ink);}
    :host([variante=principale]) button:hover:not(:disabled){background:var(--copper-light);}

    :host([variante=fantasma]) button{background:transparent;border-color:var(--line-strong);color:var(--paper);font-weight:500;}
    :host([variante=fantasma]) button:hover:not(:disabled){border-color:var(--copper);}

    :host([variante=pericolo]) button{background:transparent;border-color:rgba(168,65,47,0.45);color:var(--alert);font-weight:500;}
    :host([variante=pericolo]) button:hover:not(:disabled){background:var(--alert-soft);border-color:var(--alert);}

    :host([variante=piano]) button{background:transparent;color:var(--brass);font-family:var(--font-body);font-weight:400;font-size:var(--text-xs);}
    :host([variante=piano]) button:hover:not(:disabled){color:var(--paper);}

    :host([misura=piccolo]) button{min-height:32px;padding:6px 10px;font-size:var(--text-sm);}
    @media (pointer:coarse){ :host([misura=piccolo]) button{min-height:36px;} }

    /* La rotellina occupa lo spazio di un'icona a sinistra dell'etichetta: il
       bottone non cambia larghezza mentre lavora, altrimenti la fila di
       comandi accanto si sposta sotto le dita di chi sta premendo. */
    .giro{
      width:13px;height:13px;flex:0 0 auto;border-radius:50%;
      border:2px solid currentColor;border-top-color:transparent;
      animation:gira 620ms linear infinite;
    }
    @keyframes gira{to{transform:rotate(360deg);}}
    @media (prefers-reduced-motion: reduce){
      .giro{animation:none;opacity:0.55;}
    }
  `];

  override render(): TemplateResult {
    return html`
      <button
        part="bottone"
        type=${this.tipo}
        ?disabled=${this.disabilitato || this.inCorso}
        aria-label=${this.etichetta || nothing}
        aria-busy=${this.inCorso ? 'true' : nothing}
      >
        ${this.inCorso ? html`<span class="giro" aria-hidden="true"></span>` : nothing}
        <slot></slot>
      </button>`;
  }
}

customElements.define('cmd-bottone', Bottone);

declare global {
  interface HTMLElementTagNameMap { 'cmd-bottone': Bottone }
}
