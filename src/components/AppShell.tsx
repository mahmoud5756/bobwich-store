import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Menu, LogOut } from "lucide-react";
import { useAuth, useRoleFlags } from "@/lib/auth";
import { roleLabels } from "@/lib/domain";
import { Button } from "@/components/ui/button";

type NavItem = { to: string; label: string; dot: string; show: boolean };

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { profile, roles, loading, signOut } = useAuth();
  const flags = useRoleFlags();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    // من غير الرجوع دي هيفضل واقف على نفس الصفحة المحمية بحساب null،
    // يعني هيشوف شاشة "جارِ التحميل" للأبد بدل ما يرجع لتسجيل الدخول
    void navigate({ to: "/" });
  }

  const nav: NavItem[] = [
    { to: "/dashboard", label: "لوحة التحكم", dot: "bg-brand", show: true },
    { to: "/inventory", label: "الجرد الصباحي والمسائي", dot: "bg-amber", show: flags.isBranchManager },
    { to: "/orders/new", label: "إنشاء طلبية", dot: "bg-sky", show: flags.isBranchManager },
    { to: "/orders", label: "قائمة الطلبات", dot: "bg-coral", show: true },
    { to: "/warehouse", label: "تجهيز المخزن", dot: "bg-mint", show: flags.isWarehouse },
    { to: "/reports", label: "التقارير", dot: "bg-pink", show: true },
    { to: "/reports/daily", label: "التقرير اليومي للطباعة", dot: "bg-mint", show: true },
    { to: "/branches", label: "الفروع", dot: "bg-sky", show: flags.isAdmin },
    { to: "/items", label: "الأصناف والوحدات", dot: "bg-amber", show: flags.isAdmin },
    { to: "/admin", label: "إدارة المستخدمين", dot: "bg-muted-foreground", show: flags.isAdmin },
  ].filter((n) => n.show);

  const sidebar = (
    <div className="flex h-full flex-col gap-1 p-4">
      <div className="mb-2 flex items-center gap-3 px-3 py-4">
        <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-2xl shadow-lg">
          <img src="/bob.png" alt="مخازن بوب ويتش" className="size-full object-cover" />
        </div>
        <div>
          <div className="font-display font-extrabold leading-tight text-foreground">مخازن بوب ويتش</div>
          <div className="text-[11px] text-muted-foreground">نظام المخزن والطلبات</div>
        </div>
      </div>
      <nav className="flex flex-col gap-1 overflow-y-auto">
        {nav.map((item) => {
          const deepest = nav
            .filter((n) => pathname === n.to || pathname.startsWith(`${n.to}/`))
            .sort((a, b) => b.to.length - a.to.length)[0];
          const active = deepest?.to === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={
                active
                  ? "gradient-brand flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm"
                  : "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition hover:bg-card/60"
              }
            >
              {!active && <span className={`size-2 rounded-full ${item.dot}`} />}
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="glass mt-auto rounded-2xl p-4">
        <div className="text-sm font-semibold text-foreground">{profile?.full_name || "مستخدم"}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {roles.length ? roles.map((r) => roleLabels[r]).join(" · ") : "بدون دور بعد"}
        </div>
        <Button variant="ghost" size="sm" className="mt-2 w-full justify-start gap-2" onClick={() => void handleSignOut()}>
          <LogOut className="size-4" />
          تسجيل الخروج
        </Button>
      </div>
    </div>
  );

  // لسه بنجيب بيانات الحساب (profile/roles) من السيرفر: منورّيش الواجهة ولا أي بيانات
  // لحد ما نتأكد فعلاً من حالة الاعتماد، عشان مستخدم غير معتمد مايشوفش الشاشة حتى للحظة.
  if (loading || !profile) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="animate-in fade-in zoom-in-95 flex flex-col items-center gap-5 duration-500">
          <div className="relative grid size-20 place-items-center">
            <div className="border-t-brand absolute inset-0 animate-spin rounded-full border-4 border-border" />
            <div className="grid size-14 place-items-center overflow-hidden rounded-2xl shadow-lg">
              <img src="/bob.png" alt="مخازن بوب ويتش" className="size-full animate-pulse object-cover" />
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <span>جارِ التحميل</span>
            <span className="flex gap-0.5">
              <span className="bg-brand size-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" />
              <span className="bg-brand size-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" />
              <span className="bg-brand size-1.5 animate-bounce rounded-full" />
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (!profile.approved && !flags.isAdmin) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="glass w-full max-w-md space-y-4 rounded-3xl p-8 text-center">
          <div className="mx-auto grid size-14 place-items-center overflow-hidden rounded-2xl">
            <img src="/bob.png" alt="مخازن بوب ويتش" className="size-full object-cover" />
          </div>
          <h1 className="font-display text-2xl font-extrabold">حسابك بانتظار الموافقة</h1>
          <p className="text-sm text-muted-foreground">
            تم إنشاء حسابك بنجاح، ولا يمكن استخدام النظام قبل موافقة مدير النظام على الحساب وتحديد الدور والفرع.
          </p>
          <p className="text-xs text-muted-foreground">{profile.email}</p>
          <Button variant="outline" className="w-full rounded-2xl" onClick={() => void handleSignOut()}>
            تسجيل الخروج
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 overflow-y-auto md:block">{sidebar}</aside>
        {open && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 right-0 flex w-[17rem] max-w-[85vw] flex-col overflow-y-auto bg-background shadow-xl">
              {sidebar}
            </div>
          </div>
        )}
        <main className="min-w-0 flex-1 p-3 sm:p-4 md:p-8">
          <div className="glass mb-5 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-3xl px-4 py-3 sm:px-5 sm:py-4 md:flex md:flex-wrap md:gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 md:hidden"
              aria-label="فتح القائمة"
              onClick={() => setOpen(true)}
            >
              <Menu className="size-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate font-display text-lg font-extrabold text-foreground sm:text-xl md:text-2xl">
                {title}
              </h1>
              {subtitle && <p className="truncate text-xs text-muted-foreground sm:text-sm">{subtitle}</p>}
            </div>
            {actions && (
              <div className="col-span-2 flex flex-wrap items-center gap-2 md:col-auto md:ms-auto">{actions}</div>
            )}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
