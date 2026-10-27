/**
 * Sub-secciones (pantallas) de cada módulo que pueden darse/quitarse por usuario
 * desde el panel de administrador (tabla usuario_secciones).
 *
 * `seccion` = href (coincide con el href del ítem en el menú). Solo se listan los
 * módulos que tienen varias pantallas y donde tiene sentido un control fino; los
 * módulos que no están acá se otorgan completos (como hasta ahora).
 *
 * Semántica: si un usuario tiene filas en usuario_secciones para un módulo, ve
 * SOLO esas sub-secciones; si no tiene filas, ve TODAS (compatibilidad).
 */
export type SeccionModulo = { href: string; label: string };

export const SECCIONES_POR_MODULO: Record<string, SeccionModulo[]> = {
  compras: [
    { href: "/compras", label: "Compras / Productos" },
    { href: "/libro-compras", label: "Libro de compras" },
    { href: "/libro-compras/por-pagar", label: "Cuentas por pagar" },
    { href: "/compras/ordenes", label: "Órdenes de compra" },
    { href: "/proveedores", label: "Proveedores" },
  ],
  inventario: [
    { href: "/inventario", label: "Productos" },
    { href: "/inventario/movimientos", label: "Movimientos" },
    { href: "/inventario/transferencias", label: "Transferencias entre almacenes" },
    { href: "/inventario/categorias", label: "Categorías" },
    { href: "/inventario/ubicaciones", label: "Almacenes" },
  ],
  facturas_exportacion: [
    { href: "/facturas-exportacion", label: "Facturas" },
    { href: "/facturas-exportacion/nueva", label: "Nueva factura" },
    { href: "/facturas-exportacion/regularizacion", label: "Regularización" },
    { href: "/facturas-exportacion/configuracion", label: "Timbrado" },
    { href: "/facturas-exportacion/historial", label: "Historial" },
  ],
  reportes: [
    { href: "/reportes/estado-cuenta", label: "Estado de cuenta" },
    { href: "/reportes/cuentas-por-cobrar", label: "Cuentas por cobrar" },
    { href: "/reportes/cuentas-por-pagar", label: "Cuentas por pagar" },
    { href: "/reportes/libro-compras", label: "Libro de compras (mercadería)" },
    { href: "/reportes/libro-ventas", label: "Libro de ventas" },
    { href: "/reportes/suscripciones", label: "Suscripciones" },
  ],
  contabilidad: [
    { href: "/contabilidad/plan-de-cuentas", label: "Plan de cuentas" },
    { href: "/contabilidad/libro-diario", label: "Libro diario" },
    { href: "/contabilidad/libro-mayor", label: "Libro mayor" },
    { href: "/contabilidad/libro-compras-general", label: "Libro de compras general" },
    { href: "/contabilidad/configuracion", label: "Configuración contable" },
  ],
  rrhh: [
    { href: "/rrhh/empleados", label: "Empleados" },
    { href: "/rrhh/control-horario", label: "Control horario" },
    { href: "/rrhh/vacaciones", label: "Vacaciones" },
    { href: "/rrhh/feriados-ausencias", label: "Feriados y ausencias" },
    { href: "/rrhh/nomina", label: "Nómina" },
  ],
  produccion: [
    { href: "/produccion/panel", label: "Panel" },
    { href: "/produccion/proyectos", label: "Proyectos" },
    { href: "/produccion/inventario", label: "Inventario" },
    { href: "/produccion/tableros", label: "Catálogo de tableros" },
    { href: "/produccion/herrajes", label: "Catálogo de herrajes" },
    { href: "/produccion/contratistas", label: "Contratistas" },
    { href: "/produccion/gastos", label: "Gastos" },
    { href: "/produccion/libro-compras", label: "Libro de compras producción" },
  ],
};

/** ¿El módulo (por slug) admite control por sub-sección? */
export function moduloTieneSecciones(slug: string): boolean {
  return (SECCIONES_POR_MODULO[slug]?.length ?? 0) > 0;
}
