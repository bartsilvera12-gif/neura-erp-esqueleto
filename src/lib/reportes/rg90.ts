import "server-only";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * Exportación RG90 (Resolución General 90/2021 DNIT Paraguay).
 *
 * Layout: XLSX con una hoja "Datos" y 28 columnas, como lo exporta Marangatu
 * en "Detalle de Comprobantes Registrados". Un mismo archivo puede llevar
 * filas de COMPRAS y VENTAS mezcladas.
 *
 * Los montos en el archivo van siempre en guaraníes. Para comprobantes en
 * moneda extranjera se convierte usando la cotización del comprobante
 * (compras.cotizacion / factura.tipo_cambio) y se deja la columna
 * "Operación en Moneda Extranjera" con la moneda original.
 *
 * Validaciones: cada fila se marca con `errores` si le faltan datos
 * obligatorios (RUC, timbrado, nro) para que la contadora pueda corregir
 * antes de subir a Marangatu.
 */

type Client = import("pg").PoolClient;

export const TIPO_REGISTRO = ["COMPRAS", "VENTAS"] as const;
export type TipoRegistroRg90 = (typeof TIPO_REGISTRO)[number];

export interface Rg90Row {
  // 28 columnas Marangatu (en el orden del XLSX).
  ruc_informante: string;
  nombre_informante: string;
  ruc_informado: string;
  tipo_identificacion: "RUC" | "CI" | "PASAPORTE" | "OTRO";
  nombre_informado: string;
  tipo_registro: TipoRegistroRg90;
  tipo_comprobante: string;
  fecha_emision: string;         // dd/mm/yyyy
  periodo_emision: string;       // mm/yyyy
  condicion: "CONTADO" | "CRÉDITO";
  moneda_extranjera: string;     // "USD" / "BOB" / "" si PYG
  timbrado: string;
  numero_comprobante: string;    // 001-002-0000001
  cdc: string;                   // 44 dígitos del DE, o ""
  monto_gravado_10: number;
  iva_10: number;
  monto_gravado_5: number;
  iva_5: number;
  monto_exento: number;
  total: number;
  imputa_iva: "SI" | "NO";
  imputa_ire: "SI" | "NO";
  imputa_irp: "SI" | "NO";
  no_imputar: "SI" | "NO";
  numero_comprobante_asociado: string;
  timbrado_asociado: string;
  fecha_registro: string;        // dd/mm/yyyy
  origen_informacion: "ELECTRONICO" | "FISICO" | "VIRTUAL";
  // Metadata (no va al archivo, se usa para la pre-validación en pantalla).
  _errores: string[];
  _id_interno: string;           // numero_control o id, para el link en pantalla
  _seccion?: string | null;      // solo compras (COMEX / SHOWROOM / PRODUCCION)
}

export interface Rg90Filters {
  desde: string;                 // YYYY-MM-DD
  hasta: string;                 // YYYY-MM-DD
  tipos: TipoRegistroRg90[];     // ["COMPRAS", "VENTAS"] o uno solo
}

export interface Rg90Result {
  rows: Rg90Row[];
  informante: { ruc: string; nombre: string };
  totales: {
    compras: number; ventas: number;
    gravado_10: number; iva_10: number;
    gravado_5: number; iva_5: number;
    exento: number;
  };
  comprobantes_con_errores: number;
}

function pool() {
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  return p;
}

function fechaES(iso: string | Date | null): string {
  if (!iso) return "";
  const s = typeof iso === "string" ? iso : iso.toISOString();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function periodoES(iso: string | Date | null): string {
  if (!iso) return "";
  const s = typeof iso === "string" ? iso : iso.toISOString();
  const m = s.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[2]}/${m[1]}` : "";
}
function rucSinDV(v: string | null | undefined): string {
  const s = (v ?? "").trim().toUpperCase();
  if (!s) return "";
  // 80150840-1 → 80150840 ; mantener letras (algunos CI). Quitar la DV típica.
  return s.replace(/[-\s]?\d$/, "").replace(/[^A-Z0-9]/g, "") || s.replace(/[^A-Z0-9]/g, "");
}
function tipoIdent(ruc: string | null | undefined): Rg90Row["tipo_identificacion"] {
  const s = (ruc ?? "").trim();
  if (!s) return "OTRO";
  // CI paraguaya: solo dígitos sin guión o con guión al final (no RUC).
  if (/^\d{6,8}$/.test(s)) return "CI";
  return "RUC";
}
function nroReal(s: string | null | undefined): boolean {
  const t = (s ?? "").trim();
  if (!t) return false;
  if (/^0+$/.test(t.replace(/[-\s]/g, ""))) return false;
  return t.length >= 3;
}
function mapTipoCompra(tipoCodigo: number | null, tipoNombre: string | null): string {
  // Marangatu espera "FACTURA" / "NOTA DE CREDITO" / "AUTOFACTURA" / etc.
  const n = String(tipoNombre ?? "").toUpperCase();
  if (n.includes("NOTA DE CRED")) return "NOTA DE CREDITO";
  if (n.includes("NOTA DE DEB")) return "NOTA DE DEBITO";
  if (n.includes("AUTOFACT")) return "AUTOFACTURA";
  if (n.includes("BOLETA")) return "BOLETA DE VENTA";
  if (n.includes("DESPACH")) return "DESPACHO DE IMPORTACION";
  return "FACTURA";
}

async function leerInformante(client: Client, schema: string, empresaId: string): Promise<{ ruc: string; nombre: string }> {
  const tE = quoteSchemaTable(schema, "empresas");
  // Algunos schemas tienen `nombre_empresa` y otros `nombre`. Preguntamos al
  // information_schema por las columnas presentes y elegimos la que haya.
  const { rows: cols } = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema=$1 AND table_name='empresas'
        AND column_name IN ('nombre_empresa','nombre','ruc')`,
    [schema]
  );
  const has = new Set(cols.map((c) => c.column_name));
  const nomExpr = has.has("nombre_empresa") && has.has("nombre")
    ? "COALESCE(NULLIF(btrim(nombre_empresa),''), NULLIF(btrim(nombre),''))"
    : has.has("nombre_empresa") ? "NULLIF(btrim(nombre_empresa),'')"
    : has.has("nombre") ? "NULLIF(btrim(nombre),'')"
    : "''";
  const rucExpr = has.has("ruc") ? "ruc" : "NULL";
  const { rows } = await client.query<{ ruc: string | null; nombre: string | null }>(
    `SELECT ${rucExpr} AS ruc, ${nomExpr} AS nombre FROM ${tE} WHERE id=$1::uuid`,
    [empresaId]
  );
  return {
    ruc: rucSinDV(rows[0]?.ruc ?? ""),
    nombre: (rows[0]?.nombre ?? "").trim().toUpperCase(),
  };
}

async function listCompras(client: Client, schema: string, empresaId: string, f: Rg90Filters, info: { ruc: string; nombre: string }): Promise<Rg90Row[]> {
  const tC = quoteSchemaTable(schema, "libro_compras");
  const { rows } = await client.query<{
    id: string; numero_control: string | null;
    fecha: string; proveedor_nombre: string | null; proveedor_ruc: string | null;
    tipo_codigo: number | null; tipo_nombre: string | null; condicion: string | null;
    nro_comprobante: string | null; timbrado: string | null; es_electronica: boolean | null; cdc: string | null;
    moneda: string | null; cotizacion: string | null;
    total_exentas: string | null; total_gravado10: string | null; total_gravado5: string | null;
    iva10: string | null; iva5: string | null; total: string | null;
    impacta: string | null; nota_credito_de_id: string | null;
    seccion: string | null;
    asoc_nro: string | null; asoc_timbrado: string | null;
  }>(
    `SELECT c.id, c.numero_control, to_char(c.fecha, 'YYYY-MM-DD') AS fecha,
            c.proveedor_nombre, c.proveedor_ruc, c.tipo_codigo, c.tipo_nombre, c.condicion,
            c.nro_comprobante, c.timbrado, c.es_electronica, c.cdc,
            c.moneda, c.cotizacion::text AS cotizacion,
            c.total_exentas::text, c.total_gravado10::text, c.total_gravado5::text,
            c.iva10::text, c.iva5::text, c.total::text,
            c.impacta, c.nota_credito_de_id,
            c.seccion,
            orig.nro_comprobante AS asoc_nro, orig.timbrado AS asoc_timbrado
       FROM ${tC} c
       LEFT JOIN ${tC} orig ON orig.id = c.nota_credito_de_id
      WHERE c.empresa_id=$1::uuid
        AND c.fecha >= $2::date AND c.fecha <= $3::date
        AND c.estado = 'registrada'
      ORDER BY c.fecha, c.created_at`,
    [empresaId, f.desde, f.hasta]
  );
  const hoy = fechaES(new Date().toISOString().slice(0, 10));
  return rows.map((r) => {
    const esPYG = (r.moneda ?? "PYG").toUpperCase() === "PYG";
    const cot = esPYG ? 1 : (Number(r.cotizacion) || 1);
    const toPyg = (v: string | null) => Math.round(Number(v ?? 0) * cot);
    const errores: string[] = [];
    if (!r.proveedor_ruc?.trim()) errores.push("Falta RUC del proveedor.");
    if (!r.timbrado?.trim()) errores.push("Falta timbrado.");
    if (!nroReal(r.nro_comprobante)) errores.push("Falta N° de comprobante.");
    const impacta = String(r.impacta ?? "SOLO_IVA");
    return {
      ruc_informante: info.ruc,
      nombre_informante: info.nombre,
      ruc_informado: rucSinDV(r.proveedor_ruc),
      tipo_identificacion: tipoIdent(r.proveedor_ruc),
      nombre_informado: (r.proveedor_nombre ?? "").trim().toUpperCase(),
      tipo_registro: "COMPRAS",
      tipo_comprobante: mapTipoCompra(r.tipo_codigo, r.tipo_nombre),
      fecha_emision: fechaES(r.fecha),
      periodo_emision: periodoES(r.fecha),
      condicion: String(r.condicion ?? "").toUpperCase() === "CREDITO" ? "CRÉDITO" : "CONTADO",
      moneda_extranjera: esPYG ? "" : (r.moneda ?? "").toUpperCase(),
      timbrado: (r.timbrado ?? "").trim(),
      numero_comprobante: (r.nro_comprobante ?? "").trim(),
      cdc: (r.cdc ?? "").trim(),
      monto_gravado_10: toPyg(r.total_gravado10),
      iva_10: toPyg(r.iva10),
      monto_gravado_5: toPyg(r.total_gravado5),
      iva_5: toPyg(r.iva5),
      monto_exento: toPyg(r.total_exentas),
      total: toPyg(r.total),
      imputa_iva: impacta === "SOLO_IVA" || impacta === "IVA_IRE" ? "SI" : "NO",
      imputa_ire: impacta === "SOLO_IRE" || impacta === "IVA_IRE" ? "SI" : "NO",
      imputa_irp: "NO",
      no_imputar: impacta === "NO_IMPUTA" ? "SI" : "NO",
      numero_comprobante_asociado: (r.asoc_nro ?? "").trim(),
      timbrado_asociado: (r.asoc_timbrado ?? "").trim(),
      fecha_registro: hoy,
      origen_informacion: r.es_electronica ? "ELECTRONICO" : "FISICO",
      _errores: errores,
      _id_interno: r.numero_control ?? r.id,
      _seccion: r.seccion,
    };
  });
}

async function listVentas(client: Client, schema: string, empresaId: string, f: Rg90Filters, info: { ruc: string; nombre: string }): Promise<Rg90Row[]> {
  // Combina facturas emitidas + notas de crédito. Facturas electrónicas traen CDC;
  // las físicas no. Tipo de cambio: si la factura tiene moneda != PYG, se aplica
  // su tipo_cambio para expresar los montos en guaraníes.
  // Las facturas del módulo de Facturación se guardan en facturas_exportacion
  // (la tabla "facturas" es la de cuentas por cobrar y puede estar vacía).
  const tF = quoteSchemaTable(schema, "facturas_exportacion");
  const sql = `
    SELECT 'factura'::text AS origen_tipo, f.id::text AS id, f.fecha::date AS fecha,
           NULLIF(btrim(f.cliente_nombre),'') AS cliente,
           NULLIF(btrim(f.cliente_documento),'') AS ruc,
           f.timbrado AS timbrado,
           NULL::text AS cdc,
           COALESCE(NULLIF(f.numero_formateado,''), f.establecimiento || '-' || f.punto_expedicion || '-' || lpad(COALESCE(f.numero,0)::text, 7, '0')) AS numero,
           CASE WHEN upper(COALESCE(f.condicion_venta,'')) LIKE 'CR%' THEN 'credito' ELSE 'contado' END AS condicion,
           COALESCE(f.moneda, 'PYG') AS moneda,
           COALESCE(f.tipo_cambio::numeric, 1) AS tipo_cambio,
           f.total_exentas::numeric AS exento,
           f.total_gravado5::numeric AS gravado5,
           f.iva5::numeric AS iva5,
           f.total_gravado10::numeric AS gravado10,
           f.iva10::numeric AS iva10,
           f.total::numeric AS total,
           false AS es_electronica
      FROM ${tF} f
     WHERE f.empresa_id = $1::uuid
       AND f.fecha >= $2::date AND f.fecha <= $3::date
       AND upper(COALESCE(f.estado,'')) <> 'ANULADA'
       AND COALESCE(f.prueba, false) = false
     ORDER BY f.fecha, f.created_at
  `;

  type R = {
    origen_tipo: "factura" | "nota_credito"; id: string; fecha: string;
    cliente: string | null; ruc: string | null; timbrado: string | null; cdc: string | null;
    numero: string | null; condicion: string | null; moneda: string | null; tipo_cambio: string;
    exento: string; gravado5: string; iva5: string; gravado10: string; iva10: string; total: string;
    es_electronica: boolean | null;
  };

  let rows: R[] = [];
  try {
    const q = await client.query<R>(sql, [empresaId, f.desde, f.hasta]);
    rows = q.rows;
  } catch (e) {
    // Si el schema no tiene las tablas de facturas/NC, no hay ventas: devolver [].
    console.warn("[rg90 ventas] query fallo:", e instanceof Error ? e.message : e);
    return [];
  }

  const hoy = fechaES(new Date().toISOString().slice(0, 10));
  return rows.map((r) => {
    const esPYG = (r.moneda ?? "PYG").toUpperCase() === "PYG";
    const cot = esPYG ? 1 : (Number(r.tipo_cambio) || 1);
    const toPyg = (v: string) => Math.round(Number(v ?? 0) * cot);
    const errores: string[] = [];
    if (!r.ruc?.trim()) errores.push("Falta RUC del cliente.");
    if (!r.timbrado?.trim()) errores.push("Falta timbrado.");
    if (!nroReal(r.numero)) errores.push("Falta N° de comprobante.");
    return {
      ruc_informante: info.ruc,
      nombre_informante: info.nombre,
      ruc_informado: rucSinDV(r.ruc),
      tipo_identificacion: tipoIdent(r.ruc),
      nombre_informado: (r.cliente ?? "").trim().toUpperCase(),
      tipo_registro: "VENTAS",
      tipo_comprobante: r.origen_tipo === "nota_credito" ? "NOTA DE CREDITO" : "FACTURA",
      fecha_emision: fechaES(r.fecha),
      periodo_emision: periodoES(r.fecha),
      condicion: String(r.condicion ?? "").toLowerCase() === "credito" ? "CRÉDITO" : "CONTADO",
      moneda_extranjera: esPYG ? "" : (r.moneda ?? "").toUpperCase(),
      timbrado: (r.timbrado ?? "").trim(),
      numero_comprobante: (r.numero ?? "").trim(),
      cdc: (r.cdc ?? "").trim(),
      monto_gravado_10: toPyg(r.gravado10),
      iva_10: toPyg(r.iva10),
      monto_gravado_5: toPyg(r.gravado5),
      iva_5: toPyg(r.iva5),
      monto_exento: toPyg(r.exento),
      total: toPyg(r.total),
      imputa_iva: "SI",
      imputa_ire: "SI",
      imputa_irp: "NO",
      no_imputar: "NO",
      numero_comprobante_asociado: "",
      timbrado_asociado: "",
      fecha_registro: hoy,
      origen_informacion: r.es_electronica ? "ELECTRONICO" : "FISICO",
      _errores: errores,
      _id_interno: r.id,
    };
  });
}

/** Punto de entrada principal. */
export async function generarRG90(schemaRaw: string, empresaId: string, f: Rg90Filters): Promise<Rg90Result> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const client = await pool().connect();
  try {
    const informante = await leerInformante(client, schema, empresaId);
    const rows: Rg90Row[] = [];
    if (f.tipos.includes("COMPRAS")) rows.push(...(await listCompras(client, schema, empresaId, f, informante)));
    if (f.tipos.includes("VENTAS"))  rows.push(...(await listVentas (client, schema, empresaId, f, informante)));
    // Ordenar por tipo_registro y fecha
    rows.sort((a, b) => (a.tipo_registro === b.tipo_registro ? a.fecha_emision.localeCompare(b.fecha_emision) : a.tipo_registro.localeCompare(b.tipo_registro)));

    const totales = {
      compras: 0, ventas: 0,
      gravado_10: 0, iva_10: 0, gravado_5: 0, iva_5: 0, exento: 0,
    };
    let errores = 0;
    for (const r of rows) {
      if (r.tipo_registro === "COMPRAS") totales.compras += r.total;
      else totales.ventas += r.total;
      totales.gravado_10 += r.monto_gravado_10;
      totales.iva_10 += r.iva_10;
      totales.gravado_5 += r.monto_gravado_5;
      totales.iva_5 += r.iva_5;
      totales.exento += r.monto_exento;
      if (r._errores.length) errores++;
    }
    return { rows, informante, totales, comprobantes_con_errores: errores };
  } finally {
    client.release();
  }
}
