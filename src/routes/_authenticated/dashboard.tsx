import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth, useRoleFlags } from "@/lib/auth";
import { periodLabels, roleLabels, todayISO, type OrderStatus } from "@/lib/domain";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم · مخازن بوب ويتش" },
      { name: "description", content: "نظرة سريعة على الجرد والطلبات وحالتها حسب دورك في النظام." },
      { property: "og:title", content: "لوحة التحكم · مخازن بوب ويتش" },
      { property: "og:description", content: "متابعة الطلبات قيد المراجعة والتجهيز والاستلام في مكان واحد." },
    ],
  }),
  component: DashboardPage,
});

const statCards: { key: OrderStatus[]; label: string; hint: string; tone: string }[] = [
  { key: ["submitted"], label: "طلبات قيد المراجعة", hint: "بانتظار مدير التكاليف", tone: "text-amber-strong" },
  { key: ["approved"], label: "طلبات معتمدة", hint: "جاهزة للتجهيز", tone: "text-sky-strong" },
  { key: ["preparing", "prepared"], label: "قيد التجهيز", hint: "في المخزن المركزي", tone: "text-coral-strong" },
  { key: ["received", "received_with_diff"], label: "تم الاستلام", hint: "آخر ٣٠ يوم", tone: "text-mint-strong" },
];

function DashboardPage() {
  const { profile, roles } = useAuth();
  const flags = useRoleFlags();

  const { data: orders = [] } = useQuery({
    queryKey: ["dashboard-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_no, branch_id, order_date, period, status, created_at, branches(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const { data: todayCounts = [] } = useQuery({
    queryKey: ["dashboard-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_counts")
        .select("id, period, branch_id, branches(name)")
        .eq("count_date", todayISO());
      if (error) throw error;
      return data;
    },
  });

  const roleTitle = roles.length ? roleLabels[roles[0]!] : "مستخدم";

  return (
    <AppShell
      title={`لوحة تحكم ${roleTitle}`}
      subtitle={new Date().toLocaleDateString("ar-EG", { dateStyle: "full" })}
      actions={
        flags.isBranchManager ? (
          <Button asChild className="gradient-hot rounded-2xl font-bold">
            <Link to="/orders/new">طلبية جديدة</Link>
          </Button>
        ) : null
      }
    >
      {roles.length === 0 && (
        <div className="glass mb-6 rounded-3xl p-5 text-sm">
          حسابك غير مرتبط بأي دور بعد. يرجى التواصل مع مدير النظام لتحديد دورك وفرعك.
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="glass rounded-3xl p-5">
            <div className="mb-2 text-xs text-muted-foreground">{card.label}</div>
            <div className={`font-display text-3xl font-extrabold ${card.tone}`}>
              {orders.filter((o) => card.key.includes(o.status)).length}
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">{card.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="glass min-w-0 rounded-3xl p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-foreground">أحدث الطلبات</h2>
            <Link to="/orders" className="text-sm font-semibold text-brand">
              عرض الكل
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-right text-[11px] text-muted-foreground">
                  <th className="py-2 pe-1 font-medium">الرقم</th>
                  <th className="font-medium">الفرع</th>
                  <th className="font-medium">التاريخ</th>
                  <th className="font-medium">الفترة</th>
                  <th className="font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.slice(0, 8).map((o) => (
                  <tr key={o.id}>
                    <td className="py-3 pe-1 font-semibold">
                      <Link to="/orders/$id" params={{ id: o.id }} className="text-brand">
                        #{o.order_no}
                      </Link>
                    </td>
                    <td>{o.branches?.name ?? "—"}</td>
                    <td className="text-muted-foreground">{o.order_date}</td>
                    <td className="text-muted-foreground">{periodLabels[o.period]}</td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      لا توجد طلبات بعد
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="glass min-w-0 rounded-3xl p-5">
          <h2 className="mb-4 font-display text-lg font-bold text-foreground">جرد اليوم</h2>
          <div className="space-y-2 text-sm">
            {(["morning", "evening"] as const).map((p) => {
              const rows = todayCounts.filter((c) => c.period === p);
              return (
                <div key={p} className="rounded-2xl bg-card/60 p-3">
                  <div className="mb-1 font-semibold">الجرد {periodLabels[p]}</div>
                  {rows.length === 0 ? (
                    <div className="text-xs text-muted-foreground">لم يُسجّل بعد</div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      {rows.map((r) => r.branches?.name).join(" · ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {flags.isBranchManager && (
            <Button asChild variant="outline" className="mt-4 w-full rounded-2xl">
              <Link to="/inventory">تسجيل الجرد</Link>
            </Button>
          )}
          {profile?.branch_id == null && flags.isBranchManager && (
            <p className="mt-3 text-[11px] text-coral-strong">
              لم يتم ربط حسابك بفرع بعد؛ اطلب من مدير النظام تحديد الفرع.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
