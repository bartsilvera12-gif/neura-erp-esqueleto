"use client";

import LibroComprasVista from "@/app/libro-compras/_components/LibroComprasVista";

/**
 * Libro de compras general (Contabilidad): consolida las tres secciones
 * (Showroom, Producción y Comercio Exterior) en una sola vista de solo lectura.
 */
export default function LibroComprasGeneralPage() {
  return (
    <LibroComprasVista
      seccion={null}
      titulo="Libro de compras general"
      subtitulo="Todas las facturas de compras de la empresa: showroom, producción y comercio exterior juntas."
    />
  );
}
