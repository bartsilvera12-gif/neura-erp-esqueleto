"use client";

import { use, useEffect, useState } from "react";
import { fetchNR, type NotaRemision } from "@/lib/multideposito/client";
import { EMPRESA_DOC } from "@/lib/documentos/membrete";

/** 2026-08-14 (o fecha-hora ISO) → 14/08/2026, sin corrimiento de zona horaria. */
function fmtFecha(iso?: string | null) {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
const cant = (n: number) => Number(n).toLocaleString("es-PY");
/** Filas mínimas de la grilla, para que el cuadro tenga alto de talonario. */
const FILAS_MIN = 14;

/** Nota de remisión imprimible, con el formato del talonario de Living Room. */
export default function DocumentoNRPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [nr, setNr] = useState<NotaRemision | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setCargando(true);
      const r = await fetchNR(id);
      if (!r.ok) {
        setError(r.error);
        setCargando(false);
        return;
      }
      setNr(r.data.nota_remision);
      setCargando(false);
    })();
  }, [id]);

  if (cargando) return <div className="p-8 text-sm text-slate-500">Cargando…</div>;
  if (error) return <div className="p-8 text-sm text-rose-700">{error}</div>;
  if (!nr) return <div className="p-8 text-sm text-slate-500">NR no encontrada.</div>;

  const aCliente = nr.destino_tipo === "cliente";
  const items = nr.items ?? [];
  const destinatario = aCliente ? nr.destino_nombre ?? "" : EMPRESA_DOC.nombre;
  const llegada = aCliente ? [nr.destino_direccion, nr.destino_ciudad].filter(Boolean).join(" - ") : nr.destino?.nombre ?? "";
  const vacias = Math.max(1, FILAS_MIN - items.length);
  const destino = aCliente ? nr.destino_ciudad ?? "" : nr.destino?.nombre ?? "";

  return (
    <>
      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
        }
        .nr-doc { font-family: Arial, Helvetica, sans-serif; color: #000; font-size: 12px; }
        .nr-doc .box { border: 1px solid #000; }
        .nr-doc .fila { display: flex; gap: 8px; padding: 4px 0; }
        .nr-doc .fila .l { flex: 0 0 160px; }
        .nr-doc table { width: 100%; border-collapse: collapse; }
        .nr-doc th { border: 1px solid #000; font-weight: 400; font-size: 11px; padding: 3px 6px; text-transform: uppercase; }
        .nr-doc td { border-left: 1px solid #000; border-right: 1px solid #000; padding: 2px 8px; vertical-align: top; }
        .nr-doc tr.fin td { border-bottom: 1px solid #000; }
      `}</style>

      <div className="nr-doc mx-auto bg-white p-6 print:p-0" style={{ maxWidth: "210mm" }}>
        <div className="no-print mb-4 flex items-center justify-between">
          <a href="/notas-remision" className="text-sm text-slate-600 hover:underline">← Volver al historial</a>
          <button onClick={() => window.print()} className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900">
            Imprimir
          </button>
        </div>

        {/* Cabecera: logo + actividad | RUC, título, número y timbrado */}
        <div className="flex gap-[3px]">
          <div className="box flex flex-1 items-center gap-4 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={EMPRESA_DOC.logoUrl} alt={EMPRESA_DOC.nombre} style={{ maxWidth: "150px", maxHeight: "70px", objectFit: "contain" }} />
            <div className="flex-1 text-center text-[10px] leading-snug">
              {EMPRESA_DOC.actividad.map((a) => <div key={a}>{a.toUpperCase()}</div>)}
              <div className="mt-2">{EMPRESA_DOC.direccion[0]}</div>
              {EMPRESA_DOC.telefono && <div>Cel. {EMPRESA_DOC.telefono}</div>}
              <div>{EMPRESA_DOC.direccion[1]}</div>
            </div>
          </div>
          <div className="box flex flex-col justify-center gap-3 p-3 text-center" style={{ flex: "0 0 30%" }}>
            <div>RUC.: {EMPRESA_DOC.ruc}</div>
            <div className="text-[13px]">NOTA DE REMISION</div>
            <div>{nr.numero}</div>
            {nr.timbrado && <div className="text-[10px]">Timbrado Nº {nr.timbrado}</div>}
          </div>
        </div>

        <div className="box mt-[3px] px-3 py-2">
          <div className="fila"><span className="l">Nombre / Razon Social:</span><span>{destinatario.toUpperCase()}</span></div>
          <div className="fila"><span className="l">Dir. Punto de Partida:</span><span>{nr.origen?.nombre ?? ""}</span></div>
          <div className="fila"><span className="l">Dir. Punto de Llegada:</span><span>{llegada}</span></div>
          <div className="fila"><span className="l">R.U.C. / C.I. Destinatario:</span><span>{aCliente ? nr.cliente_documento ?? "" : EMPRESA_DOC.ruc}</span></div>
        </div>

        <div className="box mt-[3px] grid grid-cols-2 gap-x-8 px-3 py-2">
          <div className="fila"><span className="l">Fecha Inicio Traslado:</span><span>{fmtFecha(nr.fecha_inicio_traslado)}</span></div>
          <div className="fila"><span className="l">Fecha Termino Traslado:</span><span>{fmtFecha(nr.fecha_fin_traslado)}</span></div>
          <div className="fila"><span className="l">Marca de Vehiculo:</span><span>{nr.marca_vehiculo ?? ""}</span></div>
          <div className="fila"><span className="l">Nro. de Chapa:</span><span>{nr.chapa ?? ""}</span></div>
          <div className="fila"><span className="l">Nombre Conductor:</span><span>{nr.conductor ?? ""}</span></div>
          <div className="fila"><span className="l">C.I. Conductor:</span><span>{nr.ci_conductor ?? ""}</span></div>
          <div className="fila"><span className="l">Almacén de Salida:</span><span>{(nr.origen?.nombre ?? "").toUpperCase()}</span></div>
          <div className="fila"><span className="l">Destino:</span><span>{destino}</span></div>
          {nr.documento_origen && <div className="fila col-span-2"><span className="l">Comprobante de venta:</span><span>{nr.documento_origen}</span></div>}
        </div>

        <table className="mt-[3px]">
          <thead>
            <tr>
              <th style={{ width: "20%" }}>Cantidad</th>
              <th style={{ width: "15%" }}>Unidad de medida</th>
              <th>Descripcion de articulo</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.producto_id}>
                <td className="text-center">{cant(it.cantidad)}</td>
                <td className="text-center">{(it.unidad ?? "").toUpperCase()}</td>
                <td>{[it.producto_sku, it.producto_nombre ?? it.producto_id].filter(Boolean).join(" ")}</td>
              </tr>
            ))}
            {Array.from({ length: vacias }, (_, i) => (
              <tr key={`v${i}`} className={i === vacias - 1 ? "fin" : ""}>
                <td>&nbsp;</td><td /><td />
              </tr>
            ))}
          </tbody>
        </table>

        {nr.observaciones?.trim() && <p className="mt-2">Observaciones: {nr.observaciones}</p>}
        {nr.estado === "rechazada" && <p className="mt-2 font-bold">RECHAZADA. Motivo: {nr.motivo_rechazo}</p>}

        <div className="mt-6 grid grid-cols-2 gap-x-10 gap-y-4 px-1">
          {["Entregado por:", "Recibido por:", "Aclaración de firma:", "Aclaración de firma:"].map((t, i) => (
            <div key={i} className="flex items-end gap-2">
              <span>{t}</span>
              <span className="flex-1 border-b border-dashed border-black" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
