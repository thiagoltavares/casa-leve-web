"use client";
/* eslint-disable react-hooks/set-state-in-effect -- sincronização de sessão e consultas remotas */

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { type Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import "@/app/portal.css";

type Status = "pago" | "a_pagar" | "na";
type Tab = "visao" | "despesas" | "cartoes" | "analises";

const rotasFinancas: Record<Tab, string> = {
  visao: "/financas/visao-geral",
  despesas: "/financas/lancamentos",
  cartoes: "/financas/cartoes",
  analises: "/financas/analises",
};
type Casa = {
  household_id: string;
  membership_id: string;
  papel: string;
  pode_ver_financas: boolean;
  nome_exibicao: string;
  household_nome: string;
};
type Item = {
  item_id: string;
  descricao: string;
  valor_previsto: number;
  valor_real: number | null;
  status: Status;
  dia_vencimento: number | null;
  parcelas_total: number | null;
  parcela_atual: number | null;
};
type Avulso = {
  id: string;
  descricao: string;
  valor_previsto: number;
  valor_real: number | null;
  status: Status;
  dia_pagamento: number | null;
};
type Dashboard = {
  mes: {
    entrada: number;
    gasto_previsto: number;
    gasto_real: number;
    saldo: number;
  } | null;
  itens: Item[];
  avulsos: Avulso[];
  cartao: { total: number };
  painel_12m: {
    competencia: string;
    entrada: number;
    gasto_real: number;
    gasto_previsto: number;
  }[];
};
type Analise = {
  por_categoria: { nome: string; cor: string; total: number }[];
  top_despesas: { descricao: string; valor: number; cor: string }[];
  status: { pago: number; a_pagar: number; na: number };
  mes: { entrada: number; gasto: number; comprometimento_pct: number | null };
  serie_12m: {
    competencia: string;
    entrada: number;
    previsto: number;
    real: number;
    saldo_acum: number;
  }[];
};
type Cartao = {
  id: string;
  nome: string;
  dia_fechamento: number;
  dia_vencimento: number;
  cor: string;
};
type Compra = {
  id: string;
  cartao_id: string;
  descricao: string;
  categoria_id: string | null;
  valor_parcela: number;
  parcelas_total: number;
  competencia_inicio: string;
};
type FaturaOficial = {
  cartao_id: string;
  competencia: string;
  total_aberto: number;
};
type Categoria = { id: string; nome: string; cor: string };
type Entrada = {
  id: string;
  descricao: string;
  valor: number;
  competencia: string;
  recorrente: boolean;
  competencia_fim: string | null;
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const competenciaAtual = () =>
  `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
const mes = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(`${value}T12:00:00`),
  );
const moverMes = (value: string, amount: number) => {
  const date = new Date(`${value}T12:00:00`);
  date.setMonth(date.getMonth() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
};
const parcelaNoMes = (inicio: string, referencia: string) =>
  (Number(referencia.slice(0, 4)) - Number(inicio.slice(0, 4))) * 12 +
  Number(referencia.slice(5, 7)) -
  Number(inicio.slice(5, 7)) +
  1;
const comprasDaFatura = (compras: Compra[], competencia: string) =>
  compras.filter((compra) => {
    const parcela = parcelaNoMes(compra.competencia_inicio, competencia);
    return parcela >= 1 && parcela <= compra.parcelas_total;
  });

const competenciaFaturaAberta = (cartao: Cartao) => {
  const hoje = new Date();
  let anoFechamento = hoje.getFullYear();
  let mesFechamento = hoje.getMonth();

  if (hoje.getDate() > cartao.dia_fechamento) {
    mesFechamento += 1;
    if (mesFechamento === 12) {
      mesFechamento = 0;
      anoFechamento += 1;
    }
  }

  let anoVencimento = anoFechamento;
  let mesVencimento = mesFechamento;
  if (cartao.dia_vencimento <= cartao.dia_fechamento) {
    mesVencimento += 1;
    if (mesVencimento === 12) {
      mesVencimento = 0;
      anoVencimento += 1;
    }
  }

  return `${anoVencimento}-${String(mesVencimento + 1).padStart(2, "0")}-01`;
};

function Icon({ name }: { name: "home" | "grid" | "list" | "card" | "chart" | "refresh" | "plus" }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" /><path d="M9 21v-6h6v6" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    list: <><path d="M9 6h12M9 12h12M9 18h12" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
    card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h3" /></>,
    chart: <><path d="M3 3v18h18" /><path d="m7 15 4-4 3 2 5-6" /></>,
    refresh: <><path d="M20 11a8 8 0 1 0 2 5" /><path d="M20 4v7h-7" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
  };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Badge({ status }: { status: Status }) {
  return (
    <span className={`status ${status}`}>
      {status === "pago"
        ? "Pago"
        : status === "a_pagar"
          ? "A pagar"
          : "Sem registro"}
    </span>
  );
}

export default function FinancePortal({ initialTab }: { initialTab: Tab }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState("");
  const [casa, setCasa] = useState<Casa | null>(null);
  const [competencia, setCompetencia] = useState(competenciaAtual);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [modal, setModal] = useState<
    "recorrente" | "avulso" | "entrada" | null
  >(null);
  const [entradaEditando, setEntradaEditando] = useState<Entrada | null>(null);
  const [cartaoModal, setCartaoModal] = useState<"cartao" | "compra" | null>(
    null,
  );
  const [cartaoEditando, setCartaoEditando] = useState<Cartao | null>(null);
  const [addMenu, setAddMenu] = useState(false);
  const [cartoes, setCartoes] = useState<Cartao[]>([]);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [faturasOficiais, setFaturasOficiais] = useState<FaturaOficial[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [previstoParaLancamento, setPrevistoParaLancamento] =
    useState<Item | null>(null);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const navegar = (proxima: Tab) => {
    setTab(proxima);
    setMobileMenuOpen(false);
    router.push(rotasFinancas[proxima]);
  };

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) =>
      setSession(next),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) {
      setCasa(null);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    (async () => {
      setLoading(true);
      const { data: user } = await supabase
        .from("users")
        .select("active_household_id")
        .eq("id", session.user.id)
        .maybeSingle();
      let query = supabase
        .from("memberships")
        .select(
          "id, household_id, papel, pode_ver_financas, nome_exibicao, household:households(nome)",
        )
        .eq("user_id", session.user.id)
        .eq("status", "active");
      if (user?.active_household_id)
        query = query.eq("household_id", user.active_household_id);
      const { data, error: membershipError } = await query
        .limit(1)
        .maybeSingle();
      if (membershipError || !data) {
        setError(
          membershipError?.message ??
            "Não foi possível encontrar uma casa ativa.",
        );
        setLoading(false);
        return;
      }
      const household = Array.isArray(data.household)
        ? data.household[0]
        : data.household;
      setCasa({
        household_id: data.household_id,
        membership_id: data.id,
        papel: data.papel,
        pode_ver_financas: data.pode_ver_financas ?? false,
        nome_exibicao: data.nome_exibicao,
        household_nome: household?.nome ?? "Minha casa",
      });
      setLoading(false);
    })();
  }, [session]);
  async function carregar() {
    if (!casa) return;
    const supabase = getSupabase();
    if (!supabase) return;
    setLoading(true);
    setError("");
    const [painel, analises, cards, purchases, faturas, categories, incomes] =
      await Promise.all([
        supabase.rpc("dashboard_financas", {
          p_household_id: casa.household_id,
          p_competencia: competencia,
        }),
        supabase.rpc("analises_financas", {
          p_household_id: casa.household_id,
          p_competencia: competencia,
        }),
        supabase
          .from("cartoes")
          .select("id,nome,dia_fechamento,dia_vencimento,cor")
          .eq("household_id", casa.household_id)
          .eq("ativo", true)
          .order("nome"),
        supabase
          .from("compras_cartao")
          .select(
            "id,cartao_id,descricao,categoria_id,valor_parcela,parcelas_total,competencia_inicio",
          )
          .eq("household_id", casa.household_id)
          .order("competencia_inicio", { ascending: false }),
        supabase
          .from("faturas_cartao")
          .select("cartao_id,competencia,total_aberto")
          .eq("household_id", casa.household_id),
        supabase
          .from("financas_categorias")
          .select("id,nome,cor")
          .eq("household_id", casa.household_id)
          .eq("ativo", true)
          .order("ordem"),
        supabase
          .from("entradas")
          .select("id,descricao,valor,competencia,recorrente,competencia_fim")
          .eq("household_id", casa.household_id)
          .order("competencia", { ascending: false }),
      ]);
    if (painel.error) setError(painel.error.message);
    else setDashboard(painel.data as Dashboard);
    if (!analises.error) setAnalise(analises.data as Analise);
    if (!cards.error) setCartoes((cards.data ?? []) as Cartao[]);
    if (!purchases.error) setCompras((purchases.data ?? []) as Compra[]);
    if (!faturas.error)
      setFaturasOficiais((faturas.data ?? []) as FaturaOficial[]);
    if (!categories.error)
      setCategorias((categories.data ?? []) as Categoria[]);
    if (!incomes.error) setEntradas((incomes.data ?? []) as Entrada[]);
    setLoading(false);
  }
  useEffect(() => {
    carregar(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casa?.household_id, competencia]);
  async function enviarCodigo() {
    if (authLoading) return;
    const supabase = getSupabase();
    if (!supabase) {
      setError("Configure as chaves do Supabase para entrar.");
      return;
    }
    setAuthLoading(true);
    try {
      setError("");
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
      });
      if (authError) setError(authError.message);
      else {
        setCodigo("");
        setSent(true);
      }
    } catch {
      setError("Não foi possível enviar o código. Tente novamente.");
    } finally {
      setAuthLoading(false);
    }
  }
  async function entrar(e: FormEvent) {
    e.preventDefault();
    await enviarCodigo();
  }
  async function confirmarCodigo(e: FormEvent) {
    e.preventDefault();
    if (authLoading) return;
    const supabase = getSupabase();
    if (!supabase) {
      setError("Configure as chaves do Supabase para entrar.");
      return;
    }
    const token = codigo.replace(/\s/g, "");
    if (token.length !== 6) {
      setError("Digite os 6 dígitos do código recebido.");
      return;
    }
    setAuthLoading(true);
    try {
      setError("");
      const { data, error: authError } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "email",
      });
      if (authError)
        setError("Código inválido ou expirado. Solicite outro código.");
      else setSession(data.session);
    } catch {
      setError("Não foi possível confirmar o código. Tente novamente.");
    } finally {
      setAuthLoading(false);
    }
  }
  const gastos = useMemo(
    () =>
      dashboard
        ? dashboard.itens.reduce(
            (s, i) =>
              s + (i.status === "pago" ? (i.valor_real ?? i.valor_previsto) : 0),
            0,
          ) +
          dashboard.avulsos.reduce(
            (s, i) =>
              s + (i.status === "pago" ? (i.valor_real ?? i.valor_previsto) : 0),
            0,
          )
        : 0,
    [dashboard],
  );
  const previstos = useMemo(
    () =>
      dashboard
        ? dashboard.itens.reduce(
            (total, item) =>
              total +
              (item.status === "a_pagar" ? item.valor_previsto : 0),
            0,
          ) +
          dashboard.avulsos.reduce(
            (total, item) =>
              total +
              (item.status === "a_pagar" ? item.valor_previsto : 0),
            0,
          )
        : 0,
    [dashboard],
  );
  const dashboardExibido = useMemo(() => {
    if (!dashboard) return dashboard;
    const faturasDoMes = faturasOficiais.filter(
      (fatura) => fatura.competencia === competencia,
    );
    const totalCartoes = faturasDoMes.reduce(
      (total, fatura) => total + fatura.total_aberto,
      0,
    );
    return {
      ...dashboard,
      mes: dashboard.mes
        ? {
            ...dashboard.mes,
            saldo: dashboard.mes.saldo - totalCartoes - previstos,
          }
        : null,
      cartao: {
        total: totalCartoes,
      },
    };
  }, [competencia, dashboard, faturasOficiais, previstos]);
  async function registrarRealizado(item: Item, valorReal: number) {
    if (!casa) return false;
    const supabase = getSupabase();
    if (!supabase) return false;
    setLoading(true);
    setError("");
    const { error: launchError } = await supabase
      .from("orcamento_realizado")
      .upsert(
        {
          household_id: casa.household_id,
          item_id: item.item_id,
          competencia,
          valor_real: valorReal,
          status: "pago",
          pago_em: new Date().toISOString(),
        },
        { onConflict: "item_id,competencia" },
      );
    if (launchError) {
      setError(launchError.message);
      setLoading(false);
      return false;
    }
    await carregar();
    return true;
  }
  if (!session)
    return (
      <Login
        email={email}
        setEmail={setEmail}
        sent={sent}
        codigo={codigo}
        setCodigo={setCodigo}
        authLoading={authLoading}
        error={error}
        onSubmit={entrar}
        onVerify={confirmarCodigo}
        onResend={enviarCodigo}
        onChangeEmail={() => {
          setSent(false);
          setCodigo("");
          setError("");
        }}
      />
    );
  if (loading && !dashboard)
    return (
      <main className="loading">
        <span className="loader" />
        Carregando sua casa…
      </main>
    );
  if (!casa)
    return (
      <main className="loading">
        <strong>Não conseguimos abrir sua casa.</strong>
        <span>{error || "Tente atualizar a página."}</span>
        <button onClick={() => getSupabase()?.auth.signOut()}>Sair</button>
      </main>
    );
  if (casa.papel !== "admin" && !casa.pode_ver_financas)
    return (
      <main className="loading">
        <strong>Finanças é uma área privada.</strong>
        <span>Peça acesso a quem administra a casa.</span>
        <button onClick={() => getSupabase()?.auth.signOut()}>Sair</button>
      </main>
    );
  return (
    <main className="portal">
      <aside className="sidebar">
        <button className="brand" type="button" onClick={() => navegar("visao")} aria-label="Ir para a visão geral de Finanças">
          <Image className="brand-araponguinha" src="/araponguinha-equilibrio.png" width={38} height={38} alt="" priority />Casa Leve
        </button>
        <div className="home-card">
          <span className="avatar">{casa.household_nome.charAt(0)}</span>
          <div>
            <b>{casa.household_nome}</b>
            <small>Espaço financeiro</small>
          </div>
        </div>
        <nav>
          <span>FINANÇAS</span>
          <button
            className={tab === "visao" ? "active" : ""}
            onClick={() => navegar("visao")}
          >
            <Icon name="grid" />Visão geral
          </button>
          <button
            className={tab === "despesas" ? "active" : ""}
            onClick={() => navegar("despesas")}
          >
            <Icon name="list" />Lançamentos
          </button>
          <button
            className={tab === "cartoes" ? "active" : ""}
            onClick={() => navegar("cartoes")}
          >
            <Icon name="card" />Cartões
          </button>
          <button
            className={tab === "analises" ? "active" : ""}
            onClick={() => navegar("analises")}
          >
            <Icon name="chart" />Análises
          </button>
        </nav>
        <div className="mobile-navigation">
          <button className="mobile-nav-toggle" type="button" onClick={() => setMobileMenuOpen((open) => !open)} aria-expanded={mobileMenuOpen}>
            <Icon name={tab === "visao" ? "grid" : tab === "despesas" ? "list" : tab === "cartoes" ? "card" : "chart"} />
            {tab === "visao" ? "Visão geral" : tab === "despesas" ? "Lançamentos" : tab === "cartoes" ? "Cartões" : "Análises"} <span>⌄</span>
          </button>
          {mobileMenuOpen && <div className="mobile-nav-menu">
            <button onClick={() => navegar("visao")}><Icon name="grid" />Visão geral</button>
            <button onClick={() => navegar("despesas")}><Icon name="list" />Lançamentos</button>
            <button onClick={() => navegar("cartoes")}><Icon name="card" />Cartões</button>
            <button onClick={() => navegar("analises")}><Icon name="chart" />Análises</button>
          </div>}
        </div>
        <div className="profile">
          <span className="avatar small">{casa.nome_exibicao.charAt(0)}</span>
          <div>
            <b>{casa.nome_exibicao}</b>
            <button onClick={() => getSupabase()?.auth.signOut()}>Sair</button>
          </div>
        </div>
      </aside>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">ORGANIZAÇÃO FINANCEIRA</p>
            <h1>Dinheiro claro, casa leve.</h1>
            <p className="lede">
              Controle o mês, acompanhe compromissos e decida com tranquilidade.
            </p>
          </div>
          <div className="header-actions">
            <button className="ghost" onClick={carregar} aria-label="Atualizar">
              <Icon name="refresh" />
            </button>
            <button className="primary" onClick={() => setAddMenu(true)}>
              <Icon name="plus" />Novo lançamento
            </button>
          </div>
        </header>
        <div className="toolbar">
          <div className="month">
            <button onClick={() => setCompetencia((v) => moverMes(v, -1))}>
              ‹
            </button>
            <b>{mes(competencia)}</b>
            <button onClick={() => setCompetencia((v) => moverMes(v, 1))}>
              ›
            </button>
          </div>
          <span className="summary">
            {loading ? "Atualizando…" : "Dados atualizados"}
          </span>
        </div>
        {error && <div className="error">{error}</div>}
        {tab === "visao" && (
          <Overview
            dashboard={dashboardExibido}
            gastos={gastos + (dashboardExibido?.cartao.total ?? 0) + previstos}
            previstos={previstos}
            faturasOficiais={faturasOficiais}
            onShow={() => navegar("despesas")}
          />
        )}
        {tab === "despesas" && (
          <Expenses
            dashboard={dashboard}
            cards={cartoes}
            purchases={compras}
            faturasOficiais={faturasOficiais}
            entries={entradas}
            competencia={competencia}
            onEditEntry={(entry) => {
              setEntradaEditando(entry);
              setModal("entrada");
            }}
            onLaunch={setPrevistoParaLancamento}
          />
        )}
        {tab === "cartoes" && (
          <Cards
            cards={cartoes}
            purchases={compras}
            faturasOficiais={faturasOficiais}
            competencia={competencia}
            onCard={() => {
              setCartaoEditando(null);
              setCartaoModal("cartao");
            }}
            onEditCard={(card) => {
              setCartaoEditando(card);
              setCartaoModal("cartao");
            }}
            onPurchase={() => setCartaoModal("compra")}
          />
        )}
        {tab === "analises" && (
          <Analysis
            data={analise}
            dashboard={dashboard}
            cards={cartoes}
            purchases={compras}
            categories={categorias}
            competencia={competencia}
          />
        )}
      </section>
      {addMenu && (
        <AddChoice
          cards={cartoes.length}
          onClose={() => setAddMenu(false)}
          onRecurring={() => {
            setAddMenu(false);
            setModal("recorrente");
          }}
          onOneOff={() => {
            setAddMenu(false);
            setModal("avulso");
          }}
          onIncome={() => {
            setAddMenu(false);
            setModal("entrada");
          }}
          onCardPurchase={() => {
            setAddMenu(false);
            setCartaoModal(cartoes.length ? "compra" : "cartao");
          }}
        />
      )}
      {modal && (
        <NewRecord
          kind={modal}
          casa={casa}
          competencia={competencia}
          categories={categorias}
          entry={entradaEditando}
          onClose={() => {
            setModal(null);
            setEntradaEditando(null);
          }}
          onSaved={() => {
            setModal(null);
            setEntradaEditando(null);
            carregar();
          }}
        />
      )}
      {previstoParaLancamento && (
        <RealizedRecord
          item={previstoParaLancamento}
          onClose={() => setPrevistoParaLancamento(null)}
          onSave={async (valorReal) => {
            if (await registrarRealizado(previstoParaLancamento, valorReal))
              setPrevistoParaLancamento(null);
          }}
        />
      )}
      {cartaoModal && (
        <CardRecord
          kind={cartaoModal}
          casa={casa}
          competencia={competencia}
          cards={cartoes}
          card={cartaoEditando}
          onClose={() => {
            setCartaoModal(null);
            setCartaoEditando(null);
          }}
          onSaved={() => {
            setCartaoModal(null);
            setCartaoEditando(null);
            carregar();
          }}
        />
      )}
    </main>
  );
}

function Login({
  email,
  setEmail,
  sent,
  codigo,
  setCodigo,
  authLoading,
  error,
  onSubmit,
  onVerify,
  onResend,
  onChangeEmail,
}: {
  email: string;
  setEmail: (v: string) => void;
  sent: boolean;
  codigo: string;
  setCodigo: (v: string) => void;
  authLoading: boolean;
  error: string;
  onSubmit: (e: FormEvent) => void;
  onVerify: (e: FormEvent) => void;
  onResend: () => void;
  onChangeEmail: () => void;
}) {
  const codigoInputs = useRef<(HTMLInputElement | null)[]>([]);
  const atualizarCodigo = (index: number, value: string) => {
    const digitos = value.replace(/\D/g, "");
    const proximo = codigo.padEnd(6, " ").split("");
    if (!digitos) proximo[index] = " ";
    else {
      digitos.slice(0, 6 - index).split("").forEach((digito, offset) => {
        proximo[index + offset] = digito;
      });
    }
    setCodigo(proximo.join(""));
    const proximoIndex = Math.min(index + Math.max(digitos.length, 1), 5);
    if (digitos) codigoInputs.current[proximoIndex]?.focus();
  };
  const colarCodigo = (value: string) => {
    const digitos = value.replace(/\D/g, "").slice(0, 6);
    if (!digitos) return;
    setCodigo(digitos);
    codigoInputs.current[Math.min(digitos.length, 5)]?.focus();
  };
  return (
    <main className="login">
      <section>
        <div className="login-brand">
          <Image className="brand-araponguinha" src="/araponguinha-equilibrio.png" width={42} height={42} alt="" priority /> Casa Leve
        </div>
        <p className="eyebrow">FINANÇAS DA CASA</p>
        <h1>Uma visão calma do seu dinheiro.</h1>
        <p>
          Entre com o mesmo e-mail que você usa no Casa Leve para continuar.
        </p>
        {sent ? (
          <form className="otp-form" onSubmit={onVerify}>
            <div className="sent">
              <b>Digite o código de 6 dígitos.</b>
              <span>Enviamos um código para {email}.</span>
            </div>
            <fieldset className="otp-inputs">
              <legend>Código de acesso</legend>
              {Array.from({ length: 6 }, (_, index) => (
                <input
                  key={index}
                  ref={(element) => { codigoInputs.current[index] = element; }}
                  aria-label={`Dígito ${index + 1} do código`}
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  inputMode="numeric"
                  maxLength={6}
                  pattern="[0-9]*"
                  disabled={authLoading}
                  value={codigo[index]?.trim() ?? ""}
                  onChange={(e) => atualizarCodigo(index, e.target.value)}
                  onPaste={(e) => {
                    e.preventDefault();
                    colarCodigo(e.clipboardData.getData("text"));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !codigo[index] && index > 0)
                      codigoInputs.current[index - 1]?.focus();
                  }}
                />
              ))}
            </fieldset>
            {error && <div className="error">{error}</div>}
            <button className="primary" type="submit" disabled={authLoading}>
              {authLoading && <span className="button-spinner" aria-hidden="true" />}
              {authLoading ? "Confirmando…" : "Confirmar e entrar"}
            </button>
            <div className="otp-actions">
              <button type="button" onClick={onResend} disabled={authLoading}>Reenviar código</button>
              <button type="button" onClick={onChangeEmail} disabled={authLoading}>Usar outro e-mail</button>
            </div>
          </form>
        ) : (
          <form onSubmit={onSubmit}>
            <label>
              E-mail
              <input
                required
                type="email"
                value={email}
                disabled={authLoading}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com"
              />
            </label>
            {error && <div className="error">{error}</div>}
            <button className="primary" type="submit" disabled={authLoading}>
              {authLoading && <span className="button-spinner" aria-hidden="true" />}
              {authLoading ? "Enviando código…" : "Receber código de acesso"}
            </button>
          </form>
        )}
      </section>
      <aside>
        <div className="login-panel">
          <span>◌</span>
          <p>
            O portal de Finanças é feito para uma visão maior: planejamento,
            contas e escolhas da casa.
          </p>
        </div>
      </aside>
    </main>
  );
}

function RealizedRecord({
  item,
  onClose,
  onSave,
}: {
  item: Item;
  onClose: () => void;
  onSave: (valorReal: number) => Promise<void>;
}) {
  const [valor, setValor] = useState(String(item.valor_real ?? item.valor_previsto));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(valor.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) {
      setError("Informe um valor real válido.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(value);
    } catch {
      setError("Não foi possível salvar o lançamento.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal real-record" onSubmit={submit}>
        <button className="close" type="button" onClick={onClose} aria-label="Fechar">
          ×
        </button>
        <div>
          <p className="eyebrow">LANÇAR NO REAL</p>
          <h2>{item.descricao}</h2>
          <p>Previsto para este mês: {money.format(item.valor_previsto)}</p>
        </div>
        <label>
          Valor realmente pago
          <input
            autoFocus
            inputMode="decimal"
            min="0"
            step="0.01"
            type="number"
            value={valor}
            onChange={(event) => setValor(event.target.value)}
          />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary" type="submit" disabled={saving}>
          {saving ? "Salvando…" : "Confirmar valor real"}
        </button>
      </form>
    </div>
  );
}

function Overview({
  dashboard,
  gastos,
  previstos,
  faturasOficiais,
  onShow,
}: {
  dashboard: Dashboard | null;
  gastos: number;
  previstos: number;
  faturasOficiais: FaturaOficial[];
  onShow: () => void;
}) {
  const d = dashboard?.mes;
  const entrada = d?.entrada ?? 0;
  const saldo = d?.saldo ?? 0;
  const pct = entrada ? Math.min(100, Math.round((gastos / entrada) * 100)) : 0;
  const serie = dashboard?.painel_12m ?? [];
  const faturasPorMes = new Map<string, number>();
  for (const fatura of faturasOficiais)
    faturasPorMes.set(
      fatura.competencia,
      (faturasPorMes.get(fatura.competencia) ?? 0) + fatura.total_aberto,
    );
  const maxSerie = Math.max(
    1,
    ...serie.map((item) =>
      Math.max(
        item.entrada,
        item.gasto_real,
        Math.max(0, item.gasto_previsto - item.gasto_real),
        faturasPorMes.get(item.competencia) ?? 0,
      ),
    ),
  );
  return (
    <>
      <section className="metrics">
        <article className={`balance ${saldo < 0 ? "negative" : ""}`}>
          <small>Saldo do mês</small>
          <strong>{money.format(saldo)}</strong>
          <span>
            {saldo >= 0
              ? "Após os compromissos deste mês"
              : "Atenção aos gastos deste mês"}
          </span>
        </article>
        <Metric
          label="Entradas"
          value={money.format(entrada)}
          detail="Receitas deste mês"
          icon="↓"
          green
        />
        <Metric
          label="Gastos pagos"
          value={money.format(d?.gasto_real ?? 0)}
          detail="Pagamentos sem cartão"
          icon="↑"
        />
        <Metric
          label="Previstos"
          value={money.format(previstos)}
          detail="Contas ainda a pagar"
          icon="◷"
        />
        <Metric
          label="Cartões"
          value={money.format(dashboard?.cartao.total ?? 0)}
          detail="Faturas em aberto"
          icon="▣"
        />
      </section>
      <section className="grid">
        <article className="card pace">
          <div className="card-title">
            <div>
              <h2>Ritmo do mês</h2>
          <p>Quanto da renda já está comprometida</p>
            </div>
            <b>{pct}%</b>
          </div>
          <div className="progress">
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className="progress-copy">
            <span>{money.format(gastos)} comprometidos</span>
            <span>{money.format(Math.max(0, entrada - gastos))} disponíveis</span>
          </div>
        </article>
        <article className="card commitments">
          <div className="card-title">
            <div>
              <h2>Próximos compromissos</h2>
              <p>Contas previstas para o mês</p>
            </div>
            <button onClick={onShow}>Ver todos</button>
          </div>
          {(dashboard?.itens ?? [])
            .filter((item) => item.status === "a_pagar")
            .slice(0, 4)
            .map((item) => (
            <div className="commitment" key={item.item_id}>
              <span className={item.status === "pago" ? "dot done" : "dot"} />
              <div>
                <b>{item.descricao}</b>
                <small>
                  {item.dia_vencimento
                    ? `Vence dia ${item.dia_vencimento}`
                    : "Sem data fixa"}
                </small>
              </div>
              <strong>
                {money.format(item.valor_real ?? item.valor_previsto)}
              </strong>
            </div>
          ))}
          {!(dashboard?.itens ?? []).some((item) => item.status === "a_pagar") && (
            <div className="empty">Ainda não há compromissos neste mês.</div>
          )}
        </article>
      </section>
      <section className="grid overview-insights">
        <article className="card cashflow">
          <div className="card-title">
            <div>
              <h2>Fluxo de caixa</h2>
              <p>Entradas, gastos pagos, previstos e faturas de cartão ao longo do ano.</p>
            </div>
          </div>
          <div className="cash-bars">
            {serie.map((item) => {
              const cartoes = faturasPorMes.get(item.competencia) ?? 0;
              const previstosDoMes = Math.max(
                0,
                item.gasto_previsto - item.gasto_real,
              );
              const rotuloMes = new Intl.DateTimeFormat("pt-BR", {
                month: "short",
              })
                .format(new Date(`${item.competencia}T12:00:00`))
                .replace(".", "");
              return (
                <div
                  className="cash-bar"
                  key={item.competencia}
                  tabIndex={0}
                  aria-label={`${rotuloMes}: entradas ${money.format(item.entrada)}, gastos pagos ${money.format(item.gasto_real)}, previstos ${money.format(previstosDoMes)} e cartões ${money.format(cartoes)}`}
                >
                  <div>
                    <i
                      className="entrada"
                      style={{
                        height: `${Math.max(3, (item.entrada / maxSerie) * 100)}%`,
                      }}
                    />
                    <em
                      className="gasto"
                      style={{
                        height: `${Math.max(3, (item.gasto_real / maxSerie) * 100)}%`,
                      }}
                    />
                    <b
                      className="cartao"
                      style={{
                        height: `${Math.max(3, (cartoes / maxSerie) * 100)}%`,
                      }}
                    />
                    <span
                      className="previsto"
                      style={{
                        height: `${Math.max(3, (previstosDoMes / maxSerie) * 100)}%`,
                      }}
                    />
                  </div>
                  <small>{rotuloMes}</small>
                  <div className="cash-tooltip" role="tooltip">
                    <b>{rotuloMes}</b>
                    <span>Entradas <strong>{money.format(item.entrada)}</strong></span>
                    <span>Gastos pagos <strong>{money.format(item.gasto_real)}</strong></span>
                    <span>Cartões <strong>{money.format(cartoes)}</strong></span>
                    <span>Previstos <strong>{money.format(previstosDoMes)}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="chart-key">
            <span>
              <i /> Entradas
            </span>
            <span>
              <i /> Gastos pagos
            </span>
            <span>
              <i /> Cartões
            </span>
            <span>
              <i /> Previstos
            </span>
          </div>
        </article>
        <article className="card month-reading">
          <div className="card-title">
            <div>
              <h2>Leitura do mês</h2>
              <p>Uma referência rápida para decidir.</p>
            </div>
          </div>
          <div>
            <span>Gastos pagos</span>
            <strong>{money.format(d?.gasto_real ?? 0)}</strong>
          </div>
          <div>
            <span>Previstos</span>
            <strong>{money.format(previstos)}</strong>
          </div>
          <div>
            <span>Faturas de cartão</span>
            <strong>{money.format(dashboard?.cartao.total ?? 0)}</strong>
          </div>
          <div>
              <span>Saldo projetado</span>
            <strong className={saldo < 0 ? "negative-text" : ""}>
              {money.format(saldo)}
            </strong>
          </div>
        </article>
      </section>
    </>
  );
}
function Metric({
  label,
  value,
  detail,
  icon,
  green,
}: {
  label: string;
  value: string;
  detail: string;
  icon: string;
  green?: boolean;
}) {
  return (
    <article className="metric">
      <span className={green ? "metric-icon green" : "metric-icon"}>
        {icon}
      </span>
      <small>{label}</small>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}
function Expenses({
  dashboard,
  cards,
  purchases,
  faturasOficiais,
  entries,
  competencia,
  onEditEntry,
  onLaunch,
}: {
  dashboard: Dashboard | null;
  cards: Cartao[];
  purchases: Compra[];
  faturasOficiais: FaturaOficial[];
  entries: Entrada[];
  competencia: string;
  onEditEntry: (entry: Entrada) => void;
  onLaunch: (item: Item) => void;
}) {
  const [view, setView] = useState<"realizados" | "previstos">("realizados");
  const entradasDoMes = entries.filter(
    (entry) =>
      entry.competencia <= competencia &&
      ((entry.recorrente &&
        (!entry.competencia_fim || entry.competencia_fim >= competencia)) ||
        (!entry.recorrente && entry.competencia === competencia)),
  );
  const faturasCalculadas = Array.from(
    comprasDaFatura(purchases, competencia).reduce((map, compra) => {
      const atual = map.get(compra.cartao_id) ?? [];
      map.set(compra.cartao_id, [...atual, compra]);
      return map;
    }, new Map<string, Compra[]>()),
  ).map(([cartaoId, itens]) => {
    const card = cards.find((item) => item.id === cartaoId);
    return {
      item_id: `fatura-${cartaoId}`,
      descricao: card?.nome ?? "Cartão",
      valor_previsto: itens.reduce((sum, item) => sum + item.valor_parcela, 0),
      valor_real: null,
      status: "a_pagar" as Status,
      dia_vencimento: card?.dia_vencimento ?? null,
      parcelas_total: null,
      parcela_atual: null,
      cartao: card?.nome ?? "Cartão",
      itens: itens.length,
    };
  });
  const faturas = cards.map((card) => {
      const fatura = faturasOficiais.find(
        (item) =>
          item.cartao_id === card.id && item.competencia === competencia,
      );
      const calculada = faturasCalculadas.find(
        (item) => item.item_id === `fatura-${card.id}`,
      );
      return {
        item_id: `fatura-${card.id}`,
        descricao: card.nome,
        valor_previsto: fatura?.total_aberto ?? 0,
        valor_real: null,
        status: fatura?.total_aberto ? ("a_pagar" as Status) : ("na" as Status),
        dia_vencimento: card.dia_vencimento,
        parcelas_total: null,
        parcela_atual: null,
        cartao: card.nome,
        itens: calculada?.itens ?? 0,
      };
    });
  const rows = [
    ...(dashboard?.itens ?? []).map((i) => ({
      ...i,
      cartao: null as string | null,
      itens: 0,
    })),
    ...(dashboard?.avulsos ?? []).map((i) => ({
      ...i,
      item_id: i.id,
      dia_vencimento: i.dia_pagamento,
      parcelas_total: null,
      parcela_atual: null,
      cartao: null as string | null,
      itens: 0,
    })),
    ...faturas,
  ];
  const realizados = rows.filter((item) => item.status === "pago");
  const previstos = [
    ...(dashboard?.itens ?? []).map((item) => ({
      ...item,
      cartao: null as string | null,
      itens: 0,
      podeLancar: true,
    })),
    ...faturas.map((item) => ({ ...item, podeLancar: false })),
  ];
  const exibidos = view === "realizados" ? realizados : previstos;
  return (
    <article className="card table-card">
      <div className="card-title">
        <div>
          <h2>Lançamentos</h2>
          <p>Registre pagamentos e acompanhe os valores previstos.</p>
        </div>
      </div>
      <div className="launch-tabs" role="tablist" aria-label="Tipo de lançamento">
        <button
          type="button"
          role="tab"
          aria-selected={view === "realizados"}
          className={view === "realizados" ? "active" : ""}
          onClick={() => setView("realizados")}
        >
          Realizados
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "previstos"}
          className={view === "previstos" ? "active" : ""}
          onClick={() => setView("previstos")}
        >
          Previstos
        </button>
      </div>
      {!!entradasDoMes.length && (
        <div className="income-list">
          <span>ENTRADAS DO MÊS</span>
          {entradasDoMes.map((entry) => (
            <button
              type="button"
              key={entry.id}
              onClick={() => onEditEntry(entry)}
            >
              <div>
                <b>{entry.descricao}</b>
                <small>
                  {entry.recorrente
                    ? "Entrada recorrente · editar"
                    : "Entrada deste mês · editar"}
                </small>
              </div>
              <strong>{money.format(entry.valor)}</strong>
            </button>
          ))}
        </div>
      )}
      <div className="table">
        <div className="thead">
          <span>DESCRIÇÃO</span>
          <span>STATUS</span>
          <span>{view === "previstos" ? "PREVISTO / REAL" : "VALOR REAL"}</span>
        </div>
        {exibidos.map((item) => (
          <div className="trow" key={item.item_id}>
            <div>
              <b>{item.descricao}</b>
              <small>
                {item.cartao
                  ? `Fatura ${item.cartao}${item.itens > 1 ? ` · ${item.itens} compras` : ""}`
                  : item.dia_vencimento
                    ? `Dia ${item.dia_vencimento}`
                    : "Sem data fixa"}
                {item.parcelas_total
                  ? ` · ${item.parcela_atual}/${item.parcelas_total}`
                  : ""}
              </small>
            </div>
            {view === "previstos" && "podeLancar" in item && item.podeLancar ? (
              <button
                type="button"
                className="launch-item"
                onClick={() => onLaunch(item)}
              >
                {item.status === "pago" ? "Editar real" : "Lançar no real"}
              </button>
            ) : (
              <Badge status={item.status} />
            )}
            <div className="item-values">
              <strong>
                {money.format(
                  view === "previstos" ? item.valor_previsto : item.valor_real ?? item.valor_previsto,
                )}
              </strong>
              {view === "previstos" && item.valor_real != null && (
                <small>Real: {money.format(item.valor_real)}</small>
              )}
            </div>
          </div>
        ))}
        {!exibidos.length && (
          <div className="empty">
            {view === "realizados"
              ? "Ainda não há gastos pagos neste mês."
              : "Ainda não há valores previstos para este mês."}
          </div>
        )}
      </div>
    </article>
  );
}
function Analysis({
  data,
  dashboard,
  cards,
  purchases,
  categories: financeCategories,
  competencia,
}: {
  data: Analise | null;
  dashboard: Dashboard | null;
  cards: Cartao[];
  purchases: Compra[];
  categories: Categoria[];
  competencia: string;
}) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
  const [blocks, setBlocks] = useState({
    resumo: true,
    despesas: false,
    cartao: true,
    categorias: true,
    top: true,
    status: true,
    ano: false,
  });
  const cardTotal = comprasDaFatura(purchases, competencia).reduce(
    (sum, purchase) => sum + purchase.valor_parcela,
    0,
  );
  const categories = [
    ...(data?.por_categoria ?? []),
    ...(cardTotal
      ? [{ nome: "Cartões", cor: "#1a4950", total: cardTotal }]
      : []),
  ].sort((a, b) => b.total - a.total);
  const total = categories.reduce((sum, item) => sum + item.total, 0);
  const top = [
    ...(data?.top_despesas ?? []).map((item) => ({
      ...item,
      parcelaAtual: null as number | null,
      parcelasTotal: null as number | null,
    })),
    ...comprasDaFatura(purchases, competencia).map((purchase) => ({
      descricao: purchase.descricao,
      valor: purchase.valor_parcela,
      cor:
        cards.find((card) => card.id === purchase.cartao_id)?.cor ?? "#1a4950",
      parcelaAtual: parcelaNoMes(purchase.competencia_inicio, competencia),
      parcelasTotal: purchase.parcelas_total,
    })),
  ]
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 6);
  const serie = data?.serie_12m ?? [];
  const maxSerie = Math.max(
    1,
    ...serie.map((item) => Math.max(item.previsto, item.real)),
  );
  const gasto = (data?.mes.gasto ?? 0) + cardTotal;
  const entrada = data?.mes.entrada ?? 0;
  const comprometimento =
    entrada > 0 ? Math.round((gasto / entrada) * 100) : null;
  const prompt = (() => {
    const out = [
      `Você é um consultor financeiro familiar. Analise o mês de ${mes(competencia)} com base nos dados abaixo.`,
      "Ajude a:",
      "1. Explicar pra onde o dinheiro está indo.",
      "2. Identificar os maiores riscos.",
      "3. Separar gastos fixos, variáveis e dívidas.",
      "4. Apontar cortes realistas.",
      "5. Sugerir um plano simples pro próximo mês.",
      "",
      "Este resumo foi gerado pelo app Casa Leve. Considere que os dados podem estar incompletos e aponte quando faltar informação importante.",
      "",
    ];
    if (blocks.resumo && dashboard?.mes)
      out.push(
        `== RESUMO DE ${mes(competencia).toUpperCase()} ==`,
        `Renda prevista: ${money.format(dashboard.mes.entrada)}`,
        `Despesas previstas: ${money.format(dashboard.mes.gasto_previsto)}`,
        `Valor já pago: ${money.format(data?.status.pago ?? 0)}`,
        `Valor ainda a pagar: ${money.format(data?.status.a_pagar ?? 0)}`,
        `Saldo disponível antes dos pagamentos: ${money.format(dashboard.mes.saldo)}`,
        `Saldo previsto após pagar as despesas: ${money.format(dashboard.mes.entrada - dashboard.mes.gasto_previsto)}`,
        comprometimento == null
          ? "Comprometimento: sem entrada registrada"
          : `Comprometimento da renda: ${comprometimento}%`,
        "",
      );
    if (blocks.despesas) {
      out.push("== DESPESAS ==");
      for (const item of dashboard?.itens ?? [])
        out.push(
          `- ${item.descricao}${item.parcelas_total ? ` [${item.parcela_atual}/${item.parcelas_total}]` : ""}: previsto ${money.format(item.valor_previsto)}${item.valor_real != null ? `, real ${money.format(item.valor_real)}` : ""} (${item.status === "pago" ? "pago" : item.status === "na" ? "n/a" : "a pagar"})`,
        );
      for (const item of dashboard?.avulsos ?? [])
        out.push(
          `- ${item.descricao} (avulso): previsto ${money.format(item.valor_previsto)}${item.valor_real != null ? `, real ${money.format(item.valor_real)}` : ""} (${item.status === "pago" ? "pago" : item.status === "na" ? "n/a" : "a pagar"})`,
        );
      if (!(dashboard?.itens.length || dashboard?.avulsos.length))
        out.push("(nenhuma)");
      out.push("");
    }
    if (blocks.cartao) {
      const nomes = new Map(
        financeCategories.map((category) => [category.id, category.nome]),
      );
      const grupos = cards
        .map((card) => ({
          card,
          itens: comprasDaFatura(
            purchases.filter((purchase) => purchase.cartao_id === card.id),
            competencia,
          ).sort((a, b) => b.valor_parcela - a.valor_parcela),
        }))
        .filter((group) => group.itens.length);
      if (grupos.length) {
        out.push("== CARTÃO DE CRÉDITO ==");
        for (const group of grupos) {
          if (grupos.length > 1) out.push(`-- Cartão: ${group.card.nome} --`);
          const parcelado = group.itens
            .filter((item) => item.parcelas_total > 1)
            .reduce((sum, item) => sum + item.valor_parcela, 0);
          const rotativo = group.itens
            .filter((item) => item.parcelas_total === 1)
            .reduce((sum, item) => sum + item.valor_parcela, 0);
          out.push(
            `Compras detalhadas: ${money.format(parcelado + rotativo)}`,
            `Total parcelado detalhado: ${money.format(parcelado)}`,
            `Total rotativo detalhado: ${money.format(rotativo)}`,
            "Compras detalhadas:",
          );
          for (const item of group.itens)
            out.push(
              `- ${item.descricao}${item.parcelas_total === 1 ? " [rotativo]" : ` [${parcelaNoMes(item.competencia_inicio, competencia)}/${item.parcelas_total}]`}: ${money.format(item.valor_parcela)}${item.categoria_id && nomes.get(item.categoria_id) ? ` (${nomes.get(item.categoria_id)})` : ""}`,
            );
          out.push("");
        }
      }
    }
    if (blocks.categorias && categories.length) {
      const categoriaTotal = data?.mes.gasto || 1;
      const semCategoria = categories
        .filter((item) => /sem categoria/i.test(item.nome))
        .reduce((sum, item) => sum + item.total, 0);
      const semCategoriaPct = Math.round((semCategoria / categoriaTotal) * 100);
      if (semCategoriaPct >= 70)
        out.push(
          "== QUALIDADE DOS DADOS ==",
          `${semCategoriaPct}% das despesas do mês estão sem categoria. Isso limita a análise por tipo de gasto. Sugira categorizar melhor antes de tirar conclusões por categoria.`,
          "",
        );
      else {
        out.push("== POR CATEGORIA ==");
        for (const item of categories)
          out.push(
            `- ${item.nome}: ${money.format(item.total)} (${Math.round((item.total / categoriaTotal) * 100)}%)`,
          );
        out.push("");
      }
    }
    if (blocks.top && data?.top_despesas.length) {
      out.push("== TOP DESPESAS ==");
      data.top_despesas.forEach((item, index) =>
        out.push(
          `${index + 1}. ${item.descricao}: ${money.format(item.valor)}`,
        ),
      );
      out.push("");
    }
    if (blocks.status && data)
      out.push(
        "== PAGAMENTOS DO MÊS ==",
        `Pago: ${money.format(data.status.pago)}`,
        `A pagar: ${money.format(data.status.a_pagar)}`,
        `N/A: ${money.format(data.status.na)}`,
        "",
      );
    if (blocks.ano && serie.length) {
      out.push(
        "== PROJEÇÃO ANUAL ==",
        "(Meses futuros são projeções com base nos lançamentos previstos atuais, não dinheiro já realizado.)",
      );
      for (const item of serie)
        out.push(
          `${new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(`${item.competencia}T12:00:00`)).replace(".", "")}: previsto ${money.format(item.previsto)} | pago ${money.format(item.real)} | saldo projetado ${money.format(item.saldo_acum)}`,
        );
      out.push("");
    }
    out.push(
      "Responda em português do Brasil, de forma direta, humana e prática.",
      "Use linguagem simples, sem termos técnicos.",
      "Estruture a resposta em: (1) resumo do mês, (2) onde o dinheiro pesou, (3) alertas, (4) o que dá pra cortar, (5) plano do próximo mês, (6) mensagem final tranquilizadora.",
    );
    return out.join("\n");
  })();
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <>
      <section className="analysis-actions">
        <div>
          <p className="eyebrow">CONSULTOR FINANCEIRO</p>
          <h2>Peça uma análise do seu mês.</h2>
          <p>
            Preparamos uma consulta completa para você colar na IA de sua
            preferência.
          </p>
        </div>
        <button className="primary" onClick={() => setShowPrompt(true)}>
          ✦ Preparar análise
        </button>
      </section>
      <section className="grid analysis">
        <article className="card">
          <div className="card-title">
            <div>
              <h2>Despesas por categoria</h2>
              <p>Para onde seu dinheiro está indo.</p>
            </div>
          </div>
          {categories.slice(0, 7).map((i) => (
            <div className="category" key={i.nome}>
              <span style={{ background: i.cor }} />
              <b>{i.nome}</b>
              <i>
                <em
                  style={{
                    width: `${total ? Math.round((i.total / total) * 100) : 0}%`,
                  }}
                />
              </i>
              <strong>{money.format(i.total)}</strong>
            </div>
          ))}
          {!categories.length && (
            <div className="empty">Registre gastos para gerar sua análise.</div>
          )}
        </article>
        <article className="card stats">
          <h2>Resumo do mês</h2>
          <div>
            <span>Comprometimento da renda</span>
            <b>{comprometimento == null ? "—" : `${comprometimento}%`}</b>
          </div>
          <div>
            <span>Despesas pagas</span>
            <b>{money.format(data?.status.pago ?? 0)}</b>
          </div>
          <div>
            <span>Contas a pagar</span>
            <b>{money.format((data?.status.a_pagar ?? 0) + cardTotal)}</b>
          </div>
        </article>
      </section>
      <section className="grid analysis-detail">
        <article className="card">
          <div className="card-title">
            <div>
              <h2>Maiores despesas</h2>
              <p>Itens que mais pesam neste mês.</p>
            </div>
          </div>
          {top.map((item, index) => (
            <div className="top-expense" key={`${item.descricao}-${index}`}>
              <div>
                <b>{item.descricao}</b>
                {item.parcelasTotal && item.parcelasTotal > 1 && (
                  <small>
                    {item.parcelaAtual}/{item.parcelasTotal} parcelas
                  </small>
                )}
                <i>
                  <em
                    style={{
                      width: `${top[0] ? Math.round((item.valor / top[0].valor) * 100) : 0}%`,
                      backgroundColor: item.cor,
                    }}
                  />
                </i>
              </div>
              <strong>{money.format(item.valor)}</strong>
            </div>
          ))}
          {!top.length && (
            <div className="empty">Ainda não há despesas para comparar.</div>
          )}
        </article>
        <article className="card">
          <div className="card-title">
            <div>
              <h2>Previsto × real</h2>
              <p>Panorama do ano.</p>
            </div>
          </div>
          <div className="year-bars">
            {serie.map((item) => (
              <div className="year-bar" key={item.competencia}>
                <div>
                  <i
                    style={{
                      height: `${Math.max(3, (item.previsto / maxSerie) * 100)}%`,
                    }}
                  />
                  <em
                    style={{
                      height: `${Math.max(3, (item.real / maxSerie) * 100)}%`,
                    }}
                  />
                </div>
                <small>
                  {new Intl.DateTimeFormat("pt-BR", { month: "short" })
                    .format(new Date(`${item.competencia}T12:00:00`))
                    .replace(".", "")}
                </small>
              </div>
            ))}
          </div>
          <div className="chart-key">
            <span>
              <i /> Previsto
            </span>
            <span>
              <i /> Real
            </span>
          </div>
        </article>
      </section>
      {showPrompt && (
        <div className="modal-backdrop">
          <section className="modal prompt-modal">
            <button
              className="close"
              type="button"
              onClick={() => setShowPrompt(false)}
            >
              ×
            </button>
            <p className="eyebrow">ANÁLISE COM IA</p>
            <h2>Monte sua consulta</h2>
            <p className="form-hint">
              Escolha o que deseja incluir. Seus dados não são enviados pelo
              Casa Leve.
            </p>
            <div className="prompt-blocks">
              {(
                [
                  ["resumo", "Resumo do mês"],
                  ["despesas", "Detalhamento de despesas"],
                  ["cartao", "Faturas de cartão"],
                  ["categorias", "Categorias"],
                  ["top", "Maiores gastos"],
                  ["status", "Status dos pagamentos"],
                  ["ano", "Panorama do ano"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={blocks[key]}
                    onChange={() =>
                      setBlocks((current) => ({
                        ...current,
                        [key]: !current[key],
                      }))
                    }
                  />
                </label>
              ))}
            </div>
            <p className="form-hint">Prévia da consulta</p>
            <textarea
              value={prompt}
              readOnly
              aria-label="Consulta para análise financeira"
            />
            <button className="primary" onClick={copyPrompt}>
              {copied ? "Copiado!" : "Copiar consulta"}
            </button>
          </section>
        </div>
      )}
    </>
  );
}
function AddChoice({
  cards,
  onClose,
  onRecurring,
  onOneOff,
  onIncome,
  onCardPurchase,
}: {
  cards: number;
  onClose: () => void;
  onRecurring: () => void;
  onOneOff: () => void;
  onIncome: () => void;
  onCardPurchase: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section className="modal choice">
        <button className="close" type="button" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">ADICIONAR</p>
        <h2>O que você quer registrar?</h2>
        <button onClick={onRecurring}>
          <span>↻</span>
          <div>
            <b>Despesa recorrente</b>
            <small>
              Internet, streaming, aluguel ou outra conta que se repete.
            </small>
          </div>
        </button>
        <button onClick={onOneOff}>
          <span>ϟ</span>
          <div>
            <b>Gasto avulso</b>
            <small>Uma despesa que existe somente neste mês.</small>
          </div>
        </button>
        <button onClick={onIncome}>
          <span>↓</span>
          <div>
            <b>Entrada</b>
            <small>
              Salário, reembolso ou outra receita — pode ser recorrente.
            </small>
          </div>
        </button>
        <button onClick={onCardPurchase}>
          <span>▣</span>
          <div>
            <b>{cards ? "Compra no cartão" : "Cadastrar cartão primeiro"}</b>
            <small>
              {cards
                ? "Compra à vista ou parcelada, incluída na fatura."
                : "Você precisa de um cartão para registrar a compra."}
            </small>
          </div>
        </button>
      </section>
    </div>
  );
}
function Cards({
  cards,
  purchases,
  faturasOficiais,
  competencia,
  onCard,
  onEditCard,
  onPurchase,
}: {
  cards: Cartao[];
  purchases: Compra[];
  faturasOficiais: FaturaOficial[];
  competencia: string;
  onCard: () => void;
  onEditCard: (card: Cartao) => void;
  onPurchase: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  useEffect(() => {
    const current = cards.map((card) => card.id);
    const saved = JSON.parse(window.localStorage.getItem("casa-leve-card-order") ?? "[]") as string[];
    setOrder([...saved.filter((id) => current.includes(id)), ...current.filter((id) => !saved.includes(id))]);
  }, [cards]);
  const orderedCards = order.map((id) => cards.find((card) => card.id === id)).filter((card): card is Cartao => Boolean(card));
  function moveCard(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setOrder((current) => {
      const next = current.filter((id) => id !== draggedId);
      next.splice(next.indexOf(targetId), 0, draggedId);
      window.localStorage.setItem("casa-leve-card-order", JSON.stringify(next));
      return next;
    });
    setDraggedId(null);
  }
  const byCard = new Map(cards.map((card) => [card.id, card]));
  const mesAtual = competenciaAtual();
  const competenciaDoCartao = (card: Cartao) =>
    competencia === mesAtual ? competenciaFaturaAberta(card) : competencia;
  const faturaDoCartao = (card: Cartao) =>
    comprasDaFatura(
      purchases.filter((purchase) => purchase.cartao_id === card.id),
      competenciaDoCartao(card),
    );
  const fatura = cards.flatMap(faturaDoCartao);
  const cartaoSelecionado = selected ? byCard.get(selected) : null;
  const visible = cartaoSelecionado ? faturaDoCartao(cartaoSelecionado) : fatura;
  const selectedName = selected ? byCard.get(selected)?.nome : null;
  return (
    <section className="cards-layout">
      <article className="card">
        <div className="card-title">
          <div>
            <h2>Seus cartões</h2>
            <p>Escolha um cartão para ver apenas as compras dele.</p>
          </div>
          <div className="card-actions">
            {selected && (
              <button onClick={() => onEditCard(byCard.get(selected)!)}>
                Editar cartão
              </button>
            )}
            <button onClick={onCard}>＋ Novo cartão</button>
          </div>
        </div>
        {cards.length > 0 && (
          <div className="cards-scroll-wrap">
            <div className="cards-scroll">
              {orderedCards.map((card) => {
                const comprasFatura = faturaDoCartao(card);
                const totalCalculado = comprasFatura
                  .reduce((sum, purchase) => sum + purchase.valor_parcela, 0);
                const total = faturasOficiais.find(
                  (faturaOficial) =>
                    faturaOficial.cartao_id === card.id &&
                    faturaOficial.competencia === competenciaDoCartao(card),
                )?.total_aberto ?? totalCalculado;
                return (
                  <button
                    type="button"
                    className={`credit-card ${selected === card.id ? "selected" : ""}`}
                    key={card.id}
                    style={{ backgroundColor: card.cor }}
                    aria-pressed={selected === card.id}
                    draggable
                    onDragStart={() => setDraggedId(card.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => moveCard(card.id)}
                    onDragEnd={() => setDraggedId(null)}
                    onClick={() =>
                      setSelected((current) =>
                        current === card.id ? null : card.id,
                      )
                    }
                  >
                    <small>Fatura de {mes(competenciaDoCartao(card))}</small>
                    <b>{card.nome}</b>
                    <strong>{money.format(total)}</strong>
                    <small>
                      Fecha dia {card.dia_fechamento} · vence dia{" "}
                      {card.dia_vencimento}
                    </small>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {!cards.length && (
          <div className="empty">
            Nenhum cartão cadastrado. Cadastre o primeiro para registrar compras
            e parcelas.
          </div>
        )}
      </article>
      <article className="card">
        <div className="card-title">
          <div>
            <h2>
              {selectedName ? `Compras · ${selectedName}` : "Compras na fatura"}
            </h2>
            <p>
              {selectedName
                ? `Parcelas ativas de ${mes(competenciaDoCartao(cartaoSelecionado!))}.`
                : competencia === mesAtual
                  ? "Compras nas faturas abertas de cada cartão."
                  : `Todas as parcelas ativas de ${mes(competencia)}.`}
            </p>
          </div>
          <button onClick={onPurchase} disabled={!cards.length}>
            ＋ Nova compra
          </button>
        </div>
        {visible.map((purchase) => (
          <div className="purchase" key={purchase.id}>
            <span
              className="purchase-dot"
              style={{
                backgroundColor:
                  byCard.get(purchase.cartao_id)?.cor ?? "#9aa5a0",
              }}
            />
            <div>
              <b>{purchase.descricao}</b>
              <small>
                {byCard.get(purchase.cartao_id)?.nome ?? "Cartão"} ·{" "}
                {purchase.parcelas_total > 1
                  ? `${parcelaNoMes(purchase.competencia_inicio, competenciaDoCartao(byCard.get(purchase.cartao_id)!))}/${purchase.parcelas_total} parcelas`
                  : "Compra do mês"}
              </small>
            </div>
            <strong>{money.format(purchase.valor_parcela)}</strong>
          </div>
        ))}
        {!visible.length && (
          <div className="empty">Nenhuma compra entra nesta fatura.</div>
        )}
      </article>
    </section>
  );
}
function CardRecord({
  kind,
  casa,
  competencia,
  cards,
  card,
  onClose,
  onSaved,
}: {
  kind: "cartao" | "compra";
  casa: Casa;
  competencia: string;
  cards: Cartao[];
  card: Cartao | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(card?.nome ?? "");
  const [fechamento, setFechamento] = useState(
    String(card?.dia_fechamento ?? 25),
  );
  const [vencimento, setVencimento] = useState(
    String(card?.dia_vencimento ?? 7),
  );
  const [cor, setCor] = useState(card?.cor ?? "#287d6d");
  const [cartaoId, setCartaoId] = useState(cards[0]?.id ?? "");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [parcelas, setParcelas] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const cores = [
    "#287d6d",
    "#cc6448",
    "#437b8b",
    "#d3a14c",
    "#705f9b",
    "#7a9e7e",
  ];
  async function save(event: FormEvent) {
    event.preventDefault();
    const supabase = getSupabase();
    if (!supabase) return;
    setError("");
    setSaving(true);
    if (kind === "cartao") {
      const close = Number(fechamento);
      const due = Number(vencimento);
      if (!nome.trim() || close < 1 || close > 31 || due < 1 || due > 31) {
        setSaving(false);
        setError("Informe nome e dias válidos entre 1 e 31.");
        return;
      }
      const payload = {
        nome: nome.trim(),
        dia_fechamento: close,
        dia_vencimento: due,
        cor,
      };
      const { error: saveError } = card
        ? await supabase.from("cartoes").update(payload).eq("id", card.id)
        : await supabase.from("cartoes").insert({
            household_id: casa.household_id,
            criado_por: casa.membership_id,
            ...payload,
          });
      setSaving(false);
      if (saveError) setError(saveError.message);
      else onSaved();
      return;
    }
    const value = Number(valor.replace(/\./g, "").replace(",", "."));
    const times = Number(parcelas);
    if (
      !cartaoId ||
      !descricao.trim() ||
      value <= 0 ||
      !Number.isFinite(value) ||
      !Number.isInteger(times) ||
      times < 1
    ) {
      setSaving(false);
      setError("Informe cartão, descrição, valor e quantidade de parcelas.");
      return;
    }
    const { error: saveError } = await supabase.from("compras_cartao").insert({
      household_id: casa.household_id,
      criado_por: casa.membership_id,
      cartao_id: cartaoId,
      descricao: descricao.trim(),
      valor_parcela: value,
      parcelas_total: times,
      competencia_inicio: competencia,
    });
    setSaving(false);
    if (saveError) setError(saveError.message);
    else onSaved();
  }
  return (
    <div className="modal-backdrop">
      <form className="modal card-form" onSubmit={save}>
        <button className="close" type="button" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">
          {kind === "cartao" ? "NOVO CARTÃO" : "NOVA COMPRA NO CARTÃO"}
        </p>
        <h2>
          {kind === "cartao" ? "Cadastrar cartão" : "Adicionar compra à fatura"}
        </h2>
        {kind === "cartao" ? (
          <>
            <label>
              Nome do cartão
              <input
                autoFocus
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Nubank, Itaú"
              />
            </label>
            <div className="field-row">
              <label>
                Dia de fechamento
                <input
                  inputMode="numeric"
                  value={fechamento}
                  onChange={(e) => setFechamento(e.target.value)}
                />
              </label>
              <label>
                Dia de vencimento
                <input
                  inputMode="numeric"
                  value={vencimento}
                  onChange={(e) => setVencimento(e.target.value)}
                />
              </label>
            </div>
            <label>
              Cor de identificação
              <span className="color-list">
                {cores.map((value) => (
                  <button
                    type="button"
                    aria-label={`Selecionar cor ${value}`}
                    key={value}
                    onClick={() => setCor(value)}
                    className={cor === value ? "selected" : ""}
                    style={{ backgroundColor: value }}
                  />
                ))}
              </span>
            </label>
            <label className="custom-color">
              Escolher outra cor
              <input
                type="color"
                value={cor}
                onChange={(e) => setCor(e.target.value)}
                aria-label="Escolher cor personalizada do cartão"
              />
            </label>
          </>
        ) : (
          <>
            <label>
              Cartão
              <select
                value={cartaoId}
                onChange={(e) => setCartaoId(e.target.value)}
              >
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Descrição
              <input
                autoFocus
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Mercado, notebook"
              />
            </label>
            <div className="field-row">
              <label>
                Valor de cada parcela
                <input
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                />
              </label>
              <label>
                Parcelas
                <input
                  inputMode="numeric"
                  value={parcelas}
                  onChange={(e) => setParcelas(e.target.value)}
                />
              </label>
            </div>
            <p className="form-hint">
              A fatura começa em {mes(competencia)}. Uma parcela equivale a
              compra do mês.
            </p>
          </>
        )}
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={saving}>
          {saving
            ? "Salvando…"
            : kind === "cartao"
              ? "Cadastrar cartão"
              : "Adicionar à fatura"}
        </button>
      </form>
    </div>
  );
}
function NewRecord({
  kind,
  casa,
  competencia,
  categories,
  entry,
  onClose,
  onSaved,
}: {
  kind: "recorrente" | "avulso" | "entrada";
  casa: Casa;
  competencia: string;
  categories: Categoria[];
  entry: Entrada | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [descricao, setDescricao] = useState(entry?.descricao ?? "");
  const [valor, setValor] = useState(
    entry ? String(entry.valor).replace(".", ",") : "",
  );
  const [categoriaId, setCategoriaId] = useState("");
  const [dia, setDia] = useState("10");
  const [recorrente, setRecorrente] = useState(
    entry?.recorrente ?? kind === "recorrente",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isEntrada = kind === "entrada";
  const isRecorrente = kind === "recorrente";
  async function save(e: FormEvent) {
    e.preventDefault();
    const number = Number(valor.replace(/\./g, "").replace(",", "."));
    const due = Number(dia);
    if (
      !descricao.trim() ||
      !Number.isFinite(number) ||
      number <= 0 ||
      (isRecorrente && (!Number.isInteger(due) || due < 1 || due > 31))
    ) {
      setError(
        isRecorrente
          ? "Informe descrição, valor e vencimento entre 1 e 31."
          : "Informe uma descrição e um valor válido.",
      );
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    setSaving(true);
    let saveError: { message: string } | null = null;
    if (isEntrada) {
      const payload = {
        descricao: descricao.trim(),
        valor: number,
        competencia,
        recorrente,
      };
      ({ error: saveError } = entry
        ? await supabase.from("entradas").update(payload).eq("id", entry.id)
        : await supabase.from("entradas").insert({
            household_id: casa.household_id,
            criado_por: casa.membership_id,
            ...payload,
          }));
    } else if (isRecorrente)
      ({ error: saveError } = await supabase.from("orcamento_itens").insert({
        household_id: casa.household_id,
        criado_por: casa.membership_id,
        descricao: descricao.trim(),
        valor_previsto: number,
        dia_vencimento: due,
        competencia_inicio: competencia,
        recorrente: true,
        eh_demanda: false,
        categoria_id: categoriaId || null,
      }));
    else
      ({ error: saveError } = await supabase.from("orcamento_avulso").insert({
        household_id: casa.household_id,
        criado_por: casa.membership_id,
        descricao: descricao.trim(),
        competencia,
        valor_previsto: number,
        status: "a_pagar",
        categoria_id: categoriaId || null,
      }));
    setSaving(false);
    if (saveError) setError(saveError.message);
    else onSaved();
  }
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={save}>
        <button className="close" type="button" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">
          {entry ? "EDITAR ENTRADA" : "NOVO LANÇAMENTO"}
        </p>
        <h2>
          {isEntrada
            ? entry
              ? "Editar entrada"
              : "Registrar entrada"
            : isRecorrente
              ? "Adicionar despesa recorrente"
              : "Adicionar gasto avulso"}
        </h2>
        <label>
          Descrição
          <input
            autoFocus
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder={
              isEntrada
                ? "Ex: Salário"
                : isRecorrente
                  ? "Ex: Internet, streaming"
                  : "Ex: Mercado"
            }
          />
        </label>
        <label>
          Valor (R$)
          <input
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
          />
        </label>
        {!isEntrada && (
          <label>
            Categoria
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
            >
              <option value="">Sem categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        {isRecorrente && (
          <label>
            Dia de vencimento
            <input
              inputMode="numeric"
              value={dia}
              onChange={(e) => setDia(e.target.value)}
            />
          </label>
        )}
        {isEntrada && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={recorrente}
              onChange={(e) => setRecorrente(e.target.checked)}
            />
            Repetir esta entrada todo mês
          </label>
        )}
        {isRecorrente && (
          <p className="form-hint">
            Esta despesa aparecerá automaticamente a partir de{" "}
            {mes(competencia)}.
          </p>
        )}
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={saving}>
          {saving ? "Salvando…" : "Salvar lançamento"}
        </button>
      </form>
    </div>
  );
}
