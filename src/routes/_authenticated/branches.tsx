import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useRoleFlags } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/branches")({
  head: () => ({
    meta: [
      { title: "الفروع · مخازن بوب ويتش" },
      { name: "description", content: "إدارة فروع الشركة وأكوادها وحالة تفعيلها." },
      { property: "og:title", content: "الفروع · مخازن بوب ويتش" },
      { property: "og:description", content: "أضف وعدّل فروع الشركة المرتبطة بالجرد والطلبات." },
    ],
  }),
  component: BranchesPage,
});

function BranchesPage() {
  const flags = useRoleFlags();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const { data: branches = [] } = useQuery({
    queryKey: ["branches-full"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  async function add() {
    if (!name || !code) {
      toast.error("أدخل اسم الفرع والكود");
      return;
    }
    const { error } = await supabase.from("branches").insert({ name, code });
    if (error) {
      toast.error("تعذّر إضافة الفرع (قد يكون الكود مكرراً)");
      return;
    }
    setName("");
    setCode("");
    toast.success("تمت إضافة الفرع");
    void qc.invalidateQueries({ queryKey: ["branches-full"] });
    void qc.invalidateQueries({ queryKey: ["branches"] });
  }

  async function toggle(id: string, isActive: boolean) {
    const { error } = await supabase.from("branches").update({ is_active: !isActive }).eq("id", id);
    if (error) {
      toast.error("تعذّر التعديل");
      return;
    }
    void qc.invalidateQueries({ queryKey: ["branches-full"] });
  }

  return (
    <AppShell title="الفروع" subtitle={`${branches.length} فرع`}>
      {flags.isAdmin && (
        <div className="glass mb-5 grid gap-4 rounded-3xl p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label>اسم الفرع</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: فرع الملز" />
          </div>
          <div className="space-y-1.5">
            <Label>كود الفرع</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="BR-01" dir="ltr" />
          </div>
          <Button className="gradient-hot rounded-2xl font-bold" onClick={() => void add()}>
            إضافة فرع
          </Button>
        </div>
      )}

      <div className="glass overflow-x-auto rounded-3xl p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-right text-[11px] text-muted-foreground">
              <th className="py-2 font-medium">الفرع</th>
              <th className="font-medium">الكود</th>
              <th className="font-medium">الحالة</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {branches.map((b) => (
              <tr key={b.id}>
                <td className="py-3 font-medium">{b.name}</td>
                <td className="text-muted-foreground" dir="ltr">
                  {b.code}
                </td>
                <td>{b.is_active ? "نشط" : "موقوف"}</td>
                <td className="text-left">
                  {flags.isAdmin && (
                    <Button variant="ghost" size="sm" onClick={() => void toggle(b.id, b.is_active)}>
                      {b.is_active ? "إيقاف" : "تفعيل"}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {branches.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-muted-foreground">
                  لا توجد فروع بعد
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
