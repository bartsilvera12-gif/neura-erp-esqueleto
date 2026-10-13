import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/response";
import { getChatServiceClientForEmpresa } from "@/lib/supabase/chat-service-role-empresa";
import { requirePlanCuentasApiAccess } from "@/lib/plan-cuentas/plan-cuentas-auth";
import { listPlanCuentas, type PlanCuentaItem } from "@/lib/plan-cuentas/plan-cuentas";
import { buildXlsxBuffer, xlsxResponseHeaders, nowStamp, type ExportColumn } from "@/lib/excel/export";

export const runtime = "nodejs";

/**
 * Exporta el Plan de Cuentas de la empresa a Excel (.xlsx).
 * Usa EXACTAMENTE las mismas columnas que la plantilla de importación, de modo
 * que el archivo generado se puede volver a importar sin cambios (ida y vuelta).
 */
const COLS: ExportColumn<PlanCuentaItem>[] = [
  { header: "Cuenta", value: (r) => r.cuenta, width: 16 },
  { header: "Denominación", value: (r) => r.denominacion, width: 40 },
  { header: "Nivel", value: (r) => r.nivel, width: 8 },
  { header: "Naturaleza", value: (r) => r.naturaleza, width: 12 },
  { header: "Asentable", value: (r) => (r.asentable ? "S" : "N"), width: 12 },
  { header: "Centro Costo", value: (r) => (r.centro_costo ? "SI" : "NO"), width: 14 },
  { header: "Moneda", value: (r) => r.moneda ?? "", width: 14 },
  { header: "Tipo cambio", value: (r) => r.tipo_cambio ?? "", width: 14 },
  { header: "Cuenta SSET", value: (r) => r.cuenta_sset ?? "", width: 16 },
];

export async function GET(request: Request) {
  try {
    const auth = await requirePlanCuentasApiAccess(request);
    if (!auth.ok) {
      return NextResponse.json(errorResponse(auth.message), { status: auth.status });
    }
    const supabase = await getChatServiceClientForEmpresa(auth.empresaId);
    const cuentas = await listPlanCuentas(supabase, auth.empresaId);
    // Orden por código para que el archivo salga ordenado (listPlanCuentas ya ordena, reforzamos).
    const rows = [...cuentas].sort((a, b) => a.cuenta.localeCompare(b.cuenta, "es"));
    const buf = buildXlsxBuffer(rows, COLS, { sheetName: "Plan de Cuentas" });
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: xlsxResponseHeaders(`plan-de-cuentas-${nowStamp()}`),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "No se pudo exportar el Plan de Cuentas";
    return NextResponse.json(errorResponse(message), { status: 500 });
  }
}
