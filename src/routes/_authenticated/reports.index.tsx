import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { allStatuses, periodLabels, statusLabels } from "@/lib/domain";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/reports/")({
  head: () => ({
    meta: [
      { title: "التقارير · مخازن بوب ويتش" },
      { name: "description", content: "تقارير الطلبات حسب الفترة والفرع والحالة مع تقرير الفروقات." },
      { property: "og:title", content: "التقارير · مخازن بوب ويتش" },
      { property: "og:description", content: "تحليل الطلبات المعلقة والجاهزة والفروقات بين المطلوب والمجهز والمستلم." },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: orders = [] } = useQuery({
    queryKey: ["report-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_no, order_date, period, status, branches(name), order_items(requested_qty, approved_qty, prepared_qty, received_qty, items(name))",
        )
        .order("order_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const rows = useMemo(
    () =>
      orders.filter((o) => {
        if (from && o.order_date < from) return false;
        if (to && o.order_date > to) return false;
        return true;
      }),
    [orders, from, to],
  );

  const byPeriod = (p: "morning" | "evening") => rows.filter((o) => o.period === p).length;

  const byBranch = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of rows) map.set(o.branches?.name ?? "—", (map.get(o.branches?.name ?? "—") ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const diffs = useMemo(
    () =>
      rows
        .map((o) => {
          const lines = o.order_items.filter((l) => {
            const base = Number(l.approved_qty ?? l.requested_qty);
            return l.received_qty != null && Number(l.received_qty) !== base;
          });
          return { order: o, lines };
        })
        .filter((r) => r.lines.length > 0),
    [rows],
  );

  const pending = rows.filter((o) => o.status === "submitted");
  const readyInWarehouse = rows.filter((o) => o.status === "prepared");
  const notReceived = rows.filter((o) => o.status === "dispatched");

  return (
    <AppShell title="التقارير" subtitle={`${rows.length} طلبية ضمن الفترة المحددة`}>
      <div className="glass mb-5 grid gap-4 rounded-3xl p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>من تاريخ</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>إلى تاريخ</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="rounded-2xl bg-card/60 p-3">
          <div className="text-xs text-muted-foreground">طلبات صباحية</div>
          <div className="font-display text-2xl font-extrabold text-amber-strong">{byPeriod("morning")}</div>
        </div>
        <div className="rounded-2xl bg-card/60 p-3">
          <div className="text-xs text-muted-foreground">طلبات مسائية</div>
          <div className="font-display text-2xl font-extrabold text-sky-strong">{byPeriod("evening")}</div>
        </div>
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <section className="glass rounded-3xl p-5">
          <h2 className="mb-3 font-display text-lg font-bold">الطلبات حسب الحالة</h2>
          <div className="space-y-1.5 text-sm">
            {allStatuses.map((s) => {
              const n = rows.filter((o) => o.status === s).length;
              if (n === 0) return null;
              return (
                <div key={s} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{statusLabels[s]}</span>
                  <span className="font-bold">{n}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="glass rounded-3xl p-5">
          <h2 className="mb-3 font-display text-lg font-bold">الطلبات حسب الفرع</h2>
          <div className="space-y-1.5 text-sm">
            {byBranch.map(([branch, n]) => (
              <div key={branch} className="flex items-center justify-between">
                <span className="text-muted-foreground">{branch}</span>
                <span className="font-bold">{n}</span>
              </div>
            ))}
            {byBranch.length === 0 && <div className="text-muted-foreground">لا توجد بيانات</div>}
          </div>
        </section>

        <section className="glass rounded-3xl p-5">
          <h2 className="mb-3 font-display text-lg font-bold">متابعة عاجلة</h2>
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">معلقة لدى مدير التكاليف</span>
              <span className="font-bold text-amber-strong">{pending.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">جاهزة في المخزن</span>
              <span className="font-bold text-coral-strong">{readyInWarehouse.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">خرجت ولم تُستلم</span>
              <span className="font-bold text-sky-strong">{notReceived.length}</span>
            </div>
          </div>
        </section>
      </div>

      <section className="glass overflow-x-auto rounded-3xl p-5">
        <h2 className="mb-4 font-display text-lg font-bold">تقرير الفروقات</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-right text-[11px] text-muted-foreground">
              <th className="py-2 font-medium">الطلبية</th>
              <th className="font-medium">الفرع</th>
              <th className="font-medium">التاريخ / الفترة</th>
              <th className="font-medium">الأصناف ذات الفروقات</th>
              <th className="font-medium">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {diffs.map(({ order, lines }) => (
              <tr key={order.id}>
                <td className="py-3 font-semibold">
                  <Link to="/orders/$id" params={{ id: order.id }} className="text-brand">
                    #{order.order_no}
                  </Link>
                </td>
                <td>{order.branches?.name}</td>
                <td className="text-muted-foreground">
                  {order.order_date} · {periodLabels[order.period]}
                </td>
                <td className="text-xs">
                  {lines
                    .map((l) => {
                      const base = Number(l.approved_qty ?? l.requested_qty);
                      const diff = Number(l.received_qty) - base;
                      return `${l.items?.name}: ${diff > 0 ? "+" : ""}${diff}`;
                    })
                    .join(" · ")}
                </td>
                <td>
                  <StatusBadge status={order.status} />
                </td>
              </tr>
            ))}
            {diffs.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  لا توجد فروقات مسجلة
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
