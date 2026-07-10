import { useState, useEffect, useCallback, useContext, createContext, Fragment } from "react";
import {
  auth, getMyProfile, profilesApi, convitesUsuarioApi,
  fornecedoresApi, clientesApi, planoContasApi, cotacoesApi, storageApi,
  convitesFornecedorApi, pendentesFornecedorApi, portalFornecedorApi,
} from "./lib/api";

// ── Mobile context ────────────────────────────────────────────────────────────
const MobileCtx = createContext(false);
const useMobile = () => useContext(MobileCtx);
function useIsMobile() {
  const [v, setV] = useState(window.innerWidth < 768);
  useEffect(() => { const h = () => setV(window.innerWidth < 768); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);
  return v;
}

// ── Auth context ──────────────────────────────────────────────────────────────
const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

const ROLES = {
  admin:     { label:"Administrador",  color:"#DC2626", bg:"#FEE2E2", level:1 },
  comprador: { label:"Comprador",      color:"#1B2E8A", bg:"#EEF1FB", level:2 },
  sindico:   { label:"Síndico/Gestor", color:"#16A34A", bg:"#DCFCE7", level:3 },
};

const PERMS = {
  admin:     ["all"],
  comprador: ["view","create","edit_cotacao","manage_fornecedores","invite","approve_supplier"],
  sindico:   ["view","approve_cotacao"],
};

const can = (user, action) => {
  if(!user) return false;
  const p = PERMS[user.role] || [];
  return p.includes("all") || p.includes(action);
};

const C = {
  amber:"#F5A623",amberDark:"#E8941A",amberLight:"#FFC84A",
  navy:"#1B2E8A",navyLight:"#2A3FA0",
  white:"#FFFFFF",gray50:"#F9FAFB",gray100:"#F3F4F6",
  gray200:"#E5E7EB",gray300:"#D1D5DB",gray400:"#9CA3AF",gray600:"#4B5563",gray800:"#1F2937",
  green:"#16A34A",greenLight:"#DCFCE7",greenBorder:"#86EFAC",
  red:"#DC2626",redLight:"#FEE2E2",
  yellow:"#CA8A04",yellowLight:"#FEF9C3",
  blue:"#1D4ED8",blueLight:"#DBEAFE",
};

const uid=()=>Math.random().toString(36).slice(2,9);
const fmt=(v)=>v==null||v===""?"—":Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const today=()=>new Date().toLocaleDateString("pt-BR");
const yearNow=()=>new Date().getFullYear();

const fmtCNPJ=(v)=>v.replace(/\D/g,"").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/,"$1.$2.$3/$4-$5");
const fmtCPF=(v)=>v.replace(/\D/g,"").replace(/^(\d{3})(\d{3})(\d{3})(\d{2}).*/,"$1.$2.$3-$4");
const fmtCEP=(v)=>v.replace(/\D/g,"").replace(/^(\d{5})(\d{3}).*/,"$1-$2");
const fmtTel=(v)=>{const d=v.replace(/\D/g,"");if(d.length<=10)return d.replace(/^(\d{2})(\d{4})(\d{0,4}).*/,"($1) $2-$3");return d.replace(/^(\d{2})(\d{5})(\d{0,4}).*/,"($1) $2-$3");};

const ESTADOS=["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const CATEGORIAS=["Materiais de Construção","Materiais de Escritório","Equipamentos","Serviços","Tecnologia","Limpeza","Alimentação","Transporte","Outros"];
const CATEGORIAS_CLIENTE=["Condomínio Residencial","Condomínio Comercial","Condomínio Misto","Empresa Privada","Órgão Público","Pessoa Física","Outros"];
const COND_PAGAMENTO=["À Vista","7 dias","14 dias","21 dias","28 dias","30 dias","45 dias","60 dias","90 dias","Parcelado"];
const TIPOS_CUSTO=["Ordinária","Extraordinária"];
const CLASSIFICACOES=["Manutenção Itens em Geral","Equipamentos","Obras e Reformas","Serviços Terceirizados","Material de Escritório","Segurança","Limpeza","Outros"];

// ── Plano de Contas hierárquico (3 níveis) ────────────────────────────────────
// Estrutura: Conta (1) → Subconta (2) → Variação (3)
// parentId: null = conta | id de conta = subconta | id de subconta = variação
async function loadPlanoContas(){try{return await planoContasApi.list();}catch{return [];}}
const NIVEL={1:{label:"Conta",      color:C.navy,    bg:"#EEF1FB",indent:0},
             2:{label:"Subconta",   color:"#1D4ED8", bg:"#DBEAFE",indent:20},
             3:{label:"Variação",   color:"#6D28D9", bg:"#EDE9FE",indent:40}};

// Helpers de árvore
const getFilhos=(lista,parentId)=>lista.filter(i=>i.parentId===parentId);
const getContas=(lista)=>lista.filter(i=>i.nivel===1);
const getSubcontas=(lista,contaId)=>lista.filter(i=>i.nivel===2&&i.parentId===contaId);
const getVariacoes=(lista,subId)=>lista.filter(i=>i.nivel===3&&i.parentId===subId);
const temFilhos=(lista,id)=>lista.some(i=>i.parentId===id);
// Retorna path completo: "Conta › Subconta › Variação"
const getPath=(lista,item)=>{
  if(!item)return "";
  if(item.nivel===1)return item.descricao;
  if(item.nivel===2){const pai=lista.find(i=>i.id===item.parentId);return `${pai?.descricao||""} › ${item.descricao}`;}
  if(item.nivel===3){const sub=lista.find(i=>i.id===item.parentId);const conta=lista.find(i=>i.id===sub?.parentId);return `${conta?.descricao||""} › ${sub?.descricao||""} › ${item.descricao}`;}
  return item.descricao;
};

const STATUS_COLORS={
  rascunho:{bg:"#F3F4F6",color:"#6B7280",border:"#D1D5DB"},
  aberta:{bg:C.yellowLight,color:C.yellow,border:"#FDE68A"},
  cotando:{bg:C.blueLight,color:C.blue,border:"#BFDBFE"},
  fechada:{bg:C.greenLight,color:C.green,border:C.greenBorder},
  aprovada:{bg:"#DCFCE7",color:"#16A34A",border:"#86EFAC"},
  rejeitada:{bg:C.redLight,color:C.red,border:"#FCA5A5"},
};

// ── UI Base ──────────────────────────────────────────────────────────────────
function Badge({status}){
  const s=STATUS_COLORS[status]||STATUS_COLORS.aberta;
  const labels={rascunho:"Rascunho",aberta:"Aberta",cotando:"Em Cotação",fechada:"Encerrada",aprovada:"Aprovada",rejeitada:"Rejeitada"};
  return <span style={{background:s.bg,color:s.color,border:`1px solid ${s.border}`,borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:800,letterSpacing:0.3}}>{labels[status]}</span>;
}

function Btn({children,onClick,variant="primary",size="md",disabled,style={}}){
  const pad=size==="sm"?"5px 13px":size==="lg"?"12px 28px":"8px 18px";
  const fs=size==="sm"?12:size==="lg"?16:14;
  const vars={
    primary:{background:C.amber,color:C.navy},
    navy:{background:C.navy,color:C.white},
    ghost:{background:"transparent",color:C.navy,border:`1.5px solid ${C.navy}`},
    danger:{background:C.redLight,color:C.red,border:`1px solid #FCA5A5`},
    success:{background:C.greenLight,color:C.green,border:`1px solid ${C.greenBorder}`},
    light:{background:C.gray100,color:C.gray800,border:`1px solid ${C.gray200}`},
  };
  return <button onClick={disabled?undefined:onClick} style={{border:"none",borderRadius:7,cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",fontWeight:700,transition:"all .15s",opacity:disabled?.5:1,display:"inline-flex",alignItems:"center",gap:5,padding:pad,fontSize:fs,...vars[variant],...style}}>{children}</button>;
}

function Inp({value,onChange,placeholder,type="text",mask,disabled,rows,style={}}){
  const handle=(e)=>{let v=e.target.value;if(mask==="cnpj")v=fmtCNPJ(v);else if(mask==="cpf")v=fmtCPF(v);else if(mask==="cep")v=fmtCEP(v);else if(mask==="tel")v=fmtTel(v);onChange(v);};
  const base={width:"100%",border:`1.5px solid ${C.gray200}`,borderRadius:8,padding:"8px 12px",fontSize:14,fontFamily:"inherit",color:C.gray800,background:disabled?C.gray100:C.white,outline:"none",transition:"border-color .15s",boxSizing:"border-box",...style};
  if(rows) return <textarea value={value} onChange={handle} placeholder={placeholder} rows={rows} style={{...base,resize:"vertical"}} onFocus={e=>e.target.style.borderColor=C.amber} onBlur={e=>e.target.style.borderColor=C.gray200}/>;
  return <input type={type} value={value} onChange={handle} placeholder={placeholder} disabled={disabled} style={base} onFocus={e=>!disabled&&(e.target.style.borderColor=C.amber)} onBlur={e=>e.target.style.borderColor=C.gray200}/>;
}

function Sel({value,onChange,options,placeholder}){
  return <select value={value} onChange={e=>onChange(e.target.value)} style={{width:"100%",border:`1.5px solid ${C.gray200}`,borderRadius:8,padding:"8px 12px",fontSize:14,fontFamily:"inherit",color:value?C.gray800:C.gray400,background:C.white,outline:"none",cursor:"pointer",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor=C.amber} onBlur={e=>e.target.style.borderColor=C.gray200}>
    {placeholder&&<option value="">{placeholder}</option>}
    {options.map(o=><option key={o} value={o}>{o}</option>)}
  </select>;
}

function Toggle({value,onChange,label}){
  return <div style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}} onClick={()=>onChange(!value)}>
    <div style={{width:36,height:20,borderRadius:10,background:value?C.navy:C.gray300,transition:"background .2s",position:"relative",flexShrink:0}}>
      <div style={{width:16,height:16,borderRadius:"50%",background:C.white,position:"absolute",top:2,left:value?18:2,transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/>
    </div>
    <span style={{fontSize:13,fontWeight:700,color:value?C.navy:C.gray400}}>{label}</span>
  </div>;
}

function Card({children,style={}}){return <div style={{background:C.white,borderRadius:12,border:`1px solid ${C.gray200}`,boxShadow:"0 1px 4px rgba(0,0,0,.06)",padding:20,...style}}>{children}</div>;}

function SectionDivider({children}){
  return <div style={{display:"flex",alignItems:"center",gap:8,margin:"20px 0 14px"}}>
    <div style={{flex:1,height:1,background:C.gray200}}/>
    <span style={{fontSize:10,fontWeight:900,color:C.navy,letterSpacing:1.2,textTransform:"uppercase",whiteSpace:"nowrap"}}>{children}</span>
    <div style={{flex:1,height:1,background:C.gray200}}/>
  </div>;
}

// Wrapper de campo de formulário com label. Definido no nível do módulo
// (fora de qualquer componente pai) de propósito: se fosse definido dentro
// de FormFornecedor/FormCliente, o React recriaria essa função a cada
// re-render (cada tecla digitada), tratando-a como um componente novo e
// desmontando o <input> por baixo — por isso só a primeira letra ficava.
function FormField({label,required,children,col}){
  const mob=useMobile();
  return <div style={{gridColumn:mob?undefined:col}}>{label&&<Lbl required={required}>{label}</Lbl>}{children}</div>;
}

function Lbl({children,required}){
  return <label style={{display:"block",fontSize:11,fontWeight:800,color:C.gray600,letterSpacing:0.5,marginBottom:4,textTransform:"uppercase"}}>
    {children}{required&&<span style={{color:C.red}}> *</span>}
  </label>;
}

function Modal({title,subtitle,onClose,children,width=720}){
  const mob=useMobile();
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,display:"flex",alignItems:mob?"flex-end":"center",justifyContent:"center",padding:mob?0:16}} onClick={onClose}>
    <div style={{background:C.white,borderRadius:mob?"20px 20px 0 0":"16px",width:"100%",maxWidth:mob?"100%":width,maxHeight:mob?"92vh":"92vh",overflowY:"auto",boxShadow:"0 24px 64px rgba(0,0,0,.2)"}} onClick={e=>e.stopPropagation()}>
      <div style={{padding:mob?"16px 20px":"18px 24px",borderBottom:`1px solid ${C.gray200}`,display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:C.white,zIndex:10,borderRadius:mob?"20px 20px 0 0":"16px 16px 0 0"}}>
        <div><h2 style={{margin:0,fontSize:mob?17:18,fontWeight:900,color:C.navy}}>{title}</h2>{subtitle&&<div style={{fontSize:12,color:C.gray400,marginTop:2}}>{subtitle}</div>}</div>
        <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:C.gray400,lineHeight:1,padding:"4px 8px"}}>✕</button>
      </div>
      <div style={{padding:mob?"16px 20px 32px":"20px 24px 24px"}}>{children}</div>
    </div>
  </div>;
}

const SEGMENTOS_GRUPOS = {
  "🏗 Construção & Reformas": ["Materiais de Construção","Elétrica e Iluminação","Hidráulica e Encanamento","Pintura e Revestimentos","Marcenaria e Esquadrias","Vidraçaria e Serralheria","Gesso e Drywall","Impermeabilização","Pavimentação e Pisos","Paisagismo e Jardinagem"],
  "🔧 Manutenção Predial":    ["Manutenção Geral","Limpeza e Conservação","Dedetização / Controle de Pragas","Elevadores e Escadas Rolantes","Portões e Automação","CFTV e Segurança Eletrônica","Climatização e HVAC","Piscinas e Spas","Bombas e Sistemas Hidráulicos","Geração de Energia / GD"],
  "👷 Serviços Especializados":["Portaria e Vigilância","Engenharia e Projetos","Arquitetura e Design","Consultoria Jurídica","Contabilidade e Fiscal","Tecnologia da Informação","Seguros e Corretoras","Treinamentos e Capacitação"],
  "📦 Suprimentos & Produtos": ["Material de Escritório","EPI e Segurança do Trabalho","Ferramentas e Equipamentos","Limpeza e Higiene","Informática e Periféricos","Uniformes e Vestuário","Sinalização e Placas"],
  "🚚 Logística & Outros":     ["Transporte e Fretes","Locação de Equipamentos","Alimentação e Refeições","Gráfica e Comunicação Visual","Outros"],
};
const TODOS_SEGMENTOS=Object.values(SEGMENTOS_GRUPOS).flat();

// ── Fornecedor Form ──────────────────────────────────────────────────────────
const EMPTY_F=()=>({id:null,razaoSocial:"",nomeFantasia:"",tipoPessoa:"PJ",cnpj:"",cpf:"",ie:"",im:"",isMei:false,email:"",email2:"",telefone:"",celular:"",whatsapp:"",site:"",contatoNome:"",contatoCargo:"",cep:"",logradouro:"",numero:"",complemento:"",bairro:"",cidade:"",estado:"",categoria:"",segmentos:[],produtosServicos:"",condPagamento:"",limiteCredito:"",prazoEntregaDias:"",banco:"",agencia:"",conta:"",tipoConta:"",pix:"",obs:"",ativo:true});

function FormFornecedor({initial,onSave,onCancel}){
  const [f,setF]=useState(initial||EMPTY_F());
  const mob=useMobile();
  const set=(k)=>(v)=>setF(p=>({...p,[k]:v}));
  const canSave=(
    f.razaoSocial.trim()&&
    (f.tipoPessoa==="PJ"?f.cnpj.trim():f.cpf.trim())&&
    f.whatsapp.trim()&&
    f.cep.trim()&&f.logradouro.trim()&&f.cidade.trim()&&f.estado.trim()&&
    f.segmentos.length>0
  );
  const G=(cols="1fr 1fr")=>({display:"grid",gridTemplateColumns:mob?"1fr":cols,gap:"12px 14px",marginBottom:4});
  return <div>
    <SectionDivider>Identificação</SectionDivider>
    <div style={{display:"flex",gap:8,marginBottom:14}}>
      {["PJ","PF"].map(t=><button key={t} onClick={()=>set("tipoPessoa")(t)} style={{padding:"6px 18px",borderRadius:7,fontWeight:800,fontSize:12,cursor:"pointer",border:`2px solid ${f.tipoPessoa===t?C.navy:C.gray200}`,background:f.tipoPessoa===t?C.navy:C.white,color:f.tipoPessoa===t?C.white:C.gray400,transition:"all .15s"}}>{t==="PJ"?"Pessoa Jurídica":"Pessoa Física"}</button>)}
    </div>
    <div style={G("1fr 1fr")}>
      <FormField label={f.tipoPessoa==="PJ"?"Razão Social":"Nome Completo"} required><Inp value={f.razaoSocial} onChange={set("razaoSocial")} placeholder={f.tipoPessoa==="PJ"?"Razão Social Ltda.":"Nome completo"}/></FormField>
      <FormField label="Nome Fantasia"><Inp value={f.nomeFantasia} onChange={set("nomeFantasia")} placeholder="Nome fantasia"/></FormField>
      {f.tipoPessoa==="PJ"?<><FormField label="CNPJ" required><Inp value={f.cnpj} onChange={set("cnpj")} mask="cnpj" placeholder="00.000.000/0000-00"/></FormField><FormField label="Inscrição Estadual"><Inp value={f.ie} onChange={set("ie")} placeholder="Isento ou número"/></FormField><FormField label="Inscrição Municipal"><Inp value={f.im} onChange={set("im")} placeholder="Número"/></FormField></>:<FormField label="CPF" required><Inp value={f.cpf} onChange={set("cpf")} mask="cpf" placeholder="000.000.000-00"/></FormField>}
      <FormField label="Categoria"><Sel value={f.categoria} onChange={set("categoria")} options={CATEGORIAS} placeholder="Selecione..."/></FormField>
      <FormField label="Porte">
        <div style={{display:"flex",alignItems:"center",gap:16,paddingTop:8}}>
          <Toggle value={f.isMei||false} onChange={set("isMei")} label="Microempreendedor Individual (MEI)"/>
          {f.isMei&&<span style={{fontSize:11,fontWeight:800,background:"#FEF9C3",color:"#92400E",padding:"2px 10px",borderRadius:20,border:"1px solid #FDE68A"}}>MEI</span>}
        </div>
      </FormField>
    </div>
    <SectionDivider>Contato</SectionDivider>
    <div style={G("1fr 1fr")}>
      <FormField label="E-mail Principal"><Inp value={f.email} onChange={set("email")} type="email" placeholder="contato@empresa.com.br"/></FormField>
      <FormField label="E-mail Secundário"><Inp value={f.email2} onChange={set("email2")} type="email" placeholder="nfe@empresa.com.br"/></FormField>
      <FormField label="Telefone Fixo"><Inp value={f.telefone} onChange={set("telefone")} mask="tel" placeholder="(00) 0000-0000"/></FormField>
      <FormField label="Celular"><Inp value={f.celular} onChange={set("celular")} mask="tel" placeholder="(00) 00000-0000"/></FormField>
      <FormField label="WhatsApp" required><Inp value={f.whatsapp} onChange={set("whatsapp")} mask="tel" placeholder="(00) 00000-0000"/></FormField>
      <FormField label="Site"><Inp value={f.site} onChange={set("site")} placeholder="www.empresa.com.br"/></FormField>
      <FormField label="Contato Principal"><Inp value={f.contatoNome} onChange={set("contatoNome")} placeholder="Nome"/></FormField>
      <FormField label="Cargo"><Inp value={f.contatoCargo} onChange={set("contatoCargo")} placeholder="Função"/></FormField>
    </div>
    <SectionDivider>Endereço</SectionDivider>
    <div style={G("120px 1fr 70px 1fr 1fr 70px")}>
      <FormField label="CEP" required><Inp value={f.cep} onChange={set("cep")} mask="cep" placeholder="00000-000"/></FormField>
      <FormField label="Logradouro" required col="2/5"><Inp value={f.logradouro} onChange={set("logradouro")} placeholder="Rua, Av..."/></FormField>
      <FormField label="Número"><Inp value={f.numero} onChange={set("numero")}/></FormField>
      <FormField label="Complemento" col="1/3"><Inp value={f.complemento} onChange={set("complemento")} placeholder="Sala, Bloco..."/></FormField>
      <FormField label="Bairro" col="3/5"><Inp value={f.bairro} onChange={set("bairro")}/></FormField>
      <FormField label="Cidade" required col="5/7"><Inp value={f.cidade} onChange={set("cidade")}/></FormField>
      <FormField label="UF" required><Sel value={f.estado} onChange={set("estado")} options={ESTADOS} placeholder="UF"/></FormField>
    </div>
    <SectionDivider>Comercial</SectionDivider>
    <div style={G("1fr 1fr 1fr")}>
      <FormField label="Condição de Pagamento"><Sel value={f.condPagamento} onChange={set("condPagamento")} options={COND_PAGAMENTO} placeholder="Selecione..."/></FormField>
      <FormField label="Prazo de Entrega (dias)"><Inp value={f.prazoEntregaDias} onChange={set("prazoEntregaDias")} type="number" placeholder="Ex: 5"/></FormField>
      <FormField label="Limite de Crédito (R$)"><Inp value={f.limiteCredito} onChange={set("limiteCredito")} type="number" placeholder="0,00"/></FormField>
    </div>
    <SectionDivider>Dados Bancários</SectionDivider>
    <div style={G("1fr 90px 1fr 1fr")}>
      <FormField label="Banco"><Inp value={f.banco} onChange={set("banco")} placeholder="Ex: 001 – Banco do Brasil"/></FormField>
      <FormField label="Agência"><Inp value={f.agencia} onChange={set("agencia")} placeholder="0000-X"/></FormField>
      <FormField label="Conta"><Inp value={f.conta} onChange={set("conta")} placeholder="00000-X"/></FormField>
      <FormField label="Tipo de Conta"><Sel value={f.tipoConta} onChange={set("tipoConta")} options={["Corrente","Poupança","Pagamento"]} placeholder="Selecione..."/></FormField>
      <FormField label="Chave PIX" col="1/5"><Inp value={f.pix} onChange={set("pix")} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"/></FormField>
    </div>
    <SectionDivider>Segmentos, Produtos e Serviços</SectionDivider>
    <div style={{marginBottom:16}}>
      <Lbl required>Segmentos de Atuação</Lbl>
      <div style={{fontSize:12,color:C.gray400,marginBottom:12}}>Selecione todos que se aplicam — estes dados serão usados para sugerir este fornecedor nas cotações relevantes.</div>
      {Object.entries(SEGMENTOS_GRUPOS).map(([grupo,segs])=>(
        <div key={grupo} style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:800,color:C.navy,letterSpacing:0.5,marginBottom:7}}>{grupo}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {segs.map(seg=>{
              const sel=(f.segmentos||[]).includes(seg);
              return <button key={seg} type="button" onClick={()=>setF(p=>({...p,segmentos:sel?(p.segmentos||[]).filter(s=>s!==seg):[...(p.segmentos||[]),seg]}))} style={{padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:sel?800:600,cursor:"pointer",border:`1.5px solid ${sel?C.navy:C.gray200}`,background:sel?C.navy:C.white,color:sel?C.white:C.gray600,transition:"all .12s"}}>{seg}</button>;
            })}
          </div>
        </div>
      ))}
      {(f.segmentos||[]).length>0&&<div style={{background:C.blueLight,borderRadius:8,padding:"8px 12px",fontSize:12,color:C.blue,fontWeight:700}}>{(f.segmentos||[]).length} segmento{(f.segmentos||[]).length!==1?"s":""} selecionado{(f.segmentos||[]).length!==1?"s":""}: {(f.segmentos||[]).join(" · ")}</div>}
    </div>
    <div style={{marginBottom:4}}>
      <Lbl>Descrição dos Produtos / Serviços Oferecidos</Lbl>
      <Inp value={f.produtosServicos||""} onChange={set("produtosServicos")} placeholder="Descreva com detalhes os produtos e serviços que sua empresa oferece, marcas que trabalha, especializações..." rows={3}/>
    </div>
    <SectionDivider>Observações</SectionDivider>
    <Inp value={f.obs} onChange={set("obs")} placeholder="Notas internas, histórico, condições especiais..." rows={3}/>
    <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:24}}>
      <Btn onClick={onCancel} variant="ghost">Cancelar</Btn>
      <Btn onClick={()=>canSave&&onSave(f)} variant="navy" disabled={!canSave}>{initial?"Salvar Alterações":"Cadastrar Fornecedor"}</Btn>
    </div>
  </div>;
}

// ── Tela Fornecedores ────────────────────────────────────────────────────────
function TelaFornecedores({fornecedores,onAdd,onEdit,onDelete}){
  const [search,setSearch]=useState("");
  const [segFiltro,setSegFiltro]=useState("");
  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState(null);

  const filtered=fornecedores.filter(f=>{
    const matchText=[f.razaoSocial,f.nomeFantasia,f.cnpj,f.cpf,f.categoria,f.contatoNome,f.produtosServicos,...(f.segmentos||[])].some(v=>v?.toLowerCase().includes(search.toLowerCase()));
    const matchSeg=!segFiltro||(f.segmentos||[]).includes(segFiltro);
    return matchText&&matchSeg;
  });

  // Todos os segmentos únicos presentes nos fornecedores cadastrados
  const segsUsados=[...new Set(fornecedores.flatMap(f=>f.segmentos||[]))].sort();

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <div><h1 style={{margin:0,fontSize:22,fontWeight:900,color:C.navy}}>Fornecedores</h1><div style={{fontSize:13,color:C.gray400,marginTop:2}}>{fornecedores.length} cadastrado{fornecedores.length!==1?"s":""}</div></div>
      <Btn onClick={()=>{setEditing(null);setShowForm(true);}} variant="primary">＋ Novo Fornecedor</Btn>
    </div>

    {/* Busca */}
    <div style={{position:"relative",marginBottom:10}}>
      <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:C.gray400}}>🔍</span>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome, CNPJ, segmento, produto..." style={{width:"100%",border:`1.5px solid ${C.gray200}`,borderRadius:9,padding:"9px 12px 9px 36px",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor=C.amber} onBlur={e=>e.target.style.borderColor=C.gray200}/>
    </div>

    {/* Filtro por segmento */}
    {segsUsados.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
      <button onClick={()=>setSegFiltro("")} style={{padding:"4px 12px",borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",border:`1.5px solid ${!segFiltro?C.navy:C.gray200}`,background:!segFiltro?C.navy:C.white,color:!segFiltro?C.white:C.gray600}}>Todos</button>
      {segsUsados.map(s=><button key={s} onClick={()=>setSegFiltro(s===segFiltro?"":s)} style={{padding:"4px 12px",borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",border:`1.5px solid ${segFiltro===s?C.navy:C.gray200}`,background:segFiltro===s?C.navy:C.white,color:segFiltro===s?C.white:C.gray600,transition:"all .12s"}}>{s}</button>)}
    </div>}

    {filtered.length===0?<Card style={{textAlign:"center",padding:40}}><div style={{fontSize:40,marginBottom:10}}>🏭</div><div style={{fontSize:15,fontWeight:700,color:C.gray600}}>{search||segFiltro?"Nenhum resultado":"Nenhum fornecedor cadastrado"}</div>{!search&&!segFiltro&&<Btn onClick={()=>setShowForm(true)} variant="navy" size="lg" style={{marginTop:16}}>＋ Cadastrar</Btn>}</Card>:
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {filtered.map(f=><Card key={f.id} style={{padding:"14px 18px"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <span style={{fontWeight:900,fontSize:15,color:C.navy}}>{f.razaoSocial}</span>
              {f.nomeFantasia&&f.nomeFantasia!==f.razaoSocial&&<span style={{fontSize:12,color:C.gray400,fontStyle:"italic"}}>({f.nomeFantasia})</span>}
              {f.isMei&&<span style={{fontSize:11,fontWeight:800,background:"#FEF9C3",color:"#92400E",padding:"1px 8px",borderRadius:20,border:"1px solid #FDE68A"}}>MEI</span>}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"4px 16px",marginTop:5}}>
              {(f.cnpj||f.cpf)&&<span style={{fontSize:12,color:C.gray600}}>📄 {f.cnpj||f.cpf}</span>}
              {f.email&&<span style={{fontSize:12,color:C.gray600}}>✉️ {f.email}</span>}
              {(f.celular||f.whatsapp||f.telefone)&&<span style={{fontSize:12,color:C.gray600}}>📞 {f.celular||f.whatsapp||f.telefone}</span>}
              {f.contatoNome&&<span style={{fontSize:12,color:C.gray600}}>👤 {f.contatoNome}{f.contatoCargo?` · ${f.contatoCargo}`:""}</span>}
              {f.condPagamento&&<span style={{fontSize:12,color:C.gray600}}>💳 {f.condPagamento}</span>}
              {f.cidade&&<span style={{fontSize:12,color:C.gray600}}>📍 {f.cidade}{f.estado?`/${f.estado}`:""}</span>}
            </div>
            {(f.segmentos||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:8}}>
              {(f.segmentos||[]).map(s=><span key={s} style={{background:C.blueLight,color:C.blue,fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20}}>{s}</span>)}
            </div>}
            {f.produtosServicos&&<div style={{fontSize:12,color:C.gray500,marginTop:6,fontStyle:"italic"}}>"{f.produtosServicos.slice(0,120)}{f.produtosServicos.length>120?"...":""}"</div>}
          </div>
          <div style={{display:"flex",gap:6,flexShrink:0}}>
            <Btn onClick={()=>{setEditing(f);setShowForm(true);}} variant="ghost" size="sm">Editar</Btn>
            <Btn onClick={()=>onDelete(f.id)} variant="danger" size="sm">Excluir</Btn>
          </div>
        </div>
      </Card>)}
    </div>}
    {showForm&&<Modal title={editing?"Editar Fornecedor":"Cadastrar Fornecedor"} onClose={()=>setShowForm(false)} width={800}>
      <FormFornecedor initial={editing} onSave={(forn)=>{editing?onEdit(forn):onAdd(forn);setShowForm(false);setEditing(null);}} onCancel={()=>{setShowForm(false);setEditing(null);}}/>
    </Modal>}
  </div>;
}

// ── Formulário Cliente (mesmo formato do Fornecedor) ──────────────────────────
const EMPTY_CLIENTE=()=>({id:null,razaoSocial:"",nomeFantasia:"",tipoPessoa:"PJ",cnpj:"",cpf:"",ie:"",email:"",email2:"",telefone:"",celular:"",whatsapp:"",site:"",contatoNome:"",contatoCargo:"",cep:"",logradouro:"",numero:"",complemento:"",bairro:"",cidade:"",estado:"",categoria:"",condPagamento:"",obs:"",ativo:true});

function FormCliente({initial,onSave,onCancel}){
  const [f,setF]=useState(initial||EMPTY_CLIENTE());
  const mob=useMobile();
  const set=(k)=>(v)=>setF(p=>({...p,[k]:v}));
  const podeSalvar=(f.tipoPessoa==="PJ"?f.razaoSocial:f.razaoSocial||f.nomeFantasia)&&(f.tipoPessoa==="PJ"?f.cnpj:f.cpf);
  const G=(cols="1fr 1fr")=>({display:"grid",gridTemplateColumns:mob?"1fr":cols,gap:"12px 14px",marginBottom:4});
  return <div>
    <SectionDivider>Identificação</SectionDivider>
    <div style={{display:"flex",gap:8,marginBottom:14}}>
      {["PJ","PF"].map(t=><button key={t} type="button" onClick={()=>set("tipoPessoa")(t)} style={{padding:"6px 18px",borderRadius:7,fontWeight:800,fontSize:12,cursor:"pointer",border:`2px solid ${f.tipoPessoa===t?C.navy:C.gray200}`,background:f.tipoPessoa===t?C.navy:C.white,color:f.tipoPessoa===t?C.white:C.gray400}}>{t==="PJ"?"Pessoa Jurídica":"Pessoa Física"}</button>)}
    </div>
    <div style={G("1fr 1fr")}>
      <FormField label={f.tipoPessoa==="PJ"?"Razão Social":"Nome Completo"} required><Inp value={f.razaoSocial} onChange={set("razaoSocial")} placeholder={f.tipoPessoa==="PJ"?"Razão Social Ltda.":"Nome completo"}/></FormField>
      <FormField label="Nome Fantasia / Apelido"><Inp value={f.nomeFantasia} onChange={set("nomeFantasia")} placeholder="Ex: Condomínio Wonder"/></FormField>
      {f.tipoPessoa==="PJ"?<><FormField label="CNPJ" required><Inp value={f.cnpj} onChange={set("cnpj")} mask="cnpj" placeholder="00.000.000/0000-00"/></FormField><FormField label="Inscrição Estadual"><Inp value={f.ie} onChange={set("ie")} placeholder="Isento ou número"/></FormField></>:<FormField label="CPF" required><Inp value={f.cpf} onChange={set("cpf")} mask="cpf" placeholder="000.000.000-00"/></FormField>}
      <FormField label="Categoria"><Sel value={f.categoria} onChange={set("categoria")} options={CATEGORIAS_CLIENTE} placeholder="Selecione..."/></FormField>
    </div>
    <SectionDivider>Contato</SectionDivider>
    <div style={G("1fr 1fr")}>
      <FormField label="E-mail Principal"><Inp value={f.email} onChange={set("email")} type="email" placeholder="contato@empresa.com.br"/></FormField>
      <FormField label="E-mail Secundário"><Inp value={f.email2} onChange={set("email2")} type="email"/></FormField>
      <FormField label="Telefone Fixo"><Inp value={f.telefone} onChange={set("telefone")} mask="tel" placeholder="(00) 0000-0000"/></FormField>
      <FormField label="Celular"><Inp value={f.celular} onChange={set("celular")} mask="tel" placeholder="(00) 00000-0000"/></FormField>
      <FormField label="WhatsApp"><Inp value={f.whatsapp} onChange={set("whatsapp")} mask="tel"/></FormField>
      <FormField label="Site"><Inp value={f.site} onChange={set("site")}/></FormField>
      <FormField label="Nome do Responsável / Síndico"><Inp value={f.contatoNome} onChange={set("contatoNome")}/></FormField>
      <FormField label="Cargo / Função"><Inp value={f.contatoCargo} onChange={set("contatoCargo")} placeholder="Ex: Síndico, Gerente..."/></FormField>
    </div>
    <SectionDivider>Endereço</SectionDivider>
    <div style={G("120px 1fr 70px 1fr 1fr 70px")}>
      <FormField label="CEP"><Inp value={f.cep} onChange={set("cep")} mask="cep" placeholder="00000-000"/></FormField>
      <FormField label="Logradouro" col="2/5"><Inp value={f.logradouro} onChange={set("logradouro")}/></FormField>
      <FormField label="Número"><Inp value={f.numero} onChange={set("numero")}/></FormField>
      <FormField label="Complemento" col="1/3"><Inp value={f.complemento} onChange={set("complemento")} placeholder="Bloco, Torre..."/></FormField>
      <FormField label="Bairro" col="3/5"><Inp value={f.bairro} onChange={set("bairro")}/></FormField>
      <FormField label="Cidade" col="5/7"><Inp value={f.cidade} onChange={set("cidade")}/></FormField>
      <FormField label="UF"><Sel value={f.estado} onChange={set("estado")} options={ESTADOS} placeholder="UF"/></FormField>
    </div>
    <SectionDivider>Comercial</SectionDivider>
    <div style={G("1fr 1fr")}>
      <div><Lbl>Condição de Pagamento</Lbl><Sel value={f.condPagamento} onChange={set("condPagamento")} options={COND_PAGAMENTO} placeholder="Selecione..."/></div>
    </div>
    <SectionDivider>Observações</SectionDivider>
    <Inp value={f.obs} onChange={set("obs")} placeholder="Notas internas, histórico..." rows={3}/>
    <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:24}}>
      <Btn onClick={onCancel} variant="ghost">Cancelar</Btn>
      <Btn onClick={()=>podeSalvar&&onSave(f)} variant="navy" disabled={!podeSalvar}>{initial?"Salvar Alterações":"Cadastrar Cliente"}</Btn>
    </div>
  </div>;
}

function TelaClientes({clientes,onAdd,onEdit,onDelete}){
  const [search,setSearch]=useState("");
  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState(null);
  const filtered=clientes.filter(c=>[c.razaoSocial,c.nomeFantasia,c.cnpj,c.cpf,c.categoria,c.contatoNome,c.cidade].some(v=>v?.toLowerCase().includes(search.toLowerCase())));
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <div><h1 style={{margin:0,fontSize:22,fontWeight:900,color:C.navy}}>Clientes</h1><div style={{fontSize:13,color:C.gray400,marginTop:2}}>{clientes.length} cadastrado{clientes.length!==1?"s":""}</div></div>
      <Btn onClick={()=>{setEditing(null);setShowForm(true);}} variant="primary">＋ Novo Cliente</Btn>
    </div>
    <div style={{position:"relative",marginBottom:14}}>
      <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:C.gray400}}>🔍</span>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome, CNPJ, categoria, cidade..." style={{width:"100%",border:`1.5px solid ${C.gray200}`,borderRadius:9,padding:"9px 12px 9px 36px",fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor=C.amber} onBlur={e=>e.target.style.borderColor=C.gray200}/>
    </div>
    {filtered.length===0?<Card style={{textAlign:"center",padding:44}}>
      <div style={{fontSize:40,marginBottom:10}}>🏢</div>
      <div style={{fontSize:15,fontWeight:700,color:C.gray600}}>{search?"Nenhum resultado":"Nenhum cliente cadastrado"}</div>
      {!search&&<Btn onClick={()=>setShowForm(true)} variant="navy" size="lg" style={{marginTop:18}}>＋ Cadastrar Cliente</Btn>}
    </Card>:
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {filtered.map(c=><Card key={c.id} style={{padding:"14px 18px"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <span style={{fontWeight:900,fontSize:15,color:C.navy}}>{c.razaoSocial}</span>
              {c.nomeFantasia&&c.nomeFantasia!==c.razaoSocial&&<span style={{fontSize:12,color:C.gray400,fontStyle:"italic"}}>({c.nomeFantasia})</span>}
              {c.categoria&&<span style={{background:"#FEF9C3",color:"#92400E",fontSize:11,fontWeight:700,padding:"1px 8px",borderRadius:20,border:"1px solid #FDE68A"}}>{c.categoria}</span>}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"4px 16px",marginTop:5}}>
              {(c.cnpj||c.cpf)&&<span style={{fontSize:12,color:C.gray600}}>📄 {c.cnpj||c.cpf}</span>}
              {c.email&&<span style={{fontSize:12,color:C.gray600}}>✉️ {c.email}</span>}
              {(c.celular||c.whatsapp||c.telefone)&&<span style={{fontSize:12,color:C.gray600}}>📞 {c.celular||c.whatsapp||c.telefone}</span>}
              {c.contatoNome&&<span style={{fontSize:12,color:C.gray600}}>👤 {c.contatoNome}{c.contatoCargo?` · ${c.contatoCargo}`:""}</span>}
              {c.cidade&&<span style={{fontSize:12,color:C.gray600}}>📍 {c.cidade}{c.estado?`/${c.estado}`:""}</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:6,flexShrink:0}}>
            <Btn onClick={()=>{setEditing(c);setShowForm(true);}} variant="ghost" size="sm">Editar</Btn>
            <Btn onClick={()=>onDelete(c.id)} variant="danger" size="sm">Excluir</Btn>
          </div>
        </div>
      </Card>)}
    </div>}
    {showForm&&<Modal title={editing?"Editar Cliente":"Cadastrar Cliente"} onClose={()=>setShowForm(false)} width={800}>
      <FormCliente initial={editing} onSave={(cli)=>{editing?onEdit(cli):onAdd(cli);setShowForm(false);setEditing(null);}} onCancel={()=>{setShowForm(false);setEditing(null);}}/>
    </Modal>}
  </div>;
}

// ── Modal Nova Cotação ───────────────────────────────────────────────────────
// ── Classificação Fields (reutilizável) ──────────────────────────────────────
// Exibe o path completo de um item do plano de contas pelo id
function PlanoContasLabel({id}){
  const [label,setLabel]=useState(id||"—");
  useEffect(()=>{if(!id){setLabel("—");return;}loadPlanoContas().then(lista=>{const item=lista.find(i=>i.id===id);setLabel(item?getPath(lista,item):id);});},[id]);
  return <div style={{fontSize:13,fontWeight:700,color:C.gray800}}>{label}</div>;
}

function ClassificacaoFields({centrosCusto,onCentrosCusto,classificacao,onClassificacao,planoContas,onPlanoContas,urgente,onUrgente,necessario,onNecessario}){
  const mob=useMobile();
  const [contas,setContas]=useState([]);
  const [searchPC,setSearchPC]=useState("");
  const [showPC,setShowPC]=useState(false);
  useEffect(()=>{loadPlanoContas().then(setContas);},[]);

  return <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:4}}>
    {/* Centro de Custo — toggle visual */}
    <div>
      <Lbl>Tipo de Despesa</Lbl>
      <div style={{display:"flex",gap:8,marginTop:4}}>
        {TIPOS_CUSTO.map(t=>{
          const sel=centrosCusto===t;
          const isOrd=t==="Ordinária";
          const color=isOrd?C.navy:"#7C3AED";
          const bg=isOrd?"#EEF1FB":"#F5F3FF";
          return <button key={t} type="button" onClick={()=>onCentrosCusto(t)} style={{
            flex:1,padding:"10px 12px",borderRadius:9,fontWeight:800,fontSize:13,cursor:"pointer",
            border:`2px solid ${sel?color:C.gray200}`,background:sel?bg:C.white,
            color:sel?color:C.gray400,transition:"all .15s",textAlign:"center"
          }}>
            <div style={{fontSize:16,marginBottom:2}}>{isOrd?"📅":"⚡"}</div>
            <div>{t}</div>
            <div style={{fontSize:10,fontWeight:600,color:sel?color:C.gray400,marginTop:1}}>
              {isOrd?"Despesas recorrentes":"Despesas eventuais"}
            </div>
          </button>;
        })}
      </div>
    </div>

    {/* Plano de Contas — seletor hierárquico */}
    <div style={{position:"relative"}}>
      <Lbl>Plano de Contas</Lbl>
      <div onClick={()=>setShowPC(v=>!v)} style={{
        width:"100%",border:`1.5px solid ${showPC?C.amber:C.gray200}`,borderRadius:8,
        padding:"9px 12px",fontSize:13,cursor:"pointer",background:C.white,
        display:"flex",alignItems:"center",justifyContent:"space-between",
        color:C.gray800,userSelect:"none",boxSizing:"border-box"
      }}>
        <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:planoContas?C.gray800:C.gray400}}>
          {planoContas
            ? (()=>{const item=contas.find(i=>i.id===planoContas);return item?getPath(contas,item):"—";})()
            : "Selecione a conta..."}
        </span>
        <span style={{fontSize:11,color:C.gray400,flexShrink:0,marginLeft:8}}>{showPC?"▲":"▼"}</span>
      </div>
      {showPC&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:C.white,border:`1.5px solid ${C.amber}`,borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,.12)",zIndex:50,overflow:"hidden"}}>
          <div style={{padding:"8px 10px",borderBottom:`1px solid ${C.gray200}`}}>
            <input autoFocus value={searchPC} onChange={e=>setSearchPC(e.target.value)} placeholder="Buscar conta..."
              style={{width:"100%",border:"none",outline:"none",fontSize:13,fontFamily:"inherit"}}/>
          </div>
          <div style={{maxHeight:260,overflowY:"auto"}}>
            {contas.length===0&&<div style={{padding:"14px",textAlign:"center",fontSize:13,color:C.gray400}}>Nenhuma conta cadastrada no plano</div>}
            {getContas(contas).filter(c=>{
              if(!searchPC)return true;
              const sub=getSubcontas(contas,c.id);
              const vars=sub.flatMap(s=>getVariacoes(contas,s.id));
              return [c,...sub,...vars].some(i=>i.descricao.toLowerCase().includes(searchPC.toLowerCase())||(i.codigo||"").includes(searchPC));
            }).map(conta=>{
              const subs=getSubcontas(contas,conta.id).filter(s=>{
                if(!searchPC)return true;
                const vars=getVariacoes(contas,s.id);
                return s.descricao.toLowerCase().includes(searchPC.toLowerCase())||(s.codigo||"").includes(searchPC)||vars.some(v=>v.descricao.toLowerCase().includes(searchPC.toLowerCase()));
              });
              return(
                <div key={conta.id}>
                  {/* Conta — header não selecionável */}
                  <div style={{padding:"7px 14px 4px",fontSize:10,fontWeight:900,color:C.navy,letterSpacing:0.6,background:"#EEF1FB",borderTop:`1px solid ${C.gray200}`}}>
                    {conta.codigo&&<span style={{fontFamily:"monospace",marginRight:6,opacity:.7}}>{conta.codigo}</span>}{conta.descricao.toUpperCase()}
                  </div>
                  {subs.map(sub=>{
                    const vars=getVariacoes(contas,sub.id).filter(v=>!searchPC||v.descricao.toLowerCase().includes(searchPC.toLowerCase())||(v.codigo||"").includes(searchPC));
                    return(
                      <div key={sub.id}>
                        {/* Subconta — selecionável */}
                        <div onClick={()=>{onPlanoContas(sub.id);setShowPC(false);setSearchPC("");}} style={{padding:"8px 14px 8px 22px",cursor:"pointer",fontSize:13,background:planoContas===sub.id?"#DBEAFE":C.white,color:planoContas===sub.id?C.blue:C.gray700,fontWeight:planoContas===sub.id?800:500,borderBottom:`1px solid ${C.gray100}`,display:"flex",alignItems:"center",gap:6}}
                          onMouseEnter={e=>{if(planoContas!==sub.id)e.currentTarget.style.background=C.gray50;}}
                          onMouseLeave={e=>{if(planoContas!==sub.id)e.currentTarget.style.background=C.white;}}>
                          {sub.codigo&&<span style={{fontFamily:"monospace",fontSize:11,color:NIVEL[2].color,fontWeight:700,flexShrink:0}}>{sub.codigo}</span>}
                          {sub.descricao}
                          {planoContas===sub.id&&<span style={{marginLeft:"auto",color:C.blue,fontSize:14}}>✓</span>}
                        </div>
                        {/* Variações — selecionáveis com indent */}
                        {vars.map(v=>(
                          <div key={v.id} onClick={()=>{onPlanoContas(v.id);setShowPC(false);setSearchPC("");}} style={{padding:"7px 14px 7px 38px",cursor:"pointer",fontSize:12,background:planoContas===v.id?"#EDE9FE":C.white,color:planoContas===v.id?"#6D28D9":C.gray600,fontWeight:planoContas===v.id?700:400,borderBottom:`1px solid ${C.gray100}`,display:"flex",alignItems:"center",gap:6}}
                            onMouseEnter={e=>{if(planoContas!==v.id)e.currentTarget.style.background=C.gray50;}}
                            onMouseLeave={e=>{if(planoContas!==v.id)e.currentTarget.style.background=C.white;}}>
                            <span style={{color:"#6D28D9",fontSize:10,flexShrink:0}}>◇</span>
                            {v.codigo&&<span style={{fontFamily:"monospace",fontSize:10,color:"#6D28D9",fontWeight:700}}>{v.codigo}</span>}
                            {v.descricao}
                            {planoContas===v.id&&<span style={{marginLeft:"auto",color:"#6D28D9",fontSize:14}}>✓</span>}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {subs.length===0&&!searchPC&&<div style={{padding:"6px 22px",fontSize:12,color:C.gray300,fontStyle:"italic"}}>Sem subcontas</div>}
                </div>
              );
            })}
          </div>
          {planoContas&&<div onClick={()=>{onPlanoContas("");setShowPC(false);}} style={{padding:"8px 14px",fontSize:12,color:C.red,cursor:"pointer",borderTop:`1px solid ${C.gray200}`,fontWeight:700}}>✕ Limpar seleção</div>}
        </div>
      )}
    </div>

    {/* Classificação + toggles */}
    <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:"12px 14px"}}>
      <div><Lbl>Classificação</Lbl><Sel value={classificacao} onChange={onClassificacao} options={CLASSIFICACOES} placeholder="Selecione..."/></div>
      <div style={{display:"flex",alignItems:"flex-end",gap:20,paddingBottom:4}}>
        <Toggle value={urgente} onChange={onUrgente} label="Urgente"/>
        <Toggle value={necessario} onChange={onNecessario} label="Necessário"/>
      </div>
    </div>
  </div>;
}

// ── Tela Plano de Contas (admin) ──────────────────────────────────────────────
function TelaPlanoContas({onBack}){
  const mob=useMobile();
  const [lista,setLista]=useState([]);
  const [expandidos,setExpandidos]=useState({});
  const [modal,setModal]=useState(null); // {modo:'add'|'edit', nivel, parentId, item}
  const [fDescricao,setFDescricao]=useState("");
  const [fCodigo,setFCodigo]=useState("");
  const [erro,setErro]=useState("");

  const reload=async()=>{
    const d=await loadPlanoContas();setLista(d);
    const exp={};d.filter(i=>i.nivel===1).forEach(i=>{exp[i.id]=true;});setExpandidos(exp);
  };
  useEffect(()=>{reload();},[]);

  const toggleExpand=(id)=>setExpandidos(p=>({...p,[id]:!p[id]}));

  const openAdd=(nivel,parentId)=>{
    setFDescricao("");setFCodigo("");setErro("");
    setModal({modo:"add",nivel,parentId});
  };
  const openEdit=(item)=>{
    setFDescricao(item.descricao);setFCodigo(item.codigo||"");setErro("");
    setModal({modo:"edit",nivel:item.nivel,parentId:item.parentId,item});
  };

  const handleSave=async()=>{
    if(!fDescricao.trim()){setErro("Descrição obrigatória.");return;}
    if(modal.modo==="add"){
      await planoContasApi.create({codigo:fCodigo.trim(),descricao:fDescricao.trim(),nivel:modal.nivel,parentId:modal.parentId||null});
      if(modal.parentId) setExpandidos(p=>({...p,[modal.parentId]:true}));
    } else {
      await planoContasApi.update(modal.item.id,{codigo:fCodigo.trim(),descricao:fDescricao.trim()});
    }
    await reload();
    setModal(null);
  };

  const handleDelete=async(item)=>{
    const filhos=temFilhos(lista,item.id);
    const msg=filhos
      ?`Excluir "${item.descricao}" e todos os itens filhos?`
      :`Excluir "${item.descricao}"?`;
    if(!window.confirm(msg))return;
    // ON DELETE CASCADE no banco já remove os filhos automaticamente.
    await planoContasApi.delete(item.id);
    await reload();
  };

  const resetTudo=async()=>{
    if(window.confirm("Apagar TODOS os itens do plano de contas? Esta ação não pode ser desfeita.")){
      await planoContasApi.resetAll();
      await reload();
    }
  };

  const contas=getContas(lista);
  const totalItens=lista.length;

  // Legenda de níveis
  const nLegenda=Object.entries(NIVEL).map(([n,v])=>(
    <div key={n} style={{display:"flex",alignItems:"center",gap:6,background:v.bg,border:`1px solid ${v.color}30`,borderRadius:20,padding:"3px 10px"}}>
      <div style={{width:7,height:7,borderRadius:"50%",background:v.color}}/>
      <span style={{fontSize:11,fontWeight:700,color:v.color}}>Nível {n} — {v.label}</span>
    </div>
  ));

  return <div>
    {/* Header */}
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:20,flexWrap:"wrap"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:C.navy,fontWeight:700,fontSize:13,padding:0,flexShrink:0}}>←</button>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:900,color:C.navy}}>Plano de Contas</h1>
          <div style={{fontSize:13,color:C.gray400,marginTop:2}}>{contas.length} conta{contas.length!==1?"s":""} · {totalItens} ite{totalItens!==1?"ns":"m"} no total</div>
        </div>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <Btn onClick={resetTudo} variant="danger" size="sm">🗑 Limpar Tudo</Btn>
        <Btn onClick={()=>openAdd(1,null)} variant="primary">＋ Nova Conta</Btn>
      </div>
    </div>

    {/* Legenda */}
    <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>{nLegenda}</div>

    {/* Árvore */}
    {contas.length===0?(
      <Card style={{textAlign:"center",padding:48}}>
        <div style={{fontSize:40,marginBottom:12}}>📒</div>
        <div style={{fontSize:16,fontWeight:800,color:C.gray600,marginBottom:6}}>Nenhuma conta cadastrada</div>
        <div style={{fontSize:13,color:C.gray400,marginBottom:20}}>Comece criando as contas principais (Nível 1)</div>
        <Btn onClick={()=>openAdd(1,null)} variant="navy" size="lg">＋ Criar Primeira Conta</Btn>
      </Card>
    ):(
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {contas.map(conta=>{
          const subcontas=getSubcontas(lista,conta.id);
          const exp=expandidos[conta.id];
          return(
            <Card key={conta.id} style={{padding:0,overflow:"hidden"}}>
              {/* Conta (nível 1) */}
              <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
                <button onClick={()=>toggleExpand(conta.id)} style={{background:"rgba(255,255,255,.15)",border:"none",color:C.white,borderRadius:6,width:26,height:26,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {exp?"▾":"▸"}
                </button>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {conta.codigo&&<span style={{fontFamily:"monospace",fontSize:12,fontWeight:800,color:C.amberLight,background:"rgba(255,255,255,.1)",padding:"1px 8px",borderRadius:4}}>{conta.codigo}</span>}
                    <span style={{fontWeight:900,fontSize:15,color:C.white}}>{conta.descricao}</span>
                  </div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.45)",marginTop:2}}>
                    {subcontas.length} subconta{subcontas.length!==1?"s":""}
                  </div>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>openAdd(2,conta.id)} style={{background:"rgba(255,255,255,.15)",border:"none",color:C.white,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>＋ Subconta</button>
                  <button onClick={()=>openEdit(conta)} style={{background:"rgba(255,255,255,.1)",border:"none",color:C.white,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:12}}>✏</button>
                  <button onClick={()=>handleDelete(conta)} style={{background:"rgba(220,38,38,.3)",border:"none",color:C.white,borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:12}}>🗑</button>
                </div>
              </div>

              {/* Subcontas (nível 2) */}
              {exp&&(
                <div style={{padding:"8px 12px 12px",display:"flex",flexDirection:"column",gap:6}}>
                  {subcontas.length===0&&(
                    <div style={{padding:"10px 12px",textAlign:"center",color:C.gray400,fontSize:12,borderRadius:7,border:`1px dashed ${C.gray200}`}}>
                      Nenhuma subconta · <button onClick={()=>openAdd(2,conta.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.navy,fontWeight:700,fontSize:12}}>Adicionar</button>
                    </div>
                  )}
                  {subcontas.map(sub=>{
                    const vars=getVariacoes(lista,sub.id);
                    const expSub=expandidos[sub.id];
                    return(
                      <div key={sub.id} style={{marginLeft:16}}>
                        {/* Subconta */}
                        <div style={{background:NIVEL[2].bg,border:`1px solid ${NIVEL[2].color}30`,borderRadius:8,padding:"9px 12px",display:"flex",alignItems:"center",gap:8}}>
                          <button onClick={()=>toggleExpand(sub.id)} style={{background:"transparent",border:"none",cursor:"pointer",color:NIVEL[2].color,fontSize:13,width:20,flexShrink:0}}>
                            {vars.length>0?(expSub?"▾":"▸"):"·"}
                          </button>
                          <div style={{flex:1}}>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              {sub.codigo&&<span style={{fontFamily:"monospace",fontSize:11,fontWeight:800,color:NIVEL[2].color}}>{sub.codigo}</span>}
                              <span style={{fontWeight:700,fontSize:13,color:C.gray800}}>{sub.descricao}</span>
                            </div>
                            {vars.length>0&&<div style={{fontSize:10,color:C.gray400,marginTop:1}}>{vars.length} variação{vars.length!==1?"ões":""}</div>}
                          </div>
                          <div style={{display:"flex",gap:4}}>
                            <button onClick={()=>openAdd(3,sub.id)} style={{background:"transparent",border:`1px solid ${NIVEL[2].color}40`,color:NIVEL[2].color,borderRadius:5,padding:"3px 8px",cursor:"pointer",fontSize:10,fontWeight:700}}>＋ Variação</button>
                            <button onClick={()=>openEdit(sub)} style={{background:"transparent",border:"none",color:C.gray400,borderRadius:5,padding:"3px 6px",cursor:"pointer",fontSize:12}}>✏</button>
                            <button onClick={()=>handleDelete(sub)} style={{background:"transparent",border:"none",color:C.gray400,borderRadius:5,padding:"3px 6px",cursor:"pointer",fontSize:12}}>🗑</button>
                          </div>
                        </div>

                        {/* Variações (nível 3) */}
                        {expSub&&vars.length>0&&(
                          <div style={{marginLeft:20,marginTop:4,display:"flex",flexDirection:"column",gap:4}}>
                            {vars.map(v=>(
                              <div key={v.id} style={{background:NIVEL[3].bg,border:`1px solid ${NIVEL[3].color}30`,borderRadius:7,padding:"7px 12px",display:"flex",alignItems:"center",gap:8}}>
                                <span style={{color:NIVEL[3].color,fontSize:12,flexShrink:0}}>◇</span>
                                <div style={{flex:1}}>
                                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                                    {v.codigo&&<span style={{fontFamily:"monospace",fontSize:11,fontWeight:800,color:NIVEL[3].color}}>{v.codigo}</span>}
                                    <span style={{fontSize:13,color:C.gray700,fontWeight:600}}>{v.descricao}</span>
                                  </div>
                                </div>
                                <div style={{display:"flex",gap:4}}>
                                  <button onClick={()=>openEdit(v)} style={{background:"transparent",border:"none",color:C.gray400,borderRadius:5,padding:"3px 6px",cursor:"pointer",fontSize:12}}>✏</button>
                                  <button onClick={()=>handleDelete(v)} style={{background:"transparent",border:"none",color:C.gray400,borderRadius:5,padding:"3px 6px",cursor:"pointer",fontSize:12}}>🗑</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    )}

    {/* Modal adicionar/editar */}
    {modal&&(
      <Modal title={modal.modo==="add"?`Adicionar ${NIVEL[modal.nivel].label}`:
                    `Editar ${NIVEL[modal.nivel].nivel}`}
             onClose={()=>setModal(null)} width={420}>
        <div style={{marginBottom:8}}>
          <span style={{background:NIVEL[modal.nivel].bg,color:NIVEL[modal.nivel].color,fontSize:12,fontWeight:800,padding:"3px 12px",borderRadius:20,border:`1px solid ${NIVEL[modal.nivel].color}40`}}>
            Nível {modal.nivel} — {NIVEL[modal.nivel].label}
          </span>
        </div>
        {modal.nivel>1&&modal.modo==="add"&&(
          <div style={{background:C.gray50,borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:C.gray600}}>
            Dentro de: <strong style={{color:C.navy}}>{lista.find(i=>i.id===modal.parentId)?.descricao||""}</strong>
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:14,marginTop:12}}>
          <div>
            <Lbl>Código <span style={{fontWeight:400,color:C.gray400}}>(opcional — ex: 1, 1.1, 1.1.2)</span></Lbl>
            <Inp value={fCodigo} onChange={setFCodigo} placeholder={modal.nivel===1?"Ex: 1":modal.nivel===2?"Ex: 1.1":"Ex: 1.1.1"}/>
          </div>
          <div>
            <Lbl required>Descrição</Lbl>
            <Inp value={fDescricao} onChange={setFDescricao} placeholder={
              modal.nivel===1?"Ex: Manutenção, Contratos, Consumo...":
              modal.nivel===2?"Ex: Manutenção Elétrica, Limpeza...":
              "Ex: Energia Áreas Comuns, Água Irrigação..."}/>
          </div>
        </div>
        {erro&&<div style={{fontSize:12,color:C.red,fontWeight:600,marginTop:10,padding:"8px 12px",background:C.redLight,borderRadius:7}}>{erro}</div>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:22}}>
          <Btn onClick={()=>setModal(null)} variant="ghost">Cancelar</Btn>
          <Btn onClick={handleSave} variant="navy">{modal.modo==="add"?"Adicionar":"Salvar"}</Btn>
        </div>
      </Modal>
    )}
  </div>;
}

const EMPTY_COT=()=>({
  titulo:"",clienteId:"",
  descricaoAquisicao:"",justificativa:"",centrosCusto:"Ordinária",classificacao:"",planoContas:"",
  urgente:false,necessario:true,responsavel:"",aprovador:"",
  status:"aberta",
  itens:[{id:uid(),descricao:"",unidade:"un",quantidade:1}],
  fornecedores:[],propostas:[],condicoesFornecedor:[],
});

function ModalNovaCotacao({onClose,onSave,fornecedores,clientes}){
  const [c,setC]=useState(EMPTY_COT());
  const set=(k)=>(v)=>setC(p=>({...p,[k]:v}));
  const setItem=(id,k,v)=>setC(p=>({...p,itens:p.itens.map(i=>i.id===id?{...i,[k]:v}:i)}));
  const addItem=()=>setC(p=>({...p,itens:[...p.itens,{id:uid(),descricao:"",unidade:"un",quantidade:1}]}));
  const removeItem=(id)=>setC(p=>({...p,itens:p.itens.filter(i=>i.id!==id)}));
  const [fornSel,setFornSel]=useState([]);
  const toggleF=(id)=>setFornSel(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const canSave=c.titulo.trim()&&c.itens.some(i=>i.descricao.trim());
  const handleSave=(comoRascunho=false)=>{
    const fSel=fornecedores.filter(f=>fornSel.includes(f.id));
    onSave({...c,titulo:c.titulo.trim(),itens:c.itens.filter(i=>i.descricao.trim()),fornecedores:fSel,
      status:comoRascunho?"rascunho":(fSel.length?"cotando":"aberta")});
  };
  return <Modal title="Nova Cotação de Compra" onClose={onClose} width={700}>
    <SectionDivider>Identificação do Pedido</SectionDivider>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px 14px",marginBottom:4}}>
      <div><Lbl required>Responsável pelo Pedido</Lbl><Inp value={c.responsavel} onChange={set("responsavel")} placeholder="Nome completo"/></div>
      <div><Lbl>Aprovador</Lbl><Inp value={c.aprovador} onChange={set("aprovador")} placeholder="Ex: Katia Macedo"/></div>
    </div>
    <div style={{marginTop:12}}>
      <Lbl>Cliente / Condomínio</Lbl>
      <select value={c.clienteId||""} onChange={e=>set("clienteId")(e.target.value)} style={{width:"100%",border:`1.5px solid ${C.gray200}`,borderRadius:8,padding:"9px 12px",fontSize:14,fontFamily:"inherit",color:c.clienteId?C.gray800:C.gray400,background:C.white,outline:"none",cursor:"pointer",boxSizing:"border-box"}}>
        <option value="">Selecione o cliente...</option>
        {(clientes||[]).map(cl=><option key={cl.id} value={cl.id}>{cl.nomeFantasia||cl.razaoSocial}</option>)}
      </select>
    </div>
    <SectionDivider>Objeto da Cotação</SectionDivider>
    <div style={{marginBottom:12}}><Lbl required>Título</Lbl><Inp value={c.titulo} onChange={set("titulo")} placeholder="Resumo em uma linha – Ex: Lixeira 120L Pedal Preto"/></div>
    <div style={{marginBottom:12}}><Lbl required>Descrição da Aquisição</Lbl><Inp value={c.descricaoAquisicao} onChange={set("descricaoAquisicao")} placeholder="Descreva o que será adquirido, onde será utilizado..." rows={3}/></div>
    <div style={{marginBottom:4}}><Lbl>Justificativa</Lbl><Inp value={c.justificativa} onChange={set("justificativa")} placeholder="Por que esta aquisição é necessária? Qual a situação atual?" rows={3}/></div>
    <SectionDivider>Classificação</SectionDivider>
    <ClassificacaoFields
      centrosCusto={c.centrosCusto} onCentrosCusto={set("centrosCusto")}
      classificacao={c.classificacao} onClassificacao={set("classificacao")}
      planoContas={c.planoContas} onPlanoContas={set("planoContas")}
      urgente={c.urgente} onUrgente={set("urgente")}
      necessario={c.necessario} onNecessario={set("necessario")}
    />
    <SectionDivider>Itens para Cotar</SectionDivider>
    <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:8}}>
      {c.itens.map((item,idx)=><div key={item.id} style={{display:"grid",gridTemplateColumns:"1fr 70px 80px 28px",gap:8,alignItems:"end"}}>
        {idx===0&&<><div style={{gridColumn:1}}><Lbl>Descrição do Item *</Lbl></div><div><Lbl>Unidade</Lbl></div><div><Lbl>Qtd</Lbl></div><div/></>}
        <Inp value={item.descricao} onChange={v=>setItem(item.id,"descricao",v)} placeholder="Descrição"/>
        <Inp value={item.unidade} onChange={v=>setItem(item.id,"unidade",v)} placeholder="un"/>
        <Inp value={item.quantidade} onChange={v=>setItem(item.id,"quantidade",v)} type="number"/>
        {c.itens.length>1?<button onClick={()=>removeItem(item.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.red,fontSize:16,padding:"6px 0"}}>✕</button>:<div/>}
      </div>)}
    </div>
    <Btn onClick={addItem} variant="light" size="sm">＋ Item</Btn>
    {fornecedores.filter(f=>f.ativo!==false).length>0&&<>
      <SectionDivider>Vincular Fornecedores (opcional)</SectionDivider>
      <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
        {fornecedores.filter(f=>f.ativo!==false).map(f=>{const sel=fornSel.includes(f.id);return <button key={f.id} onClick={()=>toggleF(f.id)} style={{padding:"5px 13px",borderRadius:7,fontWeight:700,fontSize:12,cursor:"pointer",border:`2px solid ${sel?C.navy:C.gray200}`,background:sel?C.navy:C.white,color:sel?C.white:C.gray600,transition:"all .15s"}}>{f.nomeFantasia||f.razaoSocial}</button>;})}
      </div>
    </>}
    <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:24}}>
      <Btn onClick={onClose} variant="ghost">Cancelar</Btn>
      <Btn onClick={()=>handleSave(true)} variant="light" disabled={!canSave}>💾 Rascunho</Btn>
      <Btn onClick={()=>handleSave(false)} variant="navy" disabled={!canSave}>Criar Cotação</Btn>
    </div>
  </Modal>;
}

// ── Dashboard ────────────────────────────────────────────────────────────────
const DEMO_COTACAO={
  id:"__demo__",numeroPedido:"PC001_2026",titulo:"Lixeira 120L Plástico Pedal Preto",
  dataCriacao:"21/05/2026",responsavel:"Rodrigo Alves",aprovador:"Katia Macedo",
  descricaoAquisicao:"Aquisição de uma lixeira 120 litros plástico pedal preto para utilizar na churrasqueira a carvão — área comum do Condomínio Wonder Cidade Jardim.",
  justificativa:"A lixeira que estava na churrasqueira está danificada e necessita ser substituída para manter a organização e higiene da área comum.",
  centrosCusto:"Ordinária",planoContas:"3.1.01",classificacao:"Manutenção Itens em Geral",
  urgente:false,necessario:true,status:"fechada",
  itens:[
    {id:"i1",descricao:"Lixeira 120L Plástico Pedal Preto",unidade:"Peça",quantidade:1},
    {id:"i2",descricao:"Frete",unidade:"Un",quantidade:1},
  ],
  fornecedores:[
    {id:"f1",razaoSocial:"Dutra Máquinas",nomeFantasia:"Dutra Máquinas",cnpj:"50.970.342/0001-02",celular:"(11) 2795-8830",email:""},
    {id:"f2",razaoSocial:"Mercado Livre S.A.",nomeFantasia:"Mercado Livre",cnpj:"03.007.331/0001-41",celular:"0800 637 7246",email:""},
    {id:"f3",razaoSocial:"Shopee Brasil",nomeFantasia:"Shopee",cnpj:"35.635.824/0001-12",celular:"0800 887 1551",email:""},
  ],
  propostas:[
    {fornecedorId:"f1",itemId:"i1",preco:223.16},
    {fornecedorId:"f1",itemId:"i2",preco:131.47},
    {fornecedorId:"f2",itemId:"i1",preco:346.00},
    {fornecedorId:"f3",itemId:"i1",preco:189.05},
    {fornecedorId:"f3",itemId:"i2",preco:9.62},
  ],
  condicoesFornecedor:[
    {fornecedorId:"f1",entrega:"3 dias",garantia:"6 meses",pagamento:"30 dias",obs:""},
    {fornecedorId:"f2",entrega:"5 dias",garantia:"1 ano",pagamento:"À vista",obs:"Frete grátis acima R$200"},
    {fornecedorId:"f3",entrega:"7 dias",garantia:"1 ano",pagamento:"À vista",obs:""},
  ],
};

function Dashboard({cotacoes,fornecedores,onCreate,onOpen,onDelete}){
  const {user}=useAuth();
  const mob=useMobile();
  const [showDemo,setShowDemo]=useState(false);
  const [search,setSearch]=useState("");
  const [filtroStatus,setFiltroStatus]=useState("todos");

  const st={total:cotacoes.length,rascunhos:cotacoes.filter(c=>c.status==="rascunho").length,abertas:cotacoes.filter(c=>c.status==="aberta").length,cotando:cotacoes.filter(c=>c.status==="cotando").length,fechadas:cotacoes.filter(c=>c.status==="fechada").length};

  const filtradas=[...cotacoes].reverse().filter(c=>{
    const matchSearch=!search||[c.titulo,c.numeroPedido,c.responsavel].some(v=>v?.toLowerCase().includes(search.toLowerCase()));
    const matchStatus=filtroStatus==="todos"||c.status===filtroStatus;
    return matchSearch&&matchStatus;
  });

  const STATUS_FILTROS=[
    {id:"todos",label:"Todas"},
    {id:"rascunho",label:"Rascunhos"},
    {id:"aberta",label:"Abertas"},
    {id:"cotando",label:"Em Cotação"},
    {id:"fechada",label:"Encerradas"},
  ];

  const handleDelete=(e,id)=>{
    e.stopPropagation();
    if(window.confirm("Excluir esta cotação? A ação não pode ser desfeita.")) onDelete(id);
  };

  const openDemoPDF=()=>{
    const html=generatePrintHTML(DEMO_COTACAO);
    const blob=new Blob([html],{type:"text/html;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.target="_blank";a.rel="noopener noreferrer";
    document.body.appendChild(a);a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  };

  return <div>
    {/* Stats */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:14,marginBottom:24}}>
      {[{l:"Cotações",v:st.total,color:C.navy,f:"todos"},{l:"Rascunhos",v:st.rascunhos,color:"#6B7280",f:"rascunho"},{l:"Abertas",v:st.abertas,color:C.yellow,f:"aberta"},{l:"Em Cotação",v:st.cotando,color:C.blue,f:"cotando"},{l:"Encerradas",v:st.fechadas,color:C.green,f:"fechada"},{l:"Fornecedores",v:fornecedores.length,color:C.amberDark,f:null}].map(s=>(
        <Card key={s.l} style={{padding:"16px 18px",borderLeft:`4px solid ${s.color}`,cursor:s.f?"pointer":"default"}} onClick={()=>s.f&&setFiltroStatus(s.f)}>
          <div style={{fontSize:26,fontWeight:900,color:s.color}}>{s.v}</div>
          <div style={{fontSize:12,color:C.gray600,fontWeight:700,marginTop:2}}>{s.l}</div>
        </Card>
      ))}
    </div>

    {/* Header + busca */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,gap:10,flexWrap:"wrap"}}>
      <h2 style={{margin:0,fontSize:17,fontWeight:900,color:C.gray800}}>Cotações</h2>
      <Btn onClick={onCreate} variant="primary">＋ Nova Cotação</Btn>
    </div>

    {/* Busca + filtro */}
    <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
      <div style={{position:"relative",flex:1,minWidth:180}}>
        <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.gray400,fontSize:13}}>🔍</span>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por título, número, responsável..."
          style={{width:"100%",border:`1.5px solid ${C.gray200}`,borderRadius:8,padding:"8px 10px 8px 30px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}
          onFocus={e=>e.target.style.borderColor=C.amber} onBlur={e=>e.target.style.borderColor=C.gray200}/>
      </div>
      <div style={{display:"flex",gap:4}}>
        {STATUS_FILTROS.map(f=>(
          <button key={f.id} onClick={()=>setFiltroStatus(f.id)} style={{padding:"7px 12px",borderRadius:7,fontSize:12,fontWeight:700,cursor:"pointer",border:`1.5px solid ${filtroStatus===f.id?C.navy:C.gray200}`,background:filtroStatus===f.id?C.navy:C.white,color:filtroStatus===f.id?C.white:C.gray600,transition:"all .12s",whiteSpace:"nowrap"}}>{f.label}</button>
        ))}
      </div>
    </div>

    {/* Banner demo */}
    <Card style={{marginBottom:12,padding:"12px 16px",background:"linear-gradient(135deg,#EEF1FB,#F5F3FF)",border:`1px solid #C7D2FE`,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
      <div style={{fontSize:12,color:C.navy,fontWeight:700}}>👁 Ver exemplo de Pedido de Compra preenchido</div>
      <Btn onClick={()=>setShowDemo(true)} variant="navy" size="sm">Abrir Demo →</Btn>
    </Card>

    {/* Lista */}
    {cotacoes.length===0?(
      <Card style={{textAlign:"center",padding:44}}>
        <div style={{fontSize:44,marginBottom:10}}>📋</div>
        <div style={{fontSize:15,fontWeight:700,color:C.gray600}}>Nenhuma cotação ainda</div>
        <Btn onClick={onCreate} variant="primary" size="lg" style={{marginTop:18}}>＋ Nova Cotação</Btn>
      </Card>
    ):filtradas.length===0?(
      <Card style={{textAlign:"center",padding:32}}>
        <div style={{fontSize:32,marginBottom:8}}>🔍</div>
        <div style={{fontSize:14,fontWeight:700,color:C.gray600}}>Nenhuma cotação encontrada</div>
        <button onClick={()=>{setSearch("");setFiltroStatus("todos");}} style={{marginTop:10,background:"none",border:"none",cursor:"pointer",color:C.navy,fontWeight:700,fontSize:13}}>Limpar filtros</button>
      </Card>
    ):(
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filtradas.map(c=>(
          <Card key={c.id} style={{padding:"14px 18px",cursor:"pointer",transition:"box-shadow .15s"}}
            onClick={()=>onOpen(c.id)}
            onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(27,46,138,.12)"}
            onMouseLeave={e=>e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,.06)"}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{fontWeight:800,fontSize:15,color:C.navy}}>{c.titulo}</span>
                  <span style={{fontSize:11,fontWeight:700,color:C.gray400}}>{c.numeroPedido}</span>
                </div>
                <div style={{fontSize:12,color:C.gray400,marginTop:3}}>
                  {c.dataCriacao} · {c.responsavel||"—"} · {c.itens.length} iten{c.itens.length!==1?"s":""} · {c.fornecedores.length} fornecedor{c.fornecedores.length!==1?"es":""}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                <Badge status={c.status}/>
                {can(user,"create")&&(
                  <button onClick={(e)=>handleDelete(e,c.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.gray300,fontSize:16,padding:"4px",borderRadius:5,lineHeight:1,transition:"color .1s"}}
                    onMouseEnter={e=>e.currentTarget.style.color=C.red}
                    onMouseLeave={e=>e.currentTarget.style.color=C.gray300}
                    title="Excluir cotação">🗑</button>
                )}
                <span style={{color:C.gray400,fontSize:16}}>›</span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    )}

    {showDemo&&<PedidoView cotacao={DEMO_COTACAO} onClose={()=>setShowDemo(false)}/>}
  </div>;
}

// ── Gerador de PDF ───────────────────────────────────────────────────────────
function generatePrintHTML(cotacao) {
  const fmtR=(v)=>v==null||v===""?"—":Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const getProp=(fid,iid)=>cotacao.propostas.find(p=>p.fornecedorId===fid&&p.itemId===iid);
  const getCond=(fid,field)=>(cotacao.condicoesFornecedor||[]).find(c=>c.fornecedorId===fid)?.[field]||"—";
  const bestByItem={};
  cotacao.itens.forEach(item=>{const ps=cotacao.fornecedores.map(f=>getProp(f.id,item.id)?.preco).filter(v=>v!=null);if(ps.length)bestByItem[item.id]=Math.min(...ps);});
  const totalF=(fid)=>cotacao.itens.reduce((s,item)=>{const p=getProp(fid,item.id);return s+(p?p.preco*item.quantidade:0);},0);
  const totals=cotacao.fornecedores.map(f=>({id:f.id,total:totalF(f.id)})).filter(t=>t.total>0);
  const bestTotal=totals.length?Math.min(...totals.map(t=>t.total)):null;
  const winner=bestTotal!=null?cotacao.fornecedores.find(f=>totalF(f.id)===bestTotal):null;
  const nF=cotacao.fornecedores.length;

  const colPct = nF > 0 ? Math.floor(55/nF) : 18;
  const descW = 100 - 5 - 5 - (colPct*2*nF);

  const itemRows=cotacao.itens.map((item,idx)=>{
    return `<tr style="background:${idx%2===0?"#fff":"#f9fafb"}">
      <td style="padding:7px 8px;font-size:11px;color:#374151;font-weight:600;border-bottom:1px solid #e5e7eb;">
        <span style="color:#9ca3af;margin-right:4px;font-size:10px;">${String(idx+1).padStart(2,'0')}</span>${item.descricao}
      </td>
      <td style="padding:7px 6px;text-align:center;font-size:10px;color:#6b7280;border-bottom:1px solid #e5e7eb;">${item.unidade}</td>
      <td style="padding:7px 6px;text-align:center;font-size:11px;font-weight:700;color:#374151;border-bottom:1px solid #e5e7eb;">${item.quantidade}</td>
      ${cotacao.fornecedores.map(f=>{
        const p=getProp(f.id,item.id);
        const isBest=p!=null&&bestByItem[item.id]!=null&&p.preco===bestByItem[item.id];
        const total=p?p.preco*item.quantidade:null;
        const bg=isBest?"rgba(22,163,74,.08)":"transparent";
        const clr=isBest?"#16a34a":"#374151";
        const fw=isBest?"800":"600";
        return `<td style="padding:6px;text-align:right;font-size:10px;border-bottom:1px solid #e5e7eb;border-left:1px solid #e5e7eb;background:${bg};color:${clr};font-weight:${fw};">${p?fmtR(p.preco):"—"}</td>
                <td style="padding:6px;text-align:right;font-size:10px;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;background:${bg};color:${clr};font-weight:${fw};">${total!=null?(isBest?'★ ':'')+fmtR(total):"—"}</td>`;
      }).join('')}
    </tr>`;
  }).join('');

  const condRows=["Entrega","Garantia","Pagamento","Obs."].map((label,i)=>{
    const fieldKey=["entrega","garantia","pagamento","obs"][i];
    return `<tr style="background:${i%2===0?"#fff":"#f9fafb"}">
      <td colspan="3" style="padding:6px 8px;font-size:10px;font-weight:700;color:#4b5563;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">${label}</td>
      ${cotacao.fornecedores.map(f=>`<td colspan="2" style="padding:6px 8px;text-align:center;font-size:10px;color:#374151;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">${getCond(f.id,fieldKey)}</td>`).join('')}
    </tr>`;
  }).join('');

  const suppTable=cotacao.fornecedores.map((f,i)=>`
    <tr>
      <td style="padding:6px 8px;text-align:center;font-size:10px;font-weight:800;color:#1b2e8a;">${i+1}</td>
      <td style="padding:6px 8px;font-size:10px;font-weight:700;color:#111827;">${f.razaoSocial}</td>
      <td style="padding:6px 8px;font-size:10px;color:#4b5563;">${f.cnpj||f.cpf||"—"}</td>
      <td style="padding:6px 8px;font-size:10px;color:#4b5563;">${f.celular||f.telefone||"—"}</td>
      <td style="padding:6px 8px;font-size:10px;color:#4b5563;">${f.email||"—"}</td>
      <td style="padding:6px 8px;font-size:10px;color:#4b5563;">${getCond(f.id,"entrega")}</td>
      <td style="padding:6px 8px;font-size:10px;color:#4b5563;">${getCond(f.id,"garantia")}</td>
      <td style="padding:6px 8px;font-size:10px;color:#4b5563;">${getCond(f.id,"pagamento")}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
  <title>${cotacao.numeroPedido} – ${cotacao.titulo}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800;900&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#111827;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    @page{size:A4 landscape;margin:12mm 14mm;}
    @media print{body{font-size:11px;}.no-print{display:none!important;}.page-break{page-break-before:always;}}
    table{border-collapse:collapse;width:100%;}
    .section-label{font-size:9px;font-weight:800;color:#9ca3af;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:3px;}
    .section-value{font-size:12px;font-weight:700;color:#111827;}
  ${'</style>'}
  ${'</head>'}<body>

  <!-- PRINT BUTTON -->
  <div class="no-print" style="position:fixed;top:12px;right:16px;display:flex;gap:8px;z-index:999;">
    <button onclick="window.print()" style="background:#1b2e8a;color:#fff;border:none;padding:9px 20px;border-radius:8px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;">🖨 Imprimir / Salvar PDF</button>
    <button onclick="window.close()" style="background:#f3f4f6;color:#4b5563;border:none;padding:9px 16px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit;">Fechar</button>
  </div>

  <!-- CABEÇALHO -->
  <table style="margin-bottom:10px;">
    <tr>
      <td style="background:#1b2e8a;padding:12px 16px;border-radius:8px 0 0 8px;width:40%;">
        <div style="font-size:9px;font-weight:800;color:#ffc84a;letter-spacing:1px;margin-bottom:4px;">FORMULÁRIO DE COMPRA</div>
        <div style="font-size:16px;font-weight:900;color:#fff;line-height:1.25;">${cotacao.titulo}</div>
        <div style="font-size:10px;color:rgba(255,255,255,.5);margin-top:4px;">${cotacao.descricaoAquisicao||""}</div>
      </td>
      <td style="background:#f0f2f8;padding:10px 14px;vertical-align:top;border-radius:0 8px 8px 0;">
        <table style="width:100%;">
          <tr>
            <td style="padding:2px 12px 2px 0;"><div class="section-label">Nº DO PEDIDO</div><div class="section-value" style="color:#1b2e8a;">${cotacao.numeroPedido}</div></td>
            <td style="padding:2px 12px 2px 0;"><div class="section-label">DATA</div><div class="section-value">${cotacao.dataCriacao}</div></td>
            <td style="padding:2px 12px 2px 0;"><div class="section-label">RESPONSÁVEL</div><div class="section-value">${cotacao.responsavel||"—"}</div></td>
            <td style="padding:2px 12px 2px 0;"><div class="section-label">APROVADOR</div><div class="section-value">${cotacao.aprovador||"—"}</div></td>
            <td style="padding:2px 12px 2px 0;"><div class="section-label">CENTRO DE CUSTO</div><div class="section-value">${cotacao.centrosCusto||"—"}</div></td>
            <td style="padding:2px 0;"><div class="section-label">URGENTE / NECESSÁRIO</div><div class="section-value">${cotacao.urgente?"SIM":"NÃO"} / ${cotacao.necessario?"SIM":"NÃO"}</div></td>
          </tr>
          <tr><td colspan="6" style="padding-top:8px;">
            <div class="section-label">JUSTIFICATIVA</div>
            <div style="font-size:11px;color:#4b5563;line-height:1.5;">${cotacao.justificativa||"—"}</div>
          </td></tr>
          ${cotacao.classificacao?`<tr><td colspan="6" style="padding-top:6px;"><div class="section-label">CLASSIFICAÇÃO</div><div style="font-size:11px;color:#374151;font-weight:700;">${cotacao.classificacao}</div></td></tr>`:""}
        </table>
      </td>
    </tr>
  </table>

  <!-- TABELA COMPARATIVA -->
  <div style="font-size:9px;font-weight:900;color:#1b2e8a;letter-spacing:0.8px;margin-bottom:5px;">QUADRO COMPARATIVO DE PROPOSTAS</div>
  <table style="margin-bottom:10px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
    <thead>
      <tr style="background:#1b2e8a;">
        <th style="padding:8px 8px;text-align:left;font-size:10px;color:#ffc84a;font-weight:800;letter-spacing:0.3px;width:${Math.max(descW,20)}%;">DESCRIÇÃO</th>
        <th style="padding:8px 6px;text-align:center;font-size:10px;color:rgba(255,255,255,.7);font-weight:700;width:5%;">UNID</th>
        <th style="padding:8px 6px;text-align:center;font-size:10px;color:rgba(255,255,255,.7);font-weight:700;width:5%;">QTD</th>
        ${cotacao.fornecedores.map((f,i)=>`<th colspan="2" style="padding:8px 6px;text-align:center;font-size:10px;color:#fff;font-weight:900;border-left:1px solid rgba(255,255,255,.15);width:${colPct*2}%;">
          <span style="background:rgba(255,255,255,.15);border-radius:50%;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;margin-right:4px;">${i+1}</span>${f.nomeFantasia||f.razaoSocial}
          ${f.cnpj?`<div style="font-size:8px;color:rgba(255,255,255,.45);font-weight:500;margin-top:1px;">${f.cnpj}</div>`:""}
        </th>`).join('')}
      </tr>
      <tr style="background:#eef1fb;">
        <th colspan="3" style="padding:4px 8px;"></th>
        ${cotacao.fornecedores.map(()=>`
          <th style="padding:4px 6px;text-align:right;font-size:9px;color:#6b7280;font-weight:700;border-left:1px solid #e5e7eb;">VL. UNIT</th>
          <th style="padding:4px 6px;text-align:right;font-size:9px;color:#6b7280;font-weight:700;border-right:1px solid #e5e7eb;">TOTAL</th>
        `).join('')}
      </tr>
    </thead>
    <tbody>
      ${itemRows}
      <!-- TOTAL -->
      <tr style="background:#eef1fb;">
        <td colspan="3" style="padding:9px 8px;font-size:11px;font-weight:900;color:#1b2e8a;letter-spacing:0.3px;">TOTAL GERAL</td>
        ${cotacao.fornecedores.map(f=>{
          const total=totalF(f.id);
          const isBestT=bestTotal!=null&&total===bestTotal&&total>0;
          return `<td colspan="2" style="padding:9px 8px;text-align:right;font-size:12px;font-weight:900;color:${isBestT?"#16a34a":"#1b2e8a"};border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">${total>0?(isBestT?"★ ":"")+fmtR(total):"—"}</td>`;
        }).join('')}
      </tr>
      <!-- CONDIÇÕES -->
      <tr style="background:#f0f2f8;">
        <td colspan="${3+nF*2}" style="padding:5px 8px;font-size:9px;font-weight:900;color:#1b2e8a;letter-spacing:0.8px;">CONDIÇÕES COMERCIAIS</td>
      </tr>
      ${condRows}
    </tbody>
  </table>

  <!-- RELAÇÃO DAS EMPRESAS -->
  <div style="font-size:9px;font-weight:900;color:#1b2e8a;letter-spacing:0.8px;margin-bottom:5px;">RELAÇÃO DAS EMPRESAS EM PROCESSO DE COTAÇÃO</div>
  <table style="margin-bottom:10px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
    <thead>
      <tr style="background:#eef1fb;">
        <th style="padding:6px 8px;text-align:center;font-size:9px;font-weight:800;color:#1b2e8a;width:4%;">#</th>
        <th style="padding:6px 8px;text-align:left;font-size:9px;font-weight:800;color:#4b5563;width:22%;">RAZÃO SOCIAL</th>
        <th style="padding:6px 8px;text-align:left;font-size:9px;font-weight:800;color:#4b5563;width:14%;">CNPJ/CPF</th>
        <th style="padding:6px 8px;text-align:left;font-size:9px;font-weight:800;color:#4b5563;width:13%;">CONTATO</th>
        <th style="padding:6px 8px;text-align:left;font-size:9px;font-weight:800;color:#4b5563;width:19%;">E-MAIL</th>
        <th style="padding:6px 8px;text-align:center;font-size:9px;font-weight:800;color:#4b5563;width:10%;">ENTREGA</th>
        <th style="padding:6px 8px;text-align:center;font-size:9px;font-weight:800;color:#4b5563;width:10%;">GARANTIA</th>
        <th style="padding:6px 8px;text-align:center;font-size:9px;font-weight:800;color:#4b5563;width:10%;">PAGAMENTO</th>
      </tr>
    </thead>
    <tbody>${suppTable}</tbody>
  </table>

  <!-- RODAPÉ: APROVAÇÕES + VENCEDOR -->
  <table>
    <tr>
      <td style="vertical-align:top;width:55%;padding-right:12px;">
        <div style="font-size:9px;font-weight:900;color:#1b2e8a;letter-spacing:0.8px;margin-bottom:5px;">PROCESSO DE APROVAÇÕES</div>
        <table style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
          <tr style="background:#eef1fb;">
            <th style="padding:6px 10px;font-size:9px;font-weight:800;color:#4b5563;text-align:center;">URGENTE</th>
            <th style="padding:6px 10px;font-size:9px;font-weight:800;color:#4b5563;text-align:center;">NECESSÁRIO</th>
            <th style="padding:6px 10px;font-size:9px;font-weight:800;color:#4b5563;text-align:center;">CENTRO DE CUSTO</th>
            <th style="padding:6px 10px;font-size:9px;font-weight:800;color:#4b5563;text-align:center;">CLASSIFICAÇÃO</th>
            <th style="padding:6px 10px;font-size:9px;font-weight:800;color:#4b5563;text-align:center;">APROVAÇÃO</th>
          </tr>
          <tr>
            <td style="padding:8px 10px;text-align:center;font-size:11px;font-weight:800;color:${cotacao.urgente?"#dc2626":"#9ca3af"};">${cotacao.urgente?"SIM":"NÃO"}</td>
            <td style="padding:8px 10px;text-align:center;font-size:11px;font-weight:800;color:${cotacao.necessario?"#16a34a":"#9ca3af"};">${cotacao.necessario?"SIM":"NÃO"}</td>
            <td style="padding:8px 10px;text-align:center;font-size:11px;font-weight:700;color:#374151;">${cotacao.centrosCusto||"—"}</td>
            <td style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:#374151;">${cotacao.classificacao||"—"}</td>
            <td style="padding:8px 10px;text-align:center;font-size:11px;font-weight:700;color:#374151;">${cotacao.aprovador||"—"}</td>
          </tr>
        </table>
      </td>
      ${winner?`<td style="vertical-align:top;width:45%;">
        <div style="font-size:9px;font-weight:900;color:#1b2e8a;letter-spacing:0.8px;margin-bottom:5px;">EMPRESA VENCEDORA</div>
        <table style="background:#1b2e8a;border-radius:6px;overflow:hidden;width:100%;">
          <tr>
            <td style="padding:12px 16px;">
              <div style="font-size:9px;font-weight:800;color:#ffc84a;letter-spacing:0.8px;margin-bottom:4px;">★ MENOR PREÇO TOTAL</div>
              <div style="font-size:15px;font-weight:900;color:#fff;">${winner.nomeFantasia||winner.razaoSocial}</div>
              <div style="font-size:9px;color:rgba(255,255,255,.45);margin-top:2px;">${winner.cnpj||winner.cpf||""}</div>
            </td>
            <td style="padding:12px 16px;text-align:right;">
              <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,.45);margin-bottom:2px;">VALOR FINAL</div>
              <div style="font-size:22px;font-weight:900;color:#ffc84a;">${fmtR(bestTotal)}</div>
            </td>
          </tr>
        </table>
      </td>`:`<td style="vertical-align:top;width:45%;"><div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:16px;text-align:center;color:#9ca3af;font-size:11px;">Propostas incompletas — vencedor não determinado</div></td>`}
    </tr>
  </table>
  <div style="margin-top:10px;font-size:8px;color:#d1d5db;text-align:right;">Gerado por A3 Cotações · ${new Date().toLocaleString("pt-BR")}</div>
  ${(cotacao.anexos||[]).length>0?`
  <div style="margin-top:16px;border-top:1px solid #e5e7eb;padding-top:12px;">
    <div style="font-size:9px;font-weight:900;color:#1b2e8a;letter-spacing:0.8px;margin-bottom:6px;">📎 DOCUMENTOS ANEXADOS</div>
    ${(cotacao.anexos||[]).map((a,i)=>`<div style="font-size:11px;color:#374151;padding:3px 0;border-bottom:1px solid #f3f4f6;">${String(i+1).padStart(2,"0")}. ${a.name} <span style="color:#9ca3af;">(${(a.size/1024).toFixed(0)} KB)</span></div>`).join("")}
    <div style="font-size:9px;color:#9ca3af;margin-top:6px;">* Arquivos disponíveis no sistema A3 Cotações — acesse e imprima cada documento separadamente.</div>
  </div>`:""}
  ${'</body>'}${'</html>'}`;
}

// ── Detalhe + Comparativo ────────────────────────────────────────────────────
// ── Visualização do Pedido de Compra ─────────────────────────────────────────
function PedidoView({cotacao,onClose}){
  const mob=useMobile();

  const handlePrint=()=>window.print();
  const getProp=(fid,iid)=>cotacao.propostas.find(p=>p.fornecedorId===fid&&p.itemId===iid);
  const getCond=(fid,field)=>(cotacao.condicoesFornecedor||[]).find(c=>c.fornecedorId===fid)?.[field]||"—";
  const bestByItem={};
  cotacao.itens.forEach(item=>{
    const ps=cotacao.fornecedores.map(f=>getProp(f.id,item.id)?.preco).filter(v=>v!=null);
    if(ps.length)bestByItem[item.id]=Math.min(...ps);
  });
  const totalF=(fid)=>cotacao.itens.reduce((s,item)=>{const p=getProp(fid,item.id);return s+(p?p.preco*item.quantidade:0);},0);
  const totals=cotacao.fornecedores.map(f=>({id:f.id,total:totalF(f.id)})).filter(t=>t.total>0);
  const bestTotal=totals.length?Math.min(...totals.map(t=>t.total)):null;
  const winner=bestTotal!=null?cotacao.fornecedores.find(f=>totalF(f.id)===bestTotal):null;
  const nF=cotacao.fornecedores.length;

  const TH={padding:"8px 10px",fontWeight:800,fontSize:11,letterSpacing:0.3,color:C.white,textAlign:"center",borderRight:"1px solid rgba(255,255,255,.15)"};
  const TH2={padding:"5px 8px",fontWeight:700,fontSize:10,color:C.gray600,textAlign:"center",borderRight:`1px solid ${C.gray200}`,background:"#EEF1FB"};
  const TD={padding:"8px 10px",fontSize:12,borderBottom:`1px solid ${C.gray200}`,borderRight:`1px solid ${C.gray200}`};

  return(
    <div id="a3-print-area" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:2000,display:"flex",flexDirection:"column",fontFamily:"'DM Sans',sans-serif"}}>
      {/* Toolbar */}
      <div className="no-print" style={{background:C.navy,padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontWeight:900,color:C.white,fontSize:14}}>👁 Formulário de Compra — {cotacao.numeroPedido}</span>
          <Badge status={cotacao.status}/>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn onClick={handlePrint} variant="primary" size="sm">🖨 Imprimir / PDF</Btn>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.15)",border:"none",color:C.white,borderRadius:7,padding:"5px 12px",cursor:"pointer",fontWeight:700,fontSize:12}}>✕ Fechar</button>
        </div>
      </div>

      {/* Document */}
      <div style={{flex:1,overflowY:"auto",padding:mob?"12px":"24px",background:"#E5E7EB"}}>
        <div style={{maxWidth:900,margin:"0 auto",background:C.white,borderRadius:12,boxShadow:"0 4px 24px rgba(0,0,0,.15)",overflow:"hidden"}}>

          {/* ── CABEÇALHO ── */}
          <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"20px 28px",display:"flex",alignItems:"center",gap:20,flexWrap:"wrap"}}>
            <div style={{width:48,height:48,background:C.amber,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,color:C.navy,fontSize:18,flexShrink:0}}>A3</div>
            <div style={{flex:1}}>
              <div style={{fontSize:10,fontWeight:800,color:C.amberLight,letterSpacing:1.2,marginBottom:3}}>FORMULÁRIO DE COMPRA</div>
              <div style={{fontSize:18,fontWeight:900,color:C.white,lineHeight:1.2}}>{cotacao.titulo}</div>
            </div>
            <div style={{display:"flex",gap:24,flexWrap:"wrap"}}>
              {[["Nº PEDIDO",cotacao.numeroPedido],["DATA",cotacao.dataCriacao],["RESPONSÁVEL",cotacao.responsavel||"—"],["APROVADOR",cotacao.aprovador||"—"]].map(([l,v])=>(
                <div key={l} style={{textAlign:"right"}}>
                  <div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,.45)",letterSpacing:0.8}}>{l}</div>
                  <div style={{fontSize:13,fontWeight:800,color:C.white}}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── CLASSIFICAÇÃO ── */}
          <div style={{background:"#F0F2F8",padding:"10px 28px",display:"flex",gap:24,flexWrap:"wrap",borderBottom:`1px solid ${C.gray200}`}}>
            {cotacao.centrosCusto&&<div><span style={{fontSize:9,fontWeight:800,color:C.gray400,letterSpacing:0.6}}>TIPO DE DESPESA </span><span style={{fontSize:12,fontWeight:800,color:cotacao.centrosCusto==="Ordinária"?C.navy:"#7C3AED"}}>{cotacao.centrosCusto==="Ordinária"?"📅":"⚡"} {cotacao.centrosCusto}</span></div>}
            {cotacao.planoContas&&<div><span style={{fontSize:9,fontWeight:800,color:C.gray400,letterSpacing:0.6}}>PLANO DE CONTAS </span><span style={{fontSize:12,fontWeight:800,color:C.gray800,fontFamily:"monospace"}}>{cotacao.planoContas}</span></div>}
            {cotacao.classificacao&&<div><span style={{fontSize:9,fontWeight:800,color:C.gray400,letterSpacing:0.6}}>CLASSIFICAÇÃO </span><span style={{fontSize:12,fontWeight:700,color:C.gray700}}>{cotacao.classificacao}</span></div>}
            <div style={{marginLeft:"auto",display:"flex",gap:16}}>
              <div><span style={{fontSize:9,fontWeight:800,color:C.gray400,letterSpacing:0.6}}>URGENTE </span><span style={{fontSize:12,fontWeight:800,color:cotacao.urgente?C.red:C.gray400}}>{cotacao.urgente?"SIM":"NÃO"}</span></div>
              <div><span style={{fontSize:9,fontWeight:800,color:C.gray400,letterSpacing:0.6}}>NECESSÁRIO </span><span style={{fontSize:12,fontWeight:800,color:cotacao.necessario?C.green:C.gray400}}>{cotacao.necessario?"SIM":"NÃO"}</span></div>
            </div>
          </div>

          <div style={{padding:"20px 28px",display:"flex",flexDirection:"column",gap:16}}>

            {/* ── DESCRIÇÃO + JUSTIFICATIVA ── */}
            {(cotacao.descricaoAquisicao||cotacao.justificativa)&&(
              <div style={{display:"grid",gridTemplateColumns:cotacao.descricaoAquisicao&&cotacao.justificativa?"1fr 1fr":"1fr",gap:16}}>
                {cotacao.descricaoAquisicao&&<div style={{background:C.gray50,borderRadius:8,padding:"12px 14px",borderLeft:`3px solid ${C.navy}`}}>
                  <div style={{fontSize:9,fontWeight:900,color:C.navy,letterSpacing:0.8,marginBottom:6}}>DESCRIÇÃO DA AQUISIÇÃO</div>
                  <div style={{fontSize:12,color:C.gray700,lineHeight:1.7}}>{cotacao.descricaoAquisicao}</div>
                </div>}
                {cotacao.justificativa&&<div style={{background:C.gray50,borderRadius:8,padding:"12px 14px",borderLeft:`3px solid ${C.amber}`}}>
                  <div style={{fontSize:9,fontWeight:900,color:C.amberDark,letterSpacing:0.8,marginBottom:6}}>JUSTIFICATIVA</div>
                  <div style={{fontSize:12,color:C.gray700,lineHeight:1.7}}>{cotacao.justificativa}</div>
                </div>}
              </div>
            )}

            {/* ── QUADRO COMPARATIVO ── */}
            <div>
              <div style={{fontSize:10,fontWeight:900,color:C.navy,letterSpacing:0.8,marginBottom:8}}>QUADRO COMPARATIVO DE PROPOSTAS</div>
              {nF===0?(
                <div style={{background:C.gray50,borderRadius:8,padding:"20px",textAlign:"center",color:C.gray400,fontSize:13}}>Nenhum fornecedor vinculado à cotação</div>
              ):(
                <div style={{overflowX:"auto",borderRadius:8,border:`1px solid ${C.gray200}`,overflow:"hidden"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:400+nF*160}}>
                    <thead>
                      <tr style={{background:C.navy}}>
                        <th style={{...TH,textAlign:"left",minWidth:180,width:"30%"}}>ITEM / DESCRIÇÃO</th>
                        <th style={{...TH,width:50}}>UNID</th>
                        <th style={{...TH,width:50}}>QTD</th>
                        {cotacao.fornecedores.map((f,i)=>(
                          <th key={f.id} colSpan={2} style={{...TH,minWidth:160}}>
                            <div style={{fontSize:11,fontWeight:900}}>{f.nomeFantasia||f.razaoSocial}</div>
                            <div style={{fontSize:9,color:"rgba(255,255,255,.4)",fontWeight:500}}>{f.cnpj||f.cpf||""}</div>
                          </th>
                        ))}
                      </tr>
                      <tr>
                        <td colSpan={3} style={{background:"#EEF1FB",padding:"4px 8px"}}/>
                        {cotacao.fornecedores.map(f=>(
                          <Fragment key={f.id}>
                            <td style={{...TH2}}>VL. UNIT</td>
                            <td style={{...TH2,borderRight:`2px solid ${C.gray300}`}}>TOTAL</td>
                          </Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cotacao.itens.map((item,idx)=>(
                        <tr key={item.id} style={{background:idx%2===0?C.white:C.gray50}}>
                          <td style={{...TD,fontWeight:600,textAlign:"left",color:C.gray800}}>
                            <span style={{color:C.gray400,fontSize:10,marginRight:4}}>0{idx+1}</span>{item.descricao}
                          </td>
                          <td style={{...TD,textAlign:"center",color:C.gray500}}>{item.unidade}</td>
                          <td style={{...TD,textAlign:"center",fontWeight:700}}>{item.quantidade}</td>
                          {cotacao.fornecedores.map(f=>{
                            const p=getProp(f.id,item.id);
                            const isBest=p&&bestByItem[item.id]&&p.preco===bestByItem[item.id];
                            const bg=isBest?"rgba(22,163,74,.07)":"transparent";
                            const clr=isBest?C.green:p?C.gray800:C.gray300;
                            const fw=isBest?900:p?600:400;
                            return(
                              <Fragment key={f.id}>
                                <td style={{...TD,textAlign:"right",background:bg,color:clr,fontWeight:fw}}>{p?fmt(p.preco):"—"}</td>
                                <td style={{...TD,textAlign:"right",background:bg,color:clr,fontWeight:fw,borderRight:`2px solid ${C.gray300}`}}>{p?fmt(p.preco*item.quantidade):"—"}</td>
                              </Fragment>
                            );
                          })}
                        </tr>
                      ))}
                      {/* Total */}
                      <tr style={{background:"#EEF1FB"}}>
                        <td colSpan={3} style={{padding:"10px",fontWeight:900,color:C.navy,fontSize:12,borderRight:`1px solid ${C.gray200}`}}>TOTAL GERAL</td>
                        {cotacao.fornecedores.map(f=>{
                          const total=totalF(f.id);
                          const isBestT=bestTotal&&total===bestTotal&&total>0;
                          return(
                            <Fragment key={f.id}>
                              <td style={{padding:"10px 8px",textAlign:"right",borderRight:`1px solid ${C.gray200}`}}/>
                              <td style={{padding:"10px 8px",textAlign:"right",fontWeight:900,fontSize:13,color:isBestT?C.green:C.navy,borderRight:`2px solid ${C.gray300}`}}>
                                {total>0?<>{isBestT&&"★ "}{fmt(total)}</>:"—"}
                              </td>
                            </Fragment>
                          );
                        })}
                      </tr>
                      {/* Condições */}
                      <tr style={{background:"#F0F2F8"}}>
                        <td colSpan={3+nF*2} style={{padding:"6px 10px",fontSize:9,fontWeight:900,color:C.navy,letterSpacing:0.8}}>CONDIÇÕES COMERCIAIS</td>
                      </tr>
                      {[["Entrega","entrega"],["Garantia","garantia"],["Pagamento","pagamento"],["Observações","obs"]].map(([label,field])=>(
                        <tr key={field} style={{background:C.white}}>
                          <td colSpan={3} style={{...TD,fontWeight:700,color:C.gray600}}>{label}</td>
                          {cotacao.fornecedores.map(f=>(
                            <td key={f.id} colSpan={2} style={{...TD,textAlign:"center",color:C.gray700,borderRight:`2px solid ${C.gray300}`}}>{getCond(f.id,field)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── RELAÇÃO DAS EMPRESAS ── */}
            {nF>0&&(
              <div>
                <div style={{fontSize:10,fontWeight:900,color:C.navy,letterSpacing:0.8,marginBottom:8}}>RELAÇÃO DAS EMPRESAS EM PROCESSO DE COTAÇÃO</div>
                <div style={{border:`1px solid ${C.gray200}`,borderRadius:8,overflow:"hidden"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                    <thead>
                      <tr style={{background:"#EEF1FB"}}>
                        {["#","RAZÃO SOCIAL","CNPJ/CPF","CONTATO","E-MAIL","ENTREGA","GARANTIA","PAGAMENTO"].map(h=>(
                          <th key={h} style={{padding:"7px 10px",fontWeight:800,color:C.navy,fontSize:9,letterSpacing:0.4,textAlign:"left",borderBottom:`1px solid ${C.gray200}`}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cotacao.fornecedores.map((f,i)=>(
                        <tr key={f.id} style={{background:i%2===0?C.white:C.gray50}}>
                          <td style={{padding:"7px 10px",fontWeight:900,color:C.navy,fontSize:12,borderBottom:`1px solid ${C.gray200}`}}>{i+1}</td>
                          <td style={{padding:"7px 10px",fontWeight:700,color:C.gray800,borderBottom:`1px solid ${C.gray200}`}}>{f.razaoSocial}</td>
                          <td style={{padding:"7px 10px",color:C.gray600,borderBottom:`1px solid ${C.gray200}`}}>{f.cnpj||f.cpf||"—"}</td>
                          <td style={{padding:"7px 10px",color:C.gray600,borderBottom:`1px solid ${C.gray200}`}}>{f.celular||f.telefone||"—"}</td>
                          <td style={{padding:"7px 10px",color:C.gray600,borderBottom:`1px solid ${C.gray200}`}}>{f.email||"—"}</td>
                          <td style={{padding:"7px 10px",color:C.gray600,borderBottom:`1px solid ${C.gray200}`,textAlign:"center"}}>{getCond(f.id,"entrega")}</td>
                          <td style={{padding:"7px 10px",color:C.gray600,borderBottom:`1px solid ${C.gray200}`,textAlign:"center"}}>{getCond(f.id,"garantia")}</td>
                          <td style={{padding:"7px 10px",color:C.gray600,borderBottom:`1px solid ${C.gray200}`,textAlign:"center"}}>{getCond(f.id,"pagamento")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── APROVAÇÕES + VENCEDOR ── */}
            <div style={{display:"grid",gridTemplateColumns:winner?"1fr 1fr":"1fr",gap:16}}>
              <div>
                <div style={{fontSize:10,fontWeight:900,color:C.navy,letterSpacing:0.8,marginBottom:8}}>PROCESSO DE APROVAÇÕES</div>
                <div style={{border:`1px solid ${C.gray200}`,borderRadius:8,overflow:"hidden"}}>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead>
                      <tr style={{background:"#EEF1FB"}}>
                        {["URGENTE","NECESSÁRIO","CENTRO DE CUSTO","CLASSIFICAÇÃO","APROVAÇÃO"].map(h=>(
                          <th key={h} style={{padding:"7px 10px",fontSize:9,fontWeight:800,color:C.navy,letterSpacing:0.3,textAlign:"center",borderBottom:`1px solid ${C.gray200}`}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{padding:"10px",textAlign:"center",fontWeight:900,fontSize:13,color:cotacao.urgente?C.red:C.gray300}}>{cotacao.urgente?"SIM":"NÃO"}</td>
                        <td style={{padding:"10px",textAlign:"center",fontWeight:900,fontSize:13,color:cotacao.necessario?C.green:C.gray300}}>{cotacao.necessario?"SIM":"NÃO"}</td>
                        <td style={{padding:"10px",textAlign:"center",fontWeight:700,fontSize:12,color:C.gray700}}>{cotacao.centrosCusto||"—"}</td>
                        <td style={{padding:"10px",textAlign:"center",fontSize:11,color:C.gray600}}>{cotacao.classificacao||"—"}</td>
                        <td style={{padding:"10px",textAlign:"center",fontWeight:700,fontSize:12,color:C.gray700}}>{cotacao.aprovador||<span style={{color:C.gray300,fontStyle:"italic"}}>Pendente</span>}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {winner&&(
                <div>
                  <div style={{fontSize:10,fontWeight:900,color:C.navy,letterSpacing:0.8,marginBottom:8}}>EMPRESA VENCEDORA</div>
                  <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,borderRadius:8,padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                    <div>
                      <div style={{fontSize:9,fontWeight:800,color:C.amberLight,letterSpacing:0.8,marginBottom:4}}>★ MENOR PREÇO TOTAL</div>
                      <div style={{fontSize:16,fontWeight:900,color:C.white}}>{winner.nomeFantasia||winner.razaoSocial}</div>
                      <div style={{fontSize:10,color:"rgba(255,255,255,.45)",marginTop:2}}>{winner.cnpj||winner.cpf||""}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.4)"}}>VALOR FINAL</div>
                      <div style={{fontSize:24,fontWeight:900,color:C.amberLight}}>{fmt(bestTotal)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{textAlign:"right",fontSize:10,color:C.gray300,paddingTop:4}}>
              Gerado por A3 Cotações · {new Date().toLocaleString("pt-BR")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetalheCotacao({cotacao,allFornecedores,clientes,onUpdate,onDelete,onBack,onAddFornecedor,readOnly}){
  const {user:authUser}=useAuth();

  // Guards para campos JSONB que podem vir como null do Supabase
  const cot={
    ...cotacao,
    itens:       Array.isArray(cotacao?.itens)?cotacao.itens:[],
    fornecedores:Array.isArray(cotacao?.fornecedores)?cotacao.fornecedores:[],
    propostas:   Array.isArray(cotacao?.propostas)?cotacao.propostas:[],
    condicoesFornecedor:Array.isArray(cotacao?.condicoesFornecedor)?cotacao.condicoesFornecedor:[],
    anexos:      Array.isArray(cotacao?.anexos)?cotacao.anexos:[],
  };
  // Usa cot no lugar de cotacao dentro de todo o componente
  const editavel=!readOnly&&cot.status!=="fechada"&&cot.status!=="aprovada"&&cot.status!=="rejeitada"&&cot.status!=="rascunho";
  const podeAprovar=can(authUser,"approve_cotacao")&&cot.status==="fechada";
  const cliente=(clientes||[]).find(c=>c.id===cot.clienteId);
  const [showVinc,setShowVinc]=useState(false);
  const [showPedido,setShowPedido]=useState(false);
  const [editCell,setEditCell]=useState(null);
  const [tempVal,setTempVal]=useState("");
  const [editCond,setEditCond]=useState(null);
  const [tempCond,setTempCond]=useState("");
  const [editMeta,setEditMeta]=useState(false);
  const [metaDraft,setMetaDraft]=useState({});

  const set=(k)=>(v)=>onUpdate({...cot,[k]:v});
  const getProp=(fid,iid)=>cot.propostas.find(p=>p.fornecedorId===fid&&p.itemId===iid);
  const getCond=(fid,field)=>(cot.condicoesFornecedor||[]).find(c=>c.fornecedorId===fid)?.[field]||"";

  const startCellEdit=(fid,iid)=>{const p=getProp(fid,iid);setTempVal(p?.preco??"");setEditCell({fid,iid});};
  const commitCell=()=>{
    if(!editCell)return;
    const {fid,iid}=editCell;
    const val=tempVal===""?null:parseFloat(String(tempVal).replace(",","."));
    const exist=cot.propostas.find(p=>p.fornecedorId===fid&&p.itemId===iid);
    let np;
    if(val==null||isNaN(val))np=cot.propostas.filter(p=>!(p.fornecedorId===fid&&p.itemId===iid));
    else if(exist)np=cot.propostas.map(p=>p.fornecedorId===fid&&p.itemId===iid?{...p,preco:val}:p);
    else np=[...cot.propostas,{fornecedorId:fid,itemId:iid,preco:val}];
    onUpdate({...cot,propostas:np});setEditCell(null);
  };

  const startCondEdit=(fid,field)=>{setTempCond(getCond(fid,field));setEditCond({fid,field});};
  const commitCond=()=>{
    if(!editCond)return;
    const {fid,field}=editCond;
    const arr=cot.condicoesFornecedor||[];
    const exist=arr.find(c=>c.fornecedorId===fid);
    const nc=exist?arr.map(c=>c.fornecedorId===fid?{...c,[field]:tempCond}:c):[...arr,{fornecedorId:fid,[field]:tempCond}];
    onUpdate({...cot,condicoesFornecedor:nc});setEditCond(null);
  };

  const removeForn=(fid)=>onUpdate({...cot,fornecedores:cot.fornecedores.filter(f=>f.id!==fid),propostas:cot.propostas.filter(p=>p.fornecedorId!==fid),condicoesFornecedor:(cot.condicoesFornecedor||[]).filter(c=>c.fornecedorId!==fid)});

  const exportPDF=()=>setShowPedido(true);

  const handleDelete=()=>{
    if(window.confirm("Excluir esta cotação? A ação não pode ser desfeita.")) onDelete(cot.id);
  };

  const bestByItem={};
  cot.itens.forEach(item=>{const ps=cot.fornecedores.map(f=>getProp(f.id,item.id)?.preco).filter(v=>v!=null);if(ps.length)bestByItem[item.id]=Math.min(...ps);});
  const totalF=(fid)=>cot.itens.reduce((s,item)=>{const p=getProp(fid,item.id);return s+(p?p.preco*item.quantidade:0);},0);
  const totals=cot.fornecedores.map(f=>({id:f.id,total:totalF(f.id)})).filter(t=>t.total>0);
  const bestTotal=totals.length?Math.min(...totals.map(t=>t.total)):null;
  const winner=bestTotal!=null?cot.fornecedores.find(f=>totalF(f.id)===bestTotal):null;
  const preench=cot.fornecedores.length&&cot.itens.length?Math.round((cot.propostas.length/(cot.fornecedores.length*cot.itens.length))*100):0;

  const TH={padding:"10px 12px",textAlign:"center",fontWeight:800,fontSize:11,borderBottom:`1px solid ${C.gray200}`,letterSpacing:0.4};
  const TD={padding:"4px 8px",textAlign:"center",borderBottom:`1px solid ${C.gray200}`,fontSize:13};
  const COND_FIELDS=[{key:"entrega",label:"Entrega"},{key:"garantia",label:"Garantia"},{key:"pagamento",label:"Pagamento"},{key:"obs",label:"Obs"}];

  // renderInlineEdit/renderInlineCond são funções normais (não componentes JSX
  // via <Tag/>) de propósito — assim o React não as trata como um "tipo" novo
  // a cada re-render, evitando desmontar o <input> a cada tecla digitada.
  const renderInlineEdit=(fid,iid)=>{const p=getProp(fid,iid);const isBest=p!=null&&bestByItem[iid]!=null&&p.preco===bestByItem[iid];const isEdit=editCell?.fid===fid&&editCell?.iid===iid;
    return isEdit?<input autoFocus type="number" value={tempVal} step="0.01" onChange={e=>setTempVal(e.target.value)} onBlur={commitCell} onKeyDown={e=>{if(e.key==="Enter")commitCell();if(e.key==="Escape")setEditCell(null);}} style={{width:88,textAlign:"right",border:`2px solid ${C.amber}`,borderRadius:6,padding:"4px 6px",fontFamily:"inherit",fontSize:13}}/>:
    <div onClick={()=>editavel&&startCellEdit(fid,iid)} style={{cursor:editavel?"pointer":"default",color:isBest?C.green:p?C.gray800:C.gray400,fontWeight:isBest?900:p?600:400,display:"flex",alignItems:"center",justifyContent:"center",gap:3,padding:"4px",borderRadius:5,minWidth:70}} onMouseEnter={e=>{if(editavel)e.currentTarget.style.background=C.gray100;}} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      {isBest&&<span style={{fontSize:10,color:C.green}}>★</span>}{p?fmt(p.preco):"—"}
    </div>;
  };

  const renderInlineCond=(fid,field)=>{const val=getCond(fid,field);const isEdit=editCond?.fid===fid&&editCond?.field===field;
    return isEdit?<input autoFocus value={tempCond} onChange={e=>setTempCond(e.target.value)} onBlur={commitCond} onKeyDown={e=>{if(e.key==="Enter")commitCond();if(e.key==="Escape")setEditCond(null);}} style={{width:"100%",textAlign:"center",border:`2px solid ${C.amber}`,borderRadius:5,padding:"3px 6px",fontFamily:"inherit",fontSize:12,boxSizing:"border-box"}}/>:
    <div onClick={()=>editavel&&startCondEdit(fid,field)} style={{cursor:editavel?"pointer":"default",color:val?C.gray800:C.gray400,fontSize:12,padding:"3px 6px",borderRadius:4,minHeight:22,display:"flex",alignItems:"center",justifyContent:"center"}} onMouseEnter={e=>{if(editavel)e.currentTarget.style.background=C.gray100;}} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      {val||"—"}
    </div>;
  };

  return <div>
    {/* Voltar + header */}
    <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:C.navy,fontWeight:700,fontSize:13,padding:0,display:"flex",alignItems:"center",gap:4,marginBottom:14}}>← Voltar</button>

    {readOnly&&<div style={{background:"#FEF9C3",border:"1px solid #FDE68A",borderRadius:8,padding:"8px 14px",marginBottom:16,fontSize:12,fontWeight:700,color:"#92400E"}}>
      👁 Modo visualização — você pode ver esta cotação mas não pode editá-la.
    </div>}

    {/* Card de cabeçalho do formulário */}
    <Card style={{marginBottom:20,padding:0,overflow:"hidden"}}>
      {/* Header azul */}
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"18px 24px",display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:11,fontWeight:800,color:C.amberLight,letterSpacing:1,marginBottom:4}}>FORMULÁRIO DE COMPRA</div>
          <div style={{fontSize:20,fontWeight:900,color:C.white,lineHeight:1.2}}>{cot.titulo}</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,.55)",marginTop:4}}>
            {cot.numeroPedido} · {cot.dataCriacao}{cliente?` · ${cliente.nomeFantasia||cliente.razaoSocial}`:""}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <Badge status={cot.status}/>
          {podeAprovar&&<>
            <Btn onClick={()=>onUpdate({...cot,status:"aprovada",_aprovar:true})} variant="success" size="sm">✔ Aprovar</Btn>
            <Btn onClick={()=>onUpdate({...cot,status:"rejeitada",_aprovar:true})} variant="danger" size="sm">✕ Rejeitar</Btn>
          </>}
          {!readOnly&&(cot.status!=="fechada"&&cot.status!=="aprovada"&&cot.status!=="rejeitada"
            ?<Btn onClick={()=>onUpdate({...cot,status:"fechada"})} variant="success" size="sm">✔ Encerrar</Btn>
            :cot.status==="fechada"?<Btn onClick={()=>onUpdate({...cot,status:"cotando"})} variant="light" size="sm">Reabrir</Btn>:null)}
          {!readOnly&&<Btn onClick={()=>{setMetaDraft({...cotacao});setEditMeta(true);}} variant="light" size="sm">✏ Editar</Btn>}
          {!readOnly&&can(authUser,"create")&&<Btn onClick={handleDelete} variant="danger" size="sm">🗑</Btn>}
          <Btn onClick={()=>setShowPedido(true)} variant="navy" size="sm">👁 Ver / Imprimir Pedido</Btn>
        </div>
      </div>
      {/* Metadados */}
      <div style={{padding:"16px 24px",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:"12px 24px",borderBottom:`1px solid ${C.gray200}`}}>
        {cot.responsavel&&<div><div style={{fontSize:10,fontWeight:800,color:C.gray400,letterSpacing:0.6,marginBottom:2}}>RESPONSÁVEL</div><div style={{fontSize:14,fontWeight:700,color:C.gray800}}>{cot.responsavel}</div></div>}
        {cot.aprovador&&<div><div style={{fontSize:10,fontWeight:800,color:C.gray400,letterSpacing:0.6,marginBottom:2}}>APROVADOR</div><div style={{fontSize:14,fontWeight:700,color:C.gray800}}>{cot.aprovador}</div></div>}
        {cot.centrosCusto&&<div><div style={{fontSize:10,fontWeight:800,color:C.gray400,letterSpacing:0.6,marginBottom:2}}>TIPO DE DESPESA</div>
          <span style={{fontSize:13,fontWeight:800,color:cot.centrosCusto==="Ordinária"?C.navy:"#7C3AED",background:cot.centrosCusto==="Ordinária"?"#EEF1FB":"#F5F3FF",padding:"2px 10px",borderRadius:20}}>
            {cot.centrosCusto==="Ordinária"?"📅":"⚡"} {cot.centrosCusto}
          </span>
        </div>}
        {cot.planoContas&&<div><div style={{fontSize:10,fontWeight:800,color:C.gray400,letterSpacing:0.6,marginBottom:2}}>PLANO DE CONTAS</div><PlanoContasLabel id={cot.planoContas}/></div>}
        <div style={{display:"flex",gap:14}}>
          <div><div style={{fontSize:10,fontWeight:800,color:C.gray400,letterSpacing:0.6,marginBottom:2}}>URGENTE</div><div style={{fontSize:14,fontWeight:700,color:cot.urgente?C.red:C.gray400}}>{cot.urgente?"SIM":"NÃO"}</div></div>
          <div style={{marginLeft:16}}><div style={{fontSize:10,fontWeight:800,color:C.gray400,letterSpacing:0.6,marginBottom:2}}>NECESSÁRIO</div><div style={{fontSize:14,fontWeight:700,color:cot.necessario?C.green:C.gray400}}>{cot.necessario?"SIM":"NÃO"}</div></div>
        </div>
      </div>
      {/* Descrição + Justificativa */}
      {(cot.descricaoAquisicao||cot.justificativa)&&<div style={{padding:"14px 24px",display:"grid",gridTemplateColumns:cot.descricaoAquisicao&&cot.justificativa?"1fr 1fr":"1fr",gap:16}}>
        {cot.descricaoAquisicao&&<div><div style={{fontSize:10,fontWeight:900,color:C.navy,letterSpacing:0.6,marginBottom:4}}>DESCRIÇÃO DA AQUISIÇÃO</div><div style={{fontSize:13,color:C.gray600,lineHeight:1.6}}>{cot.descricaoAquisicao}</div></div>}
        {cot.justificativa&&<div><div style={{fontSize:10,fontWeight:900,color:C.navy,letterSpacing:0.6,marginBottom:4}}>JUSTIFICATIVA</div><div style={{fontSize:13,color:C.gray600,lineHeight:1.6}}>{cot.justificativa}</div></div>}
      </div>}
    </Card>

    {/* Progresso */}
    {cot.fornecedores.length>0&&<div style={{marginBottom:20}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,fontWeight:700,color:C.gray400,marginBottom:4}}><span>Preenchimento das propostas</span><span>{preench}%</span></div>
      <div style={{height:5,background:C.gray200,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${preench}%`,background:`linear-gradient(90deg,${C.amber},${C.amberLight})`,transition:"width .4s",borderRadius:3}}/></div>
    </div>}

    {/* Fornecedores + botão */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
      <span style={{fontSize:11,fontWeight:800,color:C.gray600,letterSpacing:0.5}}>FORNECEDORES ({cot.fornecedores.length})</span>
      {editavel&&<Btn onClick={()=>setShowVinc(true)} variant="primary" size="sm">＋ Vincular Fornecedor</Btn>}
    </div>

    {cot.fornecedores.length===0?<Card style={{textAlign:"center",padding:32,marginBottom:20}}>
      <div style={{fontSize:32,marginBottom:8}}>🏭</div>
      <div style={{fontSize:14,fontWeight:700,color:C.gray600,marginBottom:12}}>Vincule fornecedores para iniciar a comparação</div>
      <Btn onClick={()=>setShowVinc(true)} variant="navy" size="sm">＋ Vincular Fornecedor</Btn>
    </Card>:<>

      {/* Chips fornecedores */}
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:20}}>
        {cot.fornecedores.map((f,i)=><div key={f.id} style={{display:"flex",alignItems:"center",gap:6,background:C.gray50,border:`1.5px solid ${C.gray200}`,borderRadius:8,padding:"5px 10px"}}>
          <span style={{width:20,height:20,background:C.navy,color:C.white,borderRadius:"50%",fontSize:10,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{i+1}</span>
          <div><div style={{fontSize:13,fontWeight:800,color:C.navy,lineHeight:1.1}}>{f.nomeFantasia||f.razaoSocial}</div><div style={{fontSize:10,color:C.gray400}}>{f.cnpj||f.cpf}</div></div>
          {editavel&&<button onClick={()=>removeForn(f.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.gray300,fontSize:14,padding:0,lineHeight:1}}>✕</button>}
        </div>)}
      </div>

      {/* TABELA COMPARATIVA */}
      <Card style={{padding:0,overflow:"hidden",marginBottom:20}}>
        <div style={{background:C.navy,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontWeight:800,color:C.white,fontSize:14}}>Quadro Comparativo de Propostas</span>
          <span style={{fontSize:11,color:"rgba(255,255,255,.4)",fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
            ★ menor preço · clique para editar
          </span>
        </div>
        <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
          <style>{`.sticky-col{position:sticky;left:0;z-index:2;background:inherit;}.sticky-col::after{content:"";position:absolute;top:0;right:-4px;bottom:0;width:4px;background:linear-gradient(to right,rgba(0,0,0,.06),transparent);pointer-events:none;}`}</style>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth: 160 + cot.fornecedores.length * 180}}>
            <thead>
              <tr style={{background:C.gray50}}>
                <th className="sticky-col" style={{...TH,textAlign:"left",minWidth:160,color:C.gray600,background:C.gray50}}>ITEM / DESCRIÇÃO</th>
                <th style={{...TH,minWidth:48,color:C.gray600}}>UNID</th>
                <th style={{...TH,minWidth:48,color:C.gray600}}>QTD</th>
                {cot.fornecedores.map((f,i)=><th key={f.id} style={{...TH,minWidth:150,borderLeft:`1px solid ${C.gray200}`}}>
                  <div style={{display:"flex",flexDirection:"column",gap:1}}>
                    <span style={{color:C.navy,fontWeight:900,fontSize:11}}><span style={{background:C.navy,color:C.white,borderRadius:"50%",width:15,height:15,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:9,marginRight:4,verticalAlign:"middle"}}>{i+1}</span>{f.nomeFantasia||f.razaoSocial}</span>
                    <span style={{fontSize:9,color:C.gray400,fontWeight:600}}>{f.cnpj||f.cpf||""}</span>
                  </div>
                </th>)}
              </tr>
              {/* Sub-header valor unit / total */}
              <tr style={{background:"#F0F2F8"}}>
                <td colSpan={3} style={{padding:"4px 12px",fontSize:10,fontWeight:700,color:C.gray400,letterSpacing:0.4}}></td>
                {cot.fornecedores.map(f=><td key={f.id} style={{borderLeft:`1px solid ${C.gray200}`}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
                    <div style={{textAlign:"center",fontSize:9,fontWeight:800,color:C.gray500,padding:"3px 6px",letterSpacing:0.3}}>VL. UNIT</div>
                    <div style={{textAlign:"center",fontSize:9,fontWeight:800,color:C.gray500,padding:"3px 6px",borderLeft:`1px solid ${C.gray200}`,letterSpacing:0.3}}>TOTAL</div>
                  </div>
                </td>)}
              </tr>
            </thead>
            <tbody>
              {cot.itens.map((item,idx)=>{
                const bestPU=Object.entries(bestByItem).find(([k])=>k===item.id)?.[1];
                return <tr key={item.id} style={{background:idx%2===0?C.white:C.gray50}}>
                  <td className="sticky-col" style={{padding:"9px 12px",borderBottom:`1px solid ${C.gray200}`,fontWeight:600,color:C.gray800,background:idx%2===0?C.white:C.gray50}}>
                    <span style={{fontSize:11,color:C.gray400,marginRight:6}}>0{idx+1}</span>{item.descricao}
                  </td>
                  <td style={{padding:"9px 8px",borderBottom:`1px solid ${C.gray200}`,textAlign:"center",color:C.gray500,fontSize:12}}>{item.unidade}</td>
                  <td style={{padding:"9px 8px",borderBottom:`1px solid ${C.gray200}`,textAlign:"center",fontWeight:700,color:C.gray700}}>{item.quantidade}</td>
                  {cot.fornecedores.map(f=>{
                    const p=getProp(f.id,item.id);
                    const isBest=p!=null&&bestByItem[item.id]!=null&&p.preco===bestByItem[item.id];
                    const total=p?p.preco*item.quantidade:null;
                    return <td key={f.id} style={{borderBottom:`1px solid ${C.gray200}`,borderLeft:`1px solid ${C.gray200}`,background:isBest?"rgba(22,163,74,.06)":"transparent",padding:0}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"center",borderRight:`1px solid ${C.gray200}`}}>
                          {renderInlineEdit(f.id,item.id)}
                        </div>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"6px 4px"}}>
                          {total!=null?<span style={{fontWeight:isBest?800:600,color:isBest?C.green:C.gray700,fontSize:12}}>{isBest&&"★ "}{fmt(total)}</span>:<span style={{color:C.gray300,fontSize:12}}>—</span>}
                        </div>
                      </div>
                    </td>;
                  })}
                </tr>;
              })}
              {/* Linha TOTAL */}
              <tr style={{background:"#EEF1FB"}}>
                <td className="sticky-col" colSpan={3} style={{padding:"10px 12px",fontWeight:900,color:C.navy,fontSize:12,letterSpacing:0.5,background:"#EEF1FB"}}>TOTAL GERAL</td>
                {cot.fornecedores.map(f=>{
                  const total=totalF(f.id);
                  const isBestT=bestTotal!=null&&total===bestTotal&&total>0;
                  return <td key={f.id} style={{borderLeft:`1px solid ${C.gray200}`,padding:0}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
                      <div/>
                      <div style={{padding:"10px 8px",textAlign:"center",fontWeight:900,fontSize:13,color:isBestT?C.green:C.navy}}>
                        {total>0?<>{isBestT&&"★ "}{fmt(total)}</>:"—"}
                      </div>
                    </div>
                  </td>;
                })}
              </tr>
              {/* Seção condições por fornecedor */}
              <tr><td colSpan={3+cot.fornecedores.length} style={{padding:"6px 12px",background:"#F0F2F8",fontSize:10,fontWeight:900,color:C.navy,letterSpacing:0.8}}>CONDIÇÕES COMERCIAIS {editavel&&<span style={{fontWeight:500,color:C.gray400}}> — clique para preencher</span>}</td></tr>
              {COND_FIELDS.map(({key,label})=><tr key={key} style={{background:C.white}}>
                <td style={{padding:"7px 12px",fontSize:12,fontWeight:700,color:C.gray600,borderBottom:`1px solid ${C.gray200}`,borderTop:`1px solid ${C.gray200}`}} colSpan={3}>{label}</td>
                {cot.fornecedores.map(f=><td key={f.id} style={{...TD,borderLeft:`1px solid ${C.gray200}`,padding:0}} colSpan={1}>
                  {renderInlineCond(f.id,key)}
                </td>)}
              </tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Card empresa vencedora */}
      {winner&&<Card style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,border:"none",padding:"20px 24px",marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{fontSize:10,fontWeight:900,color:C.amberLight,letterSpacing:1,marginBottom:6}}>★ EMPRESA VENCEDORA — MENOR PREÇO TOTAL</div>
            <div style={{fontSize:22,fontWeight:900,color:C.white}}>{winner.nomeFantasia||winner.razaoSocial}</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.5)",marginTop:3}}>
              {winner.cnpj||winner.cpf}{(winner.celular||winner.email)?` · ${winner.celular||winner.email}`:""}
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.4)",marginBottom:2}}>VALOR FINAL</div>
            <div style={{fontSize:32,fontWeight:900,color:C.amberLight}}>{fmt(bestTotal)}</div>
          </div>
        </div>
      </Card>}
    </>}

    {/* Seção de Anexos */}
    <Card style={{marginTop:20,padding:"16px 20px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:900,color:C.navy,letterSpacing:0.5}}>📎 ANEXOS ({cot.anexos.length})</div>
        {editavel&&<label style={{cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6,background:C.navy,color:C.white,borderRadius:7,padding:"5px 12px",fontSize:12,fontWeight:700}}>
          ＋ Adicionar PDF
          <input type="file" accept="application/pdf,image/jpeg,image/png" multiple style={{display:"none"}} onChange={async e=>{
            const files=Array.from(e.target.files);
            if(!files.length)return;
            const novos=[];
            for(const file of files){
              if(file.size>10*1024*1024){alert(`"${file.name}" excede 10MB.`);continue;}
              const meta=await storageApi.upload(cot.id,file);
              novos.push(meta);
            }
            if(novos.length) onUpdate({...cot,anexos:[...cot.anexos,...novos]});
            e.target.value="";
          }}/>
        </label>}
      </div>
      {cot.anexos.length===0?<div style={{fontSize:13,color:C.gray400,textAlign:"center",padding:"12px 0"}}>Nenhum anexo ainda — adicione orçamentos, fotos ou outros documentos (PDF/JPG)</div>:
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {cot.anexos.map((a,idx)=>(
          <div key={a.path} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:C.gray50,borderRadius:7,border:`1px solid ${C.gray200}`}}>
            <span style={{fontSize:16}}>📄</span>
            <span style={{flex:1,fontSize:13,fontWeight:600,color:C.gray800,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{String(idx+1).padStart(2,"0")}. {a.name}</span>
            <span style={{fontSize:11,color:C.gray400}}>{(a.size/1024).toFixed(0)} KB</span>
            <button onClick={async()=>{const url=await storageApi.getSignedUrl(a.path);window.open(url,"_blank");}} style={{background:C.navy,color:C.white,border:"none",borderRadius:5,padding:"3px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}}>Abrir</button>
            {editavel&&<button onClick={()=>{if(window.confirm("Remover este anexo?"))onUpdate({...cot,anexos:cot.anexos.filter(x=>x.path!==a.path)});}} style={{background:"none",border:"none",cursor:"pointer",color:C.red,fontSize:14,padding:"2px 4px"}}>✕</button>}
          </div>
        ))}
      </div>}
    </Card>

    {/* Modal vincular */}
    {showVinc&&<ModalVincular fornecedores={allFornecedores} vinculados={cot.fornecedores} itensCotacao={cot.itens} onClose={()=>setShowVinc(false)} onSave={(fSel,novoF)=>{
      let fUpd=[...cot.fornecedores,...(fSel||[])];
      if(novoF){onAddFornecedor(novoF);fUpd=[...fUpd,novoF];}
      onUpdate({...cot,fornecedores:fUpd,status:"cotando"});setShowVinc(false);
    }}/>}

    {/* Modal editar meta */}
    {editMeta&&<Modal title="Editar Dados da Cotação" onClose={()=>setEditMeta(false)} width={700}>
      <SectionDivider>Identificação</SectionDivider>
      <div style={{display:"grid",gridTemplateColumns:"160px 1fr 1fr",gap:"12px 14px",marginBottom:12}}>
        <div><Lbl>Nº do Pedido</Lbl><Inp value={metaDraft.numeroPedido||""} onChange={v=>setMetaDraft(p=>({...p,numeroPedido:v}))}/></div>
        <div><Lbl>Responsável</Lbl><Inp value={metaDraft.responsavel||""} onChange={v=>setMetaDraft(p=>({...p,responsavel:v}))}/></div>
        <div><Lbl>Aprovador</Lbl><Inp value={metaDraft.aprovador||""} onChange={v=>setMetaDraft(p=>({...p,aprovador:v}))}/></div>
      </div>
      <div style={{marginBottom:12}}><Lbl>Título</Lbl><Inp value={metaDraft.titulo||""} onChange={v=>setMetaDraft(p=>({...p,titulo:v}))}/></div>
      <div style={{marginBottom:12}}><Lbl>Descrição da Aquisição</Lbl><Inp value={metaDraft.descricaoAquisicao||""} onChange={v=>setMetaDraft(p=>({...p,descricaoAquisicao:v}))} rows={3}/></div>
      <div style={{marginBottom:12}}><Lbl>Justificativa</Lbl><Inp value={metaDraft.justificativa||""} onChange={v=>setMetaDraft(p=>({...p,justificativa:v}))} rows={3}/></div>
      <ClassificacaoFields
        centrosCusto={metaDraft.centrosCusto||"Ordinária"} onCentrosCusto={v=>setMetaDraft(p=>({...p,centrosCusto:v}))}
        classificacao={metaDraft.classificacao||""} onClassificacao={v=>setMetaDraft(p=>({...p,classificacao:v}))}
        planoContas={metaDraft.planoContas||""} onPlanoContas={v=>setMetaDraft(p=>({...p,planoContas:v}))}
        urgente={metaDraft.urgente||false} onUrgente={v=>setMetaDraft(p=>({...p,urgente:v}))}
        necessario={metaDraft.necessario!==false} onNecessario={v=>setMetaDraft(p=>({...p,necessario:v}))}
      />
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:24}}>
        <Btn onClick={()=>setEditMeta(false)} variant="ghost">Cancelar</Btn>
        <Btn onClick={()=>{onUpdate({...cot,...metaDraft});setEditMeta(false);}} variant="navy">Salvar</Btn>
      </div>
    </Modal>}
    {showPedido&&<PedidoView cotacao={cot} onClose={()=>setShowPedido(false)}/>}
  </div>;
}
function ModalVincular({fornecedores,vinculados,onClose,onSave,itensCotacao}){
  const [sel,setSel]=useState([]);
  const [showForm,setShowForm]=useState(false);
  const [search,setSearch]=useState("");
  const [segFiltro,setSegFiltro]=useState("");
  const vinIds=vinculados.map(f=>f.id);
  const disp=fornecedores.filter(f=>!vinIds.includes(f.id)&&f.ativo!==false);
  const termosCotacao=(itensCotacao||[]).map(i=>i.descricao.toLowerCase()).join(" ");
  const sugeridos=disp.filter(f=>{
    if(!(f.segmentos||[]).length&&!f.produtosServicos)return false;
    return (f.segmentos||[]).some(s=>termosCotacao.includes(s.toLowerCase().split(" ")[0]))||
           (f.produtosServicos||"").split(" ").some(p=>p.length>4&&termosCotacao.includes(p.toLowerCase()));
  });
  const segsDisp=[...new Set(disp.flatMap(f=>f.segmentos||[]))].sort();
  const filtrado=disp.filter(f=>{
    const matchSeg=!segFiltro||(f.segmentos||[]).includes(segFiltro);
    const matchText=!search||[f.razaoSocial,f.nomeFantasia,f.cnpj,...(f.segmentos||[]),f.produtosServicos].some(v=>v?.toLowerCase().includes(search.toLowerCase()));
    return matchSeg&&matchText;
  });
  const toggle=(id)=>setSel(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const renderFornCard=(f,highlight)=>{const s=sel.includes(f.id);return(
    <div key={f.id} onClick={()=>toggle(f.id)} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",border:`2px solid ${s?C.navy:highlight?"#BFDBFE":C.gray200}`,borderRadius:9,cursor:"pointer",background:s?"#EEF1FB":highlight?"#F0F6FF":C.white,transition:"all .12s"}}>
      <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${s?C.navy:C.gray300}`,background:s?C.navy:C.white,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>{s&&<span style={{color:C.white,fontSize:11}}>✓</span>}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:800,color:C.navy,fontSize:13}}>{f.nomeFantasia||f.razaoSocial}</div>
        <div style={{fontSize:11,color:C.gray400}}>{f.cnpj||f.cpf||""}{(f.celular||f.email)?` · ${f.celular||f.email}`:""}</div>
        {(f.segmentos||[]).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4}}>
          {(f.segmentos||[]).slice(0,4).map(sg=><span key={sg} style={{background:C.blueLight,color:C.blue,fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:20}}>{sg}</span>)}
          {(f.segmentos||[]).length>4&&<span style={{fontSize:9,color:C.gray400,fontWeight:600}}>+{(f.segmentos||[]).length-4}</span>}
        </div>}
      </div>
      {highlight&&<span style={{fontSize:9,background:"#BFDBFE",color:C.blue,fontWeight:800,padding:"2px 6px",borderRadius:20,flexShrink:0}}>⚡ Sugerido</span>}
    </div>
  );};
  if(showForm)return <Modal title="Cadastrar Novo Fornecedor" onClose={onClose} width={800}><FormFornecedor onSave={(f)=>{onSave([],f);}} onCancel={()=>setShowForm(false)}/></Modal>;
  return <Modal title="Vincular Fornecedor à Cotação" onClose={onClose} width={560}>
    {disp.length===0?<div style={{textAlign:"center",padding:"16px 0 20px"}}>
      <div style={{fontSize:30,marginBottom:8}}>🏭</div>
      <div style={{fontSize:14,color:C.gray600,fontWeight:600,marginBottom:14}}>Todos os fornecedores já estão vinculados.</div>
      <Btn onClick={()=>setShowForm(true)} variant="navy">＋ Cadastrar Novo Fornecedor</Btn>
    </div>:<>
      <div style={{position:"relative",marginBottom:8}}>
        <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:13,color:C.gray400}}>🔍</span>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome, segmento, produto..." style={{width:"100%",border:`1.5px solid ${C.gray200}`,borderRadius:8,padding:"7px 10px 7px 30px",fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}} onFocus={e=>e.target.style.borderColor=C.amber} onBlur={e=>e.target.style.borderColor=C.gray200}/>
      </div>
      {segsDisp.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>
        <button onClick={()=>setSegFiltro("")} style={{padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:700,cursor:"pointer",border:`1.5px solid ${!segFiltro?C.navy:C.gray200}`,background:!segFiltro?C.navy:C.white,color:!segFiltro?C.white:C.gray500}}>Todos</button>
        {segsDisp.map(sg=><button key={sg} onClick={()=>setSegFiltro(sg===segFiltro?"":sg)} style={{padding:"3px 10px",borderRadius:20,fontSize:10,fontWeight:700,cursor:"pointer",border:`1.5px solid ${segFiltro===sg?C.navy:C.gray200}`,background:segFiltro===sg?C.navy:C.white,color:segFiltro===sg?C.white:C.gray500,transition:"all .1s"}}>{sg}</button>)}
      </div>}
      {!search&&!segFiltro&&sugeridos.length>0&&<>
        <div style={{fontSize:10,fontWeight:900,color:C.blue,letterSpacing:0.5,marginBottom:6}}>⚡ SUGERIDOS PARA ESTA COTAÇÃO</div>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>{sugeridos.map(f=>renderFornCard(f,true))}</div>
        <div style={{fontSize:10,fontWeight:900,color:C.gray400,letterSpacing:0.5,marginBottom:6}}>TODOS</div>
      </>}
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12,maxHeight:240,overflowY:"auto"}}>
        {filtrado.filter(f=>!(!search&&!segFiltro&&sugeridos.find(sg=>sg.id===f.id))).map(f=>renderFornCard(f,false))}
        {filtrado.length===0&&<div style={{textAlign:"center",padding:14,color:C.gray400,fontSize:13}}>Nenhum resultado</div>}
      </div>
      <div style={{borderTop:`1px solid ${C.gray200}`,paddingTop:10,marginBottom:12}}>
        <button onClick={()=>setShowForm(true)} style={{background:"none",border:"none",cursor:"pointer",color:C.navy,fontWeight:700,fontSize:12,padding:0}}>＋ Cadastrar novo fornecedor</button>
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <Btn onClick={onClose} variant="ghost">Cancelar</Btn>
        <Btn onClick={()=>sel.length&&onSave(disp.filter(f=>sel.includes(f.id)),null)} variant="navy" disabled={!sel.length}>Vincular {sel.length>0?`(${sel.length})`:""}</Btn>
      </div>
    </>}
  </Modal>;
}

// ── Portal do Fornecedor ──────────────────────────────────────────────────────
function PortalFornecedor({onBack}){
  const [step,setStep]=useState("code"); // code | form | success
  const [code,setCode]=useState("");
  const [error,setError]=useState("");
  const [checking,setChecking]=useState(false);

  useEffect(()=>{
    const hash=window.location.hash.replace("#","").trim().toUpperCase();
    if(hash.match(/^A3-[A-Z0-9]{6}$/)){setCode(hash);setTimeout(()=>validateCode(hash),300);}
  },[]);

  const validateCode=async(c)=>{
    const tok=(c||code).trim().toUpperCase();
    if(!tok){setError("Digite o código de acesso.");return;}
    setChecking(true);setError("");
    try{
      const res=await portalFornecedorApi.validarCodigo(tok);
      if(!res.ok){setError(res.erro||"Código inválido.");setChecking(false);return;}
      setCode(tok);setStep("form");setChecking(false);
    }catch(e){setError("Erro ao validar código. Tente novamente.");setChecking(false);}
  };

  const handleSubmit=async(forn)=>{
    try{
      const res=await portalFornecedorApi.enviarCadastro(code,forn);
      if(!res.ok){setError(res.erro||"Erro ao enviar cadastro.");return;}
      setStep("success");
    }catch(e){setError("Erro ao enviar cadastro. Tente novamente.");}
  };

  if(step==="success") return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,fontFamily:"'DM Sans',sans-serif",padding:20}}>
      <div style={{background:C.white,borderRadius:20,padding:"48px 40px",textAlign:"center",maxWidth:440,width:"100%",boxShadow:"0 32px 80px rgba(0,0,0,.25)"}}>
        <div style={{fontSize:56,marginBottom:16}}>✅</div>
        <div style={{fontSize:22,fontWeight:900,color:C.navy,marginBottom:8}}>Cadastro enviado!</div>
        <div style={{fontSize:15,color:C.gray600,lineHeight:1.6,marginBottom:24}}>Seus dados foram recebidos com sucesso. O administrador irá revisar e ativar seu cadastro em breve.</div>
        <Btn onClick={onBack} variant="navy" size="lg">Voltar à página inicial</Btn>
      </div>
    </div>
  );

  if(step==="form") return(
    <div style={{fontFamily:"'DM Sans',sans-serif",minHeight:"100vh",background:C.gray50}}>
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyLight})`,padding:"16px 24px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:32,height:32,background:C.amber,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,color:C.navy,fontSize:13}}>A3</div>
          <div><div style={{fontWeight:900,fontSize:14,color:C.white}}>Cadastro de Fornecedor</div><div style={{fontSize:11,color:"rgba(255,255,255,.5)"}}>Código: {code}</div></div>
        </div>
        <span style={{fontSize:11,color:"rgba(255,255,255,.4)"}}>Portal A3 Cotações</span>
      </div>
      <div style={{maxWidth:800,margin:"0 auto",padding:"28px 18px"}}>
        <Card style={{marginBottom:16,padding:"14px 20px",background:C.blueLight,border:`1px solid #BFDBFE`}}>
          <div style={{fontSize:13,color:C.blue,fontWeight:700}}>📋 Preencha seus dados cadastrais completos. Todas as informações serão revisadas pelo administrador antes da ativação.</div>
        </Card>
        {error&&<Card style={{marginBottom:16,padding:"12px 16px",background:C.redLight,border:"1px solid #FCA5A5"}}><div style={{fontSize:13,color:C.red,fontWeight:700}}>{error}</div></Card>}
        <Card style={{padding:24}}>
          <FormFornecedor onSave={handleSubmit} onCancel={onBack}/>
        </Card>
      </div>
    </div>
  );

  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:`linear-gradient(135deg,${C.navy} 0%,${C.navyLight} 100%)`,fontFamily:"'DM Sans',sans-serif",padding:20}}>
      <div style={{width:"100%",maxWidth:420}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:56,height:56,background:C.amber,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,color:C.navy,fontSize:22,margin:"0 auto 16px"}}>A3</div>
          <div style={{fontSize:24,fontWeight:900,color:C.white}}>Portal do Fornecedor</div>
          <div style={{fontSize:14,color:"rgba(255,255,255,.5)",marginTop:6}}>A3 Cotações — Gestão de Compras</div>
        </div>
        <Card style={{padding:32}}>
          <div style={{fontSize:16,fontWeight:800,color:C.navy,marginBottom:4}}>Acesso ao Cadastro</div>
          <div style={{fontSize:13,color:C.gray600,marginBottom:20,lineHeight:1.6}}>Digite o código de acesso que você recebeu do administrador para preencher seu cadastro.</div>
          <Lbl required>Código de Acesso</Lbl>
          <input
            value={code} onChange={e=>setCode(e.target.value.toUpperCase())}
            placeholder="Ex: A3-X7K2M9"
            onKeyDown={e=>e.key==="Enter"&&validateCode()}
            style={{width:"100%",border:`2px solid ${error?C.red:C.gray200}`,borderRadius:10,padding:"12px 16px",fontSize:18,fontFamily:"'DM Sans',sans-serif",fontWeight:800,letterSpacing:2,textAlign:"center",color:C.navy,outline:"none",boxSizing:"border-box",marginBottom:8,background:C.white}}
            onFocus={e=>e.target.style.borderColor=C.amber} onBlur={e=>e.target.style.borderColor=error?C.red:C.gray200}
          />
          {error&&<div style={{fontSize:12,color:C.red,fontWeight:600,marginBottom:12}}>{error}</div>}
          <Btn onClick={()=>validateCode()} variant="navy" size="lg" disabled={checking} style={{width:"100%",justifyContent:"center",marginTop:8}}>
            {checking?"Verificando...":"Acessar Cadastro →"}
          </Btn>
          <div style={{textAlign:"center",marginTop:20}}>
            <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:C.gray400,fontSize:12,fontWeight:600}}>← Voltar</button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Tela Convites (admin/comprador) ───────────────────────────────────────────
const EXPIRY_H=48;
const genToken=()=>{const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";return"A3-"+Array.from({length:6},()=>c[Math.floor(Math.random()*c.length)]).join("");};
const isExpired=(inv)=>new Date(inv.expiresAt).getTime()<Date.now();
const fmtDiff=(iso)=>{const h=Math.max(0,Math.round((new Date(iso).getTime()-Date.now())/3600000));return h>0?`${h}h restante${h!==1?"s":""}`:"Expirado";};

function TelaConvites({onApprove}){
  const [invites,setInvites]=useState([]);
  const [pending,setPending]=useState([]);
  const [showGen,setShowGen]=useState(false);
  const [label,setLabel]=useState("");
  const [generated,setGenerated]=useState(null);
  const [copied,setCopied]=useState(false);
  const [loading,setLoading]=useState(true);

  const reload=async()=>{
    const [inv,pend]=await Promise.all([convitesFornecedorApi.list(),pendentesFornecedorApi.list()]);
    setInvites(inv);setPending(pend);setLoading(false);
  };
  useEffect(()=>{reload();const t=setInterval(reload,15000);return()=>clearInterval(t);},[]);

  const generate=async()=>{
    const code=genToken();
    const expiresAt=new Date(Date.now()+EXPIRY_H*3600000).toISOString();
    const inv=await convitesFornecedorApi.create({code,label:label.trim(),expiresAt});
    setInvites(p=>[inv,...p]);setGenerated(inv);setLabel("");
  };

  const revokeInvite=async(code)=>{await convitesFornecedorApi.revoke(code);await reload();};

  const approvePending=async(pend)=>{
    // pend.dados já está em snake_case (vindo direto do banco) - convertendo para camelCase
    const forn=Object.fromEntries(Object.entries(pend.dados).map(([k,v])=>[k.replace(/_([a-z])/g,(_,l)=>l.toUpperCase()),v]));
    onApprove({...forn,ativo:true});
    await pendentesFornecedorApi.delete(pend.id);
    await reload();
  };

  const rejectPending=async(id)=>{await pendentesFornecedorApi.delete(id);await reload();};

  const copyMsg=(inv)=>{
    const url=window.location.href.split("#")[0];
    const msg=`Olá! Você foi convidado para se cadastrar como fornecedor da A3.\n\nAcesse o link abaixo e utilize o código de acesso para preencher seu cadastro:\n\n🔗 Link: ${url}#${inv.code}\n🔑 Código: ${inv.code}\n⏰ Válido por ${EXPIRY_H} horas\n\nQualquer dúvida, entre em contato conosco.`;
    navigator.clipboard.writeText(msg).then(()=>{setCopied(inv.code);setTimeout(()=>setCopied(null),2500);});
  };

  const STATUS_INV={active:{label:"Ativo",bg:"#DCFCE7",color:"#16A34A"},used:{label:"Utilizado",bg:"#F3F4F6",color:"#6B7280"},revoked:{label:"Revogado",bg:C.redLight,color:C.red}};

  const activeInvites=invites.filter(i=>i.status==="active"&&!isExpired(i));
  const pendingCount=pending.length;

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
      <div>
        <h1 style={{margin:0,fontSize:22,fontWeight:900,color:C.navy}}>Convites & Cadastro</h1>
        <div style={{fontSize:13,color:C.gray400,marginTop:2}}>{activeInvites.length} convite{activeInvites.length!==1?"s":""} ativo{activeInvites.length!==1?"s":""} · {pendingCount} aguardando aprovação</div>
      </div>
      <Btn onClick={()=>setShowGen(true)} variant="primary">🔗 Gerar Convite</Btn>
    </div>

    {pendingCount>0&&<>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <span style={{fontSize:11,fontWeight:900,color:C.red,letterSpacing:0.5}}>AGUARDANDO APROVAÇÃO</span>
        <span style={{background:C.red,color:C.white,borderRadius:"50%",width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900}}>{pendingCount}</span>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:28}}>
        {pending.map(p=>{
          const d=p.dados||{};
          return <Card key={p.id} style={{padding:"16px 20px",borderLeft:`4px solid ${C.amber}`}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <div>
                <div style={{fontWeight:900,fontSize:15,color:C.navy}}>{d.razao_social}</div>
                <div style={{fontSize:12,color:C.gray400,marginTop:3}}>
                  {d.cnpj||d.cpf||"—"} · {d.email||"—"} · {d.celular||d.telefone||"—"}
                </div>
                <div style={{fontSize:11,color:C.gray400,marginTop:2}}>Enviado em {new Date(p.submittedAt).toLocaleString("pt-BR")} · Código: {p.inviteCode}</div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <Btn onClick={()=>approvePending(p)} variant="success" size="sm">✔ Aprovar</Btn>
                <Btn onClick={()=>rejectPending(p.id)} variant="danger" size="sm">Rejeitar</Btn>
              </div>
            </div>
          </Card>;
        })}
      </div>
    </>}

    <div style={{fontSize:11,fontWeight:900,color:C.gray600,letterSpacing:0.5,marginBottom:10}}>HISTÓRICO DE CONVITES ({invites.length})</div>
    {invites.length===0?<Card style={{textAlign:"center",padding:40}}>
      <div style={{fontSize:40,marginBottom:10}}>🔗</div>
      <div style={{fontSize:14,fontWeight:700,color:C.gray600}}>Nenhum convite gerado ainda</div>
      <Btn onClick={()=>setShowGen(true)} variant="navy" style={{marginTop:14}}>Gerar Primeiro Convite</Btn>
    </Card>:
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {invites.map(inv=>{
        const st=isExpired(inv)&&inv.status==="active"?{label:"Expirado",bg:C.redLight,color:C.red}:STATUS_INV[inv.status]||STATUS_INV.active;
        return <Card key={inv.code} style={{padding:"12px 18px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <code style={{fontSize:16,fontWeight:900,color:C.navy,letterSpacing:2,background:C.gray100,padding:"4px 10px",borderRadius:6}}>{inv.code}</code>
              <div>
                {inv.label&&<div style={{fontSize:13,fontWeight:700,color:C.gray800}}>{inv.label}</div>}
                <div style={{fontSize:11,color:C.gray400}}>
                  Criado {new Date(inv.createdAt).toLocaleString("pt-BR")} · {inv.status==="active"&&!isExpired(inv)?fmtDiff(inv.expiresAt):inv.status==="used"?`Usado em ${new Date(inv.usedAt||inv.createdAt).toLocaleString("pt-BR")}`:"—"}
                </div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{background:st.bg,color:st.color,fontSize:11,fontWeight:800,padding:"2px 10px",borderRadius:20}}>{st.label}</span>
              {inv.status==="active"&&!isExpired(inv)&&<>
                <Btn onClick={()=>copyMsg(inv)} variant="ghost" size="sm">{copied===inv.code?"✔ Copiado":"📋 Copiar Link"}</Btn>
                <Btn onClick={()=>revokeInvite(inv.code)} variant="danger" size="sm">Revogar</Btn>
              </>}
            </div>
          </div>
        </Card>;
      })}
    </div>}

    {showGen&&!generated&&<Modal title="Gerar Convite de Cadastro" onClose={()=>{setShowGen(false);setLabel("");}} width={480}>
      <div style={{marginBottom:20}}>
        <Lbl>Identificação (opcional)</Lbl>
        <Inp value={label} onChange={setLabel} placeholder="Ex: Distribuidora ABC, Fornecedor de limpeza..."/>
        <div style={{fontSize:12,color:C.gray400,marginTop:6}}>Ajuda a identificar para quem foi enviado o convite.</div>
      </div>
      <Card style={{background:C.gray50,padding:16,marginBottom:20}}>
        <div style={{fontSize:12,fontWeight:700,color:C.gray600,marginBottom:4}}>O convite irá:</div>
        <div style={{fontSize:13,color:C.gray600,lineHeight:1.8}}>
          ✔ Gerar um código único de acesso<br/>
          ✔ Expirar automaticamente em {EXPIRY_H} horas<br/>
          ✔ Permitir apenas um cadastro por código<br/>
          ✔ Requerer aprovação do administrador
        </div>
      </Card>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <Btn onClick={()=>{setShowGen(false);setLabel("");}} variant="ghost">Cancelar</Btn>
        <Btn onClick={generate} variant="navy">Gerar Convite</Btn>
      </div>
    </Modal>}

    {generated&&<Modal title="Convite Gerado!" onClose={()=>setGenerated(null)} width={500}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:11,fontWeight:800,color:C.gray400,letterSpacing:0.6,marginBottom:8}}>CÓDIGO DE ACESSO</div>
        <code style={{fontSize:36,fontWeight:900,color:C.navy,letterSpacing:6,background:C.gray100,padding:"12px 24px",borderRadius:12,display:"block"}}>{generated.code}</code>
        <div style={{fontSize:12,color:C.gray400,marginTop:8}}>Válido por {EXPIRY_H} horas</div>
      </div>
      <Card style={{background:"#EEF1FB",padding:16,marginBottom:20}}>
        <div style={{fontSize:11,fontWeight:800,color:C.navy,letterSpacing:0.5,marginBottom:8}}>MENSAGEM PRONTA PARA ENVIO</div>
        <div style={{fontSize:12,color:C.gray600,lineHeight:1.7,fontFamily:"monospace",whiteSpace:"pre-wrap"}}>{`Olá! Você foi convidado para se cadastrar como fornecedor da A3.

🔗 Acesse: ${window.location.href.split("#")[0]}#${generated.code}
🔑 Código: ${generated.code}
⏰ Válido por ${EXPIRY_H} horas

Clique no link ou acesse o portal e informe o código.`}</div>
      </Card>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
        <Btn onClick={()=>{copyMsg(generated);}} variant="ghost">{copied===generated.code?"✔ Copiado!":"📋 Copiar Mensagem"}</Btn>
        <Btn onClick={()=>setGenerated(null)} variant="navy">Fechar</Btn>
      </div>
    </Modal>}
  </div>;
}

// ── Seletor de Perfil ─────────────────────────────────────────────────────────
function LoginScreen(){
  const [modo,setModo]=useState("login"); // login | cadastro
  const [nome,setNome]=useState("");
  const [email,setEmail]=useState("");
  const [senha,setSenha]=useState("");
  const [erro,setErro]=useState("");
  const [loading,setLoading]=useState(false);
  const [aviso,setAviso]=useState("");

  const handleLogin=async()=>{
    if(!email.trim()||!senha){setErro("Preencha e-mail e senha.");return;}
    setLoading(true);setErro("");
    try{
      const {error}=await auth.signIn(email.trim(),senha);
      if(error) throw error;
    }catch(e){
      setErro(e.message==="Invalid login credentials"?"E-mail ou senha incorretos.":e.message);
    }finally{setLoading(false);}
  };

  const handleSignup=async()=>{
    if(!nome.trim()||!email.trim()||!senha){setErro("Preencha todos os campos.");return;}
    if(senha.length<6){setErro("A senha deve ter pelo menos 6 caracteres.");return;}
    setLoading(true);setErro("");setAviso("");
    try{
      const {data,error}=await auth.signUp(email.trim(),senha,nome.trim());
      if(error) throw error;
      if(data?.session){ /* login automático já feito pelo Supabase */ }
      else setAviso("Conta criada! Se a confirmação de e-mail estiver ativa no projeto, verifique sua caixa de entrada antes de entrar.");
    }catch(e){
      setErro(e.message);
    }finally{setLoading(false);}
  };

  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:`linear-gradient(135deg,${C.navy} 0%,${C.navyLight} 100%)`,fontFamily:"'DM Sans',sans-serif",padding:20}}>
      <div style={{width:"100%",maxWidth:420}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:60,height:60,background:C.amber,borderRadius:16,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,color:C.navy,fontSize:24,margin:"0 auto 16px"}}>A3</div>
          <div style={{fontSize:26,fontWeight:900,color:C.white}}>A3 Cotações</div>
          <div style={{fontSize:14,color:"rgba(255,255,255,.5)",marginTop:4}}>Gestão de Compras</div>
        </div>
        <Card style={{padding:32}}>
          <div style={{display:"flex",gap:4,background:C.gray100,borderRadius:9,padding:3,marginBottom:22}}>
            {[["login","Entrar"],["cadastro","Criar Conta"]].map(([k,l])=>(
              <button key={k} onClick={()=>{setModo(k);setErro("");setAviso("");}} style={{flex:1,padding:"7px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,background:modo===k?C.white:"transparent",color:modo===k?C.navy:C.gray400,boxShadow:modo===k?"0 1px 4px rgba(0,0,0,.1)":"none"}}>{l}</button>
            ))}
          </div>

          {modo==="cadastro"&&<div style={{marginBottom:14}}><Lbl required>Nome completo</Lbl><Inp value={nome} onChange={setNome} placeholder="Seu nome"/></div>}
          <div style={{marginBottom:14}}><Lbl required>E-mail</Lbl><Inp value={email} onChange={setEmail} type="email" placeholder="seu@email.com"/></div>
          <div><Lbl required>Senha</Lbl><Inp value={senha} onChange={setSenha} type="password" placeholder={modo==="cadastro"?"Mínimo 6 caracteres":"••••••••"}/></div>

          {erro&&<div style={{fontSize:12,color:C.red,fontWeight:600,marginTop:12,padding:"8px 12px",background:C.redLight,borderRadius:7}}>{erro}</div>}
          {aviso&&<div style={{fontSize:12,color:C.blue,fontWeight:600,marginTop:12,padding:"8px 12px",background:C.blueLight,borderRadius:7}}>{aviso}</div>}

          <Btn onClick={modo==="login"?handleLogin:handleSignup} variant="navy" size="lg" disabled={loading} style={{width:"100%",justifyContent:"center",marginTop:20}}>
            {loading?"Aguarde...":modo==="login"?"Entrar →":"Criar Conta →"}
          </Btn>
          {modo==="cadastro"&&<div style={{fontSize:11,color:C.gray400,marginTop:12,lineHeight:1.5}}>
            O primeiro usuário criado no sistema se torna Administrador automaticamente. Os próximos entram com o perfil definido pelo Admin em "Usuários".
          </div>}
        </Card>
      </div>
    </div>
  );
}

// ── Tela Usuários (admin) ─────────────────────────────────────────────────────
function RoleOpt({val,onSet,k}){
  const r=ROLES[k];
  return(
    <div onClick={()=>onSet(k)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",border:`2px solid ${val===k?r.color:C.gray200}`,borderRadius:8,cursor:"pointer",background:val===k?r.bg:C.white}}>
      <div style={{width:12,height:12,borderRadius:"50%",border:`2px solid ${val===k?r.color:C.gray300}`,background:val===k?r.color:C.white,flexShrink:0}}/>
      <div style={{fontWeight:800,fontSize:13,color:val===k?r.color:C.gray800}}>{r.label}</div>
    </div>
  );
}

function TelaUsuarios(){
  const {user:me}=useAuth();
  const [users,setUsers]=useState([]);
  const [convites,setConvites]=useState([]);
  const [showInv,setShowInv]=useState(false);
  const [email,setEmail]=useState("");
  const [role,setRole]=useState("comprador");
  const [cargo,setCargo]=useState("");
  const [erro,setErro]=useState("");
  const [editing,setEditing]=useState(null);

  const reload=async()=>{
    const [u,c]=await Promise.all([profilesApi.list(),convitesUsuarioApi.list()]);
    setUsers(u);setConvites(c);
  };
  useEffect(()=>{reload();},[]);

  const handleInvite=async()=>{
    if(!email.trim()){setErro("Informe o e-mail.");return;}
    if(convites.some(c=>c.email===email.trim())||users.some(u=>u.email===email.trim())){setErro("Este e-mail já tem acesso ou convite pendente.");return;}
    await convitesUsuarioApi.create({email:email.trim().toLowerCase(),role,cargo});
    setEmail("");setCargo("");setRole("comprador");setErro("");setShowInv(false);
    await reload();
  };

  const revokeConvite=async(id)=>{await convitesUsuarioApi.delete(id);await reload();};

  const saveEdit=async()=>{
    await profilesApi.update(editing.id,{role:editing.role,cargo:editing.cargo,telefone:editing.telefone,ativo:editing.ativo});
    setEditing(null);await reload();
  };

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
      <div><h1 style={{margin:0,fontSize:22,fontWeight:900,color:C.navy}}>Usuários</h1>
        <div style={{fontSize:13,color:C.gray400,marginTop:2}}>{users.length} com acesso · {convites.filter(c=>!c.usado).length} convite{convites.filter(c=>!c.usado).length!==1?"s":""} pendente{convites.filter(c=>!c.usado).length!==1?"s":""}</div>
      </div>
      <Btn onClick={()=>setShowInv(true)} variant="primary">＋ Convidar Usuário</Btn>
    </div>

    <div style={{fontSize:11,fontWeight:900,color:C.gray600,letterSpacing:0.5,marginBottom:10}}>USUÁRIOS COM ACESSO</div>
    <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:28}}>
      {users.map(u=>{
        const r=ROLES[u.role]||ROLES.comprador;
        return <Card key={u.id} style={{padding:"14px 18px",opacity:u.ativo===false?.55:1}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:40,height:40,borderRadius:"50%",background:r.bg,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:16,color:r.color,flexShrink:0,border:`2px solid ${r.color}30`}}>{u.nome.charAt(0).toUpperCase()}</div>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontWeight:900,fontSize:15,color:C.navy}}>{u.nome}</span>
                  {u.id===me.userId&&<span style={{fontSize:10,fontWeight:800,color:C.gray400,background:C.gray100,padding:"1px 6px",borderRadius:10}}>você</span>}
                </div>
                <div style={{fontSize:12,color:C.gray400,marginTop:2}}>{u.email}{u.cargo?` · ${u.cargo}`:""}</div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <span style={{background:r.bg,color:r.color,fontSize:11,fontWeight:800,padding:"2px 10px",borderRadius:20}}>{r.label}</span>
              <span style={{background:u.ativo!==false?C.greenLight:C.gray100,color:u.ativo!==false?C.green:C.gray400,fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20}}>{u.ativo!==false?"Ativo":"Inativo"}</span>
              <Btn onClick={()=>setEditing({...u})} variant="ghost" size="sm">Editar</Btn>
            </div>
          </div>
        </Card>;
      })}
    </div>

    {convites.filter(c=>!c.usado).length>0&&<>
      <div style={{fontSize:11,fontWeight:900,color:C.gray600,letterSpacing:0.5,marginBottom:10}}>CONVITES PENDENTES</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {convites.filter(c=>!c.usado).map(c=>{
          const r=ROLES[c.role]||ROLES.comprador;
          return <Card key={c.id} style={{padding:"12px 18px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:800,fontSize:14,color:C.gray800}}>{c.email}</div>
                <div style={{fontSize:11,color:C.gray400,marginTop:2}}>Convidado para perfil: <span style={{color:r.color,fontWeight:700}}>{r.label}</span>{c.cargo?` · ${c.cargo}`:""}</div>
              </div>
              <Btn onClick={()=>revokeConvite(c.id)} variant="danger" size="sm">Revogar</Btn>
            </div>
          </Card>;
        })}
      </div>
    </>}

    {showInv&&<Modal title="Convidar Usuário" onClose={()=>{setShowInv(false);setErro("");}} width={440}>
      <div style={{fontSize:13,color:C.gray600,marginBottom:18,lineHeight:1.6}}>
        Informe o e-mail e o perfil. Quando a pessoa criar a conta com esse e-mail em "Criar Conta", ela já entra automaticamente com o perfil definido aqui.
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div><Lbl required>E-mail</Lbl><Inp value={email} onChange={setEmail} type="email" placeholder="pessoa@email.com"/></div>
        <div><Lbl>Cargo / Função (opcional)</Lbl><Inp value={cargo} onChange={setCargo} placeholder="Ex: Comprador, Síndico do Wonder..."/></div>
        <div>
          <Lbl required>Perfil de Acesso</Lbl>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:6}}>
            {Object.keys(ROLES).map(k=><RoleOpt key={k} val={role} onSet={setRole} k={k}/>)}
          </div>
        </div>
      </div>
      {erro&&<div style={{fontSize:12,color:C.red,fontWeight:600,marginTop:12,padding:"8px 12px",background:C.redLight,borderRadius:7}}>{erro}</div>}
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:22}}>
        <Btn onClick={()=>setShowInv(false)} variant="ghost">Cancelar</Btn>
        <Btn onClick={handleInvite} variant="navy">Convidar</Btn>
      </div>
    </Modal>}

    {editing&&<Modal title="Editar Usuário" onClose={()=>setEditing(null)} width={420}>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div><Lbl>Cargo / Função</Lbl><Inp value={editing.cargo||""} onChange={v=>setEditing(p=>({...p,cargo:v}))}/></div>
        <div><Lbl>Telefone</Lbl><Inp value={editing.telefone||""} onChange={v=>setEditing(p=>({...p,telefone:v}))} mask="tel"/></div>
        <div>
          <Lbl>Perfil de Acesso</Lbl>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:6}}>
            {Object.keys(ROLES).map(k=><RoleOpt key={k} val={editing.role} onSet={v=>setEditing(p=>({...p,role:v}))} k={k}/>)}
          </div>
        </div>
        {editing.id!==me.userId&&<Toggle value={editing.ativo!==false} onChange={v=>setEditing(p=>({...p,ativo:v}))} label="Usuário ativo"/>}
      </div>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:22}}>
        <Btn onClick={()=>setEditing(null)} variant="ghost">Cancelar</Btn>
        <Btn onClick={saveEdit} variant="navy">Salvar</Btn>
      </div>
    </Modal>}
  </div>;
}

// ── App ──────────────────────────────────────────────────────────────────────
export default function App(){
  const isMobile=useIsMobile();
  const [session,setSession]=useState(null);   // {userId, nome, role, email} | null
  const [authChecked,setAuthChecked]=useState(false);
  const [cotacoes,setCotacoes]=useState([]);
  const [fornecedores,setFornecedores]=useState([]);
  const [clientes,setClientes]=useState([]);
  const [currCotId,setCurrCotId]=useState(null); // separado de view para evitar ambiguidade
  const [view,setView]=useState("dashboard");
  const [showNova,setShowNova]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [supplierMode,setSupplierMode]=useState(false);
  const [pendingCount,setPendingCount]=useState(0);

  const authCtx={user:session,logout:()=>auth.signOut()};

  // Detecta link de convite de fornecedor na URL (não depende de login)
  useEffect(()=>{
    const hash=window.location.hash.replace("#","").trim().toUpperCase();
    if(hash.match(/^A3-[A-Z0-9]{6}$/)) setSupplierMode(true);
  },[]);

  // Sessão Supabase: checa ao montar e escuta mudanças (login/logout)
  useEffect(()=>{
    let unsub;
    (async()=>{
      const {data}=await auth.getSession();
      if(data?.session) await hydrateSession(data.session);
      setAuthChecked(true);
      const sub=auth.onAuthChange(async(sess)=>{
        if(sess) await hydrateSession(sess);
        else{setSession(null);setLoaded(false);}
      });
      unsub=sub?.data?.subscription;
    })();
    return ()=>unsub?.unsubscribe?.();
  },[]);

  async function hydrateSession(sess){
    try{
      const profile=await getMyProfile(sess.user.id);
      setSession({userId:profile.id,nome:profile.nome,role:profile.role,email:profile.email,ativo:profile.ativo});
    }catch{
      // profile ainda não criado pelo trigger (raríssimo, race condition) — tenta de novo em 1s
      setTimeout(async()=>{
        try{const p=await getMyProfile(sess.user.id);setSession({userId:p.id,nome:p.nome,role:p.role,email:p.email,ativo:p.ativo});}catch{}
      },1200);
    }
  }

  // Carrega dados principais após login
  useEffect(()=>{
    if(!session) return;
    setLoaded(false);
    Promise.all([cotacoesApi.list(),fornecedoresApi.list(),clientesApi.list()]).then(([c,f,cl])=>{
      setCotacoes(c);setFornecedores(f);setClientes(cl);setLoaded(true);
    });
  },[session?.userId]);

  // Badge de pendentes de fornecedor (polling leve)
  useEffect(()=>{
    if(!session) return;
    const poll=()=>pendentesFornecedorApi.list().then(p=>setPendingCount(p.length)).catch(()=>{});
    poll();const t=setInterval(poll,15000);return()=>clearInterval(t);
  },[session?.userId]);

  const reloadCotacoes=async()=>setCotacoes(await cotacoesApi.list());
  const reloadFornecedores=async()=>setFornecedores(await fornecedoresApi.list());
  const reloadClientes=async()=>setClientes(await clientesApi.list());

  const createCot=async(c)=>{
    const novo=await cotacoesApi.create(c);
    await reloadCotacoes();
    setCurrCotId(novo.id);setShowNova(false);
  };

  const updCot=useCallback(async(u)=>{
    // Aprovação/rejeição do síndico passa pela RPC restrita; demais campos via UPDATE normal.
    if(u._aprovar){
      await cotacoesApi.aprovar(u.id,u.status);
    }else{
      const {id,createdAt,updatedAt,criadoPor,_aprovar,...fields}=u;
      await cotacoesApi.update(u.id,fields);
    }
    await reloadCotacoes();
  },[]);

  const deleteCot=async(id)=>{
    await cotacoesApi.delete(id);
    await reloadCotacoes();
    if(currCotId===id){setCurrCotId(null);setView("dashboard");}
  };

  const currCot=currCotId?cotacoes.find(c=>c.id===currCotId):null;

  if(supplierMode) return(
    <MobileCtx.Provider value={isMobile}><AuthCtx.Provider value={authCtx}>
      <PortalFornecedor onBack={()=>{setSupplierMode(false);window.location.hash="";}}/>
    </AuthCtx.Provider></MobileCtx.Provider>
  );

  if(!authChecked) return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.navy,fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{color:C.white,fontWeight:700}}>Carregando...</div>
    </div>
  );

  if(!session) return(
    <MobileCtx.Provider value={isMobile}><AuthCtx.Provider value={authCtx}>
      <LoginScreen/>
    </AuthCtx.Provider></MobileCtx.Provider>
  );

  if(session.ativo===false) return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.navy,fontFamily:"'DM Sans',sans-serif",padding:20}}>
      <Card style={{maxWidth:400,textAlign:"center",padding:32}}>
        <div style={{fontSize:40,marginBottom:12}}>🔒</div>
        <div style={{fontWeight:900,fontSize:17,color:C.navy,marginBottom:8}}>Conta desativada</div>
        <div style={{fontSize:13,color:C.gray600,marginBottom:20}}>Seu acesso foi desativado pelo administrador. Entre em contato para mais informações.</div>
        <Btn onClick={()=>auth.signOut()} variant="navy">Sair</Btn>
      </Card>
    </div>
  );

  if(!loaded) return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.gray50,fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{color:C.navy,fontWeight:700}}>Carregando dados...</div>
    </div>
  );

  const role=ROLES[session.role]||ROLES.comprador;
  const isInCotacao=!!currCot;
  const isSindico=session.role==="sindico";
  const cotacoesVisiveis=isSindico?cotacoes.filter(c=>c.status!=="rascunho"):cotacoes;

  const NAV=[
    {id:"dashboard",icon:"📋",label:"Cotações"},
    ...(can(session,"manage_fornecedores")?[{id:"fornecedores",icon:"🏭",label:"Fornecedores"}]:[]),
    ...(can(session,"manage_fornecedores")?[{id:"clientes",icon:"🏢",label:"Clientes"}]:[]),
    ...(can(session,"invite")?[{id:"convites",icon:"🔗",label:"Convites",badge:pendingCount}]:[]),
    ...(can(session,"all")?[{id:"plano",icon:"📒",label:"Plano de Contas"}]:[]),
    ...(can(session,"all")?[{id:"usuarios",icon:"👥",label:"Usuários"}]:[]),
  ];

  return(
    <MobileCtx.Provider value={isMobile}>
    <AuthCtx.Provider value={authCtx}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800;900&display=swap');
        *{box-sizing:border-box;}
        body{margin:0;background:${C.gray50};-webkit-tap-highlight-color:transparent;}
        input[type=number]::-webkit-inner-spin-button{opacity:.5;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-thumb{background:${C.gray200};border-radius:2px;}
        button,input,select,textarea{font-family:'DM Sans',sans-serif;}
        @media print{
          @page{size:A4 landscape;margin:10mm;}
          body>*{display:none!important;}
          #a3-print-area{display:block!important;position:fixed!important;inset:0!important;z-index:99999!important;background:#fff!important;overflow:auto!important;}
          #a3-print-area .no-print{display:none!important;}
        }
      `}</style>
      <div style={{fontFamily:"'DM Sans',sans-serif",minHeight:"100vh",background:C.gray50,paddingBottom:isMobile?72:0}}>

        {/* Topbar */}
        <div style={{background:C.white,borderBottom:`2px solid ${C.amber}`,padding:`0 ${isMobile?14:20}px`,height:isMobile?52:56,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 10px rgba(0,0,0,.06)"}}>
          <div style={{display:"flex",alignItems:"center",gap:isMobile?8:16}}>
            <div style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}} onClick={()=>{setCurrCotId(null);setView("dashboard");}}>
              <div style={{width:32,height:32,background:`linear-gradient(135deg,${C.amber},${C.amberDark})`,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,color:C.navy,fontSize:13,flexShrink:0}}>A3</div>
              {!isMobile&&<div><div style={{fontWeight:900,fontSize:14,color:C.navy,lineHeight:1.1}}>A3 Cotações</div><div style={{fontSize:10,color:C.gray400,fontWeight:600}}>Gestão de Compras</div></div>}
              {isMobile&&<div style={{fontWeight:900,fontSize:15,color:C.navy}}>{isInCotacao?currCot?.titulo?.slice(0,20)+(currCot?.titulo?.length>20?"…":""):NAV.find(n=>n.id===view)?.label||"A3"}</div>}
            </div>
            {!isMobile&&<nav style={{display:"flex",gap:2}}>
              {NAV.map(n=>{const active=view===n.id||(n.id==="dashboard"&&isInCotacao);return(
                <button key={n.id} onClick={()=>{setCurrCotId(null);setView(n.id);}} style={{background:active?C.navy:"transparent",color:active?C.white:C.gray600,border:"none",borderRadius:7,padding:"5px 12px",fontWeight:700,fontSize:12,cursor:"pointer",transition:"all .15s",display:"flex",alignItems:"center",gap:5}}>
                  {n.icon} {n.label}
                  {n.badge>0&&<span style={{background:C.red,color:C.white,borderRadius:"50%",width:16,height:16,fontSize:9,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center"}}>{n.badge}</span>}
                </button>
              );})}
            </nav>}
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,background:role.bg,borderRadius:20,padding:"4px 10px 4px 8px"}}>
              <div style={{width:22,height:22,borderRadius:"50%",background:role.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:C.white}}>{session.nome.charAt(0).toUpperCase()}</div>
              {!isMobile&&<span style={{fontSize:11,fontWeight:800,color:role.color}}>{session.nome.split(" ")[0]}</span>}
              <button onClick={()=>auth.signOut()} style={{background:"none",border:"none",cursor:"pointer",color:role.color,fontSize:11,fontWeight:700,padding:0,opacity:.7}}>Sair</button>
            </div>
            {!isMobile&&<Btn onClick={()=>setSupplierMode(true)} variant="ghost" size="sm">🏭 Portal</Btn>}
            {can(session,"create")&&<Btn onClick={()=>setShowNova(true)} variant="primary" size="sm">＋{!isMobile?" Cotação":""}</Btn>}
          </div>
        </div>

        {/* Conteúdo */}
        <div style={{maxWidth:1040,margin:"0 auto",padding:isMobile?"14px 12px 8px":"28px 18px"}}>
          {view==="dashboard"&&!currCot&&<Dashboard cotacoes={cotacoesVisiveis} fornecedores={fornecedores} onCreate={()=>setShowNova(true)} onOpen={(id)=>{setCurrCotId(id);}} onDelete={deleteCot}/>}
          {view==="fornecedores"&&can(session,"manage_fornecedores")&&<TelaFornecedores fornecedores={fornecedores}
            onAdd={async f=>{await fornecedoresApi.create(f);await reloadFornecedores();}}
            onEdit={async f=>{const {id,criadoEm,...rest}=f;await fornecedoresApi.update(id,rest);await reloadFornecedores();}}
            onDelete={async id=>{await fornecedoresApi.delete(id);await reloadFornecedores();}}/>}
          {view==="clientes"&&can(session,"manage_fornecedores")&&<TelaClientes clientes={clientes}
            onAdd={async c=>{await clientesApi.create(c);await reloadClientes();}}
            onEdit={async c=>{const {id,criadoEm,...rest}=c;await clientesApi.update(id,rest);await reloadClientes();}}
            onDelete={async id=>{await clientesApi.delete(id);await reloadClientes();}}/>}
          {view==="convites"&&can(session,"invite")&&<TelaConvites onApprove={async f=>{await fornecedoresApi.create(f);await reloadFornecedores();setPendingCount(c=>Math.max(0,c-1));}}/>}
          {view==="plano"&&can(session,"all")&&<TelaPlanoContas onBack={()=>setView("dashboard")}/>}
          {view==="usuarios"&&can(session,"all")&&<TelaUsuarios/>}
          {currCot&&<DetalheCotacao cotacao={currCot} allFornecedores={fornecedores} clientes={clientes} onUpdate={updCot} onDelete={deleteCot} onBack={()=>setCurrCotId(null)} onAddFornecedor={async f=>{await fornecedoresApi.create(f);await reloadFornecedores();}} readOnly={isSindico}/>}
        </div>

        {/* Bottom nav (mobile) */}
        {isMobile&&<div style={{position:"fixed",bottom:0,left:0,right:0,background:C.white,borderTop:`1px solid ${C.gray200}`,display:"flex",zIndex:200,boxShadow:"0 -2px 12px rgba(0,0,0,.08)",paddingBottom:"env(safe-area-inset-bottom)"}}>
          {NAV.map(n=>{const active=view===n.id||(n.id==="dashboard"&&isInCotacao);return(
            <button key={n.id} onClick={()=>{setCurrCotId(null);setView(n.id);}} style={{flex:1,background:"none",border:"none",cursor:"pointer",padding:"10px 4px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,position:"relative"}}>
              <span style={{fontSize:20,lineHeight:1}}>{n.icon}</span>
              <span style={{fontSize:10,fontWeight:active?800:600,color:active?C.navy:C.gray400}}>{n.label}</span>
              {n.badge>0&&<span style={{position:"absolute",top:6,right:"calc(50% - 14px)",background:C.red,color:C.white,borderRadius:"50%",width:16,height:16,fontSize:9,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center"}}>{n.badge}</span>}
              {active&&<div style={{position:"absolute",bottom:0,left:"20%",right:"20%",height:2,background:C.navy,borderRadius:"2px 2px 0 0"}}/>}
            </button>
          );})}
          <button onClick={()=>setSupplierMode(true)} style={{flex:1,background:"none",border:"none",cursor:"pointer",padding:"10px 4px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
            <span style={{fontSize:20,lineHeight:1}}>🔑</span>
            <span style={{fontSize:10,fontWeight:600,color:C.gray400}}>Portal</span>
          </button>
        </div>}
      </div>
      {showNova&&can(session,"create")&&<ModalNovaCotacao onClose={()=>setShowNova(false)} onSave={createCot} fornecedores={fornecedores} clientes={clientes}/>}
    </AuthCtx.Provider>
    </MobileCtx.Provider>
  );
}
