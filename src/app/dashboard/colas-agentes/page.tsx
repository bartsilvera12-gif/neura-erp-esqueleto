import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** El módulo operativo pasó a Monitoreo (`/dashboard/monitoreo`). */
export default function ColasAgentesRedirectPage() {
  redirect("/dashboard/monitoreo");
}
