export type CampoTipo = "text" | "textarea" | "number" | "email" | "tel" | "date" | "checkbox" | "select";

export interface CampoFormulario {
  name: string;
  label: string;
  type: CampoTipo;
  required?: boolean;
  placeholder?: string;
  default?: string | number | boolean;
  options?: { value: string; label: string }[];
}

export interface FormularioApi {
  id: string;
  empresa_id: string;
  nombre: string;
  descripcion: string | null;
  endpoint_url: string;
  metodo: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  auth_header_name: string | null;
  auth_header_value: string | null;
  headers_extra: Record<string, string>;
  campos: CampoFormulario[];
  activo: boolean;
  created_at: string;
  updated_at: string;
}
