import { resolveDataSchemaForCurrentUserServer } from "@/lib/supabase/empresa-data-server";
import { SUPABASE_APP_SCHEMA } from "@/lib/supabase/schema";
import ProyectosKanbanClient from "./ProyectosKanbanClient";

export const dynamic = "force-dynamic";

export default async function ProyectosPage() {
  let dataSchema = SUPABASE_APP_SCHEMA;
  try {
    dataSchema = await resolveDataSchemaForCurrentUserServer();
  } catch (e) {
    console.error("[dashboard/proyectos] resolveDataSchemaForCurrentUserServer", e);
  }
  return <ProyectosKanbanClient dataSchema={dataSchema} />;
}
