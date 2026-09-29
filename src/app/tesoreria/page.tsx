"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeftRight, Landmark, Plus, Wallet } from "lucide-react";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import { Aviso, btnPrimario, btnSecundario } from "@/components/comex/ui";
import { ModalBanco, ModalCaja, ModalTransferencia, plata, useTesoreria } from "./_components/comun";

/** Cuentas bancarias y cajas chicas con su saldo. */
export default function TesoreriaPage() {
  const { isAdmin } = useIsAdmin();
  const { datos, error, cargar } = useTesoreria();
  const [modal, setModal] = useState<"banco" | "caja" | "transferir" | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Finanzas</p>
          <h1 className="text-2xl font-semibold text-slate-900">Bancos y cajas chicas</h1>
          <p className="text-sm text-slate-600">Cuánta plata hay en cada cuenta. Los pagos de compras y las reposiciones mueven estos saldos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/libro-compras/por-pagar" className={`${btnSecundario} px-3 py-2 text-sm`}>
            Cuentas por pagar
          </Link>
          <button onClick={() => setModal("transferir")} className={`${btnSecundario} px-3 py-2 text-sm`}>
            <ArrowLeftRight className="h-4 w-4" /> Transferir / reponer
          </button>
        </div>
      </header>
      {error && <Aviso>{error}</Aviso>}
      {aviso && <Aviso tipo="info">{aviso}</Aviso>}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Landmark className="h-4 w-4" /> Cuentas bancarias
          </h2>
          {isAdmin && (
            <button onClick={() => setModal("banco")} className={btnPrimario}>
              <Plus className="h-3.5 w-3.5" /> Nueva cuenta
            </button>
          )}
        </div>
        {datos && datos.bancos.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Todavía no hay cuentas bancarias cargadas.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {datos?.bancos.map((b) => (
            <Link key={b.id} href={`/tesoreria/banco/${b.id}`} className={`rounded-xl border bg-white p-4 shadow-sm hover:border-emerald-300 ${b.activo ? "border-slate-200" : "border-slate-100 opacity-60"}`}>
              <p className="font-semibold text-slate-900">{b.nombre}</p>
              <p className="font-mono text-xs text-slate-500">{b.numero_cuenta ?? "Sin número"} · {b.moneda}</p>
              <p className={`mt-3 text-xl font-semibold ${b.saldo < 0 ? "text-rose-600" : "text-slate-900"}`}>{plata(b.saldo, b.moneda)}</p>
              {!b.activo && <p className="text-xs text-slate-400">Inactiva</p>}
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Wallet className="h-4 w-4" /> Cajas chicas
          </h2>
          {isAdmin && (
            <button onClick={() => setModal("caja")} className={btnPrimario}>
              <Plus className="h-3.5 w-3.5" /> Nueva caja chica
            </button>
          )}
        </div>
        {datos && datos.cajas.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Todavía no hay cajas chicas.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {datos?.cajas.map((c) => {
            const bajo = c.fondo_fijo ? c.saldo < Number(c.fondo_fijo) * 0.2 : false;
            return (
              <Link key={c.id} href={`/tesoreria/caja/${c.id}`} className={`rounded-xl border bg-white p-4 shadow-sm hover:border-emerald-300 ${c.activa ? "border-slate-200" : "border-slate-100 opacity-60"}`}>
                <p className="font-semibold text-slate-900">{c.nombre}</p>
                <p className="text-xs text-slate-500">
                  {c.responsable_nombre ?? "Sin responsable"}
                  {c.fondo_fijo ? ` · fondo ${plata(Number(c.fondo_fijo), c.moneda)}` : ""}
                </p>
                <p className={`mt-3 text-xl font-semibold ${bajo ? "text-amber-600" : "text-slate-900"}`}>{plata(c.saldo, c.moneda)}</p>
                {bajo && <p className="text-xs text-amber-700">Queda poco: conviene reponerla.</p>}
              </Link>
            );
          })}
        </div>
      </section>

      {modal === "banco" && <ModalBanco banco={null} onClose={() => setModal(null)} onDone={() => { setModal(null); void cargar(); }} />}
      {modal === "caja" && <ModalCaja caja={null} onClose={() => setModal(null)} onDone={() => { setModal(null); void cargar(); }} />}
      {modal === "transferir" && datos && (
        <ModalTransferencia
          bancos={datos.bancos}
          cajas={datos.cajas}
          onClose={() => setModal(null)}
          onDone={(a) => {
            setModal(null);
            setAviso(a ?? "Transferencia registrada.");
            void cargar();
          }}
        />
      )}
    </div>
  );
}
