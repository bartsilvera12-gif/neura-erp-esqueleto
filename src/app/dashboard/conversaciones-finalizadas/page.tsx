import { Suspense } from "react";
import { loadFinalizedFilterOptions } from "@/lib/chat/finalized-closures-actions";
import FinalizedClosuresClient from "./FinalizedClosuresClient";

// Depende de Supabase (envs runtime) — evita prerender estatico en build.
export const dynamic = "force-dynamic";

export default async function ConversacionesFinalizadasPage() {
  const filterOptions = await loadFinalizedFilterOptions();
  return (
    <Suspense fallback={<div className="p-8 text-slate-400 text-sm animate-pulse">Cargando finalizadas…</div>}>
      <FinalizedClosuresClient filterOptions={filterOptions} />
    </Suspense>
  );
}
