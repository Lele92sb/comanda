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
    /* LA CARTA E' UN'ISOLA CHIARA, in tutti e due i temi. Un piatto si guarda
       come si guarda una comanda vera, e una comanda vera e' di carta.

       Percio' qui dentro NON valgono i colori della pagina: valgono quelli del
       tema chiaro, ridefiniti come token per l'intero sotto-albero. Le
       variabili CSS attraversano il confine dello shadow DOM e seguono l'albero
       APPIATTITO, quindi anche il contenuto messo dentro da fuori — le voci,
       le metriche, le etichette degli allergeni — si veste da solo, senza
       sapere di essere su una carta.

       Senza questo, in tema scuro il rame della categoria dava 3,27:1 sulla
       carta e la metrica «costo storto» ne dava 2,31: rosso chiaro, pensato
       per il fondo di ghisa, appoggiato sulla carta. */
    .carta{
      position:relative;
      background:var(--carta);color:var(--carta-testo);
      border-radius:2px;padding:18px 18px 16px;
      box-shadow:var(--shadow-card);

      --paper:var(--carta-testo);
      --paper-dim:#3a352e;
      --brass:var(--carta-tenue);
      --ink:#fff8ef;
      --copper:#8f4f26;
      --copper-light:#7d4622;
      --copper-soft:rgba(143,79,38,0.12);
      --alert:#93341f;
      --alert-soft:rgba(147,52,31,0.12);
      --alert-linea:rgba(147,52,31,0.38);
      --sage:#4c6146;
      --sage-soft:rgba(76,97,70,0.14);
      --sage-linea:rgba(76,97,70,0.38);
      --film:rgba(29,27,24,0.07);
      --line:var(--carta-linea);
      --line-strong:rgba(29,27,24,0.28);
      --bg-elev:rgba(29,27,24,0.03);
      --bg-elev2:rgba(29,27,24,0.06);
    }
    /* Lo strappo in cima. Il gradiente disegna una fila di semicerchi vuoti:
       segue la larghezza da solo e non e' un'immagine da scaricare. */
    .carta::before{
      content:"";position:absolute;top:-1px;left:0;right:0;height:10px;
      background:radial-gradient(circle at 10px 0, transparent 6px, var(--carta) 6.5px)
                 top left/20px 10px repeat-x;
    }
    header{
      display:flex;justify-content:space-between;align-items:flex-start;gap:10px;
      border-bottom:1px dashed var(--carta-linea);
      padding-bottom:10px;margin-bottom:10px;
    }
    .titolo{font-family:var(--font-display);font-weight:600;font-size:var(--text-xl);line-height:1.2;
      overflow-wrap:anywhere;}
    .categoria{font-family:var(--font-body);font-weight:600;font-size:var(--text-xs);color:var(--copper);margin-top:3px;}
    .numero{font-family:var(--font-mono);font-size:var(--text-sm);color:var(--carta-tenue);
      text-align:right;flex-shrink:0;}

    /* I COMANDI SULLA CARTA SI RIBALTANO. E' l'unico posto dell'app dove il
       fondo e' chiaro, e un bottone «fantasma» pensato per il buio qui sarebbe
       testo chiaro su carta chiara: invisibile.
       Non si ridefiniscono gli stili del bottone — si ridefiniscono i TOKEN
       per questo pezzo di albero. Le variabili CSS attraversano il confine
       dello shadow DOM, quindi un <cmd-bottone> messo qui dentro si veste da
       solo, senza sapere niente di dove sta. E' esattamente il motivo per cui
       i token stanno in un file loro. */
    .comandi{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;}
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
