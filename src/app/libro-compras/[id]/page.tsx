"use client";

import { Suspense, use } from "react";
import FormCompra from "../_components/FormCompra";

export default function ComprobantePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
      <FormCompra id={id} />
    </Suspense>
  );
}
