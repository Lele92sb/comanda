// ============================================================================
// <cmd-comanda> — la carta strappata.
//
// E' l'unico pezzo dell'app che non e' scuro, ed e' voluto: un piatto, una
// sub-ricetta e un menu si guardano come si guarda una comanda sul passe —
// carta chiara, strappo in cima, un numero d'ordine a destra. E' l'identita'
// del prodotto, non una decorazione, ed e' il motivo per cui vale la pena che
// sia un componente invece di tre copie di HTML che col tempo divergono.
//
// LO STRAPPO e' fatto con un gradiente ripetuto, non con un'immagine: cosi'
// segue la larghezza qualunque essa sia, non pesa niente da scaricare, e resta
// nitido su qualunque schermo.
//
// Le parti si passano dai posti (slot), non da mille proprieta': titolo,
// categoria, numero, il corpo e i comandi in fondo. Un componente con quindici
// proprieta' e' un componente che nessuno usa senza rileggersi il codice.
// ============================================================================
import { html, css, nothing, type TemplateResult } from 'lit';
import { Elemento } from './base.ts';

export class Comanda extends Elemento {
  static override properties = {
    titolo: { type: String },
    categoria: { type: String },
    numero: { type: String },
  };

  declare titolo: string;
  /** La riga piccola sotto il titolo: la categoria, la resa, quante portate. */
  declare categoria: string;
  /** Il numero d'ordine a destra, es. «SUB003». */
  declare numero: string;

  constructor() {
    super();
    this.titolo = '';
    this.categoria = '';
    this.numero = '';
  }

  static override styles = [Elemento.styles, css`
    :host{display:block;margin-bottom:18px;}
    .carta{
      position:relative;
      background:var(--paper);color:var(--ink);
      border-radius:2px;padding:18px 18px 16px;
      box-shadow:var(--shadow-card);
    }
    /* Lo strappo in cima. Il gradiente disegna una fila di semicerchi vuoti:
       segue la larghezza da solo e non e' un'immagine da scaricare. */
    .carta::before{
      content:"";position:absolute;top:-1px;left:0;right:0;height:10px;
      background:radial-gradient(circle at 10px 0, transparent 6px, var(--paper) 6.5px)
                 top left/20px 10px repeat-x;
    }
    header{
      display:flex;justify-content:space-between;align-items:flex-start;gap:10px;
      border-bottom:1px dashed rgba(29,27,24,0.25);
      padding-bottom:10px;margin-bottom:10px;
    }
    .titolo{font-family:var(--font-display);font-weight:600;font-size:19px;line-height:1.2;
      overflow-wrap:anywhere;}
    .categoria{font-family:var(--font-mono);font-size:10px;text-transform:uppercase;
      letter-spacing:1px;color:var(--copper);margin-top:3px;}
    .numero{font-family:var(--font-mono);font-size:11px;color:rgba(29,27,24,0.5);
      text-align:right;flex-shrink:0;}

    /* I COMANDI SULLA CARTA SI RIBALTANO. E' l'unico posto dell'app dove il
       fondo e' chiaro, e un bottone «fantasma» pensato per il buio qui sarebbe
       testo chiaro su carta chiara: invisibile.
       Non si ridefiniscono gli stili del bottone — si ridefiniscono i TOKEN
       per questo pezzo di albero. Le variabili CSS attraversano il confine
       dello shadow DOM, quindi un <cmd-bottone> messo qui dentro si veste da
       solo, senza sapere niente di dove sta. E' esattamente il motivo per cui
       i token stanno in un file loro. */
    .comandi{
      display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;
      --paper:var(--ink);
      --line-strong:rgba(29,27,24,0.28);
      --bg-elev2:rgba(29,27,24,0.06);
      --brass:rgba(29,27,24,0.55);
    }
  `];

  override render(): TemplateResult {
    return html`
      <div class="carta">
        <header>
          <div>
            <div class="titolo">${this.titolo}</div>
            ${this.categoria ? html`<div class="categoria">${this.categoria}</div>` : nothing}
          </div>
          ${this.numero ? html`<div class="numero">${this.numero}</div>` : nothing}
        </header>
        <slot></slot>
        <div class="comandi"><slot name="comandi"></slot></div>
      </div>`;
  }
}

customElements.define('cmd-comanda', Comanda);

declare global {
  interface HTMLElementTagNameMap { 'cmd-comanda': Comanda }
}
