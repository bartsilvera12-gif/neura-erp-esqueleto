import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function ContabilidadPlaceholder({
  titulo,
  descripcion,
}: {
  titulo: string;
  descripcion: string;
}) {
  return (
    <div className="space-y-6">
      <Link
        href="/contabilidad"
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Contabilidad
      </Link>

      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Contabilidad</p>
        <h1 className="text-2xl font-semibold text-slate-900">{titulo}</h1>
        <p className="text-sm text-slate-600">{descripcion}</p>
      </header>

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <p className="text-sm text-slate-600">
          Sección en construcción. Se portará el módulo desde{" "}
          <span className="font-medium">neura-erp-sistemas-propio</span>.
        </p>
      </div>
    </div>
  );
}
