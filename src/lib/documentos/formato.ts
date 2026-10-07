/**
 * Formato común de los comprobantes internos imprimibles de Living Room
 * (recibo, transferencia entre depósitos, nota de remisión): recuadros con
 * borde, datos de la empresa arriba y título + número a la derecha.
 * SOLO presentación: no toca datos de negocio.
 */
import { EMPRESA_DOC } from "./membrete";

export function esc(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 2026-08-24 (o fecha-hora ISO) → 24/08/2026, sin corrimiento de zona horaria. */
export function fechaDoc(iso: unknown): string {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export const CSS_DOC = `
  *{box-sizing:border-box} html,body{margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#000;background:#f3f4f6;font-size:12px}
  .page{width:210mm;margin:0 auto;background:#fff;padding:10mm}
  .box{border:1px solid #000;margin-bottom:3px}
  .pad{padding:8px 12px}
  .cab{display:flex;gap:3px;margin-bottom:3px}
  .cab>div{border:1px solid #000;padding:8px 10px}
  .cab .logo{flex:0 0 38%;display:flex;align-items:center;justify-content:center}
  .cab .logo img{max-width:100%;max-height:80px;object-fit:contain}
  .cab .emp{flex:1;text-align:center;font-size:11px;line-height:1.35}
  .cab .tit{flex:0 0 27%;text-align:center;display:flex;flex-direction:column;justify-content:center;gap:6px}
  .cab .tit .t{font-size:15px;line-height:1.2}
  .cab .tit .nro{font-size:15px;font-weight:bold;letter-spacing:.5px}
  .cab .tit .fisc{margin-top:4px;text-align:left;font-size:8.5px;line-height:1.55}
  .cab .tit .fisc div{display:flex;gap:4px;white-space:nowrap}
  .cab .tit .fisc .k{flex:0 0 36%;color:#444;text-transform:uppercase;font-size:7px;letter-spacing:.2px;align-self:center}
  .fila{display:flex;gap:8px;padding:3px 0}
  .fila .l{flex:0 0 130px}
  .dos{display:grid;grid-template-columns:1fr 1fr;column-gap:24px}
  table.g{width:100%;border-collapse:collapse}
  table.g th{border:1px solid #000;font-weight:400;font-size:11px;padding:3px 6px;text-transform:uppercase}
  table.g td{border-left:1px solid #000;border-right:1px solid #000;padding:3px 6px;vertical-align:top}
  table.g tr.fin td{border-bottom:1px solid #000}
  .c{text-align:center}.r{text-align:right}
  .firmas{display:grid;grid-template-columns:1fr 1fr;column-gap:30px;row-gap:16px;padding:22px 12px 16px}
  .firmas .ln{display:flex;gap:8px;align-items:flex-end}
  .firmas .ln span{flex:0 0 auto}
  .firmas .ln i{flex:1;border-bottom:1px dotted #000;height:12px}
  .toolbar{position:sticky;top:0;background:#111827;padding:10px;text-align:center}
  .toolbar button{background:#4FAEB2;color:#fff;border:0;padding:8px 16px;border-radius:6px;font-size:14px;cursor:pointer}
  /* Margen 0 en @page: así el navegador no agrega la fecha arriba ni la dirección
     abajo. El margen real lo pone el padding de .page. */
  @media print{body{background:#fff}.toolbar{display:none}.page{width:auto;margin:0;padding:11mm}@page{size:A4;margin:0}}
`;

/** Cabecera: [logo] [datos de la empresa] [título + número]. */
export function cabeceraDoc(o: {
  titulo: string;
  numero: string;
  conLogo?: boolean;
  conActividad?: boolean;
  extra?: string;
  /** Datos fiscales bajo el número (RUC, timbrado, vigencia…), como en la factura. */
  fiscales?: [string, string][];
}): string {
  const e = EMPRESA_DOC;
  const datos = [
    ...(o.conActividad === false ? [] : e.actividad.map((a) => a.toUpperCase())),
    ...e.direccion,
    e.telefono ? `Cel. ${e.telefono}` : "",
  ].filter(Boolean);
  return `<div class="cab">
    ${o.conLogo === false ? "" : `<div class="logo"><img src="${esc(e.logoUrl)}" alt="${esc(e.nombre)}"></div>`}
    <div class="emp">${datos.map((d) => `<div>${esc(d)}</div>`).join("")}</div>
    <div class="tit">${o.extra ?? ""}<div class="t">${esc(o.titulo)}</div><div class="nro">${esc(o.numero)}</div>${
      o.fiscales?.length
        ? `<div class="fisc">${o.fiscales
            .map(([k, v]) => `<div><span class="k">${esc(k)}</span><span>${esc(v)}</span></div>`)
            .join("")}</div>`
        : ""
    }</div>
  </div>`;
}

/** Filas en blanco para que la grilla tenga alto de hoja, como el talonario. */
export function filasVacias(n: number, columnas: number): string {
  return Array.from({ length: Math.max(0, n) }, (_, i) => `<tr${i === n - 1 ? ' class="fin"' : ""}>${"<td>&nbsp;</td>".repeat(columnas)}</tr>`).join("");
}

export function paginaDoc(titulo: string, cuerpo: string, auto: boolean): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title><style>${CSS_DOC}</style></head><body>
<div class="toolbar"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>
<div class="page">${cuerpo}</div>
<script>try{ if (${auto ? "true" : "false"}) window.print(); }catch(e){}</script>
</body></html>`;
}
