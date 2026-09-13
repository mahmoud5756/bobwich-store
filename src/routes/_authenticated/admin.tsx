import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useAuth, useRoleFlags } from "@/lib/auth";
import { roleLabels, type AppRole } from "@/lib/domain";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "إدارة المستخدمين والصلاحيات · مخازن بوب ويتش" },
      { name: "description", content: "إدارة المستخدمين وأدوارهم وربطهم بالفروع والتحكم في صلاحيات النظام." },
      { property: "og:title", content: "إدارة النظام · مخازن بوب ويتش" },
      { property: "og:description", content: "تحديد أدوار المستخدمين وفروعهم وإدارة الفروع والأصناف." },
    ],
  }),
  component: AdminPage,
});

const roles: AppRole[] = ["branch_manager", "cost_manager", "warehouse_worker", "admin"];

function AdminPage() {
  const flags = useRoleFlags();
  const { refresh } = useAuth();
  const qc = useQueryClient();

  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*, branches(name)").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: userRoles = [] } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  async function toggleRole(userId: string, role: AppRole, has: boolean) {
    const { error } = has
      ? await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role)
      : await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) {
      toast.error("تعذّر تعديل الدور");
      return;
    }
    toast.success("تم تحديث الأدوار");
    void qc.invalidateQueries({ queryKey: ["admin-roles"] });
    await refresh();
  }

  async function setApproved(userId: string, approved: boolean) {
    const { error } = await supabase.from("profiles").update({ approved }).eq("id", userId);
    if (error) {
      toast.error("تعذّر تحديث حالة الحساب");
      return;
    }
    toast.success(approved ? "تمت الموافقة على الحساب" : "تم إيقاف الحساب");
    void qc.invalidateQueries({ queryKey: ["admin-profiles"] });
  }

  async function setBranch(userId: string, branchId: string) {
    const { error } = await supabase
      .from("profiles")
      .update({ branch_id: branchId || null })
      .eq("id", userId);
    if (error) {
      toast.error("تعذّر تحديث الفرع");
      return;
    }
    toast.success("تم تحديث الفرع");
    void qc.invalidateQueries({ queryKey: ["admin-profiles"] });
    await refresh();
  }

  async function claimAdmin() {
    const { data, error } = await supabase.rpc("claim_first_admin");
    if (error || !data) {
      toast.error("يوجد مدير نظام بالفعل");
      return;
    }
    toast.success("أصبحت مدير النظام");
    await refresh();
    void qc.invalidateQueries({ queryKey: ["admin-roles"] });
  }

  if (!flags.isAdmin) {
    return (
      <AppShell title="إدارة النظام">
        <div className="glass space-y-4 rounded-3xl p-6">
          <p>هذه الشاشة متاحة لمدير النظام فقط.</p>
          <p className="text-sm text-muted-foreground">
            إذا كنت أول مستخدم في النظام ولم يتم تعيين مدير بعد، يمكنك المطالبة بصلاحية مدير النظام.
          </p>
          <Button className="gradient-hot rounded-2xl font-bold" onClick={() => void claimAdmin()}>
            المطالبة بصلاحية مدير النظام
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="إدارة المستخدمين والصلاحيات"
      subtitle={`${profiles.length} مستخدم · ${profiles.filter((p) => !p.approved).length} بانتظار الموافقة`}
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline" className="rounded-2xl">
            <Link to="/branches">الفروع</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl">
            <Link to="/items">الأصناف والوحدات</Link>
          </Button>
        </div>
      }
    >
      <div className="glass overflow-x-auto rounded-3xl p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-right text-[11px] text-muted-foreground">
              <th className="py-2 font-medium">المستخدم</th>
              <th className="font-medium">البريد</th>
              <th className="font-medium">حالة الحساب</th>
              <th className="font-medium">الفرع</th>
              <th className="font-medium">الأدوار</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {profiles.map((p) => (
              <tr key={p.id}>
                <td className="py-3 font-medium">{p.full_name || "—"}</td>
                <td className="text-xs text-muted-foreground" dir="ltr">
                  {p.email}
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => void setApproved(p.id, !p.approved)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      p.approved ? "bg-mint text-mint-strong" : "bg-amber text-amber-strong"
                    }`}
                  >
                    {p.approved ? "معتمد · إيقاف" : "بانتظار الموافقة · اعتماد"}
                  </button>
                </td>
                <td>
                  <select
                    className="h-9 rounded-xl border border-input bg-card px-2 text-sm"
                    value={p.branch_id ?? ""}
                    onChange={(e) => void setBranch(p.id, e.target.value)}
                  >
                    <option value="">بدون فرع</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <div className="flex flex-wrap gap-1.5 py-2">
                    {roles.map((role) => {
                      const has = userRoles.some((r) => r.user_id === p.id && r.role === role);
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => void toggleRole(p.id, role, has)}
                          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                            has ? "gradient-brand text-primary-foreground" : "bg-card/70 text-muted-foreground"
                          }`}
                        >
                          {roleLabels[role]}
                        </button>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
