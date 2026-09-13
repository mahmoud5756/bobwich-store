import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { useRoleFlags } from "@/lib/auth";
import { formatDateTime, periodLabels } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/warehouse")({
  head: () => ({
    meta: [
      { title: "تجهيز المخزن · مخازن بوب ويتش" },
      { name: "description", content: "الطلبات المعتمدة الجاهزة للتجهيز والخروج من المخزن المركزي." },
      { property: "og:title", content: "تجهيز المخزن · مخازن بوب ويتش" },
      { property: "og:description", content: "عامل المخزن يرى الطلبات المعتمدة فقط ويسجل الكميات المصروفة." },
    ],
  }),
  component: WarehousePage,
});

const groups = [
  { key: ["approved"], title: "بانتظار التجهيز", hint: "طلبات معتمدة من مدير التكاليف" },
  { key: ["preparing"], title: "قيد التجهيز", hint: "تم البدء بالتجهيز" },
  { key: ["prepared"], title: "جاهزة للخروج", hint: "بانتظار تسجيل الخروج من المخزن" },
  { key: ["dispatched"], title: "خرجت ولم تُستلم", hint: "بانتظار استلام الفرع" },
];

function WarehousePage() {
  const flags = useRoleFlags();

  const { data: orders = [] } = useQuery({
    queryKey: ["warehouse-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_no, order_date, period, status, approved_at, branches(name)")
        .in("status", ["approved", "preparing", "prepared", "dispatched"])
        .order("approved_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  if (!flags.isWarehouse && !flags.isAdmin) {
    return (
      <AppShell title="تجهيز المخزن">
        <div className="glass rounded-3xl p-6">هذه الشاشة متاحة لعمال المخزن ومدير النظام فقط.</div>
      </AppShell>
    );
  }

  return (
    <AppShell title="تجهيز المخزن" subtitle={`${orders.length} طلبية في المخزن`}>
      <div className="grid gap-5 lg:grid-cols-2">
        {groups.map((g) => {
          const rows = orders.filter((o) => g.key.includes(o.status));
          return (
            <section key={g.title} className="glass rounded-3xl p-5">
              <h2 className="font-display text-lg font-bold">{g.title}</h2>
              <p className="mb-4 text-xs text-muted-foreground">{g.hint}</p>
              <div className="space-y-2">
                {rows.map((o) => (
                  <Link
                    key={o.id}
                    to="/orders/$id"
                    params={{ id: o.id }}
                    className="flex items-center gap-3 rounded-2xl bg-card/60 p-3 transition hover:bg-card"
                  >
                    <span className="font-display font-bold">#{o.order_no}</span>
                    <span className="text-sm">{o.branches?.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {o.order_date} · {periodLabels[o.period]}
                    </span>
                    <span className="ms-auto flex items-center gap-2">
                      <span className="hidden text-[11px] text-muted-foreground sm:inline">
                        {formatDateTime(o.approved_at)}
                      </span>
                      <StatusBadge status={o.status} />
                    </span>
                  </Link>
                ))}
                {rows.length === 0 && <div className="py-4 text-sm text-muted-foreground">لا توجد طلبات هنا</div>}
              </div>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}
