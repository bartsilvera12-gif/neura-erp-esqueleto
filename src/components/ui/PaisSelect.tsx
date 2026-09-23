"use client";

import { useState } from "react";
import { PAISES, PAISES_FRECUENTES } from "@/lib/paises";

const OTRO = "__otro__";

/** Selector de país con los frecuentes arriba y opción "Otro…" para escribirlo a mano. */
export default function PaisSelect({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (pais: string) => void;
  className?: string;
}) {
  const actual = (value || "").trim().toUpperCase();
  const conocido = !actual || PAISES.includes(actual);
  const [manual, setManual] = useState(false);

  if (manual || !conocido) {
    return (
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder="Escribí el país"
          className={className}
          autoFocus
        />
        <button
          type="button"
          onClick={() => { setManual(false); onChange(""); }}
          className="shrink-0 rounded-lg border border-slate-200 px-2 text-xs text-slate-500 hover:bg-slate-50"
        >
          Lista
        </button>
      </div>
    );
  }

  return (
    <select
      value={actual}
      onChange={(e) => {
        if (e.target.value === OTRO) { setManual(true); onChange(""); return; }
        onChange(e.target.value);
      }}
      className={className}
    >
      <option value="">Elegí un país…</option>
      <optgroup label="Frecuentes">
        {PAISES_FRECUENTES.map((p) => <option key={`f-${p}`} value={p}>{p}</option>)}
      </optgroup>
      <optgroup label="Todos">
        {PAISES.map((p) => <option key={p} value={p}>{p}</option>)}
      </optgroup>
      <option value={OTRO}>Otro…</option>
    </select>
  );
}
