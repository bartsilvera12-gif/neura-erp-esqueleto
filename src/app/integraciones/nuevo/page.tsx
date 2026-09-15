import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import FormularioEditor from "@/components/integraciones/FormularioEditor";

export default function NuevoFormularioApiPage() {
  return (
    <div className="space-y-6">
      <Link
        href="/integraciones"
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Integraciones
      </Link>
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Integraciones</p>
        <h1 className="text-2xl font-semibold text-slate-900">Nuevo formulario</h1>
        <p className="text-sm text-slate-600">Configurá la conexión al endpoint y los campos que se enviarán.</p>
      </header>
      <FormularioEditor />
    </div>
  );
}
