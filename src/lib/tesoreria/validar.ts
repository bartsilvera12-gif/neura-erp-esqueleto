/** Validación de los datos de cuentas bancarias y cajas chicas. */
const MONEDAS = new Set(["PYG", "USD", "BOB"]);
const txt = (v: unknown, max = 120) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

export function datosCuentaBanco(b: Record<string, unknown>, nueva: boolean): { datos: Record<string, unknown> } | { error: string } {
  const d: Record<string, unknown> = {};
  if (nueva || b.nombre !== undefined) {
    const n = txt(b.nombre);
    if (!n) return { error: "Escribí el nombre del banco." };
    d.nombre = n;
  }
  if (nueva || b.moneda !== undefined) {
    const m = String(b.moneda ?? "PYG").toUpperCase();
    if (!MONEDAS.has(m)) return { error: "Moneda no soportada." };
    d.moneda = m;
  }
  for (const k of ["numero_cuenta", "titular", "cuenta_contable_codigo"]) if (nueva || b[k] !== undefined) d[k] = txt(b[k], 60);
  if (nueva || b.saldo_inicial !== undefined) {
    const s = Number(b.saldo_inicial ?? 0);
    if (!Number.isFinite(s)) return { error: "Saldo inicial inválido." };
    d.saldo_inicial = s;
  }
  if (nueva || b.fecha_saldo_inicial !== undefined) d.fecha_saldo_inicial = /^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha_saldo_inicial ?? "")) ? b.fecha_saldo_inicial : null;
  if (b.activo !== undefined) d.activo = b.activo === true;
  return { datos: d };
}

export function datosCajaChica(b: Record<string, unknown>, nueva: boolean): { datos: Record<string, unknown> } | { error: string } {
  const d: Record<string, unknown> = {};
  if (nueva || b.nombre !== undefined) {
    const n = txt(b.nombre);
    if (!n) return { error: "Escribí el nombre de la caja chica." };
    d.nombre = n;
  }
  if (nueva || b.moneda !== undefined) {
    const m = String(b.moneda ?? "PYG").toUpperCase();
    if (!MONEDAS.has(m)) return { error: "Moneda no soportada." };
    d.moneda = m;
  }
  for (const k of ["fondo_fijo", "tope_gasto"]) {
    if (nueva || b[k] !== undefined) {
      const v = b[k] === "" || b[k] == null ? null : Number(b[k]);
      if (v !== null && !(Number.isFinite(v) && v > 0)) return { error: "El fondo y el tope tienen que ser mayores a 0 (o quedar vacíos)." };
      d[k] = v;
    }
  }
  for (const k of ["responsable_nombre", "cuenta_contable_codigo"]) if (nueva || b[k] !== undefined) d[k] = txt(b[k], 120);
  if (nueva || b.responsable_id !== undefined) d.responsable_id = typeof b.responsable_id === "string" && b.responsable_id ? b.responsable_id : null;
  if (b.activa !== undefined) d.activa = b.activa === true;
  return { datos: d };
}
