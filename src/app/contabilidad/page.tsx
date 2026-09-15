import Link from "next/link";
import { BookOpen, FileText, Landmark, ScrollText } from "lucide-react";

const secciones = [
  {
    href: "/contabilidad/plan-de-cuentas",
    icon: BookOpen,
    titulo: "Plan de cuentas",
    descripcion: "Estructura contable de la empresa.",
  },
  {
    href: "/contabilidad/libro-diario",
    icon: ScrollText,
    titulo: "Libro diario",
    descripcion: "Asientos ordenados por fecha.",
  },
  {
    href: "/contabilidad/libro-mayor",
    icon: FileText,
    titulo: "Libro mayor",
    descripcion: "Saldos y movimientos por cuenta.",
  },
  {
    href: "/contabilidad/conciliacion",
    icon: Landmark,
    titulo: "Conciliación bancaria",
    descripcion: "Cruce de extractos bancarios con el ERP.",
  },
];

export default function ContabilidadPage() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Zentra · Contabilidad</p>
        <h1 className="text-2xl font-semibold text-slate-900">Contabilidad</h1>
        <p className="text-sm text-slate-600">
          Módulo contable — plan de cuentas, libros contables y conciliación bancaria. En construcción; se
          portará desde <span className="font-medium">sistemas-propio</span>.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {secciones.map(({ href, icon: Icon, titulo, descripcion }) => (
          <Link
            key={href}
            href={href}
            className="group flex gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 group-hover:text-emerald-700">{titulo}</h2>
              <p className="mt-1 text-sm text-slate-600">{descripcion}</p>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
