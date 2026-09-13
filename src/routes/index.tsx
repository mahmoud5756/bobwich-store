import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول · مخازن بوب ويتش لإدارة المخزن والطلبات" },
      {
        name: "description",
        content:
          "سجّل الدخول لإدارة الجرد الصباحي والمسائي وطلبات الفروع ومتابعة التجهيز والاستلام.",
      },
      { property: "og:title", content: "تسجيل الدخول · مخازن بوب ويتش" },
      {
        property: "og:description",
        content:
          "نظام عربي متكامل لإدارة المخزن وطلبات الفروع من الجرد حتى الاستلام.",
      },
    ],
  }),
  component: SignInPage,
});

function SignInPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      void navigate({ to: "/dashboard", replace: true });
    }
  }, [loading, session, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        toast.success("تم تسجيل الدخول");
      } else {
        const redirectTo =
          window.location.hostname === "localhost"
            ? window.location.origin
            : "https://bobwich-store.workers.dev";

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: {
              full_name: fullName,
            },
          },
        });

        if (error) throw error;

        toast.success("تم إنشاء الحساب");
      }

      void navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "تعذّر إتمام العملية"
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    const redirectTo =
      window.location.hostname === "localhost"
        ? window.location.origin
        : "https://bobwich-store.workers.dev";

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (error) {
      toast.error("تعذّر تسجيل الدخول عبر جوجل");
    }

    // عند النجاح Supabase بيحوّل المستخدم لصفحة جوجل مباشرة (redirect)،
    // فمفيش داعي لأي navigate هنا.
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="glass w-full max-w-md rounded-3xl p-7">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl shadow-lg">
            <img
              src="/bob.png"
              alt="مخازن بوب ويتش"
              className="size-full object-cover"
            />
          </div>

          <div>
            <h1 className="font-display text-2xl font-extrabold text-foreground">
              مخازن بوب ويتش
            </h1>
            <p className="text-xs text-muted-foreground">
              نظام إدارة المخزن وطلبات الفروع
            </p>
          </div>
        </div>

        <div className="mb-5 flex gap-1 rounded-2xl bg-card/50 p-1">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              mode === "signin"
                ? "gradient-brand text-primary-foreground"
                : "text-muted-foreground"
            }`}
          >
            تسجيل الدخول
          </button>

          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${
              mode === "signup"
                ? "gradient-brand text-primary-foreground"
                : "text-muted-foreground"
            }`}
          >
            حساب جديد
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">الاسم الكامل</Label>
              <Input
                id="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">البريد الإلكتروني</Label>
            <Input
              id="email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">كلمة المرور</Label>
            <Input
              id="password"
              type="password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <Button
            type="submit"
            disabled={busy}
            className="gradient-hot w-full rounded-2xl py-6 font-bold"
          >
            {mode === "signin" ? "دخول" : "إنشاء الحساب"}
          </Button>
        </form>

        <div className="my-4 text-center text-xs text-muted-foreground">
          أو
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full rounded-2xl py-6"
          onClick={() => void handleGoogle()}
        >
          المتابعة باستخدام جوجل
        </Button>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground"></p>
      </div>
    </div>
  );
}