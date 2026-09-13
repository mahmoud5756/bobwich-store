import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth, useRoleFlags } from "@/lib/auth";
import { formatDateTime, periodLabels, type OrderStatus } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/orders/$id")({
  head: () => ({
    meta: [
      { title: "تفاصيل الطلبية · مخازن بوب ويتش" },
      { name: "description", content: "تفاصيل الطلبية والأصناف والكميات وخط زمني كامل لكل إجراء ومن قام به." },
      { property: "og:title", content: "تفاصيل الطلبية · مخازن بوب ويتش" },
      { property: "og:description", content: "مراجعة واعتماد وتجهيز واستلام الطلبية مع سجل تدقيق كامل." },
    ],
  }),
  component: OrderDetailPage,
});

type Confirm = { title: string; description: string; run: () => Promise<void> } | null;

function OrderDetailPage() {
  const { id } = Route.useParams();
  const { user, profile } = useAuth();
  const flags = useRoleFlags();
  const qc = useQueryClient();

  const [approved, setApproved] = useState<Record<string, string>>({});
  const [prepared, setPrepared] = useState<Record<string, string>>({});
  const [received, setReceived] = useState<Record<string, string>>({});
  const [prepNotes, setPrepNotes] = useState<Record<string, string>>({});
  const [recvNotes, setRecvNotes] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);

  const {
    data: order,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["order", id],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "*, branches(name), order_items(id, item_id, requested_qty, approved_qty, prepared_qty, received_qty, notes, prepare_notes, receive_notes, items(name, units(name)))",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["order-events", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_events")
        .select("id, action, note, created_at, actor_id")
        .eq("order_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: people = [] } = useQuery({
    queryKey: ["people"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw error;
      return data;
    },
  });

  const { data: count } = useQuery({
    queryKey: ["order-count", order?.branch_id, order?.order_date, order?.period],
    enabled: !!order,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_counts")
        .select("ref_no, inventory_count_items(item_id, qty)")
        .eq("branch_id", order!.branch_id)
        .eq("count_date", order!.order_date)
        .eq("period", order!.period)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const a: Record<string, string> = {};
    const p: Record<string, string> = {};
    const r: Record<string, string> = {};
    const pn: Record<string, string> = {};
    const rn: Record<string, string> = {};
    for (const line of order?.order_items ?? []) {
      a[line.id] = String(line.approved_qty ?? line.requested_qty);
      p[line.id] = String(line.prepared_qty ?? line.approved_qty ?? line.requested_qty);
      r[line.id] = String(line.received_qty ?? line.prepared_qty ?? "");
      if (line.prepare_notes) pn[line.id] = line.prepare_notes;
      if (line.receive_notes) rn[line.id] = line.receive_notes;
    }
    setApproved(a);
    setPrepared(p);
    setReceived(r);
    setPrepNotes(pn);
    setRecvNotes(rn);
  }, [order]);

  const onHand = new Map((count?.inventory_count_items ?? []).map((l) => [l.item_id, Number(l.qty)]));
  const nameOf = (uid?: string | null) =>
    people.find((p) => p.id === uid)?.full_name || people.find((p) => p.id === uid)?.email || "مستخدم";

  async function log(action: string, note?: string) {
    if (!user) return;
    await supabase.from("order_events").insert({ order_id: id, action, note: note ?? null, actor_id: user.id });
  }

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["order", id] }),
      qc.invalidateQueries({ queryKey: ["order-events", id] }),
    ]);
  }

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر تنفيذ الإجراء");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: OrderStatus, patch: Record<string, unknown> = {}) {
    const { error } = await supabase.from("orders").update({ status, ...patch }).eq("id", id);
    if (error) throw error;
  }

  async function saveLines(field: "approved_qty" | "prepared_qty" | "received_qty", source: Record<string, string>) {
    for (const line of order?.order_items ?? []) {
      const value = source[line.id];
      if (value === undefined || value === "") continue;
      const patch: {
        approved_qty?: number;
        prepared_qty?: number;
        received_qty?: number;
        prepare_notes?: string | null;
        receive_notes?: string | null;
      } = { [field]: Number(value) };
      if (field === "prepared_qty") patch.prepare_notes = prepNotes[line.id] ?? null;
      if (field === "received_qty") patch.receive_notes = recvNotes[line.id] ?? null;
      const { error } = await supabase.from("order_items").update(patch).eq("id", line.id);
      if (error) throw error;
    }
  }

  if (isError || (!isLoading && !order)) {
    return (
      <AppShell title="تفاصيل الطلبية">
        <div className="glass rounded-3xl p-6 text-muted-foreground">
          هذه الطلبية غير موجودة أو لا تملك صلاحية الاطلاع عليها.
        </div>
      </AppShell>
    );
  }

  if (isLoading || !order) {
    return (
      <AppShell title="تفاصيل الطلبية">
        <div className="glass rounded-3xl p-6 text-muted-foreground">جارٍ التحميل…</div>
      </AppShell>
    );
  }

  const ownBranch = profile?.branch_id === order.branch_id;
  const canReview = (flags.isCostManager || flags.isAdmin) && ["submitted"].includes(order.status);
  const canPrepare =
    (flags.isWarehouse || flags.isAdmin) && ["approved", "preparing", "prepared"].includes(order.status);
  const canDispatch = (flags.isWarehouse || flags.isAdmin) && order.status === "prepared";
  const canReceive = (flags.isBranchManager && ownBranch) || flags.isAdmin;
  const isReceiving = canReceive && order.status === "dispatched";
  const canEditDraft =
    flags.isBranchManager && ownBranch && ["draft", "returned"].includes(order.status);
  const locked = ["dispatched", "received", "received_with_diff"].includes(order.status) && !flags.isAdmin;

  return (
    <AppShell
      title={`الطلبية #${order.order_no}`}
      subtitle={`${order.branches?.name ?? ""} · ${order.order_date} · الفترة ${periodLabels[order.period]}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={order.status} />
          <Button asChild variant="outline" className="rounded-2xl">
            <Link to="/orders">رجوع للقائمة</Link>
          </Button>
        </div>
      }
    >
      {order.reject_reason && (
        <div className="glass mb-5 rounded-3xl border-r-4 border-coral-strong p-4 text-sm">
          <span className="font-bold text-coral-strong">سبب الرفض / الإعادة: </span>
          {order.reject_reason}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="glass overflow-x-auto rounded-3xl p-5">
            <h2 className="mb-4 font-display text-lg font-bold">
              الأصناف {count ? <span className="text-xs font-normal text-muted-foreground">(مقارنة بالجرد #{count.ref_no})</span> : null}
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-right text-[11px] text-muted-foreground">
                  <th className="py-2 font-medium">الصنف</th>
                  <th className="font-medium">الوحدة</th>
                  <th className="font-medium">بالجرد</th>
                  <th className="font-medium">مطلوب</th>
                  <th className="font-medium">معتمد</th>
                  <th className="font-medium">مجهّز</th>
                  <th className="font-medium">مستلم</th>
                  <th className="font-medium">الفرق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {order.order_items.map((line) => {
                  const diff =
                    line.received_qty != null
                      ? Number(line.received_qty) - Number(line.approved_qty ?? line.requested_qty)
                      : null;
                  return (
                    <tr key={line.id}>
                      <td className="py-2 font-medium">{line.items?.name}</td>
                      <td className="text-muted-foreground">{line.items?.units?.name}</td>
                      <td className="text-muted-foreground">{onHand.get(line.item_id) ?? "—"}</td>
                      <td className="font-semibold">{Number(line.requested_qty)}</td>
                      <td>
                        {canReview ? (
                          <Input
                            className="h-9 w-24"
                            inputMode="decimal"
                            value={approved[line.id] ?? ""}
                            onChange={(e) => setApproved({ ...approved, [line.id]: e.target.value })}
                          />
                        ) : (
                          (line.approved_qty ?? "—")
                        )}
                      </td>
                      <td>
                        {canPrepare ? (
                          <Input
                            className="h-9 w-24"
                            inputMode="decimal"
                            value={prepared[line.id] ?? ""}
                            onChange={(e) => setPrepared({ ...prepared, [line.id]: e.target.value })}
                          />
                        ) : (
                          (line.prepared_qty ?? "—")
                        )}
                      </td>
                      <td>
                        {isReceiving ? (
                          <Input
                            className="h-9 w-24"
                            inputMode="decimal"
                            value={received[line.id] ?? ""}
                            onChange={(e) => setReceived({ ...received, [line.id]: e.target.value })}
                          />
                        ) : (
                          (line.received_qty ?? "—")
                        )}
                      </td>
                      <td
                        className={
                          diff == null ? "text-muted-foreground" : diff < 0 ? "text-coral-strong" : diff > 0 ? "text-amber-strong" : "text-mint-strong"
                        }
                      >
                        {diff == null ? "—" : diff > 0 ? `+${diff}` : diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {(canPrepare || isReceiving) && (
              <div className="mt-5 space-y-2">
                <h3 className="text-sm font-bold">
                  ملاحظات {canPrepare ? "التجهيز والنواقص" : "الاستلام والفروقات"}
                </h3>
                {order.order_items.map((line) => (
                  <div key={line.id} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 text-xs text-muted-foreground">{line.items?.name}</span>
                    <Input
                      className="h-9"
                      placeholder="عجز / تلف / غير متوفر…"
                      value={(canPrepare ? prepNotes[line.id] : recvNotes[line.id]) ?? ""}
                      onChange={(e) =>
                        canPrepare
                          ? setPrepNotes({ ...prepNotes, [line.id]: e.target.value })
                          : setRecvNotes({ ...recvNotes, [line.id]: e.target.value })
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="glass rounded-3xl p-5">
            <h2 className="mb-3 font-display text-lg font-bold">الإجراءات المتاحة</h2>
            {locked && (
              <p className="mb-3 text-xs text-muted-foreground">
                الطلبية خرجت من المخزن ولا يمكن تعديلها إلا بإجراء تصحيح من مدير النظام.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {canEditDraft && (
                <Button
                  className="gradient-hot rounded-2xl font-bold"
                  disabled={busy}
                  onClick={() =>
                    setConfirm({
                      title: "إرسال الطلبية؟",
                      description: "سيتم إرسال الطلبية إلى مدير التكاليف للمراجعة.",
                      run: () =>
                        act(async () => {
                          await setStatus("submitted", { submitted_at: new Date().toISOString(), reject_reason: null });
                          await log("إرسال الطلبية إلى مدير التكاليف");
                          toast.success("تم الإرسال");
                        }),
                    })
                  }
                >
                  إرسال للمراجعة
                </Button>
              )}

              {canReview && (
                <>
                  <Button
                    className="gradient-hot rounded-2xl font-bold"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        title: "اعتماد الطلبية؟",
                        description: "بعد الاعتماد ستظهر الطلبية لعمال المخزن للتجهيز.",
                        run: () =>
                          act(async () => {
                            await saveLines("approved_qty", approved);
                            await setStatus("approved", {
                              approved_by: user?.id,
                              approved_at: new Date().toISOString(),
                              reject_reason: null,
                            });
                            await log("اعتماد الطلبية");
                            toast.success("تم اعتماد الطلبية");
                          }),
                      })
                    }
                  >
                    اعتماد
                  </Button>
                  <Input
                    className="h-10 w-56"
                    placeholder="سبب الإعادة أو الرفض"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await saveLines("approved_qty", approved);
                        await setStatus("returned", { reject_reason: reason || "بحاجة إلى تعديل" });
                        await log("إعادة الطلبية للتعديل", reason);
                        toast.success("تمت إعادة الطلبية للفرع");
                      })
                    }
                  >
                    إعادة للتعديل
                  </Button>
                  <Button
                    variant="destructive"
                    className="rounded-2xl"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        title: "رفض الطلبية؟",
                        description: "سيتم رفض الطلبية نهائياً مع تسجيل السبب.",
                        run: () =>
                          act(async () => {
                            await setStatus("rejected", { reject_reason: reason || "مرفوضة" });
                            await log("رفض الطلبية", reason);
                            toast.success("تم رفض الطلبية");
                          }),
                      })
                    }
                  >
                    رفض
                  </Button>
                </>
              )}

              {canPrepare && (
                <>
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        await saveLines("prepared_qty", prepared);
                        if (order.status === "approved") await setStatus("preparing");
                        await log("حفظ كميات التجهيز");
                        toast.success("تم حفظ التجهيز");
                      })
                    }
                  >
                    حفظ التجهيز
                  </Button>
                  <Button
                    className="gradient-hot rounded-2xl font-bold"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        title: "تأكيد انتهاء التجهيز؟",
                        description: "سيتم تسجيل الطلبية كجاهزة في المخزن.",
                        run: () =>
                          act(async () => {
                            await saveLines("prepared_qty", prepared);
                            await setStatus("prepared", {
                              prepared_by: user?.id,
                              prepared_at: new Date().toISOString(),
                            });
                            await log("انتهاء التجهيز");
                            toast.success("الطلبية جاهزة");
                          }),
                      })
                    }
                  >
                    تم التجهيز
                  </Button>
                </>
              )}

              {canDispatch && (
                <Button
                  className="gradient-hot rounded-2xl font-bold"
                  disabled={busy}
                  onClick={() =>
                    setConfirm({
                      title: "تأكيد خروج الطلبية؟",
                      description: "لن يمكن تعديل الطلبية بعد خروجها من المخزن.",
                      run: () =>
                        act(async () => {
                          await setStatus("dispatched", { dispatched_at: new Date().toISOString() });
                          await log("خروج الطلبية من المخزن");
                          toast.success("تم تسجيل الخروج");
                        }),
                    })
                  }
                >
                  خروج من المخزن
                </Button>
              )}

              {isReceiving && (
                <Button
                  className="gradient-hot rounded-2xl font-bold"
                  disabled={busy}
                  onClick={() =>
                    setConfirm({
                      title: "تأكيد الاستلام؟",
                      description: "سيتم احتساب الفروقات تلقائياً بين الكمية المعتمدة والمستلمة.",
                      run: () =>
                        act(async () => {
                          await saveLines("received_qty", received);
                          const hasDiff = order.order_items.some((line) => {
                            const value = received[line.id];
                            if (value === undefined || value === "") return true;
                            return Number(value) !== Number(line.approved_qty ?? line.requested_qty);
                          });
                          await setStatus(hasDiff ? "received_with_diff" : "received", {
                            received_by: user?.id,
                            received_at: new Date().toISOString(),
                          });
                          await log(hasDiff ? "تسجيل الاستلام مع فروقات" : "تسجيل الاستلام الكامل");
                          toast.success("تم تسجيل الاستلام");
                        }),
                    })
                  }
                >
                  تسجيل الاستلام
                </Button>
              )}
            </div>
          </section>
        </div>

        <section className="glass rounded-3xl p-5">
          <h2 className="mb-4 font-display text-lg font-bold">الخط الزمني وسجل التدقيق</h2>
          <ol className="relative space-y-4 border-e border-border pe-4">
            {events.map((e) => (
              <li key={e.id} className="relative">
                <span className="gradient-brand absolute -end-[21px] top-1.5 size-3 rounded-full" />
                <div className="text-sm font-semibold">{e.action}</div>
                {e.note && <div className="text-xs text-muted-foreground">{e.note}</div>}
                <div className="text-[11px] text-muted-foreground">
                  {nameOf(e.actor_id)} · {formatDateTime(e.created_at)}
                </div>
              </li>
            ))}
            {events.length === 0 && <li className="text-sm text-muted-foreground">لا توجد إجراءات بعد</li>}
          </ol>

          <div className="mt-6 space-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
            <div>أنشأها: {nameOf(order.created_by)} · {formatDateTime(order.created_at)}</div>
            <div>الاعتماد: {order.approved_at ? `${nameOf(order.approved_by)} · ${formatDateTime(order.approved_at)}` : "—"}</div>
            <div>التجهيز: {order.prepared_at ? `${nameOf(order.prepared_by)} · ${formatDateTime(order.prepared_at)}` : "—"}</div>
            <div>الخروج: {formatDateTime(order.dispatched_at)}</div>
            <div>الاستلام: {order.received_at ? `${nameOf(order.received_by)} · ${formatDateTime(order.received_at)}` : "—"}</div>
            {order.notes && <div>ملاحظات الطلبية: {order.notes}</div>}
          </div>
        </section>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const run = confirm?.run;
                setConfirm(null);
                void run?.();
              }}
            >
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
