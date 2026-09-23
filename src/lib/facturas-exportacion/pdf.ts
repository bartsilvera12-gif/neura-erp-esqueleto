/**
 * PDF de factura Autoimpresor Living Room: EXPORTACION (USD, exenta, datos de
 * operación/logística/banco) o LOCAL (Gs., IVA 5/10, contado/crédito).
 */
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";
import type { FacturaExportacion, FacturaConfigFiscal } from "./types";
import { EMPRESA_FACTURA, BANCO_EXPORTACION, NOMBRE_MONEDA, TIPOS_FACTURA } from "./config";
import { numeroALetras } from "./numero-a-letras";

const W = 595.28;
const H = 841.89;
const MX = 30;
const CW = W - MX * 2;

const TINTA = rgb(0.13, 0.15, 0.2);
const GRIS = rgb(0.42, 0.45, 0.5);
const BORDE = rgb(0.8, 0.82, 0.86);
const FONDO = rgb(0.95, 0.96, 0.97);
const NARANJA = rgb(0.93, 0.47, 0.13);

function fechaES(iso?: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

interface Ctx {
  page: PDFPage;
  reg: PDFFont;
  bold: PDFFont;
}

/** y en coordenadas desde arriba → coordenada pdf-lib. */
const Y = (t: number) => H - t;

function fit(text: string, font: PDFFont, size: number, maxW: number): string {
  let s = text;
  while (s.length > 1 && font.widthOfTextAtSize(s, size) > maxW) s = s.slice(0, -1);
  return s.length < text.length ? s.slice(0, -1) + "…" : s;
}

function text(c: Ctx, s: string, x: number, t: number, size = 9, font?: PDFFont, color = TINTA, maxW?: number) {
  const f = font ?? c.reg;
  const v = maxW ? fit(s, f, size, maxW) : s;
  c.page.drawText(v, { x, y: Y(t), size, font: f, color });
}

function textRight(c: Ctx, s: string, xRight: number, t: number, size = 9, font?: PDFFont, color = TINTA) {
  const f = font ?? c.reg;
  c.page.drawText(s, { x: xRight - f.widthOfTextAtSize(s, size), y: Y(t), size, font: f, color });
}

function box(c: Ctx, x: number, t: number, w: number, h: number, titulo?: string, fill = false) {
  c.page.drawRectangle({ x, y: Y(t + h), width: w, height: h, borderColor: BORDE, borderWidth: 0.8, color: fill ? FONDO : undefined });
  if (titulo) {
    c.page.drawRectangle({ x: x + 0.4, y: Y(t + 18), width: w - 0.8, height: 17.6, color: FONDO });
    text(c, titulo, x + 10, t + 12.5, 8.5, c.bold);
  }
}

function field(c: Ctx, label: string, value: string, x: number, t: number, maxW: number) {
  text(c, label, x, t, 6.3, c.reg, GRIS);
  text(c, value || "—", x, t + 11, 9, c.reg, TINTA, maxW);
}

export async function buildFacturaExportacionPdf(
  f: FacturaExportacion,
  fiscal: FacturaConfigFiscal
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifIt = await doc.embedFont(StandardFonts.TimesRomanItalic);
  let c: Ctx = { page: doc.addPage([W, H]), reg, bold };

  const esExpo = f.tipo === "EXPORTACION";
  const dec = f.moneda === "PYG" ? 0 : 2;
  const num = (n: number) =>
    (Number(n) || 0).toLocaleString("es-PY", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const simbolo = f.moneda === "PYG" ? "Gs." : f.moneda;
  const ruc = fiscal.ruc ?? EMPRESA_FACTURA.ruc;
  const autoimp = fiscal.autoimpresor_nro ?? EMPRESA_FACTURA.autoimpresorNro;

  // ── Cabecera izquierda: logo + empresa ──────────────────────────────────
  let logoOk = false;
  try {
    const bytes = await fs.readFile(path.join(process.cwd(), "public", EMPRESA_FACTURA.logoPath));
    const img = await doc.embedPng(bytes);
    const h = 62;
    const w = Math.min((h / img.height) * img.width, 230);
    c.page.drawImage(img, { x: MX + 4, y: Y(30 + h), width: w, height: h });
    logoOk = true;
  } catch {
    /* sin archivo de logo: se dibuja en texto */
  }
  if (!logoOk) {
    text(c, "Franquicia", MX + 62, 42, 14, serifIt, TINTA);
    text(c, "LivingRoom", MX + 4, 74, 34, serif, rgb(0.27, 0.27, 0.27));
    textRight(c, "MUEBLES IMPORTADOS", MX + 4 + serif.widthOfTextAtSize("LivingRoom", 34), 86, 8, reg, NARANJA);
  }
  text(c, EMPRESA_FACTURA.razonSocial, MX + 4, 108, 11, bold);
  EMPRESA_FACTURA.actividad.forEach((l, i) => text(c, l, MX + 4, 121 + i * 10, 7.3, reg, GRIS, 290));
  text(c, EMPRESA_FACTURA.direccion, MX + 4, 141, 7.3, reg, GRIS, 300);

  // ── Cabecera derecha: recuadro fiscal ───────────────────────────────────
  const bx = 345;
  const bw = W - MX - bx;
  box(c, bx, 28, bw, 118, undefined, true);
  if (esExpo) {
    text(c, TIPOS_FACTURA.EXPORTACION.titulo, bx + 12, 48, 11.5, bold);
    text(c, f.numero_formateado ?? "", bx + 12, 68, 15, bold);
    const filas: [string, string][] = [
      ["RUC", ruc],
      ["TIMBRADO", fiscal.timbrado],
      ["VIGENCIA", `${fechaES(fiscal.vigencia_desde)} - ${fechaES(fiscal.vigencia_hasta)}`],
      ["AUTOIMPRESOR", autoimp],
    ];
    filas.forEach(([k, v], i) => {
      text(c, k, bx + 12, 90 + i * 14, 6.5, reg, GRIS);
      text(c, v, bx + 85, 90 + i * 14, 8.5);
    });
  } else {
    text(c, TIPOS_FACTURA.LOCAL.titulo, bx + 12, 52, 17, bold);
    text(c, f.numero_formateado ?? "", bx + 12, 72, 15, bold);
    c.page.drawLine({ start: { x: bx + 12, y: Y(80) }, end: { x: bx + bw - 12, y: Y(80) }, thickness: 0.6, color: BORDE });
    const filas: [string, string][] = [
      ["TIMBRADO Nº", fiscal.timbrado],
      ["FECHA INICIO VIGENCIA:", fechaES(fiscal.vigencia_desde)],
      ["FECHA FIN VIGENCIA:", fechaES(fiscal.vigencia_hasta)],
      ["RUC:", ruc],
    ];
    filas.forEach(([k, v], i) => {
      text(c, k, bx + 12, 95 + i * 13, 7.5, reg, GRIS);
      text(c, v, bx + 120, 95 + i * 13, 8.5);
    });
  }

  // ── Bloques de datos ────────────────────────────────────────────────────
  let t = 158;
  if (esExpo) {
    box(c, MX, t, CW, 72, "DATOS DEL CLIENTE");
    const cols = [MX + 10, MX + 165, MX + 325, MX + 440];
    field(c, "NOMBRE / RAZÓN SOCIAL", f.cliente_nombre, cols[0], t + 30, 150);
    field(c, "DIRECCIÓN", f.cliente_direccion ?? "", cols[1], t + 30, 155);
    field(c, "CIUDAD", f.cliente_ciudad ?? "", cols[2], t + 30, 110);
    field(c, "FECHA DE EMISIÓN", fechaES(f.fecha), cols[3], t + 30, 90);
    field(c, "RUC O C.I. Nº", f.cliente_documento ?? "", cols[0], t + 52, 150);
    field(c, "TELÉFONO", f.cliente_telefono ?? "", cols[1], t + 52, 155);
    field(c, "PAÍS", f.cliente_pais, cols[2], t + 52, 110);
    t += 80;

    const half = (CW - 8) / 2;
    box(c, MX, t, half, 68, "DATOS DE LA OPERACIÓN");
    field(c, "TIPO DE OPERACIÓN", f.tipo_operacion ?? "EXPORTACIÓN", MX + 10, t + 28, 120);
    field(c, "CONDICIÓN DE VENTA", f.condicion_venta === "CREDITO" ? "CRÉDITO" : "CONTADO", MX + 140, t + 28, 120);
    field(c, "CONDICIÓN DE NEGOCIACIÓN", f.condicion_negociacion ?? "", MX + 10, t + 50, 120);
    field(c, "MONEDA", NOMBRE_MONEDA[f.moneda] ?? f.moneda, MX + 140, t + 50, 120);
    const lx = MX + half + 8;
    box(c, lx, t, half, 68, "DATOS LOGÍSTICOS");
    field(c, "AGENTE DE TRANSPORTE", f.agente_transporte ?? "", lx + 10, t + 28, 140);
    field(c, "BARCAZA / REMOLCADOR", f.barcaza ?? "", lx + 160, t + 28, 100);
    field(c, "EMPRESA FLETERA / EXPORTADOR NACIONAL", f.empresa_fletera ?? "", lx + 10, t + 50, 140);
    field(c, "CONOCIMIENTO / MANIFIESTO", f.conocimiento ?? "", lx + 160, t + 50, 100);
    t += 76;

    const b = BANCO_EXPORTACION;
    box(c, MX, t, CW, 68, "DATOS BANCARIOS");
    field(c, "BANCO BENEFICIARIO", b.banco, MX + 10, t + 28, 140);
    field(c, "CUENTA / IBAN", b.cuenta, MX + 165, t + 28, 130);
    field(c, "SWIFT", b.swift, MX + 295, t + 28, 80);
    field(c, "BENEFICIARIO", b.beneficiario, MX + 385, t + 28, 145);
    field(c, "BANCO CORRESPONSAL", b.bancoCorresponsal, MX + 10, t + 50, 280);
    field(c, "SWIFT CORRESPONSAL", b.swiftCorresponsal, MX + 295, t + 50, 80);
    field(c, "ABA CODE", b.aba, MX + 385, t + 50, 145);
    t += 76;
  } else {
    const rowH = 18;
    box(c, MX, t, CW, 20 + rowH * 4, "DATOS DEL CLIENTE");
    const mid = MX + CW / 2;
    const r0 = t + 20;
    for (let i = 1; i < 4; i++)
      c.page.drawLine({ start: { x: MX, y: Y(r0 + rowH * i) }, end: { x: MX + CW, y: Y(r0 + rowH * i) }, thickness: 0.5, color: BORDE });
    [0, 2, 3].forEach((i) =>
      c.page.drawLine({ start: { x: mid, y: Y(r0 + rowH * i) }, end: { x: mid, y: Y(r0 + rowH * (i + 1)) }, thickness: 0.5, color: BORDE })
    );
    const inline = (k: string, v: string, x: number, row: number, gap: number, maxW: number) => {
      text(c, k, x + 10, r0 + rowH * row + 12, 7.5, reg, GRIS);
      text(c, v || "—", x + 10 + gap, r0 + rowH * row + 12, 9, bold, TINTA, maxW);
    };
    inline("FECHA DE EMISIÓN", fechaES(f.fecha), MX, 0, 85, 150);
    text(c, "CONDICIÓN DE VENTA", mid + 10, r0 + 12, 7.5, reg, GRIS);
    const check = (x: number, marcado: boolean, label: string) => {
      c.page.drawRectangle({ x, y: Y(r0 + 14), width: 10, height: 10, borderColor: TINTA, borderWidth: 0.8, color: marcado ? TINTA : undefined });
      if (marcado) text(c, "X", x + 2.3, r0 + 12.3, 8, bold, rgb(1, 1, 1));
      text(c, label, x + 15, r0 + 12, 8, marcado ? bold : reg);
    };
    check(mid + 115, f.condicion_venta !== "CREDITO", "CONTADO");
    check(mid + 185, f.condicion_venta === "CREDITO", "CRÉDITO");
    inline("NOMBRE O RAZÓN SOCIAL", f.cliente_nombre, MX, 1, 110, CW - 130);
    inline("RUC o C.I. Nº", f.cliente_documento ?? "", MX, 2, 70, 170);
    inline("NOTA DE REMISIÓN Nº", f.nota_remision ?? "", mid, 2, 95, 150);
    inline("DIRECCIÓN", f.cliente_direccion ?? "", MX, 3, 55, 185);
    inline("TELÉFONO", f.cliente_telefono ?? "", mid, 3, 55, 185);
    t += 20 + rowH * 4 + 10;
  }

  // ── Tabla de ítems ──────────────────────────────────────────────────────
  const colW = [52, 0, 64, 64, 46, 60];
  colW[1] = CW - colW.reduce((a, b) => a + b, 0);
  const colX: number[] = [];
  colW.reduce((x, w, i) => ((colX[i] = x), x + w), MX);
  const heads = ["CANT.", "DESCRIPCIÓN", "PRECIO UNITARIO", "EXENTAS", "5%", "10%"];
  const rowH = 13;
  const bottomLimit = H - 205;

  const drawHead = (top: number) => {
    c.page.drawRectangle({ x: MX, y: Y(top + 20), width: CW, height: 20, color: FONDO, borderColor: BORDE, borderWidth: 0.8 });
    heads.forEach((h, i) => {
      const w = reg.widthOfTextAtSize(h, 7);
      text(c, h, i === 1 ? colX[i] + 8 : colX[i] + (colW[i] - w) / 2, top + 13, 7, reg, GRIS);
    });
    return top + 20;
  };
  const drawBody = (top: number, bottom: number) => {
    c.page.drawRectangle({ x: MX, y: Y(bottom), width: CW, height: bottom - top, borderColor: BORDE, borderWidth: 0.8 });
    for (let i = 1; i < colX.length; i++)
      c.page.drawLine({ start: { x: colX[i], y: Y(top) }, end: { x: colX[i], y: Y(bottom) }, thickness: 0.5, color: BORDE });
  };

  let tableTop = t;
  let y = drawHead(t) + 4;
  const items = f.items ?? [];
  for (const it of items) {
    if (y + rowH + 9 > bottomLimit) {
      drawBody(tableTop + 20, y + 4);
      c = { page: doc.addPage([W, H]), reg, bold };
      text(c, `${f.numero_formateado} (continuación)`, MX, 40, 9, bold);
      tableTop = 52;
      y = drawHead(52) + 4;
    }
    const extra = Number(it.descuento) > 0 ? `Descuento: ${num(Number(it.descuento))}` : "";
    const alto = extra ? rowH + 9 : rowH;
    const base = y + 9;
    const iva = it.iva_tipo ?? "EXENTA";
    const cant = (Number(it.cantidad) || 0).toLocaleString("es-PY", { minimumFractionDigits: esExpo ? 2 : 0, maximumFractionDigits: 2 });
    textRight(c, it.unidad ? `${cant} ${it.unidad}` : cant, colX[0] + colW[0] - 6, base, it.unidad ? 7.5 : 8.5);
    const desc = `${it.codigo ? `${it.codigo}  ` : ""}${it.descripcion}`.toUpperCase();
    text(c, desc, colX[1] + 6, base, 8, reg, TINTA, colW[1] - 10);
    if (extra) text(c, extra, colX[1] + 6, base + 9, 6.8, reg, GRIS, colW[1] - 10);
    textRight(c, num(it.precio_unitario), colX[2] + colW[2] - 6, base, 8.5);
    textRight(c, num(iva === "EXENTA" ? it.subtotal : 0), colX[3] + colW[3] - 6, base, 8.5);
    textRight(c, num(iva === "5" ? it.subtotal : 0), colX[4] + colW[4] - 6, base, 8.5);
    textRight(c, num(iva === "10" ? it.subtotal : 0), colX[5] + colW[5] - 6, base, 8.5);
    y += alto;
  }
  // La tabla local ocupa el alto disponible, como el talonario.
  const tableBottom = esExpo ? Math.max(y + 6, tableTop + 60) : bottomLimit;
  drawBody(tableTop + 20, tableBottom);

  // Subtotales
  t = tableBottom;
  c.page.drawRectangle({ x: MX, y: Y(t + 22), width: CW, height: 22, color: FONDO, borderColor: BORDE, borderWidth: 0.8 });
  text(c, "SUBTOTALES", MX + 10, t + 14.5, 8.5, bold);
  if (esExpo) textRight(c, num(f.total), colX[2] + colW[2] - 6, t + 14.5, 9, bold);
  textRight(c, num(f.total_exentas), colX[3] + colW[3] - 6, t + 14.5, 8.5);
  textRight(c, num(f.total_gravado5), colX[4] + colW[4] - 6, t + 14.5, 8.5);
  textRight(c, num(f.total_gravado10), colX[5] + colW[5] - 6, t + 14.5, 8.5);
  t += 28;

  // Total en letras + total + liquidación IVA
  box(c, MX, t, CW, 92);
  const monedaTxt = NOMBRE_MONEDA[f.moneda] ?? f.moneda;
  // Monto en letras: un renglón si entra; si no, dos renglones a menor tamaño.
  const letras = (txt: string) => {
    if (bold.widthOfTextAtSize(txt, 10.5) <= 355) return text(c, txt, MX + 10, t + 32, 10.5, bold);
    const palabras = txt.split(" ");
    let l1 = "";
    while (palabras.length && bold.widthOfTextAtSize(`${l1} ${palabras[0]}`.trim(), 9.5) <= 355) l1 = `${l1} ${palabras.shift()}`.trim();
    text(c, l1, MX + 10, t + 29, 9.5, bold);
    text(c, palabras.join(" "), MX + 10, t + 41, 9.5, bold, TINTA, 355);
  };
  if (esExpo) {
    text(c, "TOTAL A PAGAR EN LETRAS", MX + 10, t + 16, 7.5, reg, GRIS);
    letras(`${numeroALetras(f.total)} ${monedaTxt}`);
  } else {
    text(c, "TOTAL A PAGAR (en letras)", MX + 10, t + 16, 7.5, reg, GRIS);
    text(c, monedaTxt.charAt(0) + monedaTxt.slice(1).toLowerCase(), MX + 118, t + 16, 7.5, serifIt, GRIS);
    letras(numeroALetras(f.total));
  }
  const notas: string[] = [];
  if (f.moneda !== "PYG" && Number(f.total_pyg) > 0)
    notas.push(
      `Equivalente en guaraníes: Gs. ${Number(f.total_pyg).toLocaleString("es-PY", { maximumFractionDigits: 0 })}` +
        ` (tipo de cambio ${Number(f.tipo_cambio).toLocaleString("es-PY", { maximumFractionDigits: 4 })})`
    );
  if (Number(f.total_descuento) > 0) notas.push(`Descuentos: ${num(Number(f.total_descuento))}`);
  if (notas.length) text(c, notas.join("   ·   "), MX + 10, t + 54, 7.3, reg, GRIS, 355);
  const tx = MX + CW - 165;
  c.page.drawRectangle({ x: tx, y: Y(t + 56), width: 157, height: 48, color: FONDO });
  textRight(c, "TOTAL", tx + 150, t + 20, 8.5, bold);
  const totalTxt = `${simbolo} ${num(f.total)}`;
  const sz = bold.widthOfTextAtSize(totalTxt, 17) > 145 ? 13 : 17;
  textRight(c, totalTxt, tx + 150, t + 45, sz, bold);
  c.page.drawLine({ start: { x: MX + 10, y: Y(t + 62) }, end: { x: MX + CW - 10, y: Y(t + 62) }, thickness: 0.5, color: BORDE });
  text(c, "LIQUIDACIÓN DEL IVA", MX + 10, t + 78, 8, bold);
  text(
    c,
    `IVA 5%: ${num(f.iva5)}     |     IVA 10%: ${num(f.iva10)}     |     TOTAL IVA: ${num((Number(f.iva5) || 0) + (Number(f.iva10) || 0))}`,
    MX + 120,
    t + 78,
    8,
    reg,
    GRIS
  );

  if (f.observaciones) text(c, `Obs.: ${f.observaciones}`, MX, t + 106, 7.5, reg, GRIS, CW);

  // Pie en todas las páginas + marca ANULADA
  const pie = `Autorización de Autoimpresor y Timbrado de Documentos Nº ${autoimp}`;
  for (const p of doc.getPages()) {
    p.drawLine({ start: { x: MX, y: 42 }, end: { x: W - MX, y: 42 }, thickness: 0.5, color: BORDE });
    p.drawText(pie, { x: (W - reg.widthOfTextAtSize(pie, 7)) / 2, y: 30, size: 7, font: reg, color: GRIS });
    if (f.prueba) {
      p.drawRectangle({ x: 0, y: H - 16, width: W, height: 16, color: rgb(0.85, 0.15, 0.15) });
      const aviso = "FACTURA DE PRUEBA · SIN VALOR FISCAL";
      p.drawText(aviso, { x: (W - bold.widthOfTextAtSize(aviso, 8)) / 2, y: H - 11.5, size: 8, font: bold, color: rgb(1, 1, 1) });
      p.drawText("PRUEBA", { x: 170, y: 300, size: 100, font: bold, color: rgb(0.85, 0.15, 0.15), opacity: 0.12, rotate: degrees(35) });
    }
    if (f.estado === "ANULADA") {
      p.drawText("ANULADA", { x: 150, y: 330, size: 90, font: bold, color: rgb(0.85, 0.15, 0.15), opacity: 0.2, rotate: degrees(35) });
    }
  }

  return doc.save();
}
