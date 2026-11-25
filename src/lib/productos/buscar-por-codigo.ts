/**
 * Busca un producto por código tolerando ceros de más o de menos:
 * "MN00009" y "MN000009" son el mismo código. Primero va el código exacto;
 * nunca se busca por nombre (hay productos distintos con el mismo nombre).
 */
export function claveCodigo(codigo: string): string {
  const s = codigo.trim().toUpperCase();
  const m = s.match(/^([A-Z]+)[-_ ]?0*(\d+)$/);
  return m ? `${m[1]}#${Number(m[2])}` : s;
}

export function armarBuscadorPorCodigo<T extends { sku: string | null }>(productos: T[]) {
  const exacto = new Map<string, T>();
  const flexible = new Map<string, T | null>();
  for (const p of productos) {
    if (!p.sku) continue;
    const sku = p.sku.trim().toUpperCase();
    if (!exacto.has(sku)) exacto.set(sku, p);
    const k = claveCodigo(sku);
    // Si dos productos comparten la clave, es ambiguo: no se adivina.
    flexible.set(k, flexible.has(k) ? null : p);
  }
  return (codigo: string | null | undefined): T | undefined => {
    const c = (codigo ?? "").trim().toUpperCase();
    if (!c) return undefined;
    return exacto.get(c) ?? flexible.get(claveCodigo(c)) ?? undefined;
  };
}
