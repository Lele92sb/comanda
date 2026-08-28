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
    for(const k of STORE_KEYS){
      if(backup[k] !== undefined){ state[k] = backup[k]; await save(k); }
    }
    migrateData();
    renderDashboard();
    toast('Backup importato — dati ripristinati');
  }catch(err){
    toast('File di backup non valido');
  }
  e.target.value = '';
});
