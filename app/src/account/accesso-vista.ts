// ============================================================================
// <cmd-accesso> e <cmd-cucine> — le due schermate prima dell'app.
//
// Sono le prime cose che vede chiunque, ed erano le ultime rimaste fatte di
// stringhe. Non cambia niente di come funziona l'accesso: email e password
// vanno dove andavano prima, a Supabase, e questo componente non le tocca ne'
// le conserva — le legge dai campi e le manda in un evento, come faceva la
// funzione di prima.
//
// QUELLO CHE CAMBIA E' CHE IL PULSANTE SA DI STARE ASPETTANDO. Entrare in un
// account e' una chiamata di rete che su una connessione di cucina puo'
// prendere secondi: prima il pulsante si limitava a scrivere «Un attimo…»
// cambiando il proprio testo, e restava identico. Ora si blocca e gira.
//
// E GLI ERRORI STANNO SOPRA IL MODULO, non in un avviso che scompare: se la
// password e' sbagliata, la cosa da leggere resta li' finche' non si riprova.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { t } from '../core/lingua.ts';
import '../ds/avviso.ts';
import '../ds/bottone.ts';
import '../ds/campo.ts';
import '../ds/etichetta.ts';
import '../ds/riquadro.ts';

export interface CucinaVista {
  id: string;
  nome: string;
  /** «titolare», «può modificare», «sola lettura» — già tradotto. */
  ruolo: string;
  soloLettura: boolean;
}

/* --------------------------------------------------------------- ACCESSO */

export class Accesso extends LitElement {
  static override properties = {
    nuovo: { type: Boolean },
    errore: { type: String },
    inCorso: { type: Boolean },
  };

  declare nuovo: boolean;
  declare errore: string;
  declare inCorso: boolean;

  constructor() {
    super();
    this.nuovo = false;
    this.errore = '';
    this.inCorso = false;
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}
    input{
      width:100%;
      background:var(--bg-elev2);border:1px solid var(--line-strong);color:var(--paper);
      padding:9px 10px;border-radius:var(--radius-sm);
      font-family:var(--font-body);font-size:var(--text-md);
    }
    input:focus{outline:var(--fuoco);outline-offset:var(--fuoco-stacco);border-color:var(--copper);}
    @media (pointer:coarse){ input{min-height:var(--tocco-min);} }
    .altro{text-align:center;margin-top:var(--space-3);}
    .collegamento{
      background:none;border:none;color:var(--copper-light);
      font-family:var(--font-mono);font-size:var(--text-sm);text-decoration:underline;
      padding:6px 4px;cursor:pointer;
    }
    .collegamento:hover{color:var(--paper);}
    .collegamento:focus-visible{outline:var(--fuoco);outline-offset:var(--fuoco-stacco);}
  `;

  private manda<T>(nome: string, dettaglio?: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private get campi(): { email: string; password: string } {
    return {
      email: (this.renderRoot.querySelector<HTMLInputElement>('#a-email')?.value ?? '').trim(),
      password: this.renderRoot.querySelector<HTMLInputElement>('#a-pass')?.value ?? '',
    };
  }

  private entra(): void {
    if (this.inCorso) return;
    this.manda('accesso-entra', this.campi);
  }

  override render(): TemplateResult {
    return html`
      ${this.errore ? html`<cmd-avviso tono="allarme">${this.errore}</cmd-avviso>` : nothing}

      <cmd-campo etichetta=${t('Email')}>
        <input type="email" id="a-email" autocomplete="email" placeholder="nome@ristorante.it"
               ?disabled=${this.inCorso}>
      </cmd-campo>
      <cmd-campo etichetta=${t('Password')}
                 aiuto=${this.nuovo ? t('Almeno 6 caratteri.') : ''}>
        <input type="password" id="a-pass" ?disabled=${this.inCorso}
               autocomplete=${this.nuovo ? 'new-password' : 'current-password'}
               @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this.entra(); }}>
      </cmd-campo>

      <cmd-bottone pieno variante="principale" ?in-corso=${this.inCorso} @click=${this.entra}
      >${this.nuovo ? t('Crea account') : t('Entra')}</cmd-bottone>

      <div class="altro">
        <button class="collegamento" ?disabled=${this.inCorso}
                @click=${() => this.manda('accesso-cambia')}
        >${this.nuovo ? t('Ho già un account, accedi') : t('Non ho un account, creane uno')}</button>
      </div>
      ${this.nuovo ? nothing : html`
        <div class="altro" style="margin-top:0">
          <button class="collegamento" ?disabled=${this.inCorso}
                  @click=${() => this.manda('accesso-password-persa', this.campi)}
          >${t('Ho dimenticato la password')}</button>
        </div>`}`;
  }
}

customElements.define('cmd-accesso', Accesso);

/* ---------------------------------------------------------------- CUCINE */

export class Cucine extends LitElement {
  static override properties = {
    cucine: { type: Array },
    errore: { type: String },
    inCorso: { type: Boolean },
  };

  declare cucine: CucinaVista[];
  declare errore: string;
  declare inCorso: boolean;

  constructor() {
    super();
    this.cucine = [];
    this.errore = '';
    this.inCorso = false;
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}
    input{
      width:100%;
      background:var(--bg-elev2);border:1px solid var(--line-strong);color:var(--paper);
      padding:9px 10px;border-radius:var(--radius-sm);
      font-family:var(--font-body);font-size:var(--text-md);
    }
    input:focus{outline:var(--fuoco);outline-offset:var(--fuoco-stacco);border-color:var(--copper);}
    @media (pointer:coarse){ input{min-height:var(--tocco-min);} }
    #c-codice{font-family:var(--font-body);font-weight:600;}

    .cucina{
      display:flex;justify-content:space-between;align-items:center;gap:10px;
      width:100%;text-align:left;
      background:var(--bg-elev);border:1px solid var(--line);border-radius:var(--radius-md);
      padding:12px 14px;margin-bottom:8px;color:var(--paper);
      font-family:var(--font-body);font-size:var(--text-md);cursor:pointer;
      transition:border-color var(--tempo-istante) var(--curva),
                 transform var(--tempo-istante) var(--curva);
    }
    @media (pointer:coarse){ .cucina{min-height:var(--tocco-min);} }
    .cucina:hover{border-color:var(--copper);}
    .cucina:active{transform:scale(0.99);}
    .cucina:focus-visible{outline:var(--fuoco);outline-offset:var(--fuoco-stacco);}
    .nome{overflow-wrap:anywhere;}

    .altro{text-align:center;margin-top:var(--space-3);}
    .collegamento{
      background:none;border:none;color:var(--copper-light);
      font-family:var(--font-mono);font-size:var(--text-sm);text-decoration:underline;
      padding:6px 4px;cursor:pointer;
    }
    .collegamento:hover{color:var(--paper);}
  `;

  private manda<T>(nome: string, dettaglio?: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private valore(id: string): string {
    return (this.renderRoot.querySelector<HTMLInputElement>(id)?.value ?? '').trim();
  }

  override render(): TemplateResult {
    return html`
      ${this.errore ? html`<cmd-avviso tono="allarme">${this.errore}</cmd-avviso>` : nothing}

      ${this.cucine.map(k => html`
        <button class="cucina" @click=${() => this.manda('cucina-scelta', { id: k.id })}>
          <span class="nome">${k.nome}</span>
          <cmd-etichetta tono=${k.soloLettura ? 'neutro' : 'ok'}>${k.ruolo}</cmd-etichetta>
        </button>`)}

      <cmd-riquadro titolo=${t('Apri una nuova cucina')}>
        <cmd-campo etichetta=${t('Nome della cucina')}>
          <input type="text" id="c-nome" placeholder="es. Trattoria del Porto">
        </cmd-campo>
        <cmd-campo etichetta=${t('Come ti chiamano')}>
          <input type="text" id="c-io" placeholder="es. Emanuele, chef">
        </cmd-campo>
        <cmd-bottone pieno variante="principale" ?in-corso=${this.inCorso}
                     @click=${() => this.manda('cucina-crea', {
                       nome: this.valore('#c-nome'), io: this.valore('#c-io') })}
        >${t('Crea cucina')}</cmd-bottone>
      </cmd-riquadro>

      <cmd-riquadro titolo=${t('Entra con un codice d\'invito')}
                    sottotitolo=${t('Te lo dà chi gestisce la cucina.')}>
        <cmd-campo etichetta=${t('Codice')}>
          <input type="text" id="c-codice" placeholder="ABCD2345" autocomplete="off">
        </cmd-campo>
        <cmd-campo etichetta=${t('Come ti chiamano')}
                   aiuto=${t('Serve a chi gestisce la cucina per riconoscerti nell\'elenco di chi ha accesso.')}>
          <input type="text" id="c-nomeio" placeholder="es. Marco, secondo">
        </cmd-campo>
        <cmd-bottone pieno variante="fantasma" ?in-corso=${this.inCorso}
                     @click=${() => this.manda('cucina-entra', {
                       codice: this.valore('#c-codice').toUpperCase(), io: this.valore('#c-nomeio') })}
        >${t('Entra nella cucina')}</cmd-bottone>
      </cmd-riquadro>

      <div class="altro">
        <button class="collegamento"
                @click=${() => this.manda('account-esci')}>${t('Esci dall\'account')}</button>
      </div>`;
  }
}

customElements.define('cmd-cucine', Cucine);

declare global {
  interface HTMLElementTagNameMap {
    'cmd-accesso': Accesso;
    'cmd-cucine': Cucine;
  }
}
