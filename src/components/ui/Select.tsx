"use client";

import { Children, isValidElement, useMemo, type ReactNode } from "react";
import { FancySelect, type FancySelectOption } from "@/components/ui/FancySelect";

/**
 * Reemplazo drop-in del `<select>` nativo, con el look de `FancySelect`.
 *
 * El `<select>` nativo no se puede estilar: el navegador dibuja la lista
 * desplegable con el tema del sistema operativo (fondo azul, tipografía propia),
 * y ninguna clase de Tailwind la alcanza. Por eso convivían dos estéticas en el
 * ERP: los filtros migrados a `FancySelect` y los que seguían siendo nativos.
 *
 * Este componente cierra esa brecha SIN reescribir cada pantalla: mantiene la
 * misma API que el nativo (`value` / `onChange` / hijos `<option>`), así que la
 * migración es cambiar la etiqueta y agregar el import.
 *
 * Uso idéntico al nativo:
 *
 *   <Select value={estado} onChange={(e) => setEstado(e.target.value)}>
 *     <option value="">Todas</option>
 *     {items.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
 *   </Select>
 *
 * Diferencias a tener en cuenta:
 *
 *  - `onChange` recibe un evento SINTÉTICO con solo `target.value` y
 *    `target.name`. Es lo único que leen los handlers de este repo; si algún
 *    día hace falta `preventDefault()` u otra propiedad del evento real, hay
 *    que ampliarlo acá. Se tipa como `ChangeEvent<HTMLSelectElement>` para que
 *    los handlers existentes compilen sin cambios.
 *  - De `className` se conservan solo las clases de LAYOUT (ancho, flex, grid,
 *    márgenes, visibilidad). Las visuales del nativo (`border`, `rounded`,
 *    `px-*`, `bg-*`, `focus:*`…) se descartan a propósito: `FancySelect` trae
 *    las suyas y, superpuestas, dibujarían un segundo borde alrededor.
 *  - No soporta `multiple` (no hay ninguno en el repo). Si hiciera falta, usar
 *    el `<select multiple>` nativo directamente.
 */

export type SelectProps = {
  value?: string | number | readonly string[];
  defaultValue?: string | number | readonly string[];
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  children?: ReactNode;
  name?: string;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  placeholder?: string;
  size?: "sm" | "md";
  "aria-label"?: string;
  ariaLabel?: string;
  "aria-disabled"?: boolean;
  openDirection?: "auto" | "up" | "down";
  /** Se disparan sobre el contenedor; el foco y el puntero del trigger burbujean hasta acá. */
  onFocus?: React.FocusEventHandler<HTMLDivElement>;
  onBlur?: React.FocusEventHandler<HTMLDivElement>;
  onPointerDown?: React.PointerEventHandler<HTMLDivElement>;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
};

/** Prefijos de clases que SÍ afectan al layout y por eso se conservan. */
const LAYOUT_PREFIXES = [
  "w-", "min-w-", "max-w-", "h-", "min-h-", "max-h-",
  "flex-", "grow", "shrink", "basis-",
  "col-", "row-", "order-", "self-", "justify-self-",
  "m-", "mt-", "mb-", "ml-", "mr-", "mx-", "my-",
  "hidden", "block", "inline-block", "inline-flex", "flex",
];

function isLayoutClass(cls: string): boolean {
  // Conserva la clase también cuando viene con variante responsive/estado
  // (`sm:w-48`, `lg:col-span-2`): se evalúa la parte posterior al último `:`.
  const bare = cls.includes(":") ? cls.slice(cls.lastIndexOf(":") + 1) : cls;
  return LAYOUT_PREFIXES.some((p) =>
    p.endsWith("-") ? bare.startsWith(p) : bare === p
  );
}

function layoutClassesOnly(className: string | undefined): string {
  if (!className) return "";
  return className.split(/\s+/).filter(Boolean).filter(isLayoutClass).join(" ");
}

/** Aplana los hijos de un `<option>` a texto plano (soporta `{a} ({b})`). */
function nodeToText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (isValidElement(node)) {
    return nodeToText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

/**
 * Recorre los hijos y arma la lista de opciones.
 * Soporta `<option>` sueltos, arrays de `.map()`, fragmentos, condicionales que
 * devuelven `null` y `<optgroup>` (se aplana usando su `label` como descripción).
 */
function collectOptions(children: ReactNode, grupo?: string): FancySelectOption[] {
  const out: FancySelectOption[] = [];

  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;

    const props = child.props as {
      value?: string | number;
      children?: ReactNode;
      disabled?: boolean;
      label?: string;
    };

    if (child.type === "optgroup") {
      out.push(...collectOptions(props.children, props.label));
      continue;
    }

    if (child.type === "option") {
      const label = nodeToText(props.children).trim();
      out.push({
        // Igual que el nativo: sin `value`, el texto de la opción ES el valor.
        value: props.value !== undefined ? String(props.value) : label,
        label,
        description: grupo,
        disabled: props.disabled,
      });
      continue;
    }

    // Fragmento u otro wrapper: seguir bajando.
    if (props.children) out.push(...collectOptions(props.children, grupo));
  }

  return out;
}

export function Select({
  value,
  defaultValue,
  onChange,
  children,
  name,
  id,
  disabled = false,
  className,
  placeholder = "Seleccionar…",
  size = "md",
  ariaLabel,
  "aria-label": ariaLabelAttr,
  "aria-disabled": ariaDisabled,
  openDirection = "auto",
  onFocus,
  onBlur,
  onPointerDown,
  onClick,
}: SelectProps) {
  const options = useMemo(() => collectOptions(children), [children]);

  const current = value ?? defaultValue ?? "";
  const currentStr = Array.isArray(current) ? String(current[0] ?? "") : String(current);

  function handleChange(next: string) {
    if (!onChange) return;
    // Evento sintético: los handlers de este repo solo leen `value` y `name`.
    onChange({
      target: { value: next, name: name ?? "", id: id ?? "" },
      currentTarget: { value: next, name: name ?? "", id: id ?? "" },
    } as unknown as React.ChangeEvent<HTMLSelectElement>);
  }

  // Solo se agrega un contenedor cuando hace falta: sin handlers ni aria-disabled,
  // FancySelect se renderiza directo y no se suma un div de mas al arbol.
  const wrapper = Boolean(
    onFocus || onBlur || onPointerDown || onClick || ariaDisabled !== undefined
  );

  const campo = (
    <FancySelect
      options={options}
      value={currentStr}
      onChange={handleChange}
      placeholder={placeholder}
      ariaLabel={ariaLabel ?? ariaLabelAttr}
      className={wrapper ? "" : layoutClassesOnly(className)}
      size={size}
      disabled={disabled}
      openDirection={openDirection}
    />
  );

  if (!wrapper) return campo;

  // El trigger de FancySelect es un <button> hijo: focus, blur y pointerdown
  // burbujean hasta este contenedor, asi que los handlers siguen funcionando
  // igual que cuando estaban puestos sobre el <select> nativo.
  return (
    <div
      className={layoutClassesOnly(className)}
      aria-disabled={ariaDisabled}
      onFocus={onFocus}
      onBlur={onBlur}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      {campo}
    </div>
  );
}

export default Select;
