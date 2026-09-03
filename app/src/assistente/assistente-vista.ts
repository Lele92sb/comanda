// ============================================================================
// <cmd-conoscenza> e <cmd-chat> — il sous-chef digitale.
//
// LA CHAT E' L'UNICA SCHERMATA DELL'APP CHE ASPETTA. Tutto il resto risponde
// nell'istante in cui si preme; qui si parla con un modello, e ci vogliono
// secondi. Da qui tre cose che non c'erano:
//
//   - il pulsante «Invia» SA di stare lavorando e non si puo' premere due
//     volte. Prima si poteva, e la seconda domanda partiva mentre la prima era
//     ancora per strada;
//   - «sta scrivendo…» e' un messaggio nella conversazione, non una riga
//     staccata sopra il campo: sta dove poi comparira' la risposta, che e'
//     dove si sta guardando;
//   - l'elenco scende in fondo da solo a ogni messaggio nuovo — ma SOLO se ci
//     si era gia': chi sta rileggendo qualcosa piu' su non se lo vede strappare
//     via sotto gli occhi.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { t } from '../core/lingua.ts';
import '../ds/bottone.ts';
import '../ds/campo.ts';
import '../ds/etichetta.ts';
import '../ds/riquadro.ts';
import '../ds/scheda.ts';
import '../ds/vuoto.ts';

export interface NotaConoscenza {
  id: string;
  titolo: string;
  /** Quante righe di testo: dice a colpo d'occhio se e' un appunto o una ricetta. */
  misura: string;
}

export interface MessaggioChat {
  id: string;
  chi: 'user' | 'assistant';
  testo: string;
}

/* ------------------------------------------------------- BASE DI CONOSCENZA */

export class Conoscenza extends LitElement {
  static override properties = {
    note: { type: Array },
    errore: { type: String, state: true },
  };

  declare note: NotaConoscenza[];
  declare errore: string;

  constructor() {
    super();
    this.note = [];
    this.errore = '';
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}
    textarea{
      width:100%;min-height:90px;resize:vertical;
      background:var(--bg-elev2);border:1px solid var(--line-strong);color:var(--paper);
      padding:9px 10px;border-radius:var(--radius-sm);
      font-family:var(--font-body);font-size:var(--text-md);
    }
    input[type=text],input[type=file]{
      width:100%;
      background:var(--bg-elev2);border:1px solid var(--line-strong);color:var(--paper);
      padding:9px 10px;border-radius:var(--radius-sm);
      font-family:var(--font-body);font-size:var(--text-md);
    }
    textarea:focus,input:focus{outline:var(--fuoco);outline-offset:var(--fuoco-stacco);border-color:var(--copper);}
    .due{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);}
    @media(max-width:560px){ .due{grid-template-columns:1fr;} }
    .riga{font-family:var(--font-mono);font-size:11px;color:var(--brass);}
  `;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private aggiungi(): void {
    const titolo = this.renderRoot.querySelector<HTMLInputElement>('#k-titolo');
    const testo = this.renderRoot.querySelector<HTMLTextAreaElement>('#k-testo');
    const file = this.renderRoot.querySelector<HTMLInputElement>('#k-file');
    const scritto = (testo?.value ?? '').trim();
    const allegato = file?.files?.[0] ?? null;
    if (!scritto && !allegato) {
      this.errore = t('Aggiungi del testo o un file');
      return;
    }
    this.errore = '';
    this.manda('conoscenza-aggiungi', {
      titolo: (titolo?.value ?? '').trim(),
      testo: scritto,
      file: allegato,
    });
    if (titolo) titolo.value = '';
    if (testo) testo.value = '';
    if (file) file.value = '';
  }

  override render(): TemplateResult {
    return html`
      <cmd-riquadro titolo=${t('Base di conoscenza')}
                    sottotitolo=${t('Ricette, appunti o file .txt/.md: l\'assistente li usa per darti consigli sul tuo stile')}>
        <cmd-campo etichetta=${t('Testo')} errore=${this.errore}>
          <textarea id="k-testo" placeholder=${t('Incolla qui una ricetta, una nota tecnica, un appunto…')}></textarea>
        </cmd-campo>
        <div class="due">
          <cmd-campo etichetta=${t('Titolo breve')} style="margin:0">
            <input type="text" id="k-titolo" placeholder="es. Ragù della casa">
          </cmd-campo>
          <cmd-campo etichetta=${t('Oppure un file')} style="margin:0">
            <input type="file" id="k-file" accept=".txt,.md">
          </cmd-campo>
        </div>
        <cmd-bottone style="margin-top:var(--space-3)" variante="principale"
                     @click=${this.aggiungi}>${t('Aggiungi')}</cmd-bottone>

        ${this.note.length
          ? html`<div style="margin-top:var(--space-4)">
              ${repeat(this.note, n => n.id, n => html`
                <cmd-scheda titolo=${n.titolo}>
                  <div class="riga">${n.misura}</div>
                  <cmd-bottone slot="azioni" misura="piccolo" variante="pericolo"
                               etichetta=${t('Togli {nome}', { nome: n.titolo })}
                               @click=${() => this.manda('conoscenza-togli', { id: n.id })}>✕</cmd-bottone>
                </cmd-scheda>`)}
            </div>`
          : html`<p class="riga" style="margin-top:var(--space-3)">${t('Vuota: l\'assistente risponderà senza conoscere il tuo stile.')}</p>`}
      </cmd-riquadro>`;
  }
}

customElements.define('cmd-conoscenza', Conoscenza);

/* ------------------------------------------------------------- LA CHAT */

export class Chat extends LitElement {
  static override properties = {
    messaggi: { type: Array },
    inAttesa: { type: Boolean },
    benvenuto: { type: String },
  };

  declare messaggi: MessaggioChat[];
  /** Una risposta è per strada: il pulsante si blocca e compare «sta scrivendo». */
  declare inAttesa: boolean;
  declare benvenuto: string;

  constructor() {
    super();
    this.messaggi = [];
    this.inAttesa = false;
    this.benvenuto = '';
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}

    .conversazione{display:flex;flex-direction:column;height:56vh;min-height:340px;}
    .righe{flex:1;overflow-y:auto;padding:6px 2px;display:flex;flex-direction:column;gap:10px;}

    .msg{max-width:85%;padding:10px 13px;border-radius:10px;
      font-size:var(--text-md);line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;}
    .msg.mio{align-self:flex-end;background:var(--copper-soft);border:1px solid rgba(176,107,52,0.4);}
    .msg.suo{align-self:flex-start;background:var(--bg-elev2);border:1px solid var(--line);}
    .msg.suo::before{
      content:"Sous-chef AI";display:block;
      font-family:var(--font-mono);font-size:9.5px;color:var(--brass);
      margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;
    }
    .msg.scrive{color:var(--brass);font-family:var(--font-mono);font-size:var(--text-xs);}

    /* I tre puntini: un movimento piccolo che dice «sta succedendo qualcosa»
       senza chiedere di guardarlo. */
    .punti i{
      display:inline-block;width:5px;height:5px;border-radius:50%;
      background:var(--brass);margin-right:3px;
      animation:respira 1.2s ease-in-out infinite;
    }
    .punti i:nth-child(2){animation-delay:.15s;}
    .punti i:nth-child(3){animation-delay:.3s;}
    @keyframes respira{0%,60%,100%{opacity:.25;}30%{opacity:1;}}
    @media (prefers-reduced-motion: reduce){ .punti i{animation:none;opacity:.6;} }

    .scrivi{display:flex;gap:8px;margin-top:10px;align-items:flex-end;}
    textarea{
      flex:1;min-height:44px;max-height:120px;resize:vertical;
      background:var(--bg-elev2);border:1px solid var(--line-strong);color:var(--paper);
      padding:9px 10px;border-radius:var(--radius-sm);
      font-family:var(--font-body);font-size:var(--text-md);
    }
    textarea:focus{outline:var(--fuoco);outline-offset:var(--fuoco-stacco);border-color:var(--copper);}
  `;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private invia(): void {
    const campo = this.renderRoot.querySelector<HTMLTextAreaElement>('#c-testo');
    const testo = (campo?.value ?? '').trim();
    if (!testo || this.inAttesa) return;
    this.manda('chat-invia', { testo });
    if (campo) { campo.value = ''; campo.focus(); }
  }

  /* In fondo da solo, ma solo se ci si era gia'. Chi sta rileggendo qualcosa
     piu' su non se lo vede strappare via sotto gli occhi quando arriva una
     risposta. La soglia e' 60px: abbastanza per «ero praticamente in fondo». */
  override updated(): void {
    const righe = this.renderRoot.querySelector('.righe');
    if (!righe) return;
    const distanza = righe.scrollHeight - righe.scrollTop - righe.clientHeight;
    if (distanza < 160) righe.scrollTop = righe.scrollHeight;
  }

  override render(): TemplateResult {
    return html`
      <div class="conversazione">
        <div class="righe">
          ${this.messaggi.length
            ? repeat(this.messaggi, m => m.id, m => html`
                <div class="msg ${m.chi === 'user' ? 'mio' : 'suo'}">${m.testo}</div>`)
            : html`<div class="msg suo">${this.benvenuto}</div>`}
          ${this.inAttesa ? html`
            <div class="msg suo scrive">
              <span class="punti" aria-hidden="true"><i></i><i></i><i></i></span>
              ${t('sta scrivendo…')}
            </div>` : nothing}
        </div>

        <div class="scrivi">
          <textarea id="c-testo" ?disabled=${this.inAttesa}
                    aria-label=${t('Scrivi al sous-chef')}
                    placeholder=${t('Es. «Ho seppie, limone e finocchietto, proponimi un piatto per il menu estivo»')}
                    @keydown=${(e: KeyboardEvent) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.invia(); }
                    }}></textarea>
          <cmd-bottone variante="principale" ?in-corso=${this.inAttesa}
                       @click=${this.invia}>${t('Invia')}</cmd-bottone>
        </div>
      </div>`;
  }
}

customElements.define('cmd-chat', Chat);

declare global {
  interface HTMLElementTagNameMap {
    'cmd-conoscenza': Conoscenza;
    'cmd-chat': Chat;
  }
}
