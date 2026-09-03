// ============================================================================
// <cmd-foglio-turno> — quello che si apre toccando una cella della griglia.
//
// E' il gesto piu' frequente dell'app: correggere a mano un turno che il
// generatore ha messo. Nella cella ci stanno una sigla e un pallino; qui c'e'
// la larghezza dello schermo, quindi le scelte si spiegano per esteso — «SP ·
// Spezzato 10–16 / 18–23», «Secondi / griglia». La cella e' il posto dove il
// turno si LEGGE, questo e' il posto dove si SCEGLIE.
//
// UNA PARTITA PER TUTTI I SERVIZI O UNA PER CIASCUNO. Chi a pranzo sta ai
// primi e a cena al pass fa due partite in una giornata, e deve poterlo dire.
// Ma chiedere due volte la stessa stazione a chi non fa partite miste — cioe'
// quasi tutti — sarebbe una tassa su chi non ha il problema: la scelta parte
// da quello che la cella dice gia', e chi non la usa non se ne accorge.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { t } from '../core/lingua.ts';
import '../ds/bottone.ts';
import '../ds/chip.ts';
import '../ds/dialogo.ts';

export interface TurnoSceglibile {
  codice: string;
  /** «SP · Spezzato 10–16 / 18–23», o «—» per la casella vuota. */
  etichetta: string;
}

export interface StazioneSceglibile {
  id: string;
  nome: string;
  colore: string;
}

export interface GruppoStazione {
  /** L'id del servizio, oppure '*' quando vale per tutta la giornata. */
  servizio: string;
  etichetta: string;
  /** L'id della stazione scelta, '' se nessuna. */
  scelta: string;
}

export class FoglioTurno extends LitElement {
  static override properties = {
    aperto: { type: Boolean },
    persona: { type: String },
    quando: { type: String },
    turni: { type: Array },
    scelto: { type: String },
    stazioni: { type: Array },
    gruppi: { type: Array },
    lavora: { type: Boolean },
    mostraCollega: { type: Boolean },
    collegate: { type: Boolean },
    extra: { type: Boolean },
    senzaStazioni: { type: Boolean },
  };

  declare aperto: boolean;
  declare persona: string;
  /** La data scritta per esteso: «giovedì 3 settembre». */
  declare quando: string;
  declare turni: TurnoSceglibile[];
  declare scelto: string;
  declare stazioni: StazioneSceglibile[];
  declare gruppi: GruppoStazione[];
  /** Il turno scelto copre almeno un servizio (non è riposo, ferie, malattia). */
  declare lavora: boolean;
  declare mostraCollega: boolean;
  declare collegate: boolean;
  /** Il turno è stato assegnato oltre la quota di questa persona. */
  declare extra: boolean;
  /** Questa persona non ha nessuna partita: il generatore la salta. */
  declare senzaStazioni: boolean;

  constructor() {
    super();
    this.aperto = false;
    this.persona = '';
    this.quando = '';
    this.turni = [];
    this.scelto = '';
    this.stazioni = [];
    this.gruppi = [];
    this.lavora = false;
    this.mostraCollega = false;
    this.collegate = true;
    this.extra = false;
    this.senzaStazioni = false;
  }

  static override styles = css`
    :host{display:contents;font-family:var(--font-body);}
    .quando{font-family:var(--font-body);font-size:var(--text-sm);color:var(--brass);
      margin:0 0 var(--space-3);}
    .etichetta{display:block;font-family:var(--font-body);font-weight:600;font-size:var(--text-xs);
      color:var(--brass);
      margin:var(--space-3) 0 var(--space-1);}
    .chips{display:flex;flex-wrap:wrap;gap:6px;}
    .nota{
      font-family:var(--font-body);font-size:var(--text-xs);color:var(--brass);
      line-height:1.6;margin:var(--space-2) 0 0;
      background:var(--bg-elev2);padding:var(--space-2);border-radius:var(--radius-sm);
    }
    .nota.accento{color:var(--copper-light);}
    .pallino{display:inline-block;width:7px;height:7px;border-radius:50%;flex:0 0 auto;}
  `;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private gruppo(g: GruppoStazione): TemplateResult {
    return html`
      <span class="etichetta">${g.etichetta}</span>
      <div class="chips">
        <cmd-chip ?acceso=${!g.scelta}
                  @cmd-chip=${() => this.manda('stazione-scelta', { servizio: g.servizio, stazioneId: '' })}
        >${t('nessuna')}</cmd-chip>
        ${this.stazioni.map(st => html`
          <cmd-chip ?acceso=${g.scelta === st.id}
                    @cmd-chip=${() => this.manda('stazione-scelta', { servizio: g.servizio, stazioneId: st.id })}>
            <i class="pallino" style="background:${st.colore}"></i>${st.nome}
          </cmd-chip>`)}
      </div>`;
  }

  override render(): TemplateResult {
    return html`
      <cmd-dialogo ?aperto=${this.aperto} titolo=${this.persona}>
        <p class="quando">${this.quando}</p>

        ${this.extra ? html`
          <p class="nota accento">${t('Turno extra: assegnato oltre la quota di questa persona per coprire il fabbisogno.')}</p>` : nothing}
        ${this.senzaStazioni ? html`
          <p class="nota">${t('Nessuna partita assegnata: il generatore non le dà turni, perché un turno senza partita non copre nessun servizio. Qui puoi assegnarglielo a mano.')}</p>` : nothing}

        <span class="etichetta">${t('Turno')}</span>
        <div class="chips">
          ${this.turni.map(tt => html`
            <cmd-chip ?acceso=${this.scelto === tt.codice}
                      @cmd-chip=${() => this.manda('turno-scelto', { codice: tt.codice })}
            >${tt.etichetta}</cmd-chip>`)}
        </div>

        ${this.lavora ? (this.stazioni.length ? html`
          ${this.mostraCollega ? html`
            <div class="chips" style="margin-top:var(--space-3)">
              <cmd-chip ?acceso=${this.collegate}
                        @cmd-chip=${() => this.manda('collega', { collegate: true })}
              >${t('stessa partita tutto il giorno')}</cmd-chip>
              <cmd-chip ?acceso=${!this.collegate}
                        @cmd-chip=${() => this.manda('collega', { collegate: false })}
              >${t('una per servizio')}</cmd-chip>
            </div>` : nothing}
          ${this.gruppi.map(g => this.gruppo(g))}`
        : html`<p class="nota">${t('Nessuna partita definita: si aggiungono in Impostazioni cucina → Stazioni.')}</p>`) : nothing}

        <cmd-bottone slot="azioni" variante="fantasma"
                     @click=${() => this.manda('foglio-chiudi', {})}>${t('Chiudi')}</cmd-bottone>
      </cmd-dialogo>`;
  }
}

customElements.define('cmd-foglio-turno', FoglioTurno);

declare global {
  interface HTMLElementTagNameMap { 'cmd-foglio-turno': FoglioTurno }
}
