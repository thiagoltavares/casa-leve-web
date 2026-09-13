"use client";

import { usePathname } from "next/navigation";
import FinancePortal from "@/components/FinancePortal";

const tabsPorRota = {
  "/financas/visao-geral": "visao",
  "/financas/lancamentos": "despesas",
  "/financas/cartoes": "cartoes",
  "/financas/analises": "analises",
} as const;

export default function FinanceShell() {
  const pathname = usePathname();
  const initialTab = tabsPorRota[pathname as keyof typeof tabsPorRota] ?? "visao";

  return <FinancePortal initialTab={initialTab} />;
}
