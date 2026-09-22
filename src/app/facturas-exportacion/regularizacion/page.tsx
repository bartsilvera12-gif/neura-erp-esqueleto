import { Suspense } from "react";
import FormFactura from "../_components/FormFactura";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense>
      <FormFactura regularizacion />
    </Suspense>
  );
}
