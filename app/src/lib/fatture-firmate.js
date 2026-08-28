import forge from 'node-forge';

/* ============================= FATTURE FIRMATE .p7m ============================= */
function binaryStringToUtf8(binStr){
  const bytes = new Uint8Array(binStr.length);
  for(let i=0;i<binStr.length;i++) bytes[i] = binStr.charCodeAt(i) & 0xFF;
  return new TextDecoder('utf-8').decode(bytes);
}
export function p7mArrayBufferToXmlText(arrayBuffer){
  try{
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for(let i=0;i<bytes.length;i++) binary += String.fromCharCode(bytes[i]);
    const top = forge.asn1.fromDer(binary);
    // ContentInfo SEQUENCE [ contentType OID, [0] EXPLICIT { SignedData } ]
    const signedData = top.value[1].value[0];
    // SignedData SEQUENCE: version, digestAlgorithms, encapContentInfo, [certificates], [crls], signerInfos
    const encapContentInfo = signedData.value[2];
    if(!encapContentInfo || encapContentInfo.value.length<2) return null; // nessun eContent (firma "detached")
    const eContentWrapper = encapContentInfo.value[1]; // [0] EXPLICIT
    const octet = eContentWrapper.value[0];
    let raw;
    if(!octet.constructed){ raw = octet.value; }
    else { raw = octet.value.map(v=>v.value).join(''); } // OCTET STRING BER frammentata
    return binaryStringToUtf8(raw);
  }catch(e){ return null; }
}
