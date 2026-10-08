"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Select } from "@/components/ui/Select";

/**
 * Selector tipo dropdown con opcion "Sin asignar".
 * - `emptyShort` se muestra DENTRO del select cuando no hay opciones (texto corto
 *   para que no se corte). Para textos largos usa `helpText` debajo del campo.
 * - `buscable` lo convierte en un campo donde se escribe para filtrar, que es lo
 *   que hace falta cuando la lista tiene cientos de productos.
 */

interface Option { id: string; label: string; sublabel?: string }

interface Props {
  value: string | null;
  onChange: (v: string | null) => void;
  options: Option[];
  placeholder?: string;
  /** Texto corto dentro del select cuando options.length === 0. */
  emptyShort?: string;
  /** Compat: si se pasa, se usa como emptyShort. */
  emptyText?: string;
  className?: string;
  /** Campo de texto con filtrado, en vez de la lista desplegable del navegador. */
  buscable?: boolean;
}

const BASE =
  "block w-full min-w-0 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#0EA5E9] bg-white text-sm disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed";

export default function SelectFromList({
  value,
  onChange,
  options,
  placeholder = "Sin asignar",
  emptyShort,
  emptyText,
  className = "",
  buscable = false,
}: Props) {
  const isEmpty = options.length === 0;
  const empty = emptyShort ?? emptyText ?? "Sin opciones";

  if (!buscable) {
    return (
      <div className="min-w-0">
        <Select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={isEmpty}
          className={`${BASE} truncate ${className}`}
        >
          <option value="">{isEmpty ? empty : placeholder}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}{o.sublabel ? ` — ${o.sublabel}` : ""}
            </option>
          ))}
        </Select>
      </div>
    );
  }

  return <Buscador value={value} onChange={onChange} options={options} placeholder={isEmpty ? empty : placeholder} disabled={isEmpty} className={className} />;
}

/** Campo de texto que filtra la lista mientras se escribe. */
function Buscador({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: Option[];
  placeholder: string;
  disabled: boolean;
  className: string;
}) {
  const elegido = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const caja = useRef<HTMLDivElement | null>(null);

  // Si el valor cambia desde afuera (por ejemplo, al limpiarse tras agregar).
  useEffect(() => {
    if (!abierto) setTexto(elegido?.label ?? "");
  }, [elegido, abierto]);

  // Un clic fuera cierra la lista sin elegir nada.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) {
        setAbierto(false);
        setTexto(elegido?.label ?? "");
      }
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto, elegido]);

  const filtrados = useMemo(() => {
    const t = texto.trim().toLowerCase();
    if (!t || t === elegido?.label.toLowerCase()) return options.slice(0, 50);
    return options.filter((o) => `${o.label} ${o.sublabel ?? ""}`.toLowerCase().includes(t)).slice(0, 50);
  }, [options, texto, elegido]);

  function elegir(o: Option) {
    onChange(o.id);
    setTexto(o.label);
    setAbierto(false);
  }

  return (
    <div className="relative min-w-0" ref={caja}>
      <input
        type="text"
        value={texto}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          setResaltado(0);
          if (value) onChange(null);
        }}
        onFocus={() => {
          setAbierto(true);
          setResaltado(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAbierto(true);
            setResaltado((r) => Math.min(r + 1, filtrados.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setResaltado((r) => Math.max(r - 1, 0));
          } else if (e.key === "Enter" && abierto && filtrados[resaltado]) {
            e.preventDefault();
            elegir(filtrados[resaltado]);
          } else if (e.key === "Escape") {
            setAbierto(false);
            setTexto(elegido?.label ?? "");
          }
        }}
        className={`${BASE} ${className}`}
      />
      {abierto && !disabled && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtrados.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">Sin resultados para “{texto.trim()}”.</p>
          ) : (
            filtrados.map((o, i) => (
              <button
                key={o.id}
                type="button"
                onMouseEnter={() => setResaltado(i)}
                onClick={() => elegir(o)}
                className={`block w-full px-3 py-2 text-left text-sm ${i === resaltado ? "bg-slate-100" : "hover:bg-slate-50"}`}
              >
                <span className="block truncate text-slate-800">{o.label}</span>
                {o.sublabel && <span className="block truncate font-mono text-[11px] text-slate-500">{o.sublabel}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
