# Esqueleto ERP

Instancia dedicada monocliente del ERP de Neura. Copia independiente de
`neura-erp-instemaq`, con su propio schema Postgres, su propia empresa y un
alcance funcional acotado.

- **Schema Postgres:** `esqueletoerp`
- **empresa_id:** `3c14fe00-d466-4f24-a010-1bbd7e37ccd6`
- **URL:** http://erpesqueleto.neura.com.py
- **Módulos:** Dashboard · Caja · Inventario · Compras · Presupuestos · Reportes

La guía completa de despliegue y provisión está en
[`docs/ESQUELETO_DEPLOY.md`](docs/ESQUELETO_DEPLOY.md).

## Desarrollo

```bash
npm install
cp .env.example .env.local   # completar los secretos
npm run dev
```

Abrir http://localhost:3000.

## Stack

Next.js (App Router) · TypeScript · Tailwind · Supabase self-hosted (PostgREST +
Auth) sobre un schema Postgres dedicado.
