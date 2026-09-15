import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function FondosPorProyectoPage() {
  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/proyectos"
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Proyectos
      </Link>

      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Proyectos</p>
        <h1 className="text-2xl font-semibold text-slate-900">Fondos por proyecto</h1>
        <p className="text-sm text-slate-600">
          Presupuesto asignado, gastos imputados y saldo disponible por proyecto. Se utiliza cuando un gasto
          supera el monto de caja chica y debe manejarse como fondo del proyecto.
        </p>
      </header>

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <p className="text-sm text-slate-600">
          Sección en construcción. Falta vincular los <span className="font-medium">gastos</span> a un proyecto
          y mostrar el saldo por proyecto.
        </p>
      </div>
    </div>
  );
}
