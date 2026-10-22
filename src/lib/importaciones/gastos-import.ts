/**
 * Importación de los gastos de una importación desde Excel.
 * Cada fila crea un gasto (comex_gastos). No hay match por clave: todas las
 * filas válidas se insertan. Se valida concepto, monto, moneda y tipo de cambio.
 */
import { pick, pickNumber } from "@/lib/imports/import-helpers";
import { normalizeUpperText } from "@/lib/text/normalize";
import { MONEDAS_COMEX, TIPOS_GASTO_COMEX } from "@/lib/comex/gastos";
import type { PreviewResponse, PreviewRow } from "@/lib/excel/import-types";

const MONEDAS = new Set(MONEDAS_COMEX);

/** Normaliza para comparar conceptos (sin acentos, mayúsculas, espacios simples). */
function normConcepto(s: string): string {
  return s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}
const TIPOS_POR_NORM = new Map(TIPOS_GASTO_COMEX.map((t) => [normConcepto(t), t]));

/** Interpreta SI/NO/TRUE/1 como booleano. */
function pickBool(r: Record<string, string>, ...keys: string[]): boolean {
  const v = normalizeUpperText(pick(r, ...keys));
  return v === "SI" || v === "SÍ" || v === "TRUE" || v === "1" || v === "X" || v === "VERDADERO";
}

export interface GastoParsed {
  row_number: number;
  fecha: string | null;
  tipo: string | null; // concepto canónico (TIPOS_GASTO_COMEX) o null si inválido
  conceptoRaw: string;
  descripcion: string | null;
  proveedor_nombre: string | null;
  comprobante: string | null;
  cuenta_codigo: string | null;
  monto: number;
  moneda: string;
  tipo_cambio: number;
  lleva_iva: boolean;
  pagado: boolean;
  errors: string[];
}

function fechaIso(raw: string): string | null {
  const s = (raw || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // dd/mm/aaaa o dd-mm-aaaa
  const m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const yyyy = y.length === 2 ? `20${y}` : y;
    return `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

export function parseGastosRows(rows: Record<string, string>[], monedaImp: string): GastoParsed[] {
  return rows.map((r, idx) => {
    const errors: string[] = [];
    const conceptoRaw = normalizeUpperText(pick(r, "CONCEPTO", "TIPO", "TIPO_GASTO"));
    const tipo = conceptoRaw ? (TIPOS_POR_NORM.get(normConcepto(conceptoRaw)) ?? null) : null;
    const descripcion = normalizeUpperText(pick(r, "DESCRIPCION", "DETALLE")) || null;
    const proveedor_nombre = normalizeUpperText(pick(r, "PROVEEDOR", "PROVEEDOR_NOMBRE")) || null;
    const comprobante = normalizeUpperText(pick(r, "COMPROBANTE", "NRO_COMPROBANTE", "FACTURA")) || null;
    const cuenta_codigo = normalizeUpperText(pick(r, "CUENTA", "CUENTA_CODIGO", "CUENTA_CONTABLE")) || null;
    const monto = pickNumber(r, "MONTO", "IMPORTE", "TOTAL");
    const monedaRaw = normalizeUpperText(pick(r, "MONEDA")) || monedaImp;
    const moneda = MONEDAS.has(monedaRaw) ? monedaRaw : monedaImp;
    const tcRaw = pickNumber(r, "TIPO_CAMBIO", "TC", "COTIZACION");
    const tipo_cambio = moneda === "PYG" ? 1 : tcRaw;
    const lleva_iva = pickBool(r, "LLEVA_IVA", "IVA");
    const pagado = pickBool(r, "PAGADO");
    const fecha = fechaIso(pick(r, "FECHA"));

    if (!conceptoRaw) errors.push("CONCEPTO obligatorio.");
    else if (!tipo) errors.push(`CONCEPTO "${conceptoRaw}" no válido. Usá uno de: ${TIPOS_GASTO_COMEX.join(", ")}.`);
    if (!(monto > 0)) errors.push("MONTO debe ser mayor a 0.");
    if (moneda !== "PYG" && !(tipo_cambio > 0)) errors.push("Falta TIPO_CAMBIO para moneda extranjera.");
    if (tipo === "OTRO" && !descripcion) errors.push('Cuando el CONCEPTO es "OTRO", poné la DESCRIPCIÓN.');

    return {
      row_number: idx + 2,
      fecha,
      tipo,
      conceptoRaw,
      descripcion,
      proveedor_nombre,
      comprobante,
      cuenta_codigo,
      monto,
      moneda,
      tipo_cambio,
      lleva_iva,
      pagado,
      errors,
    };
  });
}

/** Vista previa: cada fila válida es INSERT; las inválidas, ERROR. */
export function buildPreviewGastos(parsed: GastoParsed[]): PreviewResponse {
  let insertar = 0;
  let errores = 0;
  const rows: PreviewRow[] = parsed.map((p) => {
    const action: PreviewRow["action"] = p.errors.length > 0 ? "ERROR" : "INSERT";
    if (action === "INSERT") insertar++;
    else errores++;
    return {
      row_number: p.row_number,
      action,
      warnings: [],
      errors: p.errors,
      data: {
        CONCEPTO: p.tipo ?? p.conceptoRaw,
        PROVEEDOR: p.proveedor_nombre ?? "",
        COMPROBANTE: p.comprobante ?? "",
        CUENTA: p.cuenta_codigo ?? "",
        MONTO: p.monto,
        MONEDA: p.moneda,
        IVA: p.lleva_iva ? "Sí" : "No",
        PAGADO: p.pagado ? "Sí" : "No",
      },
    };
  });
  return {
    summary: { total: parsed.length, insertar, actualizar: 0, omitir: 0, errores, warnings: 0 },
    rows,
    headers: ["CONCEPTO", "FECHA", "PROVEEDOR", "COMPROBANTE", "CUENTA", "MONTO", "MONEDA", "TIPO_CAMBIO", "LLEVA_IVA", "PAGADO", "DESCRIPCION"],
  };
}

export const GASTOS_TEMPLATE_ROW = {
  CONCEPTO: "DESPACHANTE",
  FECHA: "2026-10-20",
  PROVEEDOR: "AGENCIA MELGAREJO",
  COMPROBANTE: "001-001-0000790",
  CUENTA: "1.01.04.11.000",
  MONTO: 3537412,
  MONEDA: "PYG",
  TIPO_CAMBIO: 1,
  LLEVA_IVA: "SI",
  PAGADO: "NO",
  DESCRIPCION: "",
};
