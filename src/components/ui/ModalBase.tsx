"use client";

import { X } from "lucide-react";

/**
 * Contenedor de modal del ERP: overlay, tarjeta, encabezado con título,
 * subtítulo y botón de cierre. El contenido lo pone cada modal.
 *
 * Vivía dentro de `CajaControlPanel`; se extrajo acá al aparecer el segundo y el
 * tercer modal con el mismo marco (alta rápida de categoría y de proveedor).
 *
 * Click en el overlay cierra; click adentro no propaga.
 */
export default function ModalBase({
  title,
  subtitle,
  onClose,
  children,
  maxWidthClass = "max-w-md",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Ancho máximo del modal (default max-w-md). El arqueo usa uno más ancho. */
  maxWidthClass?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full ${maxWidthClass} border-2 border-[#4FAEB2]/20 overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-[#4FAEB2]/5 to-transparent flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
