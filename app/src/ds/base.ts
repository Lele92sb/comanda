// ============================================================================
// COMANDA DESIGN SYSTEM — la base di ogni componente.
//
// PERCHE' ESISTE QUESTO STRATO
//
// Prima l'interfaccia era fatta di stringhe: 89 punti nel codice scrivevano
// HTML a mano, con l'escape delle virgolette a carico di chi scriveva, e ogni
// modifica ridisegnava l'intera schermata. Funzionava, ma:
//   - 89 punti sono 89 occasioni di dimenticare un esc() e aprire un buco;
//   - un pezzo di interfaccia non si poteva provare da solo, solo dentro
//     l'app intera con dentro una cucina vera;
//   - cambiare l'aspetto di un pulsante voleva dire cercarlo in 23 file.
//
// Un componente risolve tutti e tre: e' un pezzo con un nome, un contratto
// dichiarato (le sue proprieta') e una vita propria. Si prova da solo, si
// cambia in un posto, e il testo che ci entra e' sempre trattato come testo.
//
// PERCHE' LIT E NON UNO SCRITTO DA NOI
//
// Scriversi il proprio motore di componenti e' la scelta che sembra piu'
// economica e costa di piu': chi arriva deve imparare il NOSTRO, che non ha
// documentazione ne' strumenti, e ogni bug e' nostro. Lit sono 5 KB, e'
// costruito sugli standard del browser (custom elements), e chi lo conosce
// lo conosce da fuori.
//
// CHE COSA E' PERMESSO A QUESTO STRATO
//
// ds/ non sa NIENTE di Comanda. Non conosce i turni, le cucine, i ruoli, il
// database. Non importa niente da core/, lib/ o dalle cartelle delle
// funzioni: se un componente avesse bisogno di sapere cos'e' una stazione,
// non sarebbe piu' un componente, sarebbe la schermata delle stazioni.
// Il controllo dei confini in scripts/controlla-import.cjs lo verifica.
// ============================================================================
import { LitElement, css, type CSSResultGroup } from 'lit';

export class Elemento extends LitElement {
  // Gli stili che valgono per TUTTI i componenti. Chi ne aggiunge dei propri
  // deve ricordarsi di mettere questi per primi:
  //     static override styles = [Elemento.styles, css`...`]
  // Lit non li unisce da solo: `styles` in una sottoclasse SOSTITUISCE quello
  // della base, e dimenticarsene toglie il contorno del fuoco al componente
  // senza dare nessun errore.
  static override styles: CSSResultGroup = css`
    :host{
      /* I token arrivano da :root e attraversano il confine dello shadow DOM
         perche' le variabili CSS ereditano. E' l'unica cosa che lo attraversa,
         ed e' esattamente il motivo per cui i token stanno in un file loro. */
      box-sizing:border-box;
      font-family:var(--font-body);
      color:var(--paper);
    }
    *,*::before,*::after{box-sizing:inherit;}

    /* UN SOLO CONTORNO DEL FUOCO PER TUTTA L'APP. Chi naviga da tastiera lo
       deve riconoscere sempre uguale, altrimenti ogni schermata e' un posto
       nuovo. «:focus-visible» e non «:focus»: col mouse non compare, con la
       tastiera si'. */
    :where(button,input,select,textarea,[tabindex]):focus-visible{
      outline:var(--fuoco);
      outline-offset:var(--fuoco-stacco);
    }
    [hidden]{display:none !important;}
  `;

  /* Un componente non chiama chi lo usa: gli manda un evento e chi lo usa
     decide. E' la regola che tiene ds/ separato dal resto — un componente che
     sapesse cosa fare col proprio clic saprebbe troppo.

     «composed:true» serve perche' l'evento esca dallo shadow DOM: senza,
     muore dentro il componente e chi ascolta da fuori non sente niente. E'
     l'errore piu' comune con i custom elements, e non da' nessun messaggio. */
  protected emetti<T>(nome: string, dettaglio?: T): void {
    this.dispatchEvent(new CustomEvent(nome, {
      detail: dettaglio,
      bubbles: true,
      composed: true,
    }));
  }
}
