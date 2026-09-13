import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useAuth, useRoleFlags } from "@/lib/auth";
import { periodLabels, todayISO, formatDateTime, type DayPeriod } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "تسجيل الجرد الصباحي والمسائي · مخازن بوب ويتش" },
      { name: "description", content: "سجّل كميات الأصناف المتوفرة في الفرع لكل فترة صباحية أو مسائية." },
      { property: "og:title", content: "تسجيل الجرد · مخازن بوب ويتش" },
      { property: "og:description", content: "جرد يومي مقسم إلى فترة صباحية وفترة مسائية لكل فرع." },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const { profile, user } = useAuth();
  const flags = useRoleFlags();
  const qc = useQueryClient();

  const [date, setDate] = useState(todayISO());
  const [period, setPeriod] = useState<DayPeriod>("morning");
  const [branchId, setBranchId] = useState<string>("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [lineNotes, setLineNotes] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

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

  const { data: existing } = useQuery({
    queryKey: ["count", branchId, date, period],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_counts")
        .select("*, inventory_count_items(item_id, qty, notes)")
        .eq("branch_id", branchId)
        .eq("count_date", date)
        .eq("period", period)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const next: Record<string, string> = {};
    const nextNotes: Record<string, string> = {};
    for (const line of existing?.inventory_count_items ?? []) {
      next[line.item_id] = String(line.qty);
      if (line.notes) nextNotes[line.item_id] = line.notes;
    }
    setQty(next);
    setLineNotes(nextNotes);
    setNotes(existing?.notes ?? "");
  }, [existing]);

  const filled = useMemo(() => Object.values(qty).filter((v) => v !== "").length, [qty]);

  async function save() {
    if (!branchId) {
      toast.error("اختر الفرع أولاً");
      return;
    }
    if (!user) return;
    setSaving(true);
    try {
      let countId = existing?.id;
      if (!countId) {
        const { data, error } = await supabase
          .from("inventory_counts")
          .insert({ branch_id: branchId, count_date: date, period, notes, created_by: user.id })
          .select("id")
          .single();
        if (error) throw error;
        countId = data.id;
      } else {
        const { error } = await supabase.from("inventory_counts").update({ notes }).eq("id", countId);
        if (error) throw error;
      }

      const rows = items
        .filter((i) => qty[i.id] !== undefined && qty[i.id] !== "")
        .map((i) => ({
          count_id: countId!,
          item_id: i.id,
          qty: Number(qty[i.id]),
          notes: lineNotes[i.id] ?? null,
        }));

      if (rows.length) {
        const { error } = await supabase.from("inventory_count_items").upsert(rows, { onConflict: "count_id,item_id" });
        if (error) throw error;
      }
      toast.success("تم حفظ الجرد");
      void qc.invalidateQueries({ queryKey: ["count"] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        msg.includes("duplicate")
          ? "يوجد جرد مسجل مسبقاً لهذا الفرع في نفس اليوم والفترة"
          : "تعذّر حفظ الجرد: تأكد من صلاحياتك وارتباط حسابك بالفرع",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!flags.isBranchManager) {
    return (
      <AppShell title="تسجيل الجرد">
        <div className="glass rounded-3xl p-6">هذه الشاشة متاحة لمدير الفرع فقط.</div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="تسجيل الجرد الصباحي والمسائي"
      subtitle={existing ? `سجل رقم ${existing.ref_no} · ${formatDateTime(existing.created_at)}` : "سجل جديد"}
      actions={
        <Button onClick={() => void save()} disabled={saving} className="gradient-hot rounded-2xl font-bold">
          حفظ الجرد
        </Button>
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
          <Label>ملاحظات عامة</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختياري" />
        </div>
      </div>

      <section className="glass rounded-3xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">الأصناف ({filled} مُدخل)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-right text-[11px] text-muted-foreground">
                <th className="py-2 font-medium">الصنف</th>
                <th className="font-medium">الوحدة</th>
                <th className="w-32 font-medium">الكمية الموجودة</th>
                <th className="font-medium">ملاحظات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 font-medium">{item.name}</td>
                  <td className="text-muted-foreground">{item.units?.name}</td>
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
        </div>
        <Textarea className="mt-4 hidden" value="" readOnly />
      </section>
    </AppShell>
  );
}
