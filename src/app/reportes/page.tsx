import Link from "next/link";
import {
  BookOpenCheck,
  ClipboardList,
  ReceiptText,
  Repeat,
  Wallet,
} from "lucide-react";

/**
 * Índice del módulo Reportes.
 *
 * Solo lista los reportes que son COMPATIBLES con el modelo de datos de esta
 * instancia. Del módulo original se dejaron fuera:
 *   · Libro Diario y Libro Mayor  — requieren el subsistema contable
 *     (`cuentas_contables`, asientos), que no existe en este schema.
 *   · Campañas Meta               — depende del stack omnicanal, fuera del
 *     alcance funcional de este ERP.
 *   · Conciliación y Ventas       — en el origen son pantallas placeholder,
 *     sin implementación.
 */

type Reporte = {
  href: string;
  titulo: string;
  descripcion: string;
  familia: string;
  icon: React.ComponentType<{ className?: string }>;
};

const REPORTES: Reporte[] = [
  {
    href: "/reportes/estado-cuenta",
    titulo: "Estado de cuenta",
    descripcion:
      "Ingresos, egresos y saldo del período: facturas, cobros, compras y gastos en una sola vista.",
    familia: "Financiero",
    icon: Wallet,
  },
  {
    href: "/reportes/cuentas-por-pagar",
    titulo: "Cuentas por pagar",
    descripcion:
      "Deuda con proveedores por compras a crédito, con vencimientos, vencidas y por vencer.",
    familia: "Compras",
    icon: ClipboardList,
  },
  {
    href: "/reportes/libro-compras",
    titulo: "Libro de compras",
    descripcion:
      "Comprobantes de compra con desglose de IVA (exento, 5% y 10%) y totales del período.",
    familia: "Compras",
    icon: BookOpenCheck,
  },
  {
    href: "/reportes/libro-ventas",
    titulo: "Libro de ventas",
    descripcion:
      "Facturas y notas de crédito emitidas, con desglose fiscal y datos del receptor.",
    familia: "Comercial",
    icon: ReceiptText,
  },
  {
    href: "/reportes/suscripciones",
    titulo: "Suscripciones",
    descripcion:
      "Grilla mensual de suscripciones por cliente: facturado, cobrado y pendiente.",
    familia: "Comercial",
    icon: Repeat,
  },
];

export default function ReportesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Reportes</h1>
        <p className="mt-1 text-sm text-gray-500">
          Reportería operativa y fiscal. Todos los reportes son de solo lectura y
          respetan el período que elijas en cada pantalla.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTES.map((r) => {
          const Icon = r.icon;
          return (
            <Link
              key={r.href}
              href={r.href}
              className="group flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                  {r.familia}
                </span>
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900 group-hover:text-blue-700">
                  {r.titulo}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-gray-500">{r.descripcion}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
