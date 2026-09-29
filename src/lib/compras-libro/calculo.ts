/**
 * Cálculos del libro de compras (compartidos por pantalla y servidor):
 * IVA incluido en "gravadas", totales, pre-asiento y lectura del CDC.
 */
import { digitoVerificadorModulo11CdcSet, parseBase43DesdeCdc44 } from "@/lib/sifen/sifen-cdc";

export interface LineaCalc {
  cuenta_codigo: string | null;
  centro_costo?: string | null;
  programa?: string | null;
  explicacion?: string | null;
  exentas: number;
  gravadas: number;
  iva_porcentaje: 0 | 5 | 10;
  imputa_iva: boolean;
}

const redondeo = (moneda: string) => (n: number) => (moneda === "PYG" ? Math.round(n) : Math.round(n * 100) / 100);

/** "Gravadas" trae el IVA incluido: 27.000 al 10% → neto 24.545 + IVA 2.455. */
export function netoEIva(gravadas: number, pct: number, moneda: string) {
  const r = redondeo(moneda);
  if (!pct || !gravadas) return { neto: r(gravadas), iva: 0 };
  const neto = r(gravadas / (1 + pct / 100));
  return { neto, iva: r(gravadas - neto) };
}

export function totales(lineas: LineaCalc[], moneda: string) {
  const r = redondeo(moneda);
  let exentas = 0, grav10 = 0, grav5 = 0, iva10 = 0, iva5 = 0, neto = 0;
  for (const l of lineas) {
    exentas += Number(l.exentas) || 0;
    const g = Number(l.gravadas) || 0;
    const { neto: n, iva } = netoEIva(g, l.iva_porcentaje, moneda);
    neto += n;
    if (l.iva_porcentaje === 10) { grav10 += g; iva10 += iva; }
    else if (l.iva_porcentaje === 5) { grav5 += g; iva5 += iva; }
    else exentas += g; // sin IVA: cuenta como exenta
  }
  const total = r(exentas + grav10 + grav5);
  return {
    exentas: r(exentas),
    gravado10: r(grav10),
    gravado5: r(grav5),
    iva10: r(iva10),
    iva5: r(iva5),
    subtotalSinIva: r(exentas + neto),
    total,
  };
}

export interface AsientoLinea {
  cuenta: string;
  detalle: string;
  debe: number;
  haber: number;
}

/**
 * Pre-asiento como el del sistema anterior del cliente:
 *   Debe  cuenta de cada renglón (neto + exentas)
 *   Debe  IVA crédito fiscal (si el renglón imputa IVA)
 *   Haber cuenta del tipo (contado: caja/banco) o proveedores (crédito)
 * Las retenciones se restan del haber principal y van a su propia cuenta.
 * En una nota de crédito se invierte debe/haber.
 */
export function preAsiento(opts: {
  lineas: LineaCalc[];
  moneda: string;
  condicion: "CONTADO" | "CREDITO";
  esNotaCredito: boolean;
  cuentaTipo: string | null;
  cuentaIva: string;
  cuentaProveedores: string;
  cuentaRetIva: string | null;
  cuentaRetRenta: string | null;
  retencionIva: number;
  retencionRenta: number;
  detalle: string;
}): { lineas: AsientoLinea[]; avisos: string[] } {
  const r = redondeo(opts.moneda);
  const avisos: string[] = [];
  const debe = new Map<string, number>();
  let iva = 0;
  for (const l of opts.lineas) {
    const g = Number(l.gravadas) || 0;
    const { neto, iva: i } = netoEIva(g, l.iva_porcentaje, opts.moneda);
    const imputa = l.imputa_iva && l.iva_porcentaje > 0;
    const monto = (Number(l.exentas) || 0) + (imputa ? neto : g);
    if (imputa) iva += i;
    const cuenta = (l.cuenta_codigo ?? "").trim();
    if (!cuenta) avisos.push("Hay renglones sin cuenta contable.");
    debe.set(cuenta || "(sin cuenta)", (debe.get(cuenta || "(sin cuenta)") ?? 0) + monto);
  }
  const total = [...debe.values()].reduce((s, v) => s + v, 0) + iva;
  const out: AsientoLinea[] = [...debe.entries()].map(([cuenta, v]) => ({ cuenta, detalle: opts.detalle, debe: r(v), haber: 0 }));
  if (iva > 0) out.push({ cuenta: opts.cuentaIva, detalle: opts.detalle, debe: r(iva), haber: 0 });

  const contra = opts.condicion === "CREDITO" ? opts.cuentaProveedores : (opts.cuentaTipo ?? "").trim();
  if (!contra) avisos.push("El tipo de comprobante no tiene cuenta: cargala en Tipos de comprobante.");
  let haberPrincipal = total;
  for (const [monto, cuenta, nombre] of [
    [opts.retencionIva, opts.cuentaRetIva, "retención de IVA"],
    [opts.retencionRenta, opts.cuentaRetRenta, "retención de renta"],
  ] as const) {
    if (!(monto > 0)) continue;
    if (!cuenta) {
      avisos.push(`Falta configurar la cuenta de ${nombre}.`);
      continue;
    }
    out.push({ cuenta, detalle: opts.detalle, debe: 0, haber: r(monto) });
    haberPrincipal -= monto;
  }
  out.push({ cuenta: contra || "(sin cuenta)", detalle: opts.detalle, debe: 0, haber: r(haberPrincipal) });

  const lineas = opts.esNotaCredito ? out.map((l) => ({ ...l, debe: l.haber, haber: l.debe })) : out;
  return { lineas, avisos: [...new Set(avisos)] };
}

const TIPO_DOC_CDC: Record<string, string> = {
  "01": "Factura electrónica",
  "04": "Autofactura electrónica",
  "05": "Nota de crédito electrónica",
  "06": "Nota de débito electrónica",
  "07": "Nota de remisión electrónica",
};

/**
 * Lee un CDC de 44 dígitos: todo lo que viene adentro del código, sin
 * consultar a la SET (RUC del emisor, número, fecha, tipo de documento).
 */
export function leerCdc(cdcRaw: string):
  | { ok: true; cdc: string; ruc: string; dv: string; numero: string; fecha: string; tipoDocumento: string }
  | { ok: false; error: string } {
  const cdc = cdcRaw.replace(/\D/g, "");
  if (cdc.length !== 44) return { ok: false, error: `El CDC tiene 44 números; este tiene ${cdc.length}.` };
  if (digitoVerificadorModulo11CdcSet(cdc.slice(0, 43)) !== cdc.slice(43)) return { ok: false, error: "El CDC no es válido (el dígito verificador no coincide). Revisá que esté bien copiado." };
  const p = parseBase43DesdeCdc44(cdc)!;
  const f = p.fechaEmision8;
  return {
    ok: true,
    cdc,
    ruc: String(Number(p.rucEm8)),
    dv: p.dvEmi,
    numero: `${p.dEst3}-${p.dPunExp3}-${p.dNumDoc7}`,
    fecha: `${f.slice(0, 4)}-${f.slice(4, 6)}-${f.slice(6, 8)}`,
    tipoDocumento: TIPO_DOC_CDC[p.tipoDoc2] ?? `Documento tipo ${p.tipoDoc2}`,
  };
}
