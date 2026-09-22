/**
 * PDF de Factura de Exportación (Autoimpresor timbrado).
 * Diseño A4 vertical, mismo estilo del talonario preimpreso Living Room:
 * cabecera con timbrado y datos de la empresa, cuadro cliente + moneda,
 * detalle de items en tabla y totales al pie con leyenda de exportación.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";
import type { FacturaExportacion } from "./types";
import { EMPRESA_DOC } from "@/lib/documentos/membrete";

const A4: [number, number] = [595.28, 841.89];
const MX = 36;

function fmt(n: number, decimales = 2): string {
  return (Number(n) || 0).toLocaleString("es-PY", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

function fechaES(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export async function buildFacturaExportacionPdf(factura: FacturaExportacion): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(A4);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const NEGRO = rgb(0.08, 0.08, 0.08);
  const GRIS = rgb(0.42, 0.45, 0.5);
  const LINEA = rgb(0.75, 0.78, 0.82);

  const { width } = page.getSize();
  let y = A4[1] - 40;

  // Logo (opcional).
  try {
    const logoPath = path.join(process.cwd(), "public", EMPRESA_DOC.logoUrl.replace(/^\//, ""));
    const bytes = await fs.readFile(logoPath);
    const img = EMPRESA_DOC.logoUrl.toLowerCase().endsWith(".png")
      ? await doc.embedPng(bytes)
      : await doc.embedJpg(bytes);
    const h = 44;
    const w = (h / img.height) * img.width;
    page.drawImage(img, { x: MX, y: y - h, width: w, height: h });
  } catch { /* sin logo si no está */ }

  // Bloque cabecera timbrado (derecha).
  const boxW = 220;
  const boxX = width - MX - boxW;
  page.drawRectangle({ x: boxX, y: y - 90, width: boxW, height: 90, borderColor: NEGRO, borderWidth: 1 });
  const put = (t: string, dx: number, dy: number, size = 8, f = reg, color = NEGRO) =>
    page.drawText(t, { x: boxX + dx, y: y - dy, size, font: f, color });
  put("FACTURA DE EXPORTACIÓN", 8, 14, 10, bold);
  put("Original", boxW - 8 - reg.widthOfTextAtSize("Original", 8), 14);
  put(`Timbrado Nº: ${factura.timbrado}`, 8, 32);
  put(
    `Vigencia: 03/08/2026 al 31/08/2027`,
    8,
    46
  );
  put(
    `Nº ${factura.numero_formateado}`,
    8,
    68,
    14,
    bold
  );
  put(`RUC:`, 8, 84);

  y -= 110;

  // Datos empresa.
  page.drawText(EMPRESA_DOC.nombre, { x: MX, y, size: 12, font: bold, color: NEGRO });
  y -= 14;
  page.drawText("Actividad económica: Muebles / Exportación", { x: MX, y, size: 8, font: reg, color: GRIS });
  y -= 20;

  // Cliente + fecha.
  page.drawLine({ start: { x: MX, y }, end: { x: width - MX, y }, thickness: 0.5, color: LINEA });
  y -= 14;
  page.drawText("Cliente:", { x: MX, y, size: 9, font: bold, color: NEGRO });
  page.drawText(factura.cliente_nombre, { x: MX + 60, y, size: 9, font: reg, color: NEGRO });
  page.drawText(`Fecha: ${fechaES(factura.fecha)}`, { x: width - MX - 180, y, size: 9, font: bold, color: NEGRO });
  y -= 12;
  page.drawText("País:", { x: MX, y, size: 9, font: bold, color: NEGRO });
  page.drawText(factura.cliente_pais, { x: MX + 60, y, size: 9, font: reg, color: NEGRO });
  page.drawText(`Moneda: ${factura.moneda}`, { x: width - MX - 180, y, size: 9, font: bold, color: NEGRO });
  y -= 12;
  if (factura.cliente_documento) {
    page.drawText("Documento:", { x: MX, y, size: 9, font: bold, color: NEGRO });
    page.drawText(factura.cliente_documento, { x: MX + 60, y, size: 9, font: reg, color: NEGRO });
    y -= 12;
  }
  if (factura.cliente_direccion) {
    page.drawText("Dirección:", { x: MX, y, size: 9, font: bold, color: NEGRO });
    page.drawText(factura.cliente_direccion, { x: MX + 60, y, size: 9, font: reg, color: NEGRO });
    y -= 12;
  }
  page.drawText(`Tipo de cambio: ${fmt(factura.tipo_cambio, 4)}`, { x: MX, y, size: 8, font: reg, color: GRIS });

  y -= 18;
  page.drawLine({ start: { x: MX, y }, end: { x: width - MX, y }, thickness: 0.5, color: LINEA });

  // Tabla items.
  y -= 4;
  const cols = [
    { label: "Cant.", x: MX, w: 40, align: "center" },
    { label: "Descripción", x: MX + 40, w: 300, align: "left" },
    { label: "P. Unit.", x: MX + 40 + 300, w: 80, align: "right" },
    { label: "Subtotal", x: MX + 40 + 300 + 80, w: width - MX - (MX + 40 + 300 + 80), align: "right" },
  ] as const;
  page.drawRectangle({ x: MX, y: y - 14, width: width - 2 * MX, height: 14, color: rgb(0.92, 0.93, 0.96) });
  for (const c of cols) {
    const tx =
      c.align === "right"
        ? c.x + c.w - reg.widthOfTextAtSize(c.label, 8) - 4
        : c.align === "center"
        ? c.x + (c.w - reg.widthOfTextAtSize(c.label, 8)) / 2
        : c.x + 4;
    page.drawText(c.label, { x: tx, y: y - 10, size: 8, font: bold, color: NEGRO });
  }
  y -= 18;

  const items = factura.items ?? [];
  for (const it of items) {
    if (y < 120) {
      const p2 = doc.addPage(A4);
      page.drawLine({ start: { x: MX, y: 40 }, end: { x: width - MX, y: 40 }, thickness: 0.3, color: LINEA });
      // simple continuación: nueva página, no reimprime cabecera.
      p2.drawText(`Factura ${factura.numero_formateado} (cont.)`, { x: MX, y: A4[1] - 40, size: 9, font: bold, color: NEGRO });
      y = A4[1] - 60;
    }
    const cant = String(it.cantidad);
    const desc = it.descripcion;
    const pu = fmt(it.precio_unitario, 2);
    const st = fmt(it.subtotal, 2);
    page.drawText(cant, {
      x: cols[0].x + (cols[0].w - reg.widthOfTextAtSize(cant, 9)) / 2,
      y,
      size: 9,
      font: reg,
      color: NEGRO,
    });
    page.drawText(desc.slice(0, 62), { x: cols[1].x + 4, y, size: 9, font: reg, color: NEGRO });
    page.drawText(pu, { x: cols[2].x + cols[2].w - reg.widthOfTextAtSize(pu, 9) - 4, y, size: 9, font: reg, color: NEGRO });
    page.drawText(st, { x: cols[3].x + cols[3].w - bold.widthOfTextAtSize(st, 9) - 4, y, size: 9, font: bold, color: NEGRO });
    y -= 14;
  }

  y -= 6;
  page.drawLine({ start: { x: MX, y }, end: { x: width - MX, y }, thickness: 0.6, color: NEGRO });

  // Totales.
  y -= 18;
  const totalTxt = `TOTAL ${factura.moneda} ${fmt(factura.total, 2)}`;
  page.drawText(totalTxt, {
    x: width - MX - bold.widthOfTextAtSize(totalTxt, 12),
    y,
    size: 12,
    font: bold,
    color: NEGRO,
  });

  // Leyenda exportación (bottom).
  const legenda = "Operación de exportación exenta de IVA (Ley N° 125/91, art. 83).";
  page.drawText(legenda, { x: MX, y: 70, size: 8, font: reg, color: GRIS });
  if (factura.observaciones) {
    page.drawText(`Obs: ${factura.observaciones.slice(0, 140)}`, { x: MX, y: 56, size: 8, font: reg, color: GRIS });
  }

  if (factura.estado === "ANULADA") {
    const w2 = bold.widthOfTextAtSize("ANULADA", 72);
    page.drawText("ANULADA", {
      x: (width - w2) / 2,
      y: A4[1] / 2,
      size: 72,
      font: bold,
      color: rgb(0.85, 0.15, 0.15),
      rotate: undefined,
      opacity: 0.28,
    });
  }

  return doc.save();
}
