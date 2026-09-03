// ============================================================================
// <cmd-brigata> — l'elenco delle persone.
//
// UNA COSA CHE SPARISCE, ED E' LA PIU' INTERESSANTE.
//
// Il vecchio elenco aveva un rimedio scritto a mano, con dieci righe di
// commento a spiegarlo: dopo aver premuto ▲, il ridisegno ributtava via tutte
// le schede e le rifaceva da capo, quindi il pulsante appena premuto finiva
// sotto un'ALTRA persona. Sul telefono il secondo tocco spostava quella
// sbagliata. Il rimedio inseguiva «lo stesso pulsante della stessa persona
// alla sua nuova posizione» cercandolo per indice nel DOM.
//
// Qui non serve piu': l'elenco e' agganciato all'id della persona, quindi
// quando due si scambiano il browser SPOSTA le due schede invece di rifarle.
// Il pulsante premuto e' fisicamente lo stesso nodo, viaggia insieme alla
// persona, e il fuoco ci resta sopra da solo.
//
// Resta un caso solo, e quello va gestito: se la persona arriva in cima, la
// sua freccia ▲ si spegne, e un comando spento non puo' tenere il fuoco. Li'
// si passa all'altra freccia, che e' comunque sulla sua riga.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { t } from '../core/lingua.ts';
import '../ds/bottone.ts';
import '../ds/vuoto.ts';

export interface PersonaVista {
  id: string;
  nome: string;
  ruolo: string;
  /** Ore contrattuali a settimana, gia' come testo ('40' oppure ''). */
  ore: string;
  telefono: string;
  email: string;
  /** I nomi delle sue partite, dalla principale in giu'. L'ordine E' la priorita'. */
  partite: string[];
  fuoriExtra: boolean;
}

export class Brigata extends LitElement {
  static override properties = {
    persone: { type: Array },
    soloLettura: { type: Boolean, reflect: true, attribute: 'solo-lettura' },
  };

  declare persone: PersonaVista[];
  declare soloLettura: boolean;

  /** Chi e' stato spostato per ultimo, per rimettergli il fuoco addosso. */
  private inseguito: { id: string; verso: number } | null = null;

  constructor() {
    super();
    this.persone = [];
    this.soloLettura = false;
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}

    .scheda{
      display:flex;justify-content:space-between;align-items:flex-start;gap:var(--space-3);
      background:var(--bg-elev);border:1px solid var(--line);
      border-radius:var(--radius-md);padding:var(--space-3);margin-bottom:var(--space-2);
    }
    .dati{min-width:0;}
    .nome{font-weight:600;font-size:var(--text-md);overflow-wrap:anywhere;}
    .riga{
      font-family:var(--font-body);font-size:var(--text-sm);color:var(--brass);
      line-height:1.6;margin-top:2px;overflow-wrap:anywhere;
    }
    .riga.allarme{color:var(--alert);}
    .riga b{color:var(--paper-dim);}
    .comandi{display:flex;flex-direction:column;align-items:flex-end;gap:var(--space-1);flex-shrink:0;}
    .frecce{display:flex;gap:var(--space-1);}
    /* Quadrate e grandi abbastanza per un dito. Spenta vuol dire «sei gia' in
       cima»: si vede, invece di non esserci. */
    .frecce cmd-bottone::part(bottone){width:36px;padding-left:0;padding-right:0;}
    @media(max-width:560px){ .frecce cmd-bottone::part(bottone){width:40px;} }
  `;

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private sposta(p: PersonaVista, verso: number): void {
    this.inseguito = { id: p.id, verso };
    this.manda('persona-sposta', { id: p.id, verso });
  }

  /* Il fuoco insegue la persona, non la posizione. Il nodo si e' gia' spostato
     da solo; qui si rimedia al caso in cui la freccia premuta si sia spenta
     perche' la persona e' arrivata a un capo dell'elenco. */
  override updated(): void {
    if (!this.inseguito) return;
    const { id, verso } = this.inseguito;
    this.inseguito = null;
    const scheda = this.renderRoot.querySelector(`[data-persona="${id}"]`);
    if (!scheda) return;
    const scelta = scheda.querySelector<HTMLElement>(
      `cmd-bottone[data-verso="${verso}"]:not([disabilitato])`)
      ?? scheda.querySelector<HTMLElement>('cmd-bottone[data-verso]:not([disabilitato])');
    if (!scelta) return;
    scelta.scrollIntoView({ block: 'nearest' });
    scelta.focus();
  }

  /* Le partite come si LEGGONO. L'ordine e' la priorita' — il motore lo usa
     cosi' — e finche' si leggeva «Primi, Pass, Secondi» separato da virgole non
     c'era modo di accorgersene: tre nomi in fila sembrano tre pari. */
  private partiteDi(p: PersonaVista): TemplateResult | string {
    if (!p.partite.length) {
      return t('⚠ nessuna stazione — il generatore la salta, resta assegnabile a mano nella griglia');
    }
    if (p.partite.length === 1) return p.partite[0] as string;
    return html`<b>${p.partite[0]}</b> (${t('principale')}) · ${t('poi')} ${p.partite.slice(1).join(', ')}`;
  }

  private scheda(p: PersonaVista, i: number): TemplateResult {
    const primo = i === 0;
    const ultimo = i === this.persone.length - 1;
    const contatti = [
      p.telefono ? '📞 ' + p.telefono : '',
      p.email ? '✉ ' + p.email : '',
    ].filter(Boolean).join(' · ');

    return html`
      <div class="scheda" data-persona=${p.id}>
        <div class="dati">
          <div class="nome">${p.nome}</div>
          <div class="riga">${p.ruolo} · ${p.ore || '—'}${t('h/sett contrattuali')}</div>
          ${contatti ? html`<div class="riga">${contatti}</div>` : nothing}
          <div class="riga ${p.partite.length ? '' : 'allarme'}">🍳 ${this.partiteDi(p)}</div>
          ${p.fuoriExtra ? html`<div class="riga">🚫 ${t('fuori dai turni extra')}</div>` : nothing}
        </div>
        ${this.soloLettura ? nothing : html`
          <div class="comandi">
            <div class="frecce">
              <cmd-bottone variante="fantasma" data-verso="-1"
                           ?disabilitato=${primo}
                           etichetta=${t('Sposta {nome} più in alto', { nome: p.nome })}
                           @click=${() => this.sposta(p, -1)}>▲</cmd-bottone>
              <cmd-bottone variante="fantasma" data-verso="1"
                           ?disabilitato=${ultimo}
                           etichetta=${t('Sposta {nome} più in basso', { nome: p.nome })}
                           @click=${() => this.sposta(p, 1)}>▼</cmd-bottone>
            </div>
            <cmd-bottone misura="piccolo" variante="fantasma"
                         @click=${() => this.manda('persona-modifica', { id: p.id })}>${t('Modifica')}</cmd-bottone>
            <cmd-bottone misura="piccolo" variante="pericolo"
                         @click=${() => this.manda('persona-rimuovi', { id: p.id })}>${t('Rimuovi')}</cmd-bottone>
          </div>`}
      </div>`;
  }

  override render(): TemplateResult {
    if (!this.persone.length) {
      return html`
        <cmd-vuoto simbolo="👥" titolo=${t('Nessuno in brigata')}
                   spiega=${t('Aggiungi le persone che lavorano in cucina: il generatore ha bisogno di sapere chi c\'è, quante ore fa di contratto e in quale partita sta.')}>
          ${this.soloLettura ? nothing : html`
            <cmd-bottone variante="principale"
                         @click=${() => this.manda('persona-nuova', {})}>${t('Aggiungi la prima persona')}</cmd-bottone>`}
        </cmd-vuoto>`;
    }
    return html`${repeat(this.persone, p => p.id, (p, i) => this.scheda(p, i))}`;
  }
}

customElements.define('cmd-brigata', Brigata);

declare global {
  interface HTMLElementTagNameMap { 'cmd-brigata': Brigata }
}
