"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import GastoForm from "@/components/gastos/GastoForm";
import { aSeccion, GASTOS_RUTA, SECCION_LABEL } from "@/lib/secciones";

function NuevoGastoInner() {
  const params = useSearchParams();
  const seccion = aSeccion(params.get("seccion"));
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href={GASTOS_RUTA[seccion]} className="hover:text-gray-700 transition-colors">
          Gastos
        </Link>
        <span>/</span>
        <span className="text-gray-700 font-medium">Nuevo gasto</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nuevo gasto</h1>
        <p className="text-sm text-gray-500 mt-1">Registrar un gasto operativo · {SECCION_LABEL[seccion]}</p>
      </div>

      <GastoForm seccion={seccion} />
    </div>
  );
}

export default function NuevoGastoPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
      <NuevoGastoInner />
    </Suspense>
  );
}
