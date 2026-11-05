/**
 * Util de parseo de archivos Excel/CSV para importacion.
 * Devuelve filas como Record<NORMALIZED_HEADER, string>.
 */
import * as XLSX from "xlsx";

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 5_000;

/** Normaliza un header: trim + upper + sin diacriticos + espacios->_  */
export function normalizeHeader(h: string): string {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_]/g, "");
}

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
}

/** Convierte un valor crudo de celda a string, normalizando fechas a ISO (YYYY-MM-DD). */
function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    // Las celdas de fecha de Excel vienen como Date gracias a cellDates:true.
    // Serializamos como YYYY-MM-DD en UTC para evitar corrimientos por timezone.
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    const d = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v);
}

export async function parseXlsxBuffer(buf: ArrayBuffer): Promise<ParsedSheet> {
  // cellDates: true → fechas de Excel se devuelven como objetos Date, no como
  // serial numbers (45713, etc.) que luego se stringifican y rompen el parseo.
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const ws = wb.Sheets[sheetName];
  const rowsRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });
  if (rowsRaw.length === 0) return { headers: [], rows: [] };
  const rawHeaders = Object.keys(rowsRaw[0]);
  const headers = rawHeaders.map(normalizeHeader);
  const rows: Record<string, string>[] = rowsRaw.map((r) => {
    const out: Record<string, string> = {};
    rawHeaders.forEach((rh, i) => {
      out[headers[i]] = cellToString(r[rh]);
    });
    return out;
  });
  return { headers, rows };
}

/** Lee `file` (Form-data File) y devuelve filas normalizadas. */
export async function parseUploadFile(file: File): Promise<ParsedSheet | { error: string }> {
  if (file.size > MAX_BYTES) {
    return { error: `Archivo demasiado grande (máx. ${Math.round(MAX_BYTES / 1024 / 1024)} MB).` };
  }
  try {
    const buf = await file.arrayBuffer();
    const parsed = await parseXlsxBuffer(buf);
    if (parsed.rows.length > MAX_ROWS) {
      return { error: `Demasiadas filas (máx. ${MAX_ROWS}).` };
    }
    return parsed;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer el archivo." };
  }
}
