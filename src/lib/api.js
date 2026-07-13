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
function crudFactory(table, orderCol = "criado_em") {
  return {
    list: async () => {
      const { data, error } = await supabase.from(table).select("*").order(orderCol, { ascending: false });
      if (error) throw error;
      return listFromDb(data);
    },
    create: async (obj) => {
      const { data, error } = await supabase.from(table).insert(toDb(obj)).select().single();
      if (error) throw error;
      return fromDb(data);
    },
    update: async (id, fields) => {
      const { data, error } = await supabase.from(table).update(toDb(fields)).eq("id", id).select().single();
      if (error) throw error;
      return fromDb(data);
    },
    delete: async (id) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
  };
}

// Converte campos numéricos com string vazia para null antes de enviar ao Supabase.
// "" é inválido para colunas numeric/int — causaria erro 400 silencioso.
function sanitizeNumeric(payload, fields) {
  for (const f of fields) {
    if (payload[f] === "" || payload[f] === undefined) payload[f] = null;
  }
  return payload;
}

export const fornecedoresApi = {
  list: async () => {
    const { data, error } = await supabase.from("fornecedores").select("*").order("criado_em", { ascending: false });
    if (error) throw error;
    return listFromDb(data);
  },
  create: async (obj) => {
    const payload = sanitizeNumeric(toDb(obj), ["limite_credito", "prazo_entrega_dias"]);
    const { data, error } = await supabase.from("fornecedores").insert(payload).select().single();
    if (error) throw error;
    return fromDb(data);
  },
  update: async (id, fields) => {
    const payload = sanitizeNumeric(toDb(fields), ["limite_credito", "prazo_entrega_dias"]);
    const { data, error } = await supabase.from("fornecedores").update(payload).eq("id", id).select().single();
    if (error) throw error;
    return fromDb(data);
  },
  delete: async (id) => {
    const { error } = await supabase.from("fornecedores").delete().eq("id", id);
    if (error) throw error;
  },
};

export const clientesApi = crudFactory("clientes");

/**
 * Obter próximo número de PC formatado para um cliente
 * @param {string} clienteId - UUID do cliente
 * @returns {Promise<string>} - Formato: "PC-0001"
 */
clientesApi.getProximoPO = async (clienteId) => {
  try {
    const { data, error } = await supabase
      .from('clientes')
      .select('numero_pedido_proximo')
      .eq('id', clienteId)
      .single();
    
    if (error) throw error;
    const num = data?.numero_pedido_proximo || 1;
    return `PC-${String(num).padStart(4, '0')}`;
  } catch (err) {
    console.error('❌ clientesApi.getProximoPO:', err.message);
    throw err;
  }
};

/**
 * Incrementar número de PO após confirmação de cotação
 * @param {string} clienteId - UUID do cliente
 * @returns {Promise<number>} - Novo valor de numero_pedido_proximo
 */
clientesApi.incrementarPO = async (clienteId) => {
  try {
    // Buscar valor atual
    const { data: cliente, error: errGet } = await supabase
      .from('clientes')
      .select('numero_pedido_proximo')
      .eq('id', clienteId)
      .single();
    
    if (errGet) throw errGet;
    
    const novoNum = (cliente?.numero_pedido_proximo || 1) + 1;
    
    // Atualizar com novo valor
    const { data: res, error: errUpd } = await supabase
      .from('clientes')
      .update({ numero_pedido_proximo: novoNum })
      .eq('id', clienteId)
      .select()
      .single();
    
    if (errUpd) throw errUpd;
    return fromDb(res).numeroPedidoProximo;
  } catch (err) {
    console.error('❌ clientesApi.incrementarPO:', err.message);
    throw err;
  }
};

// ============================================================================
// API: Plano de Contas com suporte a cliente_id
// ============================================================================

export const planoContasApi = {
  /**
   * Lista plano de contas (global se clienteId=null, ou de um cliente específico)
   * @param {string|null} clienteId - UUID do cliente ou null para plano global
   */
  list: async (clienteId = null) => {
    try {
      let query = supabase.from('plano_contas').select('*');

      if (clienteId) {
        query = query.eq('cliente_id', clienteId);
      } else {
        // Plano global (NULL)
        query = query.is('cliente_id', null);
      }

      const { data, error } = await query.order('nivel', { ascending: true }).order('codigo', { ascending: true });
      if (error) throw error;
      return listFromDb(data || []);
    } catch (err) {
      console.error('❌ planoContasApi.list:', err.message);
      throw err;
    }
  },

  /**
   * Alias para list() - compatibilidade com código existente
   */
  listByCliente: async (clienteId = null) => {
    return planoContasApi.list(clienteId);
  },

  /**
   * Cria nova conta/subconta/variação
   * @param {object} data - { codigo, descricao, nivel, parentId, cliente_id }
   */
  create: async (data) => {
    try {
      const payload = {
        codigo: data.codigo || null,
        descricao: data.descricao || '',
        nivel: data.nivel || 1,
        parent_id: data.parentId || null,
        cliente_id: data.cliente_id || null, // null = global, UUID = cliente específico
      };

      const { data: res, error } = await supabase
        .from('plano_contas')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      return fromDb(res);
    } catch (err) {
      console.error('❌ planoContasApi.create:', err.message);
      throw err;
    }
  },

  /**
   * Atualiza conta existente
   */
  update: async (id, data) => {
    try {
      const { data: res, error } = await supabase
        .from('plano_contas')
        .update({
          codigo: data.codigo !== undefined ? data.codigo : undefined,
          descricao: data.descricao !== undefined ? data.descricao : undefined,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return fromDb(res);
    } catch (err) {
      console.error('❌ planoContasApi.update:', err.message);
      throw err;
    }
  },

  /**
   * Deleta conta (CASCADE remove filhos automaticamente)
   */
  delete: async (id) => {
    try {
      const { error } = await supabase
        .from('plano_contas')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('❌ planoContasApi.delete:', err.message);
      throw err;
    }
  },

  /**
   * Reseta TUDO (apenas admin, apenas para debug/reset)
   */
  resetAll: async () => {
    try {
      const { error } = await supabase
        .from('plano_contas')
        .delete()
        .gte('id', '00000000-0000-0000-0000-000000000000'); // deleta tudo

      if (error) throw error;
    } catch (err) {
      console.error('❌ planoContasApi.resetAll:', err.message);
      throw err;
    }
  },

  /**
   * Copia plano de um cliente para outro (usado ao criar cliente novo)
   * @param {string} fromClienteId - cliente com plano template
   * @param {string} toClienteId - cliente que recebe a cópia
   */
  duplicarPlano: async (fromClienteId, toClienteId) => {
    try {
      // Carrega plano de origem
      const original = await planoContasApi.list(fromClienteId);
      if (!original.length) return [];

      // Mapeia IDs antigos → novos (para manter hierarquia)
      const mapIdAntigo = {};
      const cópias = [];

      // Primeiro: cria contas (nivel 1)
      for (const conta of original.filter(c => c.nivel === 1)) {
        const nova = await planoContasApi.create({
          codigo: conta.codigo,
          descricao: conta.descricao,
          nivel: conta.nivel,
          parentId: null,
          cliente_id: toClienteId,
        });
        mapIdAntigo[conta.id] = nova.id;
        cópias.push(nova);
      }

      // Segundo: cria subcontas (nivel 2)
      for (const sub of original.filter(c => c.nivel === 2)) {
        const novaPai = mapIdAntigo[sub.parentId];
        if (!novaPai) continue;

        const nova = await planoContasApi.create({
          codigo: sub.codigo,
          descricao: sub.descricao,
          nivel: sub.nivel,
          parentId: novaPai,
          cliente_id: toClienteId,
        });
        mapIdAntigo[sub.id] = nova.id;
        cópias.push(nova);
      }

      // Terceiro: cria variações (nivel 3)
      for (const var3 of original.filter(c => c.nivel === 3)) {
        const novaPai = mapIdAntigo[var3.parentId];
        if (!novaPai) continue;

        const nova = await planoContasApi.create({
          codigo: var3.codigo,
          descricao: var3.descricao,
          nivel: var3.nivel,
          parentId: novaPai,
          cliente_id: toClienteId,
        });
        cópias.push(nova);
      }

      return cópias;
    } catch (err) {
      console.error('❌ planoContasApi.duplicarPlano:', err.message);
      throw err;
    }
  },
};

// ── Cotações ──────────────────────────────────────────────────────────────

// ── Convites de Fornecedor (auto-cadastro) ─────────────────────────────────
export const convitesFornecedorApi = {
  list: async () => {
    const { data, error } = await supabase.from("convites_fornecedor").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return listFromDb(data);
  },
  create: async ({ code, label, expiresAt }) => {
    const { data, error } = await supabase.from("convites_fornecedor")
      .insert({ code, label, expires_at: expiresAt }).select().single();
    if (error) throw error;
    return fromDb(data);
  },
  revoke: async (code) => {
    const { error } = await supabase.from("convites_fornecedor").update({ status: "revoked" }).eq("code", code);
    if (error) throw error;
  },
};

export const pendentesFornecedorApi = {
  list: async () => {
    const { data, error } = await supabase.from("pendentes_fornecedor").select("*").order("submitted_at", { ascending: false });
    if (error) throw error;
    return listFromDb(data);
  },
  delete: async (id) => {
    const { error } = await supabase.from("pendentes_fornecedor").delete().eq("id", id);
    if (error) throw error;
  },
};

// ── Chamadas públicas (sem login) — Portal do Fornecedor ───────────────────
export const portalFornecedorApi = {
  validarCodigo: async (code) => {
    const { data, error } = await supabase.rpc("validar_convite_fornecedor", { p_code: code });
    if (error) throw error;
    return data;
  },
  enviarCadastro: async (code, dadosCamelCase) => {
    const { data, error } = await supabase.rpc("enviar_cadastro_fornecedor", {
      p_code: code, p_dados: toDb(dadosCamelCase),
    });
    if (error) throw error;
    return data;
  },
};

export const _internal = { toDb, fromDb, listFromDb };

// ── Supabase Storage — Anexos de Cotação ─────────────────────────────────────
const BUCKET = "cotacoes-anexos";

export const storageApi = {
  upload: async (cotacaoId, file) => {
    const ext = file.name.split(".").pop();
    const path = `${cotacaoId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { data, error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
    if (error) throw error;
    return { path: data.path, name: file.name, size: file.size, type: file.type };
  },
  getSignedUrl: async (path) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error) throw error;
    return data.signedUrl;
  },
  delete: async (path) => {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) throw error;
  },
};

// Sanitize UUID fields that shouldn't be empty strings
const UUID_FIELDS_COT = ["cliente_id", "plano_contas", "criado_por"];
function sanitizeUuids(payload) {
  for (const f of UUID_FIELDS_COT) if (payload[f] === "") payload[f] = null;
  return payload;
}

// Colunas originais do schema — sempre existem, independente de migrations extras
const COT_COLS_SAFE = new Set([
  "titulo","descricao_aquisicao","justificativa","centros_custo","plano_contas",
  "classificacao","urgente","necessario","status","responsavel","aprovador",
  "cliente_id","criado_por","data_criacao","numero_pedido",
  "itens","fornecedores","propostas","condicoes_fornecedor",
]);
// Colunas adicionadas por migrations opcionais
const COT_COLS_EXTRA = new Set([
  "historico","token_aprovacao","assinatura_sindico","anexos","os_vinculadas",
  "numero_po",   // ← exige a migration SQL_NUMERO_PO_COTACOES.sql
]);
const COT_COLS = new Set([...COT_COLS_SAFE, ...COT_COLS_EXTRA]);

function stripUnknownCols(payload, colSet = COT_COLS) {
  return Object.fromEntries(Object.entries(payload).filter(([k]) => colSet.has(k)));
}

export const cotacoesApi = {
  list: async () => {
    const { data, error } = await supabase.from("cotacoes").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return listFromDb(data);
  },
  create: async (obj) => {
    const payload = stripUnknownCols(sanitizeUuids(toDb(obj)));
    if (!payload.numero_pedido) delete payload.numero_pedido;
    const { data, error } = await supabase.from("cotacoes").insert(payload).select().single();
    if (error) throw error;
    return fromDb(data);
  },
  update: async (id, fields) => {
    const payload = stripUnknownCols(sanitizeUuids(toDb(fields)));
    // Tenta update completo (funciona se todas as migrations foram rodadas)
    const { data, error } = await supabase.from("cotacoes").update(payload).eq("id", id).select().single();
    if (!error) return fromDb(data);
    // Fallback: se falhou (colunas extras não existem no banco), usa só colunas originais
    const safePayload = stripUnknownCols(payload, COT_COLS_SAFE);
    const { data: d2, error: e2 } = await supabase.from("cotacoes").update(safePayload).eq("id", id).select().single();
    if (e2) throw e2;
    return fromDb(d2);
  },
  delete: async (id) => {
    const { error } = await supabase.from("cotacoes").delete().eq("id", id);
    if (error) throw error;
  },
  aprovar: async (id, status) => {
    const { error } = await supabase.rpc("aprovar_cotacao", { p_id: id, p_status: status });
    if (error) throw error;
  },
  /**
   * Confirmar cotação e incrementar PO do cliente
   * @param {string} id - ID da cotação
   * @param {string} clienteId - ID do cliente
   */
  confirmarComIncrementoPO: async (id, clienteId) => {
    try {
      // 1. Atualizar status da cotação para "confirmada"
      const { error: errUpd } = await supabase
        .from("cotacoes")
        .update({ status: "confirmada" })
        .eq("id", id);
      
      if (errUpd) throw errUpd;
      
      // 2. Incrementar PO do cliente
      await clientesApi.incrementarPO(clienteId);
      
      return true;
    } catch (err) {
      console.error('❌ cotacoesApi.confirmarComIncrementoPO:', err.message);
      throw err;
    }
  },
};

// ── Relacionamento usuário ↔ cliente (controle de acesso por condomínio) ───
export const userClientesApi = {
  // Admin: lista clientes atribuídos a um usuário específico
  listForUser: async (userId) => {
    const { data, error } = await supabase
      .from("user_clientes")
      .select("cliente_id, clientes(id, razao_social, nome_fantasia, categoria)")
      .eq("user_id", userId);
    if (error) throw error;
    return (data || []).map(r => r.clientes).filter(Boolean);
  },
  // Usuário logado: lista seus próprios clientes atribuídos
  listMine: async () => {
    const { data, error } = await supabase
      .from("user_clientes")
      .select("cliente_id, clientes(id, razao_social, nome_fantasia, categoria)");
    if (error) throw error;
    return (data || []).map(r => r.clientes).filter(Boolean);
  },
  assign: async (userId, clienteId) => {
    const { error } = await supabase
      .from("user_clientes")
      .insert({ user_id: userId, cliente_id: clienteId });
    if (error && !error.message.includes("duplicate")) throw error;
  },
  remove: async (userId, clienteId) => {
    const { error } = await supabase
      .from("user_clientes")
      .delete()
      .eq("user_id", userId)
      .eq("cliente_id", clienteId);
    if (error) throw error;
  },
};
export const usersApi = {
  create: async (_session, { nome, email, senha, role, cargo }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Sessão expirada. Faça login novamente.");

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quick-task`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ nome, email, senha, role, cargo }),
      }
    );
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Erro ao criar usuário");
    return data;
  },
};

// ── Aprovação via WhatsApp (sem login) ────────────────────────────────────
export const aprovacaoApi = {
  buscarPorToken: async (token) => {
    const { data, error } = await supabase.rpc("buscar_cotacao_por_token", { p_token: token });
    if (error) throw error;
    return data;
  },
  aprovarPorToken: async (token, status, assinante, obs = null) => {
    const { data, error } = await supabase.rpc("aprovar_cotacao_por_token", {
      p_token: token, p_status: status, p_assinante: assinante, p_obs: obs,
    });
    if (error) throw error;
    return data;
  },
};

// ── Cotações: salvar token de aprovação + historico ───────────────────────
// (usa cotacoesApi.update já existente)
