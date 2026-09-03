// ============================================================================
// <cmd-scheda-persona> — aggiungere o modificare una persona.
//
// E' la schermata con piu' campi dell'app, ed e' anche quella dove stavano DUE
// delle tendine grigie di sistema: il ruolo e l'account collegato. Adesso sono
// <cmd-scelta>, quindi si aprono con l'aspetto dell'app e si usano da tastiera.
//
// LAVORA SU UNA COPIA. Chi annulla non cambia niente: il componente si tiene
// una bozza dentro e la manda fuori solo con Salva. Era gia' cosi' per le
// partite e adesso vale per tutto — prima nome, ruolo e ore venivano riletti
// dal DOM al momento del salvataggio, il che funziona finche' nessuno tocca
// quel markup.
//
// LE PARTITE, IN ORDINE DI PRIORITA'
// «Alcune persone fanno primi e secondi, altre secondi e pass: la priorita' la
// deve impostare il titolare». L'ORDINE della lista E' la priorita', e il
// motore la legge di li' (prioritaDi in logic.js). Un elenco che si riordina e
// basta non lo dice a nessuno — sembrerebbero tutte pari — quindi il rango e'
// scritto (1ª, 2ª…) e la prima riga e' accesa in rame come i comandi attivi
// del resto dell'app.
//
// GLI ID SCONOSCIUTI NON SI PERDONO. Se una stazione viene cancellata mentre
// questa scheda e' aperta, il suo id resta da parte e torna nel salvataggio:
// questa scheda non e' il posto dove ripulire i dati, e cancellare in silenzio
// e' il modo piu' rapido di perdere qualcosa senza accorgersene.
// ============================================================================
import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { t } from '../core/lingua.ts';
import '../ds/bottone.ts';
import '../ds/campo.ts';
import '../ds/chip.ts';
import '../ds/interruttore.ts';
import '../ds/scelta.ts';
import type { Opzione } from '../ds/scelta.ts';

export interface PartitaScelta { id: string; nome: string }
export interface Membro { id: string; nome: string; email: string }

export interface PersonaModifica {
  id: string;
  nome: string;
  ruolo: string;
  ore: string;
  telefono: string;
  email: string;
  /** Id delle partite, dalla principale in giu'. */
  partite: string[];
  fuoriExtra: boolean;
  /** Id dell'account collegato, '' se nessuno. */
  accountId: string;
}

const VUOTA: PersonaModifica = {
  id: '', nome: '', ruolo: 'Cuoco', ore: '', telefono: '', email: '',
  partite: [], fuoriExtra: false, accountId: '',
};

export class SchedaPersona extends LitElement {
  static override properties = {
    persona: { type: Object },
    stazioni: { type: Array },
    ruoli: { type: Array },
    membri: { type: Array },
    nuova: { type: Boolean },
    bozza: { type: Object, state: true },
    errore: { type: String, state: true },
    inseguita: { type: String, state: true },
  };

  declare persona: PersonaModifica;
  declare stazioni: PartitaScelta[];
  declare ruoli: string[];
  /** Chi ha un account in questa cucina. Vuoto: la sezione non compare. */
  declare membri: Membro[];
  declare nuova: boolean;
  declare bozza: PersonaModifica;
  declare errore: string;
  /** Quale partita ha appena cambiato posto, per rimetterle il fuoco addosso. */
  declare inseguita: string;

  constructor() {
    super();
    this.persona = { ...VUOTA };
    this.stazioni = [];
    this.ruoli = [];
    this.membri = [];
    this.nuova = true;
    this.bozza = { ...VUOTA };
    this.errore = '';
    this.inseguita = '';
  }

  static override styles = css`
    :host{display:block;font-family:var(--font-body);color:var(--paper);}
    *,*::before,*::after{box-sizing:border-box;}

    .scatola{
      background:var(--bg-elev);border:1px solid var(--line);
      border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-4);
    }
    h3{margin:0 0 var(--space-3);font-family:var(--font-display);font-size:var(--text-lg);font-weight:600;}
    .due{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);}
    @media(max-width:560px){ .due{grid-template-columns:1fr;} }

    .nota{
      font-family:var(--font-mono);font-size:11px;color:var(--brass);
      line-height:1.6;margin:var(--space-2) 0 var(--space-3);
    }
    .nota b{color:var(--paper-dim);}
    .etichetta{
      display:block;font-family:var(--font-mono);font-size:var(--text-xs);
      letter-spacing:0.5px;text-transform:uppercase;color:var(--brass);
      margin:var(--space-3) 0 var(--space-1);
    }

    /* Una partita in elenco. Il rango e' scritto perche' l'ordine E' il dato. */
    .partita{
      display:flex;align-items:center;gap:var(--space-2);
      background:var(--bg-elev2);border:1px solid var(--line);
      border-radius:var(--radius-md);padding:var(--space-2) var(--space-3);margin-bottom:6px;
    }
    .partita.principale{border-color:var(--copper);background:var(--copper-soft);}
    .rango{
      font-family:var(--font-mono);font-size:var(--text-xs);font-weight:700;
      width:26px;height:26px;flex-shrink:0;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      background:var(--bg);color:var(--brass);
    }
    .partita.principale .rango{background:var(--copper);color:var(--ink);}
    .nome-partita{flex:1;min-width:0;overflow-wrap:anywhere;}
    .nome-partita .titolo{font-weight:600;font-size:var(--text-md);}
    .nome-partita .sotto{font-family:var(--font-mono);font-size:11px;color:var(--copper-light);margin-top:2px;}
    .comandi{display:flex;gap:var(--space-1);flex-shrink:0;}
    .comandi cmd-bottone::part(bottone){width:36px;padding-left:0;padding-right:0;}
    @media(max-width:560px){ .comandi cmd-bottone::part(bottone){width:40px;} }

    .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:var(--space-1);}
    .azioni{display:flex;gap:var(--space-3);margin-top:var(--space-4);}
    .vuoto-partite{
      font-family:var(--font-mono);font-size:var(--text-sm);color:var(--brass);
      border:1px dashed var(--line-strong);border-radius:var(--radius-md);
      padding:var(--space-3);text-align:center;
    }
  `;

  override willUpdate(cambi: Map<string, unknown>): void {
    // La bozza nasce dalla persona che arriva da fuori, e SOLO da li': dopo,
    // vive per conto suo finche' non si salva o si annulla.
    if (cambi.has('persona')) this.bozza = { ...VUOTA, ...this.persona };
  }

  private manda<T>(nome: string, dettaglio: T): void {
    this.dispatchEvent(new CustomEvent(nome, { detail: dettaglio, bubbles: true, composed: true }));
  }

  private scrivi<K extends keyof PersonaModifica>(campo: K, valore: PersonaModifica[K]): void {
    this.bozza = { ...this.bozza, [campo]: valore };
  }

  private nomeDi(id: string): string {
    return this.stazioni.find(s => s.id === id)?.nome ?? '—';
  }

  /** Solo le partite che esistono davvero: le altre restano da parte per il salvataggio. */
  private get partiteNote(): string[] {
    return this.bozza.partite.filter(id => this.stazioni.some(s => s.id === id));
  }

  private get partiteOrfane(): string[] {
    return this.bozza.partite.filter(id => !this.stazioni.some(s => s.id === id));
  }

  private spostaPartita(i: number, verso: number): void {
    const note = this.partiteNote;
    const j = i + verso;
    if (j < 0 || j >= note.length) return;
    [note[i], note[j]] = [note[j] as string, note[i] as string];
    this.inseguita = note[j] as string;
    this.scrivi('partite', note.concat(this.partiteOrfane));
  }

  private togliPartita(i: number): void {
    const note = this.partiteNote;
    note.splice(i, 1);
    this.scrivi('partite', note.concat(this.partiteOrfane));
  }

  private aggiungiPartita(id: string): void {
    // Entra in fondo: chi la vuole principale la porta su, e vedendola salire
    // capisce che l'ordine conta.
    this.inseguita = id;
    this.scrivi('partite', this.partiteNote.concat(id, this.partiteOrfane));
  }

  private cambiaAccount(id: string): void {
    this.scrivi('accountId', id);
    // L'email di chi ha un account e' gia' qui. Si compila da sola SOLO se il
    // campo e' vuoto: quella scritta a mano vince sempre, e staccare l'account
    // non cancella niente. Si riempie alla scelta e non al salvataggio, cosi'
    // il titolare la vede comparire e puo' correggerla prima di salvare.
    if (this.bozza.email.trim()) return;
    const m = this.membri.find(x => x.id === id);
    if (!m?.email) return;
    this.scrivi('email', m.email);
    this.manda('persona-email-da-account', { email: m.email });
  }

  private salva(): void {
    const nome = this.bozza.nome.trim();
    if (!nome) {
      this.errore = t('Serve un nome');
      this.renderRoot.querySelector<HTMLInputElement>('#p-nome')?.focus();
      return;
    }
    this.errore = '';
    this.manda('persona-salva', {
      persona: {
        ...this.bozza,
        nome,
        telefono: this.bozza.telefono.trim(),
        email: this.bozza.email.trim(),
        // L'ordine e' quello dell'elenco, e gli id sconosciuti tornano in coda.
        partite: this.partiteNote.concat(this.partiteOrfane),
      },
    });
  }

  /* Dopo lo spostamento la riga si e' gia' mossa da sola insieme al suo nodo:
     qui si rimedia solo al caso in cui il comando premuto si sia spento perche'
     la partita e' arrivata a un capo dell'elenco. */
  override updated(): void {
    if (!this.inseguita) return;
    const id = this.inseguita;
    this.inseguita = '';
    const riga = this.renderRoot.querySelector(`[data-partita="${id}"]`);
    const b = riga?.querySelector<HTMLElement>('cmd-bottone[data-verso]:not([disabilitato])');
    if (!b) return;
    b.scrollIntoView({ block: 'nearest' });
    b.focus();
  }

  private rigaPartita(id: string, i: number): TemplateResult {
    const note = this.partiteNote;
    return html`
      <div class="partita ${i === 0 ? 'principale' : ''}" data-partita=${id}>
        <span class="rango">${i + 1}ª</span>
        <div class="nome-partita">
          <div class="titolo">${this.nomeDi(id)}</div>
          ${i === 0 ? html`<div class="sotto">${t('principale — ci va per prima')}</div>` : nothing}
        </div>
        <div class="comandi">
          <cmd-bottone variante="fantasma" data-verso="-1" ?disabilitato=${i === 0}
                       etichetta=${t('Sposta {nome} più in alto', { nome: this.nomeDi(id) })}
                       @click=${() => this.spostaPartita(i, -1)}>▲</cmd-bottone>
          <cmd-bottone variante="fantasma" data-verso="1" ?disabilitato=${i === note.length - 1}
                       etichetta=${t('Sposta {nome} più in basso', { nome: this.nomeDi(id) })}
                       @click=${() => this.spostaPartita(i, 1)}>▼</cmd-bottone>
          <cmd-bottone variante="pericolo"
                       etichetta=${t('Togli {nome}', { nome: this.nomeDi(id) })}
                       @click=${() => this.togliPartita(i)}>✕</cmd-bottone>
        </div>
      </div>`;
  }

  private sezionePartite(): TemplateResult {
    if (!this.stazioni.length) {
      return html`<p class="nota">${t('Nessuna partita creata ancora — puoi crearle in Impostazioni cucina → Stazioni, poi torna qui.')}</p>`;
    }
    const note = this.partiteNote;
    const restanti = this.stazioni.filter(s => !note.includes(s.id));
    return html`
      ${note.length
        ? repeat(note, id => id, (id, i) => this.rigaPartita(id, i))
        : html`<div class="vuoto-partite">${t('Nessuna partita: il generatore la salterebbe.')}</div>`}
      ${restanti.length ? html`
        <p class="nota">${t('Aggiungi una partita — entra in fondo, poi la porti su con ▲')}</p>
        <div class="chips">
          ${restanti.map(s => html`
            <cmd-chip @cmd-chip=${() => this.aggiungiPartita(s.id)}>+ ${s.nome}</cmd-chip>`)}
        </div>` : nothing}`;
  }

  override render(): TemplateResult {
    const opzioniRuolo: Opzione[] = this.ruoli.map(r => ({ valore: r, etichetta: r }));
    const opzioniAccount: Opzione[] = [
      { valore: '', etichetta: t('— nessuno: le richieste le inserisci tu per lui —') },
      ...this.membri.map(m => ({ valore: m.id, etichetta: m.nome })),
    ];

    return html`
      <div class="scatola">
        <h3>${this.nuova ? t('Aggiungi persona') : t('Modifica persona')}</h3>

        <cmd-campo etichetta=${t('Nome')} obbligatorio errore=${this.errore}>
          <input type="text" id="p-nome" .value=${this.bozza.nome} placeholder="es. Marco"
                 @input=${(e: Event) => this.scrivi('nome', (e.target as HTMLInputElement).value)}>
        </cmd-campo>

        <div class="due">
          <cmd-campo etichetta=${t('Ruolo')}>
            <cmd-scelta .opzioni=${opzioniRuolo} valore=${this.bozza.ruolo}
                        @cmd-cambio=${(e: CustomEvent<{ valore: string }>) => this.scrivi('ruolo', e.detail.valore)}></cmd-scelta>
          </cmd-campo>
          <cmd-campo etichetta=${t('Ore contrattuali/sett.')}>
            <input type="number" .value=${this.bozza.ore} placeholder="es. 40"
                   @input=${(e: Event) => this.scrivi('ore', (e.target as HTMLInputElement).value)}>
          </cmd-campo>
        </div>

        <div class="due">
          <cmd-campo etichetta=${t('Numero di cellulare')}>
            <input type="tel" .value=${this.bozza.telefono} placeholder="es. 333 1234567"
                   @input=${(e: Event) => this.scrivi('telefono', (e.target as HTMLInputElement).value)}>
          </cmd-campo>
          <cmd-campo etichetta=${t('Email')}>
            <input type="email" .value=${this.bozza.email} placeholder="es. nome@email.it"
                   @input=${(e: Event) => this.scrivi('email', (e.target as HTMLInputElement).value)}>
          </cmd-campo>
        </div>

        <span class="etichetta">${t('Le sue partite, dalla principale in giù')}</span>
        ${this.sezionePartite()}
        <p class="nota">${t('L\'ordine è la priorità: la prima è la partita principale, quella dove il generatore la mette per prima. Le altre sono dove la sposta quando la principale è già coperta. Chi non ha nessuna partita il generatore la salta.')}</p>

        <cmd-interruttore
          ?acceso=${!this.bozza.fuoriExtra}
          titolo=${t('Può fare turni extra')}
          spiega=${t('Quando il fabbisogno supera le quote della brigata, il generatore può assegnarle un turno oltre la sua quota. Spenta, resta fuori dagli extra: la postazione risulterà scoperta invece che coperta da lei.')}
          @cmd-interruttore=${(e: CustomEvent<{ acceso: boolean }>) => this.scrivi('fuoriExtra', !e.detail.acceso)}
        ></cmd-interruttore>

        ${this.membri.length ? html`
          <span class="etichetta">${t('Account collegato')}</span>
          <cmd-scelta .opzioni=${opzioniAccount} valore=${this.bozza.accountId}
                      @cmd-cambio=${(e: CustomEvent<{ valore: string }>) => this.cambiaAccount(e.detail.valore)}></cmd-scelta>
          <p class="nota">${t('Collega questa persona al suo account per farle inviare da sola ferie e richieste di riposo, e per prendere la sua email da lì. Chi non ha un account resta in brigata e nei turni comunque: lascia «nessuno» e le richieste le inserisci tu per lui.')}</p>` : nothing}

        <div class="azioni">
          <cmd-bottone variante="principale" @click=${this.salva}>${t('Salva')}</cmd-bottone>
          <cmd-bottone variante="fantasma"
                       @click=${() => this.manda('persona-annulla', {})}>${t('Annulla')}</cmd-bottone>
        </div>
      </div>`;
  }
}

customElements.define('cmd-scheda-persona', SchedaPersona);

declare global {
  interface HTMLElementTagNameMap { 'cmd-scheda-persona': SchedaPersona }
}
