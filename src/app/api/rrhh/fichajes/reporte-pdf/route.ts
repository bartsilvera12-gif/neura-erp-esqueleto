import { NextRequest } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const runtime = "nodejs";

/**
 * GET /api/rrhh/fichajes/reporte-pdf?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&empleadoId?
 * Devuelve un PDF con las marcaciones del rango (una fila por fichaje).
 * Cubre el bug reportado: el boton "Descargar PDF" en Control horario
 * apuntaba a esta URL y respondia 404 porque la ruta no existia.
 */
export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  const sp = new URL(request.url).searchParams;
  const hoy = new Date().toISOString().slice(0, 10);
  const desde = sp.get("desde") ?? hoy;
  const hasta = sp.get("hasta") ?? hoy;
  const empleadoId = sp.get("empleadoId") || undefined;

  let q = ctx.supabase
    .from("empleado_fichajes")
    .select(
      "id, empleado_id, fecha, hora_entrada, hora_salida, horas, observacion, marcado_kiosco, empleados:empleado_id(nombre, cargo)",
    )
    .eq("empresa_id", ctx.auth.empresa_id)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true });
  if (empleadoId) q = q.eq("empleado_id", empleadoId);
  const { data, error } = await q;
  if (error) return new Response(error.message, { status: 500 });

  type Row = {
    fecha: string;
    hora_entrada: string | null;
    hora_salida: string | null;
    horas: number | string | null;
    observacion: string | null;
    empleados: { nombre?: string; cargo?: string | null } | Array<{ nombre?: string; cargo?: string | null }> | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const A4 = [595.28, 841.89] as [number, number];
  const MX = 36;
  let page = doc.addPage(A4);
  let y = 800;

  const line = (
    text: string,
    opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {},
  ) => {
    const size = opts.size ?? 10;
    if (y < 60) {
      page = doc.addPage(A4);
      y = 800;
    }
    page.drawText(text, {
      x: MX,
      y,
      size,
      font: opts.bold ? bold : font,
      color: rgb(opts.color?.[0] ?? 0, opts.color?.[1] ?? 0, opts.color?.[2] ?? 0),
    });
    y -= size + 6;
  };

  line("Reporte de marcaciones", { size: 16, bold: true });
  line(`Rango: ${desde} al ${hasta}`, { size: 10, color: [0.4, 0.4, 0.4] });
  y -= 6;

  page.drawLine({ start: { x: MX, y }, end: { x: A4[0] - MX, y }, thickness: 0.5 });
  y -= 10;

  // Header de tabla
  page.drawText("Fecha", { x: MX, y, size: 9, font: bold });
  page.drawText("Empleado", { x: MX + 80, y, size: 9, font: bold });
  page.drawText("Cargo", { x: MX + 240, y, size: 9, font: bold });
  page.drawText("Entrada", { x: MX + 340, y, size: 9, font: bold });
  page.drawText("Salida", { x: MX + 400, y, size: 9, font: bold });
  page.drawText("Horas", { x: MX + 460, y, size: 9, font: bold });
  y -= 14;

  let totalHoras = 0;
  for (const r of rows) {
    const emp = Array.isArray(r.empleados) ? r.empleados[0] : r.empleados;
    const horas = Number(r.horas) || 0;
    totalHoras += horas;
    if (y < 60) {
      page = doc.addPage(A4);
      y = 800;
    }
    page.drawText(String(r.fecha), { x: MX, y, size: 9, font });
    page.drawText(String(emp?.nombre ?? "").slice(0, 30), { x: MX + 80, y, size: 9, font });
    page.drawText(String(emp?.cargo ?? "").slice(0, 20), { x: MX + 240, y, size: 9, font });
    page.drawText(String(r.hora_entrada ?? "—"), { x: MX + 340, y, size: 9, font });
    page.drawText(String(r.hora_salida ?? "—"), { x: MX + 400, y, size: 9, font });
    page.drawText(horas.toFixed(1), { x: MX + 460, y, size: 9, font });
    y -= 12;
  }

  y -= 8;
  page.drawLine({ start: { x: MX, y }, end: { x: A4[0] - MX, y }, thickness: 0.5 });
  y -= 12;
  line(`Total horas registradas: ${totalHoras.toFixed(1)}`, { bold: true });
  line(`Registros: ${rows.length}`);

  const bytes = await doc.save();
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="marcaciones-${desde}-a-${hasta}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
