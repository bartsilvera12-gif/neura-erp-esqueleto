import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * Documentos desde los que se puede armar una nota de remisión o una factura
 * sin tipear los productos.
 * GET                      → lista de facturas emitidas y compromisos de venta recientes.
 * GET ?tipo=factura&id=…   → cliente y productos de esa factura.
 * GET ?tipo=compromiso&id= → cliente y productos de ese compromiso de venta.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase } = ctx;
    const emp = ctx.auth.empresa_id;
    const sp = new URL(request.url).searchParams;
    const tipo = sp.get("tipo");
    const id = sp.get("id");

    if (tipo === "factura" && id) {
      const [f, it] = await Promise.all([
        supabase.from("facturas_exportacion").select("id, numero_formateado, cliente_id, cliente_nombre, cliente_direccion, cliente_ciudad").eq("empresa_id", emp).eq("id", id).maybeSingle(),
        supabase.from("facturas_exportacion_items").select("producto_id, descripcion, cantidad").eq("empresa_id", emp).eq("factura_id", id).order("orden"),
      ]);
      if (f.error || it.error) throw new Error((f.error ?? it.error)?.message);
      if (!f.data) return NextResponse.json(errorResponse("La factura no existe."), { status: 404 });
      const c = f.data as unknown as Record<string, string | null>;
      return NextResponse.json(
        successResponse({
          documento: `Factura ${c.numero_formateado ?? ""}`.trim(),
          cliente: { id: c.cliente_id, nombre: c.cliente_nombre, direccion: c.cliente_direccion, ciudad: c.cliente_ciudad },
          items: ((it.data ?? []) as unknown as { producto_id: string | null; descripcion: string; cantidad: number }[]).map((x) => ({ producto_id: x.producto_id, descripcion: x.descripcion, cantidad: Number(x.cantidad) })),
        })
      );
    }
    if (tipo === "compromiso" && id) {
      const [p, it] = await Promise.all([
        supabase.from("presupuestos").select("id, numero_control, cliente_id, cliente_nombre, cliente_ruc, cliente_telefono, cliente_direccion, moneda, ubicacion_id").eq("empresa_id", emp).eq("id", id).maybeSingle(),
        supabase.from("presupuesto_items").select("producto_id, producto_nombre, sku, cantidad, unidad_medida, precio_unitario, iva_tipo, descuento").eq("empresa_id", emp).eq("presupuesto_id", id),
      ]);
      if (p.error || it.error) throw new Error((p.error ?? it.error)?.message);
      if (!p.data) return NextResponse.json(errorResponse("El compromiso de venta no existe."), { status: 404 });
      const c = p.data as unknown as Record<string, string | null>;
      return NextResponse.json(
        successResponse({
          documento: `Compromiso de venta ${c.numero_control ?? ""}`.trim(),
          moneda: c.moneda ?? "PYG",
          // Almacén del que sale la mercadería, para que la remisión salga de ahí.
          ubicacion_id: c.ubicacion_id ?? null,
          cliente: { id: c.cliente_id, nombre: c.cliente_nombre, documento: c.cliente_ruc, telefono: c.cliente_telefono, direccion: c.cliente_direccion, ciudad: null },
          items: ((it.data ?? []) as unknown as Record<string, unknown>[]).map((x) => ({
            producto_id: (x.producto_id as string) ?? null,
            descripcion: String(x.producto_nombre ?? ""),
            sku: (x.sku as string) ?? null,
            unidad: (x.unidad_medida as string) ?? null,
            cantidad: Number(x.cantidad) || 0,
            precio_unitario: Number(x.precio_unitario) || 0,
            iva_tipo: String(x.iva_tipo ?? "10%"),
            descuento: Number(x.descuento) || 0,
          })),
        })
      );
    }

    const [fs, ps] = await Promise.all([
      supabase.from("facturas_exportacion").select("id, numero_formateado, cliente_nombre, fecha, prueba").eq("empresa_id", emp).eq("estado", "EMITIDA").order("emitida_at", { ascending: false }).limit(100),
      supabase.from("presupuestos").select("id, numero_control, cliente_nombre, fecha, estado, total, moneda").eq("empresa_id", emp).neq("estado", "rechazado").order("created_at", { ascending: false }).limit(100),
    ]);
    return NextResponse.json(
      successResponse({
        facturas: ((fs.data ?? []) as unknown as Record<string, unknown>[]).map((f) => ({ id: f.id, numero: f.numero_formateado, cliente: f.cliente_nombre, fecha: f.fecha, prueba: f.prueba === true })),
        compromisos: ((ps.data ?? []) as unknown as Record<string, unknown>[]).map((p) => ({ id: p.id, numero: p.numero_control, cliente: p.cliente_nombre, fecha: p.fecha, total: Number(p.total) || 0, moneda: p.moneda ?? "PYG" })),
      })
    );
  } catch (err) {
    console.error("[/api/notas-remision/origenes GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar las facturas y compromisos."), { status: 500 });
  }
}
