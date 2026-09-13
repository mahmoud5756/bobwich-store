import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useAuth, useRoleFlags } from "@/lib/auth";
import { periodLabels, todayISO, type DayPeriod } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/orders/new")({
  head: () => ({
    meta: [
      { title: "إنشاء طلبية · مخازن بوب ويتش" },
      { name: "description", content: "أنشئ طلبية صباحية أو مسائية لفرعك وحدد الأصناف والكميات المطلوبة." },
      { property: "og:title", content: "إنشاء طلبية · مخازن بوب ويتش" },
      { property: "og:description", content: "طلبية مرتبطة بالفرع والتاريخ والفترة مع مقارنة بالجرد المسجل." },
    ],
  }),
  component: NewOrderPage,
});

function NewOrderPage() {
  const { profile, user } = useAuth();
  const flags = useRoleFlags();
  const navigate = useNavigate();

  const [date, setDate] = useState(todayISO());
  const [period, setPeriod] = useState<DayPeriod>("morning");
  const [branchId, setBranchId] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [lineNotes, setLineNotes] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile?.branch_id && !branchId) setBranchId(profile.branch_id);
  }, [profile?.branch_id, branchId]);

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("id, name, units(name)")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: count } = useQuery({
    queryKey: ["count-for-order", branchId, date, period],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_counts")
        .select("id, ref_no, inventory_count_items(item_id, qty)")
        .eq("branch_id", branchId)
        .eq("count_date", date)
        .eq("period", period)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const onHand = new Map((count?.inventory_count_items ?? []).map((l) => [l.item_id, Number(l.qty)]));

  async function create(submit: boolean) {
    if (!branchId || !user) {
      toast.error("اختر الفرع أولاً");
      return;
    }
    const rows = items.filter((i) => qty[i.id] && Number(qty[i.id]) > 0);
    if (rows.length === 0) {
      toast.error("أدخل كمية لصنف واحد على الأقل");
      return;
    }
    setBusy(true);
    try {
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          branch_id: branchId,
          order_date: date,
          period,
          notes,
          created_by: user.id,
          status: submit ? "submitted" : "draft",
          submitted_at: submit ? new Date().toISOString() : null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: itemsError } = await supabase.from("order_items").insert(
        rows.map((i) => ({
          order_id: order.id,
          item_id: i.id,
          requested_qty: Number(qty[i.id]),
          notes: lineNotes[i.id] ?? null,
        })),
      );
      if (itemsError) throw itemsError;

      await supabase.from("order_events").insert({
        order_id: order.id,
        action: submit ? "إرسال الطلبية إلى مدير التكاليف" : "إنشاء مسودة الطلبية",
        actor_id: user.id,
      });

      toast.success(submit ? "تم إرسال الطلبية للمراجعة" : "تم حفظ المسودة");
      void navigate({ to: "/orders/$id", params: { id: order.id } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        msg.includes("duplicate")
          ? "يوجد طلبية مسجلة مسبقاً لهذا الفرع في نفس اليوم والفترة"
          : "تعذّر إنشاء الطلبية: تأكد من صلاحياتك وارتباط حسابك بالفرع",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!flags.isBranchManager) {
    return (
      <AppShell title="إنشاء طلبية">
        <div className="glass rounded-3xl p-6">إنشاء الطلبات متاح لمدير الفرع فقط.</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="إنشاء طلبية جديدة"
      subtitle={count ? `مرتبطة بالجرد رقم ${count.ref_no}` : "لا يوجد جرد مسجل لهذه الفترة بعد"}
      actions={
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-2xl" disabled={busy} onClick={() => void create(false)}>
            حفظ كمسودة
          </Button>
          <Button className="gradient-hot rounded-2xl font-bold" disabled={busy} onClick={() => void create(true)}>
            إرسال للمراجعة
          </Button>
        </div>
      }
    >
      <div className="glass mb-5 grid gap-4 rounded-3xl p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>الفرع</Label>
          <select
            className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            disabled={!flags.isAdmin && !!profile?.branch_id}
          >
            <option value="">اختر الفرع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>التاريخ</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>الفترة</Label>
          <div className="flex gap-1 rounded-2xl bg-card/60 p-1">
            {(["morning", "evening"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`flex-1 rounded-xl px-3 py-1.5 text-sm font-semibold ${
                  period === p ? "gradient-brand text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {periodLabels[p]}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>ملاحظات الطلبية</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختياري" />
        </div>
      </div>

      <section className="glass overflow-x-auto rounded-3xl p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-right text-[11px] text-muted-foreground">
              <th className="py-2 font-medium">الصنف</th>
              <th className="font-medium">الوحدة</th>
              <th className="font-medium">الموجود بالجرد</th>
              <th className="w-32 font-medium">الكمية المطلوبة</th>
              <th className="font-medium">ملاحظات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="py-2 font-medium">{item.name}</td>
                <td className="text-muted-foreground">{item.units?.name}</td>
                <td className="text-muted-foreground">{onHand.get(item.id) ?? "—"}</td>
                <td className="py-1">
                  <Input
                    inputMode="decimal"
                    className="h-9"
                    value={qty[item.id] ?? ""}
                    onChange={(e) => setQty({ ...qty, [item.id]: e.target.value })}
                  />
                </td>
                <td className="py-1">
                  <Input
                    className="h-9"
                    value={lineNotes[item.id] ?? ""}
                    onChange={(e) => setLineNotes({ ...lineNotes, [item.id]: e.target.value })}
                    placeholder="اختياري"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AppShell>
  );
}
