import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { periodLabels, statusLabels, todayISO, type DayPeriod } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/reports/daily")({
  head: () => ({
    meta: [
      { title: "التقرير اليومي للطباعة · مخازن بوب ويتش" },
      {
        name: "description",
        content: "تقرير يومي أنيق قابل للطباعة يعرض الجرد الصباحي والمسائي وطلبات الفروع والفروقات.",
      },
      { property: "og:title", content: "التقرير اليومي · مخازن بوب ويتش" },
      { property: "og:description", content: "طباعة تقرير اليوم لكل فرع: الجرد والطلبات والكميات والفروقات." },
    ],
  }),
  component: DailyReportPage,
});

function DailyReportPage() {
  const [date, setDate] = useState(todayISO());
  const [branchId, setBranchId] = useState("");
  const [period, setPeriod] = useState<"" | DayPeriod>("");

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["daily-orders", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_no, order_date, period, status, notes, branch_id, branches(name), order_items(requested_qty, approved_qty, prepared_qty, received_qty, items(name, units(name)))",
        )
        .eq("order_date", date)
        .order("order_no");
      if (error) throw error;
      return data;
    },
  });

  const { data: counts = [] } = useQuery({
    queryKey: ["daily-counts", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_counts")
        .select("id, ref_no, period, branch_id, branches(name), inventory_count_items(qty, items(name, units(name)))")
        .eq("count_date", date)
        .order("ref_no");
      if (error) throw error;
      return data;
    },
  });

  const filteredOrders = useMemo(
    () =>
      orders.filter(
        (o) => (!branchId || o.branch_id === branchId) && (!period || o.period === period),
      ),
    [orders, branchId, period],
  );

  const filteredCounts = useMemo(
    () =>
      counts.filter(
        (c) => (!branchId || c.branch_id === branchId) && (!period || c.period === period),
      ),
    [counts, branchId, period],
  );

  const prettyDate = new Date(`${date}T00:00:00`).toLocaleDateString("ar-EG", { dateStyle: "full" });
  const branchName = branchId ? (branches.find((b) => b.id === branchId)?.name ?? "") : "كل الفروع";
  const periodName = period ? periodLabels[period] : "الفترتان";

  const totals = {
    orders: filteredOrders.length,
    lines: filteredOrders.reduce((n, o) => n + o.order_items.length, 0),
    diffs: filteredOrders.reduce(
      (n, o) =>
        n +
        o.order_items.filter((l) => {
          const base = Number(l.approved_qty ?? l.requested_qty);
          return l.received_qty != null && Number(l.received_qty) !== base;
        }).length,
      0,
    ),
  };

  return (
    <AppShell
      title="التقرير اليومي"
      subtitle={`${prettyDate} · ${branchName} · ${periodName}`}
      actions={
        <Button className="gradient-hot rounded-2xl font-bold" onClick={() => window.print()}>
          <Printer className="size-4" />
          طباعة التقرير
        </Button>
      }
    >
      <div className="glass no-print mb-5 grid gap-4 rounded-3xl p-5 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>التاريخ</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>الفرع</Label>
          <select
            className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            <option value="">كل الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>الفترة</Label>
          <select
            className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm"
            value={period}
            onChange={(e) => setPeriod(e.target.value as "" | DayPeriod)}
          >
            <option value="">الفترتان</option>
            <option value="morning">صباحي</option>
            <option value="evening">مسائي</option>
          </select>
        </div>
      </div>

      <div className="glass print-sheet rounded-3xl p-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
          <div>
            <div className="font-display text-2xl font-extrabold">تقرير الحركة اليومية — مخازن بوب ويتش</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {prettyDate} · {branchName} · {periodName}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            <div>عدد الطلبات: {totals.orders}</div>
            <div>عدد بنود الأصناف: {totals.lines}</div>
            <div>بنود بها فروقات: {totals.diffs}</div>
          </div>
        </header>

        <section className="mb-8">
          <h2 className="mb-3 font-display text-lg font-bold">الجرد المسجل</h2>
          {filteredCounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا يوجد جرد مسجل في هذا اليوم.</p>
          ) : (
            filteredCounts.map((c) => (
              <div key={c.id} className="mb-4">
                <div className="mb-1 text-sm font-semibold">
                  جرد #{c.ref_no} — {c.branches?.name} — {periodLabels[c.period]}
                </div>
                <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-right text-[11px] text-muted-foreground">
                      <th className="py-2 font-medium">الصنف</th>
                      <th className="font-medium">الوحدة</th>
                      <th className="font-medium">الكمية الموجودة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {c.inventory_count_items.map((l, i) => (
                      <tr key={i}>
                        <td className="py-2">{l.items?.name}</td>
                        <td className="text-muted-foreground">{l.items?.units?.name}</td>
                        <td className="font-semibold">{Number(l.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            ))
          )}
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-bold">طلبات اليوم</h2>
          {filteredOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد طلبات في هذا اليوم.</p>
          ) : (
            filteredOrders.map((o) => (
              <div key={o.id} className="mb-5">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
                  <span>
                    طلبية #{o.order_no} — {o.branches?.name} — {periodLabels[o.period]}
                  </span>
                  <span className="text-muted-foreground">{statusLabels[o.status]}</span>
                </div>
                {o.notes && <div className="mb-1 text-xs text-muted-foreground">ملاحظات: {o.notes}</div>}
                <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-right text-[11px] text-muted-foreground">
                      <th className="py-2 font-medium">الصنف</th>
                      <th className="font-medium">الوحدة</th>
                      <th className="font-medium">مطلوب</th>
                      <th className="font-medium">معتمد</th>
                      <th className="font-medium">مجهز</th>
                      <th className="font-medium">مستلم</th>
                      <th className="font-medium">الفرق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {o.order_items.map((l, i) => {
                      const base = Number(l.approved_qty ?? l.requested_qty);
                      const diff = l.received_qty == null ? null : Number(l.received_qty) - base;
                      return (
                        <tr key={i}>
                          <td className="py-2">{l.items?.name}</td>
                          <td className="text-muted-foreground">{l.items?.units?.name}</td>
                          <td>{Number(l.requested_qty)}</td>
                          <td>{l.approved_qty == null ? "—" : Number(l.approved_qty)}</td>
                          <td>{l.prepared_qty == null ? "—" : Number(l.prepared_qty)}</td>
                          <td>{l.received_qty == null ? "—" : Number(l.received_qty)}</td>
                          <td className={diff ? "font-bold text-coral-strong" : ""}>
                            {diff == null ? "—" : diff > 0 ? `+${diff}` : diff}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            ))
          )}
        </section>

        <footer className="mt-8 grid gap-4 border-t border-border pt-6 text-xs text-muted-foreground sm:grid-cols-3 sm:gap-6 print:grid-cols-3">
          <div>توقيع مدير الفرع: ............................</div>
          <div>توقيع مدير التكاليف: ............................</div>
          <div>توقيع أمين المخزن: ............................</div>
        </footer>
      </div>
    </AppShell>
  );
}
