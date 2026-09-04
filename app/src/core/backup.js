import { renderDashboard } from '../viste/dashboard.js';
import { STORE_KEYS, migrateData, save, state, toast } from './state.js';
/* ============================= BACKUP ============================= */
document.getElementById('btn-export').addEventListener('click', ()=>{
  const backup = {};
  STORE_KEYS.forEach(k=> backup[k]=state[k]);
  const blob = new Blob([JSON.stringify(backup, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0,10);
  a.href = url; a.download = `comanda-backup-${stamp}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Backup scaricato');
});

document.getElementById('import-file-input').addEventListener('change', async (e)=>{
  const file = e.target.files[0]; if(!file) return;
  try{
    const text = await file.text();
    const backup = JSON.parse(text);

    // PRIMA si mettono TUTTE le sezioni in memoria, POI si convertono i
    // formati vecchi, e solo alla fine si salva. L'ordine non e' un dettaglio:
    //
    // `migrateData` converte le ricette col vecchio schema, i turni indicizzati
    // per nome del giorno invece che per data, il fabbisogno in forma d'oggetto.
    // Convertendo DOPO aver salvato, nel database finivano i dati vecchi e la
    // correzione restava solo in memoria: al ricaricamento successivo tornavano
    // fuori sbagliati, senza un errore da nessuna parte.
    //
    // Con le sezioni in tabelle vere fa ancora piu' danno: `salva_piatti` legge
    // `items` e `priceActual`, che in un backup vecchio non esistono, e
    // scriverebbe righe vuote al posto delle ricette.
    //
    // E si converte a sezioni COMPLETE: `migrateData` guarda i turni insieme
    // ai tipi di turno, quindi convertirne una alla volta mentre si salva
    // vorrebbe dire convertirla senza le altre.
    for(const k of STORE_KEYS){
      if(backup[k] !== undefined) state[k] = backup[k];
    }
    migrateData();
    for(const k of STORE_KEYS){
      if(backup[k] !== undefined) await save(k);
    }

    renderDashboard();
    toast('Backup importato — dati ripristinati');
  }catch(err){
    toast('File di backup non valido');
  }
  e.target.value = '';
});
