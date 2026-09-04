// ============================================================================
// <cmd-notifiche> — la campanella e quello che c'è sotto.
//
// UN NUMERO CHE NON SI PUO' IGNORARE, e nient'altro. La tentazione di una
// campanella è farla suonare per tutto; il risultato è che dopo tre giorni
// nessuno la guarda più. Qui arrivano tre sole cose, e tutte e tre chiedono
// qualcosa a qualcuno: una richiesta è arrivata, una richiesta è stata decisa,
// dei turni sono stati pubblicati.
//
// SI SVUOTA APRENDOLA. Non c'è da segnare niente a mano, e non c'è una X per
// ogni riga: aprire È l'atto di aver letto. Un elenco che si svuota solo se lo
// svuoti diventa una lista di cose da fare che nessuno fa.
//
// IL PANNELLO E' UN <dialog>, quindi il fuoco resta dentro, Esc chiude, e su
// un telefono non c'è modo di toccare per sbaglio quello che sta sotto.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import './dialogo.ts';
import './vuoto.ts';

export interface VoceNotifica {
  /** Già scritta e tradotta da chi passa i dati: qui non si conosce la lingua. */
  testo: string;
  /** Dove porta. Vuoto = non porta da nessuna parte. */
  dove?: string;
}

export class Notifiche extends LitElement {
  static override properties = {
    voci: { type: Array },
    aperto: { type: Boolean },
    /** Titolo e testo del vuoto: `ds/` non traduce. */
    titolo: { type: String },
    vuotoTitolo: { type: String },
    vuotoSpiega: { type: String },
    etichetta: { type: String },
  };

  declare voci: VoceNotifica[];
  declare aperto: boolean;
  declare titolo: string;
  declare vuotoTitolo: string;
  declare vuotoSpiega: string;
  declare etichetta: string;

  constructor() {
    super();
    this.voci = [];
    this.aperto = false;
    this.titolo = 'Novità';
    this.vuotoTitolo = 'Niente di nuovo';
    this.vuotoSpiega = '';
    this.etichetta = 'Novità';
  }

  static override styles = css`
    :host{display:inline-block;font-family:var(--font-body);}
    *,*::before,*::after{box-sizing:border-box;}

    button.campana{
      position:relative;
      background:none;border:1px solid transparent;color:var(--brass);
      border-radius:var(--radius-pill);
      height:26px;min-width:26px;padding:0 6px;
      font-size:var(--text-md);line-height:1;cursor:pointer;
    }
    button.campana:hover{border-color:var(--line-strong);color:var(--paper);}
    button.campana:focus-visible{outline:var(--fuoco);outline-offset:var(--fuoco-stacco);}

    /* IL PALLINO COL NUMERO. Il numero e non solo un punto: «tre richieste» e
       «una richiesta» sono due giornate diverse, e saperlo prima di aprire
       cambia se apri adesso o dopo il servizio. */
    .quante{
      position:absolute;top:-4px;right:-4px;
      background:var(--alert);color:var(--ink);
      border-radius:var(--radius-pill);
      min-width:16px;height:16px;padding:0 4px;
      font-size:10px;font-weight:700;line-height:16px;
      text-align:center;
    }

    .voce{
      display:block;width:100%;text-align:left;
      background:var(--bg-elev2);border:1px solid var(--line);
      border-radius:var(--radius-md);padding:var(--space-3);
      margin-bottom:var(--space-2);
      font-family:inherit;font-size:var(--text-md);color:var(--paper);
      line-height:1.5;
    }
    button.voce{cursor:pointer;}
    button.voce:hover{border-color:var(--copper);background:var(--bg-elev);}
    button.voce:focus-visible{outline:var(--fuoco);outline-offset:var(--fuoco-stacco);}
    button.voce::after{content:' →';color:var(--brass);}
  `;

  private manda<T>(nome: string, dettaglio?: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  override render(): TemplateResult {
    const n = this.voci.length;
    return html`
      <button class="campana" type="button"
              aria-label=${this.etichetta + (n ? ' (' + n + ')' : '')}
              @click=${() => this.manda('notifiche-apri')}>
        🔔${n ? html`<span class="quante">${n > 9 ? '9+' : n}</span>` : nothing}
      </button>

      <cmd-dialogo ?aperto=${this.aperto} titolo=${this.titolo}
                   @cmd-chiudi=${() => this.manda('notifiche-chiudi')}>
        ${n
          ? this.voci.map(v => v.dove
            ? html`<button class="voce" type="button"
                           @click=${() => this.manda('notifiche-vai', { dove: v.dove })}
                   >${v.testo}</button>`
            : html`<div class="voce">${v.testo}</div>`)
          : html`<cmd-vuoto simbolo="✓" titolo=${this.vuotoTitolo}
                            spiega=${this.vuotoSpiega}></cmd-vuoto>`}
      </cmd-dialogo>`;
  }
}

customElements.define('cmd-notifiche', Notifiche);

declare global {
  interface HTMLElementTagNameMap { 'cmd-notifiche': Notifiche }
}
