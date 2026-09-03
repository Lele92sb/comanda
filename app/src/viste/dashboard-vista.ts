// ============================================================================
// <cmd-dashboard> — il colpo d'occhio prima del servizio.
//
// Tre cose, in quest'ordine, e l'ordine e' la sostanza:
//   1. cosa non va       (o «tutto a posto», che e' un'informazione anche quella)
//   2. quattro numeri    (quanto c'e' dentro l'app)
//   3. chi lavora oggi   (l'unica cosa che si guarda tutti i giorni)
//
// Non calcola niente: gli avvisi, i conti e i turni arrivano gia' fatti. Un
// componente che sapesse cos'e' un food cost sopra il 35% sarebbe la dashboard,
// non un pezzo riusabile — e infatti quella regola sta nel collante, dove puo'
// cambiare senza toccare nessun pixel.
// ============================================================================
import { LitElement, html, css, type TemplateResult } from 'lit';
import { t } from '../core/lingua.ts';
import '../ds/avviso.ts';
import '../ds/vuoto.ts';

export interface NumeroDashboard {
  numero: number;
  etichetta: string;
}

export interface TurnoOggi {
  nome: string;
  /** Gia' composto: «Spezzato · Pass (pranzo) / Primi (cena)». */
  turno: string;
}

export class Dashboard extends LitElement {
  static override properties = {
    avvisi: { type: Array },
    numeri: { type: Array },
    turniOggi: { type: Array },
    giorno: { type: String },
  };

  declare avvisi: string[];
  declare numeri: NumeroDashboard[];
  declare turniOggi: TurnoOggi[];
  /** Il giorno di oggi scritto per esteso, per il caso in cui non ci sia nessuno. */
  declare giorno: string;

  constructor() {
    super();
    this.avvisi = [];
    this.numeri = [];
    this.turniOggi = [];
    this.giorno = '';
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}

    .numeri{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:18px 0;}
    @media(min-width:1024px){ .numeri{grid-template-columns:repeat(4,1fr);} }
    .numero{
      background:var(--bg-elev);border:1px solid var(--line);
      border-radius:var(--radius-md);padding:14px;
    }
    .numero .n{font-family:var(--font-display);font-size:28px;font-weight:700;
      color:var(--copper-light);line-height:1.1;}
    .numero .l{font-family:var(--font-body);font-weight:600;font-size:var(--text-xs);
      color:var(--brass);margin-top:2px;}

    .riquadro{
      background:var(--bg-elev);border:1px solid var(--line);
      border-radius:var(--radius-md);padding:var(--space-4);
    }
    h3{margin:0 0 var(--space-3);font-family:var(--font-display);
      font-size:var(--text-lg);font-weight:600;}
    .riga{
      display:flex;justify-content:space-between;gap:var(--space-3);
      padding:var(--space-1) 0;border-bottom:1px solid var(--line);
      font-size:var(--text-md);
    }
    .riga:last-child{border-bottom:none;}
    .riga .turno{font-family:var(--font-body);color:var(--copper-light);text-align:right;}
    /* Su schermo largo la riga si ferma: a 1200px il nome e il turno finiscono
       ai due capi opposti dello schermo e per leggerli insieme si muove la
       testa. */
    @media(min-width:1024px){ .riga{max-width:68ch;} }
  `;

  override render(): TemplateResult {
    return html`
      ${this.avvisi.length
        ? this.avvisi.map(a => html`<cmd-avviso tono="allarme">${a}</cmd-avviso>`)
        : html`<cmd-avviso tono="ok">${t('Nessun alert. Cucina in equilibrio.')}</cmd-avviso>`}

      <div class="numeri">
        ${this.numeri.map(n => html`
          <div class="numero">
            <div class="n">${n.numero}</div>
            <div class="l">${n.etichetta}</div>
          </div>`)}
      </div>

      <div class="riquadro">
        <h3>${t('Turni di oggi')}</h3>
        ${this.turniOggi.length
          ? this.turniOggi.map(x => html`
              <div class="riga"><span>${x.nome}</span><span class="turno">${x.turno}</span></div>`)
          : html`
            <cmd-vuoto simbolo="🌙"
                       titolo=${t('Nessun turno assegnato per oggi')}
                       spiega=${this.giorno}></cmd-vuoto>`}
      </div>`;
  }
}

customElements.define('cmd-dashboard', Dashboard);

declare global {
  interface HTMLElementTagNameMap { 'cmd-dashboard': Dashboard }
}
