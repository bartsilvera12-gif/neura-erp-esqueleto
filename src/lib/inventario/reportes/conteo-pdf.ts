/**
 * Hoja de CONTEO FÍSICO imprimible (HTML → el navegador imprime o guarda PDF).
 * Lista los productos con su stock de sistema y deja columnas en blanco para
 * anotar el conteo real y la diferencia. Reusa el formato de los comprobantes.
 * SOLO presentación.
 */
import { cabeceraDoc, esc, filasVacias, paginaDoc } from "@/lib/documentos/formato";

export interface ConteoFila {
  sku: string;
  nombre: string;
  unidad?: string | null;
  stock: number;
}

function hoy(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const cant = (n: number) => (Number(n) || 0).toLocaleString("es-PY");

export function conteoFisicoHtml(opts: {
  titulo: string;
  meta: [string, string][];
  filas: ConteoFila[];
  auto: boolean;
}): string {
  const { titulo, meta, filas, auto } = opts;

  const metaHtml = `
  <div class="box pad dos">
    <div>
      ${meta.map(([k, v]) => `<div class="fila"><span class="l" style="flex-basis:110px">${esc(k)}:</span><span>${esc(v)}</span></div>`).join("")}
    </div>
    <div>
      <div class="fila"><span class="l" style="flex-basis:110px">RESPONSABLE:</span><span></span></div>
      <div class="fila"><span class="l" style="flex-basis:110px">FIRMA:</span><span></span></div>
    </div>
  </div>`;

  const cuerpoFilas = filas
    .map(
      (f) => `<tr>
      <td>${esc(f.sku)}</td>
      <td>${esc(f.nombre)}</td>
      <td class="c">${esc(f.unidad ?? "")}</td>
      <td class="r">${cant(f.stock)}</td>
      <td></td>
      <td></td>
    </tr>`
    )
    .join("");

  const tabla = `
  <table class="g" style="margin-bottom:3px">
    <thead>
      <tr>
        <th style="width:90px">Código</th>
        <th>Descripción</th>
        <th style="width:60px">Unidad</th>
        <th style="width:70px">Stock sistema</th>
        <th style="width:80px">Conteo físico</th>
        <th style="width:70px">Diferencia</th>
      </tr>
    </thead>
    <tbody>
      ${cuerpoFilas}
      ${filasVacias(filas.length === 0 ? 20 : 6, 6)}
    </tbody>
  </table>`;

  const cuerpo = `
  ${cabeceraDoc({ titulo, numero: hoy() })}
  ${metaHtml}
  ${tabla}`;

  return paginaDoc(titulo, cuerpo, auto);
}

export { hoy as fechaHoyDoc };
