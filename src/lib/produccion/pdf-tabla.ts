import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type ColPdf = { header: string; width: number; align?: "left" | "right" };

/**
 * Genera un PDF simple con título y una tabla (hoja carta horizontal),
 * con encabezado repetido y paginado. Sin dependencias de navegador.
 */
export async function pdfTabla(titulo: string, columnas: ColPdf[], filas: string[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 792, H = 612, M = 36; // carta horizontal, margen 0.5"
  const azul = rgb(0.18, 0.56, 0.6);
  const gris = rgb(0.4, 0.4, 0.4);
  const totalW = columnas.reduce((a, c) => a + c.width, 0);
  const esc = (s: string) => (s ?? "").replace(/[^\x20-\x7E áéíóúñÁÉÍÓÚÑ₲°º]/g, "");

  let page = doc.addPage([W, H]);
  let y = 0;
  const nuevaPagina = (primera = false) => {
    if (!primera) page = doc.addPage([W, H]);
    page.drawText(esc(titulo), { x: M, y: H - M, size: 14, font: bold, color: rgb(0.1, 0.1, 0.1) });
    page.drawText(new Date().toLocaleString("es-PY"), { x: W - M - 120, y: H - M, size: 8, font, color: gris });
    y = H - M - 26;
    // Encabezado de tabla
    let x = M;
    page.drawRectangle({ x: M, y: y - 4, width: totalW, height: 16, color: rgb(0.93, 0.96, 0.96) });
    for (const c of columnas) {
      page.drawText(esc(c.header), { x: c.align === "right" ? x + c.width - 2 - bold.widthOfTextAtSize(esc(c.header), 8) : x + 2, y, size: 8, font: bold, color: azul });
      x += c.width;
    }
    y -= 18;
  };
  nuevaPagina(true);

  for (const fila of filas) {
    if (y < M + 14) nuevaPagina();
    let x = M;
    for (let i = 0; i < columnas.length; i++) {
      const c = columnas[i];
      let txt = esc(String(fila[i] ?? ""));
      // Recorta el texto que no entra en la columna.
      while (txt.length > 1 && font.widthOfTextAtSize(txt, 8) > c.width - 4) txt = txt.slice(0, -2);
      page.drawText(txt, { x: c.align === "right" ? x + c.width - 2 - font.widthOfTextAtSize(txt, 8) : x + 2, y, size: 8, font, color: rgb(0.15, 0.15, 0.15) });
      x += c.width;
    }
    y -= 14;
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: M + totalW, y: y + 4 }, thickness: 0.3, color: rgb(0.9, 0.9, 0.9) });
  }

  return doc.save();
}
