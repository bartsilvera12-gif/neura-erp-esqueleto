const UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const ESPECIALES = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
const VEINTIS = ["VEINTE", "VEINTIUNO", "VEINTIDÓS", "VEINTITRÉS", "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"];
const DECENAS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function menorMil(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (r >= 10 && r < 20) partes.push(ESPECIALES[r - 10]);
  else if (r >= 20 && r < 30) partes.push(VEINTIS[r - 20]);
  else if (r >= 30) {
    const d = Math.floor(r / 10);
    const u = r % 10;
    partes.push(u ? `${DECENAS[d]} Y ${UNIDADES[u]}` : DECENAS[d]);
  } else if (r > 0) partes.push(UNIDADES[r]);
  return partes.join(" ");
}

// "UNO" se apocopa a "UN" delante de MIL / MILLÓN(ES).
function apocope(s: string): string {
  return s.replace(/VEINTIUNO$/, "VEINTIÚN").replace(/UNO$/, "UN");
}

function entero(n: number): string {
  if (n === 0) return "CERO";
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];
  if (millones) partes.push(millones === 1 ? "UN MILLÓN" : `${apocope(entero(millones))} MILLONES`);
  if (miles) partes.push(miles === 1 ? "MIL" : `${apocope(menorMil(miles))} MIL`);
  if (resto) partes.push(menorMil(resto));
  return partes.join(" ");
}

/** 22716 → "VEINTIDÓS MIL SETECIENTOS DIECISÉIS"; con centavos agrega "CON 50/100". */
export function numeroALetras(monto: number): string {
  const abs = Math.abs(Math.round((Number(monto) || 0) * 100) / 100);
  const ent = Math.floor(abs);
  const cent = Math.round((abs - ent) * 100);
  const txt = entero(ent);
  return cent ? `${txt} CON ${String(cent).padStart(2, "0")}/100` : txt;
}
