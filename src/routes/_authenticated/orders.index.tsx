import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { useRoleFlags } from "@/lib/auth";
import { allStatuses, periodLabels, statusLabels, formatDateTime } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/orders/")({
  head: () => ({
    meta: [
      { title: "قائمة الطلبات · مخازن بوب ويتش" },
      { name: "description", content: "ابحث وصفّي طلبات الفروع حسب الفرع والتاريخ والفترة والحالة." },
      { property: "og:title", content: "قائمة الطلبات · مخازن بوب ويتش" },
      { property: "og:description", content: "متابعة كل طلبات الفروع من المسودة حتى الاستلام." },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const flags = useRoleFlags();
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("");
  const [period, setPeriod] = useState("");
  const [status, setStatus] = useState("");
  const [date, setDate] = useState("");

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_no, order_date, period, status, created_at, notes, branches(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(
    () =>
      orders.filter((o) => {
        if (branch && o.branches?.name !== branch) return false;
        if (period && o.period !== period) return false;
        if (status && o.status !== status) return false;
        if (date && o.order_date !== date) return false;
        if (q && !`${o.order_no} ${o.branches?.name ?? ""} ${o.notes ?? ""}`.includes(q)) return false;
        return true;
      }),
    [orders, branch, period, status, date, q],
  );

  return (
    <AppShell
      title="قائمة الطلبات"
      subtitle={`${filtered.length} طلبية`}
      actions={
        flags.isBranchManager ? (
          <Button asChild className="gradient-hot rounded-2xl font-bold">
            <Link to="/orders/new">طلبية جديدة</Link>
          </Button>
        ) : null
      }
    >
      <div className="glass mb-5 grid gap-3 rounded-3xl p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Input placeholder="بحث بالرقم أو الفرع" value={q} onChange={(e) => setQ(e.target.value)} />
        <select
          className="h-10 rounded-xl border border-input bg-card px-3 text-sm"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
        >
          <option value="">كل الفروع</option>
          {branches.map((b) => (
            <option key={b.id} value={b.name}>
              {b.name}
            </option>
          ))}
        </select>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <select
          className="h-10 rounded-xl border border-input bg-card px-3 text-sm"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="">كل الفترات</option>
          <option value="morning">صباحية</option>
          <option value="evening">مسائية</option>
        </select>
        <select
          className="h-10 rounded-xl border border-input bg-card px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">كل الحالات</option>
          {allStatuses.map((s) => (
            <option key={s} value={s}>
              {statusLabels[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="glass overflow-x-auto rounded-3xl p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-right text-[11px] text-muted-foreground">
              <th className="py-2 font-medium">الرقم</th>
              <th className="font-medium">الفرع</th>
              <th className="font-medium">التاريخ</th>
              <th className="font-medium">الفترة</th>
              <th className="font-medium">الحالة</th>
              <th className="font-medium">أنشئت في</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((o) => (
              <tr key={o.id}>
                <td className="py-3 font-semibold">#{o.order_no}</td>
                <td>{o.branches?.name ?? "—"}</td>
                <td className="text-muted-foreground">{o.order_date}</td>
                <td className="text-muted-foreground">{periodLabels[o.period]}</td>
                <td>
                  <StatusBadge status={o.status} />
                </td>
                <td className="text-xs text-muted-foreground">{formatDateTime(o.created_at)}</td>
                <td className="text-left">
                  <Link to="/orders/$id" params={{ id: o.id }} className="text-sm font-semibold text-brand">
                    فتح
                  </Link>
                </td>
              </tr>
            ))}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  لا توجد طلبات مطابقة
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
