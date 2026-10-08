/**
 * Pruebas unitarias AISLADAS del módulo de Importaciones (Living Room).
 * Sin Docker, sin DB, sin red: lógica pura + mocks del cliente Supabase.
 * Corre con:  npx tsx scripts/test-importaciones-unit.ts
 *
 * Cubre: Caja (saldo), Costos (prorrateo), Gastos, Recepción/Cierre (faltantes
 * de estado) e Inventario (ingreso sin duplicación).
 */
import assert from "node:assert/strict";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { calcularCosteo } from "@/lib/comex/costeo";
import { gastoEnGuaranies, totalesGastos } from "@/lib/comex/gastos";
import { resumenCaja, movimientoEnGuaranies } from "@/lib/importaciones/caja";
import { faltantesParaEstado } from "@/lib/importaciones/validar";
import { ingresarStock, revertirIngreso } from "@/lib/comex/stock-deposito";

// ── Mini runner ──────────────────────────────────────────────────────────────
let ok = 0;
let fail = 0;
const casos: Promise<void>[] = [];
function test(nombre: string, fn: () => void | Promise<void>) {
  const run = async () => {
    try {
      await fn();
      ok++;
      console.log(`  ✓ ${nombre}`);
    } catch (e) {
      fail++;
      console.log(`  ✗ ${nombre}\n      ${(e as Error).message.split("\n")[0]}`);
    }
  };
  casos.push(run());
}

// ── Mock del cliente Supabase ────────────────────────────────────────────────
// Devuelve lecturas fijas por tabla y registra cada escritura (insert/update/delete).
type ReadCfg = Record<string, { list?: unknown[]; single?: unknown }>;
interface Escritura { table: string; op: "insert" | "update" | "delete"; payload?: unknown }
function mockSupabase(reads: ReadCfg) {
  const writes: Escritura[] = [];
  function builder(table: string) {
    let op: "select" | "insert" | "update" | "delete" = "select";
    const terminal: Record<string, unknown> = {
      maybeSingle: () => Promise.resolve({ data: reads[table]?.single ?? null, error: null }),
      single: () =>
        Promise.resolve(op === "insert" ? { data: { id: "mock-id" }, error: null } : { data: reads[table]?.single ?? null, error: null }),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
        const result =
          op === "insert" || op === "update" || op === "delete"
            ? { data: null, error: null }
            : { data: reads[table]?.list ?? [], error: null };
        return Promise.resolve(result).then(res, rej);
      },
      insert: (rows: unknown) => { op = "insert"; writes.push({ table, op: "insert", payload: rows }); return proxy; },
      update: (obj: unknown) => { op = "update"; writes.push({ table, op: "update", payload: obj }); return proxy; },
      delete: () => { op = "delete"; writes.push({ table, op: "delete" }); return proxy; },
    };
    const proxy: Record<string, unknown> = new Proxy(terminal, {
      get(t, prop: string) {
        if (prop in t) return t[prop];
        return () => proxy; // select, eq, in, order, range, limit, … → encadenable
      },
    });
    return proxy;
  }
  const client = { from: (t: string) => builder(t) } as unknown as AppSupabaseClient;
  return { client, writes };
}

// ── 1. CAJA ──────────────────────────────────────────────────────────────────
console.log("\nCAJA");
test("movimientoEnGuaranies: multiplica por el tipo de cambio", () => {
  assert.equal(movimientoEnGuaranies({ monto: 100, tipo_cambio: 7000 }), 700000);
  assert.equal(movimientoEnGuaranies({ monto: 500000, tipo_cambio: 1 }), 500000);
});
test("resumenCaja: entradas, salidas y saldo (mezcla de monedas)", () => {
  const r = resumenCaja([
    { tipo: "entrada", monto: 1000, tipo_cambio: 7000 }, // 7.000.000
    { tipo: "salida", monto: 200, tipo_cambio: 7000 }, //    1.400.000
    { tipo: "salida", monto: 500000, tipo_cambio: 1 }, //      500.000 (PYG)
  ]);
  assert.equal(r.entradas, 7000000);
  assert.equal(r.salidas, 1900000);
  assert.equal(r.saldo, 5100000);
});
test("resumenCaja: sin movimientos = todo en cero", () => {
  assert.deepEqual(resumenCaja([]), { entradas: 0, salidas: 0, saldo: 0 });
});

// ── 2. COSTOS ────────────────────────────────────────────────────────────────
console.log("COSTOS");
const itemsCosteo = [
  { id: "a", producto_id: "p1", producto_nombre: "A", sku: null, cantidad: 2, precio_unitario: 100, moneda: "USD", subtotal: 200 },
  { id: "b", producto_id: "p2", producto_nombre: "B", sku: null, cantidad: 8, precio_unitario: 50, moneda: "USD", subtotal: 400 },
];
test("calcularCosteo: prorrateo por valor reparte los gastos y suma bien", () => {
  const r = calcularCosteo(itemsCosteo, { tipoCambio: 7000, gastosGs: 700000, prorrateo: "valor" });
  assert.equal(r.totalMercaderiaGs, 4200000);
  assert.equal(r.totalGastosGs, 700000);
  assert.equal(r.totalGs, 4900000);
  // La suma de los gastos repartidos no puede inventar ni perder plata (±1 por redondeo).
  const sumaGastos = r.filas.reduce((s, f) => s + f.gastos_gs, 0);
  assert.ok(Math.abs(sumaGastos - 700000) <= 1, `gastos repartidos=${sumaGastos}`);
});
test("calcularCosteo: por cantidad reparte igual por unidad", () => {
  const r = calcularCosteo(itemsCosteo, { tipoCambio: 7000, gastosGs: 700000, prorrateo: "cantidad" });
  const a = r.filas.find((f) => f.id === "a")!;
  const b = r.filas.find((f) => f.id === "b")!;
  assert.equal(a.gastos_gs, 140000); // 2 u × 70.000
  assert.equal(b.gastos_gs, 560000); // 8 u × 70.000
});
test("calcularCosteo: sin precios no reparte gastos (no hay base)", () => {
  const sinPrecio = itemsCosteo.map((i) => ({ ...i, precio_unitario: 0, subtotal: 0 }));
  const r = calcularCosteo(sinPrecio, { tipoCambio: 7000, gastosGs: 700000, prorrateo: "valor" });
  assert.equal(r.totalMercaderiaGs, 0);
  assert.ok(r.filas.every((f) => f.gastos_gs === 0));
});
test("calcularCosteo: moneda BOB usa el tipo de cambio; PYG no convierte", () => {
  const bob = [{ id: "x", producto_id: "p", producto_nombre: "X", sku: null, cantidad: 1, precio_unitario: 1000, moneda: "BOB", subtotal: 1000 }];
  const rb = calcularCosteo(bob, { tipoCambio: 1200, gastosGs: 0, prorrateo: "valor" });
  assert.equal(rb.filas[0].subtotal_gs, 1200000);
  const pyg = [{ id: "y", producto_id: "p", producto_nombre: "Y", sku: null, cantidad: 1, precio_unitario: 1000, moneda: "PYG", subtotal: 1000 }];
  const rp = calcularCosteo(pyg, { tipoCambio: 1200, gastosGs: 0, prorrateo: "valor" });
  assert.equal(rp.filas[0].subtotal_gs, 1000);
});

// ── 3. GASTOS ────────────────────────────────────────────────────────────────
console.log("GASTOS");
test("gastoEnGuaranies: lleva a Gs. con el tipo de cambio", () => {
  assert.equal(gastoEnGuaranies({ monto: 100, tipo_cambio: 7000 }), 700000);
  assert.equal(gastoEnGuaranies({ monto: 300000, tipo_cambio: 1 }), 300000);
});
test("totalesGastos: total, pendiente y subtotales por tipo", () => {
  const g = (o: Partial<Parameters<typeof totalesGastos>[0][number]>) =>
    ({ id: "x", origen_tipo: "IMPORTACION", origen_id: "i", fecha: "2026-01-01", tipo: "FLETE INTERNACIONAL", descripcion: null, proveedor_nombre: null, comprobante: null, monto: 0, moneda: "USD", tipo_cambio: 1, pagado: true, cuenta_codigo: null, usuario_nombre: null, created_at: "", ...o }) as Parameters<typeof totalesGastos>[0][number];
  const t = totalesGastos([
    g({ tipo: "FLETE INTERNACIONAL", monto: 100, tipo_cambio: 7000, pagado: true }), // 700.000 pagado
    g({ tipo: "SEGURO", monto: 50, tipo_cambio: 7000, pagado: false }), // 350.000 pendiente
  ]);
  assert.equal(t.total, 1050000);
  assert.equal(t.pendiente, 350000);
  assert.equal(t.porTipo[0][0], "FLETE INTERNACIONAL"); // ordenado desc por monto
});

// ── 4. RECEPCIÓN / CIERRE (faltantes de estado) ──────────────────────────────
console.log("RECEPCIÓN / CIERRE");
const impCompleta = {
  id: "imp1",
  proveedor_nombre: "Proveedor BO",
  pais_origen: "BO",
  responsable_nombre: "Responsable",
  fecha_embarque: "2026-01-01",
  fecha_arribo: "2026-01-02",
  fecha_nacionalizacion: "2026-01-03",
};
test("faltantesParaEstado: anular nunca pide requisitos", async () => {
  const { client } = mockSupabase({});
  const f = await faltantesParaEstado(client, "emp", impCompleta, "anulada");
  assert.deepEqual(f, []);
});
test("faltantesParaEstado: sin mercadería no se puede ir a 'en_transito'", async () => {
  const { client } = mockSupabase({
    importacion_items: { list: [] },
    comex_contenedores: { list: [] },
    importacion_recepciones: { list: [] },
    comex_incidencias: { list: [] },
  });
  const f = await faltantesParaEstado(client, "emp", impCompleta, "en_transito");
  assert.ok(f.includes("Falta cargar la mercadería."), f.join(" | "));
});
test("faltantesParaEstado: a 'entregada' sin recepción lo pide", async () => {
  const { client } = mockSupabase({
    importacion_items: { list: [{ producto_id: "p1", producto_nombre: "A", cantidad: 5, cantidad_recibida: 5 }] },
    comex_contenedores: { list: [{ id: "c" }] },
    importacion_recepciones: { list: [] },
    comex_incidencias: { list: [] },
  });
  const f = await faltantesParaEstado(client, "emp", impCompleta, "entregada");
  assert.ok(f.includes("Falta registrar la recepción de la mercadería."), f.join(" | "));
});
test("faltantesParaEstado: a 'cerrada' exige recepción final y sin incidencias abiertas", async () => {
  const { client } = mockSupabase({
    importacion_items: { list: [{ producto_id: "p1", producto_nombre: "A", cantidad: 5, cantidad_recibida: 5 }] },
    comex_contenedores: { list: [{ id: "c" }] },
    importacion_recepciones: { list: [{ final: false }] },
    comex_incidencias: { list: [{ estado: "detectado" }] },
  });
  const f = await faltantesParaEstado(client, "emp", impCompleta, "cerrada");
  assert.ok(f.some((x) => x.includes("recepción no está marcada como terminada")), f.join(" | "));
  assert.ok(f.some((x) => x.includes("incidencia(s) sin resolver")), f.join(" | "));
});
test("faltantesParaEstado: a 'cerrada' con todo en orden no falta nada", async () => {
  const { client } = mockSupabase({
    importacion_items: { list: [{ producto_id: "p1", producto_nombre: "A", cantidad: 5, cantidad_recibida: 5 }] },
    comex_contenedores: { list: [{ id: "c" }] },
    importacion_recepciones: { list: [{ final: true }] },
    comex_incidencias: { list: [{ estado: "resuelto" }] },
  });
  const f = await faltantesParaEstado(client, "emp", impCompleta, "cerrada");
  assert.deepEqual(f, []);
});

// ── 5. INVENTARIO (ingreso sin duplicación) ──────────────────────────────────
console.log("INVENTARIO");
test("ingresarStock: UN solo movimiento, UNA suma de stock (sin duplicar)", async () => {
  const { client, writes } = mockSupabase({
    productos: { single: { nombre: "A", sku: "SKU", stock_actual: 10, costo_promedio: 5000 } },
    inventario_stock_ubicacion: { list: [{ producto_id: "p1", ubicacion_id: "u1", stock_actual: 10 }] },
  });
  const movId = await ingresarStock(client, "emp", {
    productoId: "p1", ubicacionId: "u1", cantidad: 3,
    referencia: "Importación IMP-TEST", observacion: "x", fecha: "2026-01-01",
    usuarioId: "uid", usuarioNombre: "U",
  });
  assert.equal(movId, "mock-id");
  const movs = writes.filter((w) => w.table === "movimientos_inventario" && w.op === "insert");
  const prodUpd = writes.filter((w) => w.table === "productos" && w.op === "update");
  const depUpd = writes.filter((w) => w.table === "inventario_stock_ubicacion" && w.op === "update");
  assert.equal(movs.length, 1, "debe crear exactamente 1 movimiento");
  assert.equal(prodUpd.length, 1, "debe actualizar el stock total 1 vez");
  assert.equal(depUpd.length, 1, "debe actualizar el stock del depósito 1 vez");
  assert.equal((prodUpd[0].payload as { stock_actual: number }).stock_actual, 13); // 10 + 3
  assert.equal((depUpd[0].payload as { stock_actual: number }).stock_actual, 13);
});
test("revertirIngreso: deshace el stock y borra el movimiento", async () => {
  const { client, writes } = mockSupabase({
    productos: { single: { stock_actual: 13 } },
    inventario_stock_ubicacion: { list: [{ producto_id: "p1", ubicacion_id: "u1", stock_actual: 13 }] },
  });
  await revertirIngreso(client, "emp", { productoId: "p1", ubicacionId: "u1", cantidad: 3, movimientoId: "mock-id" });
  assert.ok(writes.some((w) => w.table === "movimientos_inventario" && w.op === "delete"), "borra el movimiento");
  const depUpd = writes.find((w) => w.table === "inventario_stock_ubicacion" && w.op === "update");
  assert.equal((depUpd!.payload as { stock_actual: number }).stock_actual, 10); // 13 - 3
});

// ── Resumen ──────────────────────────────────────────────────────────────────
Promise.all(casos).then(() => {
  console.log(`\nResultado: ${ok} OK, ${fail} fallidas.`);
  process.exit(fail ? 1 : 0);
});
