import fs from "fs";

const DOMINIO = "bylmo.com";
const MONEDA = "COP";
const ARCHIVO = "publicar/bylmo.xml";
const MAX_PAGINAS = 250;

const esc = (t) => String(t ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const limpiar = (html) => String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

async function traerPagina(url) {
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const res = await fetch(url);
      if (res.ok) return (await res.json()).products || [];
      console.log(`  Intento ${intento} fallo (codigo ${res.status})`);
    } catch (e) {
      console.log(`  Intento ${intento} fallo (${e.message})`);
    }
    await pausa(5000 * intento);
  }
  throw new Error(`No se pudo leer ${url}`);
}

const inicio = Date.now();
const productos = {};
let completo = false;

try {
  console.log(`Leyendo ${DOMINIO}...`);
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const lote = await traerPagina(`https://${DOMINIO}/products.json?limit=250&page=${page}`);
    if (lote.length === 0) { completo = true; break; }
    for (const p of lote) productos[p.id] = p;
    if (page % 20 === 0) console.log(`  Pagina ${page}: ${Object.keys(productos).length} productos leidos hasta ahora`);
    await pausa(1000);
  }
  if (!completo) console.log(`  AVISO: se alcanzo el tope de ${MAX_PAGINAS} paginas; puede haber mas productos.`);

  const lista = Object.values(productos);
  if (lista.length === 0) throw new Error("La tienda no devolvio productos");

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>Feed de productos ${esc(DOMINIO)}</title>
    <link>https://${esc(DOMINIO)}</link>
    <description>Catalogo completo de productos</description>\n`;

  for (const p of lista) {
    const variantes = p.variants || [];
    const disponibles = variantes.filter((v) => v.available);
    const base = disponibles[0] || variantes[0] || {};
    const precio = Number(base.price || 0);
    const anterior = Number(base.compare_at_price || 0);
    const nombres = disponibles.map((v) => v.title).filter((t) => t && t !== "Default Title");

    let descripcion = limpiar(p.body_html).slice(0, 1000);
    if (nombres.length) descripcion += ` Variantes disponibles: ${nombres.join(", ")}.`;

    xml += `    <item>
      <g:id>${esc(p.id)}</g:id>
      <g:title>${esc(p.title)}</g:title>
      <g:description>${esc(descripcion)}</g:description>
      <g:link>https://${esc(DOMINIO)}/products/${esc(p.handle)}</g:link>
      <g:image_link>${esc(p.images?.[0]?.src || "")}</g:image_link>
      <g:availability>${disponibles.length ? "in_stock" : "out_of_stock"}</g:availability>
      <g:price>${(anterior > precio ? anterior : precio).toFixed(2)} ${MONEDA}</g:price>\n`;
    if (anterior > precio) xml += `      <g:sale_price>${precio.toFixed(2)} ${MONEDA}</g:sale_price>\n`;
    xml += `      <g:brand>${esc(p.vendor)}</g:brand>
      <g:product_type>${esc(p.product_type)}</g:product_type>
      <g:condition>new</g:condition>
      <g:identifier_exists>no</g:identifier_exists>
    </item>\n`;
  }
  xml += `  </channel>\n</rss>\n`;

  fs.mkdirSync("publicar", { recursive: true });
  fs.writeFileSync(ARCHIVO, xml);
  const mb = (Buffer.byteLength(xml) / 1048576).toFixed(1);
  const minutos = ((Date.now() - inicio) / 60000).toFixed(1);
  console.log(`bylmo.xml: ${lista.length} productos guardados (${mb} MB, ${minutos} minutos)`);
} catch (e) {
  console.log(`bylmo.xml: NO se genero (${e.message}). Productos leidos antes del error: ${Object.keys(productos).length}. El link mantiene la version anterior.`);
  process.exitCode = 1;
}
