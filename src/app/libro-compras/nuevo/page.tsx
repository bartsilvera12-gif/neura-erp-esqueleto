import { Suspense } from "react";
import FormCompra from "../_components/FormCompra";

export default function NuevoComprobantePage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
      <FormCompra />
    </Suspense>
  );
}
