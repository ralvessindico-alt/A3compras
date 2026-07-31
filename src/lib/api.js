import { supabase } from "./supabase";

// ── Auth ───────────────────────────────────────────────────────────────────
export const auth = {
  signUp: (email, password, nome) =>
    supabase.auth.signUp({ email, password, options: { data: { nome } } }),
  signIn: (email, password) =>
    supabase.auth.signInWithPassword({ email, password }),
  signOut: () => supabase.auth.signOut(),
  getSession: () => supabase.auth.getSession(),
  onAuthChange: (cb) => supabase.auth.onAuthStateChange((_event, session) => cb(session)),
};

export async function getMyProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

// ── camelCase <-> snake_case ─────────────────────────────────────────────────
// ATENÇÃO: a conversão automática QUEBRA com siglas (2+ maiúsculas seguidas).
//   camelToSnake("numeroPO")  ->  "numero_p_o"   ❌  (esperado: "numero_po")
// Isso fazia o campo ser descartado silenciosamente pelo stripUnknownCols.
// Qualquer campo com sigla DEVE ser declarado aqui.
const FIELD_MAP = {
  numeroPO: "numero_po",   // Número do Pedido de Compra digitado pelo usuário
};
const FIELD_MAP_REV = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([camel, snake]) => [snake, camel])
);

const camelToSnake = (s) =>
  FIELD_MAP[s] || s.replace(/[A-Z]/g, (l) => "_" + l.toLowerCase());
const snakeToCamel = (s) =>
  FIELD_MAP_REV[s] || s.replace(/_([a-z])/g, (_, l) => l.toUpperCase());

function toDb(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "id" && v == null) continue;
    out[camelToSnake(k)] = v;
  }
  return out;
}
function fromDb(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[snakeToCamel(k)] = v;
  return out;
}
function listFromDb(rows) { return (rows || []).map(fromDb); }

// ── Profiles (usuários) ──────────────────────────────────────────────────────
export const profilesApi = {
  list: async () => {
    const { data, error } = await supabase.from("profiles").select("*").order("criado_em");
    if (error) throw error;
    return listFromDb(data);
  },
  update: async (id, fields) => {
    const { error } = await supabase.from("profiles").update(toDb(fields)).eq("id", id);
    if (error) throw error;
  },
  delete: async (id) => {
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) throw error;
  },
};

export const convitesUsuarioApi = {
  list: async () => {
    const { data, error } = await supabase.from("convites_usuario").select("*").order("criado_em", { ascending: false });
    if (error) throw error;
    return listFromDb(data);
  },
  create: async ({ email, role, cargo }) => {
    const { error } = await supabase.from("convites_usuario").insert({ email, role, cargo });
    if (error) throw error;
  },
  delete: async (id) => {
    const { error } = await supabase.from("convites_usuario").delete().eq("id", id);
    if (error) throw error;
  },
};

// ── CRUD genérico com mapeamento ────────────────────────────────────────────
function crudFactory(table,
