"use client";

import { use } from "react";
import FormCompra from "../_components/FormCompra";

export default function ComprobantePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <FormCompra id={id} />;
}
