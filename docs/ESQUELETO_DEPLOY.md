# Esqueleto ERP — Instancia dedicada monocliente

Guía de despliegue y provisión de la instancia **Esqueleto ERP**. Sin secretos.

- **Cliente:** Esqueleto ERP
- **Modo:** `single_client` (instancia dedicada: un repo + un deploy + un schema)
- **Schema Postgres:** `esqueletoerp`
- **Schema fuente clonado:** `instemaq` (solo estructura, sin datos)
- **empresa_id (UUID propio):** `3c14fe00-d466-4f24-a010-1bbd7e37ccd6`
- **URL:** `http://erpesqueleto.neura.com.py` (HTTP: el TLS lo termina Cloudflare)
- **Usuario administrador:** `admin@erpesqueleto.com`

## Módulos habilitados

Esta instancia expone **solo** estos módulos:

| Módulo | Slug | Rutas |
|---|---|---|
| Dashboard | `dashboard` | `/` |
| Caja | `ventas` | `/ventas` (turno de caja + órdenes), `/ventas/nueva` |
| Inventario (completo) | `inventario` | `/inventario`, `/inventario/movimientos`, `/inventario/categorias`, `/inventario/ubicaciones` |
| Compras (completo) | `compras` | `/compras`, `/compras/ordenes`, `/proveedores` |
| Presupuestos | `presupuestos` | `/presupuestos` |
| Reportes | `reportes` | `/reportes` + estado de cuenta, cuentas por pagar, libro de compras, libro de ventas, suscripciones |

**Caja** es el módulo **Ventas** de Instemaq (punto de venta), con el **turno de
caja** portado de `stzautopartes-erp` encima: apertura con monto o arqueo por
denominaciones, ingresos/egresos/retiros/ajustes manuales durante el turno, y
cierre con conteo del efectivo y cálculo de diferencia. Mismo slug `ventas` y
misma ruta `/ventas`; la pantalla ahora se titula “Caja”.

Con el turno activo, **cada venta se imputa a la caja abierta** (`ventas.caja_id`).
Si no hay ninguna caja abierta la venta se rechaza con un mensaje claro: una venta
sin turno no entraría en el arqueo de cierre y aparecería como faltante de
efectivo. Para volver al comportamiento anterior (vender sin abrir caja), sacar el
`throw` de `cajasAbiertas.length === 0` en
`src/lib/ventas/server/create-venta-pg.ts` y dejar `caja_id` en `null`.

**Reportes** se portó desde `neura-erp-sistemas-propio`, quedándose únicamente con
las vistas compatibles con este schema. Quedaron fuera, y por qué:

| Vista descartada | Motivo |
|---|---|
| Libro Diario · Libro Mayor | Requieren el subsistema contable (`cuentas_contables`, asientos), que no existe en este schema. |
| Campañas Meta | Depende del stack omnicanal / Meta Ads, fuera del alcance de este ERP. |
| Conciliación · Ventas | En el repo de origen son pantallas placeholder, sin implementación. |

Dos de las vistas portadas se **adaptaron** al modelo de datos de acá, donde
`compras` es una tabla plana (una fila por línea, agrupada por `numero_control`)
en vez de cabecera + `compra_items`:

- **Cuentas por pagar**: agrupa por `numero_control` y suma totales. No hay pago en
  cuotas, así que la cuota estimada coincide con el total del comprobante.
- **Libro de compras**: agrupa por `numero_control` y suma el IVA de las líneas.
  La mitad “Gastos y Servicios” del reporte original queda fuera porque la tabla
  `gastos` de este schema no tiene datos fiscales (ni proveedor, ni timbrado, ni ítems).

El código del resto de los módulos sigue en el repo pero no se lista en el
Sidebar y `empresa_modulos` no los habilita. Con
`NEURA_INSTANCE_MODE=single_client` la app aplica **allowlist estricta**
(`strictAllowlist` en `/api/empresas/module-access`), así que sus rutas quedan
bloqueadas por `AuthGuard` aunque se entre por URL directa.

Para habilitar uno más adelante bastan dos cosas:

1. Agregar su entrada en `MENU_STRUCTURE` (`src/components/layout/Sidebar.tsx`).
2. Agregar su slug al array `v_slugs` de
   `supabase/esqueletoerp/provision/0004_empresa_modulos_seleccion.sql` y correrlo.

## 1. Variables de entorno (Coolify) — completar los secretos en el panel

```env
NEXT_PUBLIC_SUPABASE_URL=https://api.neura.com.py
NEXT_PUBLIC_SUPABASE_ANON_KEY=        # secreto — panel Coolify
SUPABASE_SERVICE_ROLE_KEY=            # secreto — panel Coolify
SUPABASE_DB_URL=                      # secreto — panel Coolify (postgresql://...)
NEURA_CLIENT_SCHEMA=esqueletoerp
NEXT_PUBLIC_NEURA_CLIENT_SCHEMA=esqueletoerp
NEURA_INSTANCE_MODE=single_client
NEURA_CLIENT_NAME=Esqueleto
NIXPACKS_NODE_VERSION=22
NODE_ENV=production
# SMTP (opcional, para invitaciones / reseteo de contraseña)
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

`NEXT_PUBLIC_NEURA_CLIENT_SCHEMA` es obligatoria: se inyecta en el bundle del
navegador durante el build y evita que el cliente use el fallback de schema.
Debe estar presente en el entorno de **build** de Coolify, no solo en runtime.

## 2. Provisión de base de datos

Ejecutar en orden, en el SQL Editor de Supabase. Todos los scripts son
idempotentes y **solo escriben dentro de `esqueletoerp`** (nunca `public`,
`instemaq` ni otro schema).

| Paso | Archivo | Qué hace |
|---|---|---|
| 0 | `supabase/esqueletoerp/provision/0000_clone_schema_from_instemaq.sql` | Clona la estructura de `instemaq` sin datos |
| 1 | `.../0001_post_clone_fix_schema_references.sql` | Reapunta funciones, políticas RLS y FKs heredadas al schema propio |
| 2 | `.../0002_grants_anon.sql` | Permisos de `anon` / `authenticated` / `service_role` |
| 3 | `.../0003_master_data.sql` | Empresa propia + catálogos (módulos, vistas de dashboard, etapas CRM) |
| 4 | `.../0004_empresa_modulos_seleccion.sql` | Deja activos solo los 6 módulos pedidos |
| 5 | `.../0005_usuario_admin.sql` | Vincula `admin@erpesqueleto.com` (requiere crear antes el usuario de Auth) |
| 6 | `.../0006_entidades_bancarias_iniciales.sql` | Entidades de cobro para Caja |
| 7 | `.../0007_modulo_caja.sql` | Tablas `cajas` y `caja_movimientos` + `ventas.caja_id` |
| — | `.../0099_verificacion.sql` | Verificación final, solo lectura |

Los pasos 1 y 2 requieren rol propietario (`supabase_admin` / superusuario). Si
alguna sentencia devuelve `must be owner of ...` o "no privileges were granted",
aplicarlos con psql dentro del contenedor `db` de Supabase self-hosted.

## 3. Usuario administrador

El paso 5 **no inventa** el `auth_user_id`: lo busca por email en `auth.users`.
Antes de correrlo hay que crear el usuario en Supabase Auth:

> Studio → Authentication → Users → **Add user** → *Create new user*
> Email `admin@erpesqueleto.com`, contraseña a elección, **Auto Confirm User: sí**.

Se crea con rol `admin` (no `super_admin`) a propósito: un admin de empresa ve
todos los módulos **activos en `empresa_modulos`**, es decir exactamente los 6.
Un `super_admin` saltea el gate y vería el catálogo completo.

## 4. Exposición en PostgREST

Paso manual sobre la VPS (no se puede hacer desde el SQL Editor):

```bash
cd /root/supabase/docker
./exponer-schema.sh esqueletoerp
```

Verificación contra la API (requiere el anon key real):

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Accept-Profile: esqueletoerp" \
  "https://api.neura.com.py/rest/v1/empresas?select=id,nombre_empresa&limit=1"
# esperado: 200
```

## 5. Independencia respecto de las demás instancias

- Schema Postgres propio (`esqueletoerp`), sin datos de ninguna otra empresa.
- `empresa_id` propio: `3c14fe00-d466-4f24-a010-1bbd7e37ccd6`.
- El paso 1 elimina cualquier referencia cruzada heredada del clon: ninguna
  política RLS, función o FK de `esqueletoerp` apunta a otro schema (salvo
  `auth.users`, que es compartido por diseño de Supabase).
- El script `0099_verificacion.sql` deja constancia de esto: las consultas de la
  sección C deben devolver **0 filas**.
