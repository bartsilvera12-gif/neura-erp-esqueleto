import { cabeceraDoc, esc, fechaDoc, paginaDoc } from "@/lib/documentos/formato";

export type MovReporte = {
  tipo: string;
  monto: number;
  fecha: string;
  referencia: string | null;
  observacion: string | null;
};

const money = (v: number, moneda: string) =>
  `${moneda === "USD" ? "USD" : "Gs."} ${(Math.round(Number(v) || 0)).toLocaleString("es-PY")}`;

/**
 * Reporte histórico imprimible de una cuenta (banco o caja chica): lista los
 * movimientos del período y suma el total de ingresos vs egresos y el neto.
 * `signo(tipo, monto)` devuelve el monto con signo (+ ingreso / − egreso).
 */
export function reporteCuentaHTML(opts: {
  titulo: string;
  cuentaNombre: string;
  moneda: string;
  saldoInicial: number;
  fechaSaldoInicial?: string | null;
  movimientos: MovReporte[]; // del más viejo al más nuevo
  desde?: string | null;
  hasta?: string | null;
  signo: (tipo: string, monto: number) => number;
  auto: boolean;
}): string {
  const { moneda, signo } = opts;
  const ordenados = [...opts.movimientos].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

  // Saldo de apertura = saldo inicial + movimientos anteriores a "desde".
  let apertura = Number(opts.saldoInicial) || 0;
  const enRango: MovReporte[] = [];
  for (const m of ordenados) {
    const antes = opts.desde && m.fecha < opts.desde;
    const despues = opts.hasta && m.fecha > opts.hasta + "￿";
    if (antes) apertura += signo(m.tipo, m.monto);
    else if (!despues) enRango.push(m);
  }

  let saldo = apertura;
  let totIngreso = 0;
  let totEgreso = 0;
  const filas = enRango.map((m) => {
    const s = signo(m.tipo, m.monto);
    const ingreso = s > 0 ? s : 0;
    const egreso = s < 0 ? -s : 0;
    totIngreso += ingreso;
    totEgreso += egreso;
    saldo += s;
    return `<tr>
      <td>${fechaDoc(m.fecha)}</td>
      <td>${esc(m.observacion ?? m.tipo)}</td>
      <td>${esc(m.referencia ?? "")}</td>
      <td class="r">${ingreso ? money(ingreso, moneda) : ""}</td>
      <td class="r">${egreso ? money(egreso, moneda) : ""}</td>
      <td class="r">${money(saldo, moneda)}</td>
    </tr>`;
  }).join("");

  const neto = totIngreso - totEgreso;
  const periodo = opts.desde || opts.hasta
    ? `Período: ${opts.desde ? fechaDoc(opts.desde) : "inicio"} a ${opts.hasta ? fechaDoc(opts.hasta) : "hoy"}`
    : "Período: histórico completo";

  const cuerpo = `
  ${cabeceraDoc({ titulo: opts.titulo, numero: opts.cuentaNombre })}
  <div class="box pad dos">
    <div>
      <div class="fila"><span class="l">CUENTA:</span><span>${esc(opts.cuentaNombre)}</span></div>
      <div class="fila"><span class="l">MONEDA:</span><span>${moneda === "USD" ? "Dólares" : "Guaraníes"}</span></div>
    </div>
    <div>
      <div class="fila"><span class="l">${esc(periodo)}</span><span></span></div>
      <div class="fila"><span class="l">SALDO INICIAL:</span><span>${money(apertura, moneda)}${opts.fechaSaldoInicial ? ` (${fechaDoc(opts.fechaSaldoInicial)})` : ""}</span></div>
    </div>
  </div>
  <table class="g" style="margin-bottom:3px">
    <thead><tr>
      <th style="width:70px">Fecha</th><th>Concepto</th><th style="width:90px">Ref.</th>
      <th class="r" style="width:110px">Ingreso</th><th class="r" style="width:110px">Egreso</th><th class="r" style="width:120px">Saldo</th>
    </tr></thead>
    <tbody>
      ${filas || `<tr><td colspan="6" style="text-align:center;color:#888">Sin movimientos en el período.</td></tr>`}
      <tr class="fin"><td class="r" colspan="3" style="font-weight:bold">TOTALES</td>
        <td class="r" style="font-weight:bold">${money(totIngreso, moneda)}</td>
        <td class="r" style="font-weight:bold">${money(totEgreso, moneda)}</td>
        <td class="r" style="font-weight:bold">${money(saldo, moneda)}</td></tr>
    </tbody>
  </table>
  <div class="box pad dos" style="margin-top:6px">
    <div>
      <div class="fila"><span class="l">TOTAL INGRESOS:</span><span>${money(totIngreso, moneda)}</span></div>
      <div class="fila"><span class="l">TOTAL EGRESOS:</span><span>${money(totEgreso, moneda)}</span></div>
    </div>
    <div>
      <div class="fila"><span class="l">NETO (ingresos − egresos):</span><span>${money(neto, moneda)}</span></div>
      <div class="fila"><span class="l">SALDO FINAL:</span><span>${money(saldo, moneda)}</span></div>
    </div>
  </div>`;
  return paginaDoc(opts.titulo, cuerpo, opts.auto);
}
