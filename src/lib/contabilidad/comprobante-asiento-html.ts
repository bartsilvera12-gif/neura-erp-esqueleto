/**
 * PDF (HTML imprimible, tamaño carta) de UN asiento contable, estilo "comprobante"
 * como el del sistema anterior del cliente: cabecera con membrete, tabla
 * Cuenta · Descripción/Glosa · Debe · Haber, totales y firmas al pie
 * (Elaborado / Autorizado / Interesado) para imprimir y firmar.
 *
 * SOLO presentación: recibe las líneas ya calculadas (asiento registrado o
 * pre-asiento de vista previa) y las dibuja. No toca datos de negocio.
 */
import { membreteA4, EMPRESA_DOC } from "@/lib/documentos/membrete";

export interface ComprobanteLinea {
  cuenta_codigo: string;
  cuenta_nombre?: string | null;
  detalle?: string | null;
  debe: number;
  haber: number;
}

export interface ComprobanteAsientoOpts {
  /** Título grande, ej "COMPROBANTE DE COMPRA" o "COMPROBANTE DE VENTA". */
  titulo: string;
  /** Número del asiento o del comprobante, ej "A-000123" o "001-001-0000001". */
  numero: string;
  /** Fecha YYYY-MM-DD. */
  fecha: string;
  /** Glosa / concepto del asiento. */
  glosa: string;
  /** "registrado" en Contabilidad, o "vista_previa" (todavía no contabilizado). */
  estado: "registrado" | "vista_previa";
  moneda?: string;
  tipo_cambio?: number | null;
  lineas: ComprobanteLinea[];
  /** Etiquetas de las firmas al pie. */
  firmas?: string[];
  /** Origin para el logo absoluto al imprimir/guardar PDF. */
  origin?: string;
}

const esc = (v: unknown): string =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** Importe con separador de miles; vacío cuando es 0 (como en el comprobante modelo). */
function money(v: unknown, moneda: string): string {
  const x = n(v);
  if (x === 0) return "";
  const dec = moneda === "PYG" ? 0 : 2;
  return x.toLocaleString("es-PY", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fechaLarga(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v ?? "");
}

export function comprobanteAsientoHtml(opts: ComprobanteAsientoOpts): string {
  const moneda = opts.moneda || "PYG";
  const firmas = opts.firmas && opts.firmas.length ? opts.firmas : ["Elaborado", "Autorizado", "Interesado"];
  const totDebe = opts.lineas.reduce((a, l) => a + n(l.debe), 0);
  const totHaber = opts.lineas.reduce((a, l) => a + n(l.haber), 0);
  const descuadrado = Math.round(totDebe) !== Math.round(totHaber);

  const filas = opts.lineas
    .map((l) => {
      const nombre = l.cuenta_nombre ? ` <span style="color:#6b7280;">${esc(l.cuenta_nombre)}</span>` : "";
      const glosa = l.detalle ? `<div style="color:#6b7280;font-size:10px;">${esc(l.detalle)}</div>` : "";
      return `
      <tr>
        <td style="padding:3px 8px;border-bottom:1px solid #f1f5f9;font-family:monospace;white-space:nowrap;vertical-align:top;">${esc(l.cuenta_codigo)}</td>
        <td style="padding:3px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top;">${esc(l.cuenta_nombre ?? "")}${glosa}</td>
        <td style="padding:3px 8px;border-bottom:1px solid #f1f5f9;text-align:right;white-space:nowrap;vertical-align:top;font-variant-numeric:tabular-nums;">${money(l.debe, moneda)}</td>
        <td style="padding:3px 8px;border-bottom:1px solid #f1f5f9;text-align:right;white-space:nowrap;vertical-align:top;font-variant-numeric:tabular-nums;">${money(l.haber, moneda)}</td>
      </tr>`;
    })
    .join("");

  const badgeVista =
    opts.estado === "vista_previa"
      ? `<div style="margin-top:6px;display:inline-block;border:1px solid #f59e0b;background:#fffbeb;color:#92400e;border-radius:6px;padding:2px 8px;font-size:10px;">Vista previa — todavía no está registrado en Contabilidad</div>`
      : `<div style="margin-top:6px;display:inline-block;border:1px solid #10b981;background:#ecfdf5;color:#065f46;border-radius:6px;padding:2px 8px;font-size:10px;">Asiento registrado en Contabilidad</div>`;

  const tcLinea =
    moneda !== "PYG" && opts.tipo_cambio && opts.tipo_cambio > 0
      ? `<div><strong>T/C:</strong> ${esc(opts.tipo_cambio)}</div>`
      : "";

  const firmasHtml = firmas
    .map(
      (f) => `
      <div style="flex:1;text-align:center;">
        <div style="border-top:1px solid #111;margin:0 12px;padding-top:4px;font-size:11px;">${esc(f)}</div>
      </div>`
    )
    .join("");

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<title>${esc(opts.titulo)} ${esc(opts.numero)}</title>
<style>
  @page { size: letter; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color:#111; font-size:12px; margin:0; }
  .wrap { max-width: 186mm; margin: 0 auto; }
  table { width:100%; border-collapse:collapse; }
  thead th { background:#f8fafc; border-top:1px solid #cbd5e1; border-bottom:1px solid #cbd5e1; padding:5px 8px; font-size:11px; text-align:left; }
  thead th.num { text-align:right; }
  .tot td { border-top:2px solid #cbd5e1; padding:6px 8px; font-weight:700; font-variant-numeric:tabular-nums; }
  @media print { .noprint { display:none !important; } }
</style></head>
<body>
<div class="wrap">
  ${membreteA4(opts.origin ?? "")}

  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:10px;">
    <div style="font-size:11px;color:#374151;">
      <div><strong>N°:</strong> ${esc(opts.numero)}</div>
      <div><strong>Glosa:</strong> ${esc(opts.glosa)}</div>
      ${tcLinea}
    </div>
    <div style="text-align:right;">
      <div style="font-size:16px;font-weight:800;letter-spacing:.5px;">${esc(opts.titulo)}</div>
      <div style="font-size:11px;color:#374151;"><strong>Fecha:</strong> ${esc(fechaLarga(opts.fecha))} · <strong>Moneda:</strong> ${esc(moneda)}</div>
      ${badgeVista}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:95px;">Cuenta</th>
        <th>Descripción cuenta / Glosa de mayor</th>
        <th class="num" style="width:110px;">Debe</th>
        <th class="num" style="width:110px;">Haber</th>
      </tr>
    </thead>
    <tbody>
      ${filas}
    </tbody>
    <tfoot>
      <tr class="tot">
        <td></td>
        <td style="text-align:right;">TOTALES</td>
        <td style="text-align:right;">${n(totDebe).toLocaleString("es-PY", { minimumFractionDigits: moneda === "PYG" ? 0 : 2, maximumFractionDigits: moneda === "PYG" ? 0 : 2 })}</td>
        <td style="text-align:right;">${n(totHaber).toLocaleString("es-PY", { minimumFractionDigits: moneda === "PYG" ? 0 : 2, maximumFractionDigits: moneda === "PYG" ? 0 : 2 })}</td>
      </tr>
    </tfoot>
  </table>

  ${descuadrado ? `<div style="margin-top:8px;color:#b91c1c;font-size:11px;">⚠ El asiento está descuadrado (Debe ≠ Haber). Revisá las cuentas y los montos.</div>` : ""}

  <div style="display:flex;gap:8px;margin-top:64px;">
    ${firmasHtml}
  </div>

  <div style="margin-top:18px;text-align:center;color:#9ca3af;font-size:9px;">
    ${esc(EMPRESA_DOC.nombre)} · Comprobante contable generado por el sistema
  </div>

  <div class="noprint" style="margin-top:16px;text-align:center;">
    <button onclick="window.print()" style="padding:8px 16px;border:1px solid #0f6f73;background:#0f6f73;color:#fff;border-radius:8px;cursor:pointer;font-size:13px;">Imprimir / Guardar PDF</button>
  </div>
</div>
</body></html>`;
}
