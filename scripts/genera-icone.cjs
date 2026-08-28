// Genera le icone dell'app senza dipendenze: disegna i pixel a mano e li
// impacchetta in PNG con lo zlib incluso in Node.
//
// Il segno è quello del marchio: il punto di rame su fondo scuro, lo stesso
// che sta accanto alla scritta "Comanda" nell'intestazione.
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const SFONDO = [0x1d, 0x1b, 0x18];   // --bg
const RAME   = [0xb0, 0x6b, 0x34];   // --copper

function disegna(lato) {
  const px = Buffer.alloc(lato * lato * 3);
  const centro = lato / 2;
  // Il punto occupa un terzo del lato: abbastanza grande da leggersi
  // nell'icona piccola di una schermata piena di app.
  const raggio = lato * 0.17;
  for (let y = 0; y < lato; y++) {
    for (let x = 0; x < lato; x++) {
      const dx = x + 0.5 - centro, dy = y + 0.5 - centro;
      const dentro = dx * dx + dy * dy <= raggio * raggio;
      const c = dentro ? RAME : SFONDO;
      const i = (y * lato + x) * 3;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
    }
  }
  return px;
}

function png(lato, pixel) {
  // Ogni riga di un PNG è preceduta da un byte che dice come è filtrata: 0 = così com'è.
  const righe = Buffer.alloc(lato * (lato * 3 + 1));
  for (let y = 0; y < lato; y++) {
    righe[y * (lato * 3 + 1)] = 0;
    pixel.copy(righe, y * (lato * 3 + 1) + 1, y * lato * 3, (y + 1) * lato * 3);
  }

  const blocco = (tipo, dati) => {
    const testa = Buffer.alloc(8);
    testa.writeUInt32BE(dati.length, 0);
    testa.write(tipo, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(tipo, 'ascii'), dati])) >>> 0, 0);
    return Buffer.concat([testa, dati, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lato, 0);
  ihdr.writeUInt32BE(lato, 4);
  ihdr[8] = 8;    // 8 bit per canale
  ihdr[9] = 2;    // colore RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    blocco('IHDR', ihdr),
    blocco('IDAT', zlib.deflateSync(righe, { level: 9 })),
    blocco('IEND', Buffer.alloc(0)),
  ]);
}

let TAVOLA;
function crc32(buf) {
  if (!TAVOLA) {
    TAVOLA = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TAVOLA[n] = c;
    }
  }
  let c = -1;
  for (const b of buf) c = TAVOLA[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

const DESTINAZIONE = 'app/public/icone';
fs.mkdirSync(DESTINAZIONE, { recursive: true });
// 192 e 512 per Android, 180 per il "Aggiungi a schermata Home" di iOS.
for (const lato of [192, 512, 180]) {
  const file = path.join(DESTINAZIONE, `icona-${lato}.png`);
  fs.writeFileSync(file, png(lato, disegna(lato)));
  console.log('  ' + file + '  (' + lato + '×' + lato + ')');
}
console.log('icone generate');
