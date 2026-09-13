import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type DayPeriod = Database["public"]["Enums"]["day_period"];

export const roleLabels: Record<AppRole, string> = {
  branch_manager: "مدير فرع",
  cost_manager: "مدير التكاليف",
  warehouse_worker: "عامل مخزن",
  admin: "مدير النظام",
};

export const periodLabels: Record<DayPeriod, string> = {
  morning: "صباحي",
  evening: "مسائي",
};

export const statusLabels: Record<OrderStatus, string> = {
  draft: "مسودة",
  submitted: "مرسلة إلى مدير التكاليف",
  returned: "معادة للتعديل",
  rejected: "مرفوضة",
  approved: "معتمدة",
  preparing: "قيد التجهيز",
  prepared: "تم تجهيزها",
  dispatched: "خرجت من المخزن",
  received: "تم الاستلام",
  received_with_diff: "تم الاستلام مع فروقات",
};

/** tone -> semantic status token used by StatusBadge */
export const statusTone: Record<OrderStatus, string> = {
  draft: "slate",
  submitted: "amber",
  returned: "amber",
  rejected: "coral",
  approved: "sky",
  preparing: "coral",
  prepared: "coral",
  dispatched: "sky",
  received: "mint",
  received_with_diff: "coral",
};

export const allStatuses = Object.keys(statusLabels) as OrderStatus[];

export const eventLabels: Record<string, string> = {
  created: "إنشاء الطلبية",
  submitted: "إرسال إلى مدير التكاليف",
  returned: "إعادة للتعديل",
  rejected: "رفض الطلبية",
  approved: "اعتماد الطلبية",
  edited: "تعديل الأصناف",
  preparing: "بدء التجهيز",
  prepared: "انتهاء التجهيز",
  dispatched: "خروج من المخزن",
  received: "تسجيل الاستلام",
  correction: "إجراء تصحيح",
};

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
