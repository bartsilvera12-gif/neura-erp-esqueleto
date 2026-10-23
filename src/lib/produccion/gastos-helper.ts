export const CATEGORIAS_GASTO = ["material", "transporte", "consumible", "instalacion", "reparacion", "alquiler", "contratista", "otro"] as const;
export type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number];
export const CATEGORIA_GASTO_LABEL: Record<string, string> = {
  material: "Material", transporte: "Transporte", consumible: "Consumibles", instalacion: "Instalación",
  reparacion: "Reparación", alquiler: "Alquiler de herramientas", contratista: "Contratista", otro: "Otro",
};
