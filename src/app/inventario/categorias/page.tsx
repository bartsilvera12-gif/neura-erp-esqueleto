"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import ImportExcelButton from "@/components/ui/ImportExcelButton";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import { Select } from "@/components/ui/Select";
import ConfirmModal from "@/components/ui/ConfirmModal";

interface Categoria {
  id: string;
  nombre: string;
  codigo: string | null;
  descripcion: string | null;
  parent_id: string | null;
  activo: boolean;
}

export default function CategoriasProductosPage() {
  const { isAdmin } = useIsAdmin();
  const [items, setItems] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form alta
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [parentId, setParentId] = useState("");
  const [creating, setCreating] = useState(false);

  // Edición en la misma fila y borrado
  const [edit, setEdit] = useState<{ id: string; nombre: string; codigo: string; parent_id: string } | null>(null);
  const [borrar, setBorrar] = useState<Categoria | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function guardarEdicion() {
    if (!edit || !edit.nombre.trim() || ocupado) return;
    setOcupado(true);
    setError(null);
    const r = await fetch(`/api/inventario/categorias/${edit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ nombre: edit.nombre.trim(), codigo: edit.codigo.trim() || null, parent_id: edit.parent_id || null }),
    });
    const j = await r.json().catch(() => null);
    setOcupado(false);
    if (r.ok && j?.success) {
      setEdit(null);
      void load();
    } else setError(j?.error ?? "No se pudo guardar.");
  }

  async function confirmarBorrar() {
    if (!borrar || ocupado) return;
    setOcupado(true);
    setError(null);
    const r = await fetch(`/api/inventario/categorias/${borrar.id}`, { method: "DELETE", credentials: "include" });
    const j = await r.json().catch(() => null);
    setOcupado(false);
    setBorrar(null);
    if (r.ok && j?.success) void load();
    else setError(j?.error ?? "No se pudo borrar.");
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/inventario/categorias?todas=1", { credentials: "include" });
      const j = await r.json();
      if (r.ok && j?.success) setItems(j.data.categorias as Categoria[]);
      else setError(j?.error ?? "No se pudo cargar.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const r = await fetch("/api/inventario/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          nombre: nombre.trim(),
          codigo: codigo.trim() || null,
          parent_id: parentId || null,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.success) {
        setError(j?.error ?? "No se pudo crear.");
      } else {
        setNombre(""); setCodigo(""); setParentId("");
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActivo(cat: Categoria) {
    const r = await fetch(`/api/inventario/categorias/${cat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ activo: !cat.activo }),
    });
    const j = await r.json();
    if (r.ok && j?.success) load();
    else setError(j?.error ?? "No se pudo actualizar.");
  }

  return (
    <div className="space-y-8">
      <ConfirmModal
        open={!!borrar}
        title={`Borrar la categoría ${borrar?.nombre ?? ""}`}
        message="Se borra del todo. Si tiene productos o categorías adentro, no se va a poder: en ese caso se puede desactivar."
        confirmLabel="Borrar"
        tone="danger"
        loading={ocupado}
        onConfirm={confirmarBorrar}
        onCancel={() => setBorrar(null)}
      />
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Categorías de productos</h1>
          <p className="text-gray-600">Clasificá tus productos para reportes y búsqueda.</p>
        </div>
        <div className="max-w-2xl rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
          Estas categorías aparecen en el selector <strong>Categoría principal</strong> de Nuevo producto.
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExportExcelButton url="/api/inventario/categorias/export" />
          <ImportExcelButton
            entidad="Categorías"
            previewUrl="/api/inventario/categorias/import/preview"
            commitUrl="/api/inventario/categorias/import/commit"
            templateUrl="/api/inventario/categorias/import/template"
            permiteCrearFaltantes
            visible={isAdmin}
            onCompleted={load}
          />
          <Link href="/inventario" className="text-sm text-sky-700 hover:text-sky-900 underline">
            ← Volver a Inventario
          </Link>
        </div>
      </div>

      {/* Alta */}
      <div className="zx-surface p-6 max-w-3xl">
        <p className="text-xs text-gray-400 mb-3 uppercase tracking-wide font-semibold">
          Nueva categoría
        </p>
        <form onSubmit={handleCrear} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Nombre</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: BEBIDAS"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Código (opcional)</label>
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Ej: BEB"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Categoría padre (opcional)</label>
            <Select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="zx-surface w-full px-3 py-2 text-sm"
            >
              <option value="">— ninguna —</option>
              {items.filter((i) => i.activo).map((i) => (
                <option key={i.id} value={i.id}>{i.nombre}</option>
              ))}
            </Select>
          </div>
          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={creating || !nombre.trim()}
              className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {creating ? "Creando..." : "Crear categoría"}
            </button>
          </div>
        </form>
        {error && (
          <p className="mt-2 text-xs text-red-700">{error}</p>
        )}
      </div>

      {/* Lista */}
      <div className="zx-surface overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-gray-400">Cargando...</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">Todavía no cargaste categorías.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Nombre</th>
                <th className="text-left px-4 py-2">Código</th>
                <th className="text-left px-4 py-2">Padre</th>
                <th className="text-left px-4 py-2">Estado</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const parent = items.find((i) => i.id === c.parent_id);
                return (
                  <tr key={c.id} className="border-t border-slate-100">
                    {edit?.id === c.id ? (
                      <>
                        <td className="px-4 py-2">
                          <input value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" aria-label="Nombre" autoFocus />
                        </td>
                        <td className="px-4 py-2">
                          <input value={edit.codigo} onChange={(e) => setEdit({ ...edit, codigo: e.target.value })} className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" aria-label="Código" />
                        </td>
                        <td className="px-4 py-2">
                          <select value={edit.parent_id} onChange={(e) => setEdit({ ...edit, parent_id: e.target.value })} className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm" aria-label="Categoría padre">
                            <option value="">— ninguna —</option>
                            {items.filter((i) => i.id !== c.id && i.parent_id !== c.id).map((i) => (
                              <option key={i.id} value={i.id}>{i.nombre}</option>
                            ))}
                          </select>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 font-medium">{c.nombre}</td>
                        <td className="px-4 py-2 text-gray-500">{c.codigo ?? "—"}</td>
                        <td className="px-4 py-2 text-gray-500">{parent?.nombre ?? "—"}</td>
                      </>
                    )}
                    <td className="px-4 py-2">
                      {c.activo ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Activo</span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Inactivo</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {edit?.id === c.id ? (
                        <>
                          <button onClick={guardarEdicion} disabled={ocupado || !edit.nombre.trim()} className="text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-50">
                            Guardar
                          </button>
                          <button onClick={() => setEdit(null)} className="ml-3 text-xs text-gray-500 hover:underline">
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setEdit({ id: c.id, nombre: c.nombre, codigo: c.codigo ?? "", parent_id: c.parent_id ?? "" })} className="text-xs text-sky-700 hover:text-sky-900 underline">
                            Editar
                          </button>
                          <button onClick={() => toggleActivo(c)} className="ml-3 text-xs text-sky-700 hover:text-sky-900 underline">
                            {c.activo ? "Desactivar" : "Activar"}
                          </button>
                          <button onClick={() => setBorrar(c)} className="ml-3 text-xs text-rose-600 hover:text-rose-800 underline">
                            Borrar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
