import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { GripVertical, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useRoleFlags } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/items")({
  head: () => ({
    meta: [
      { title: "الأصناف والوحدات · مخازن بوب ويتش" },
      { name: "description", content: "إدارة أصناف المخزن ووحدات القياس المستخدمة في الجرد والطلبات." },
      { property: "og:title", content: "الأصناف والوحدات · مخازن بوب ويتش" },
      { property: "og:description", content: "أضف الأصناف وحدد وحدة القياس لكل صنف." },
    ],
  }),
  component: ItemsPage,
});

function ItemsPage() {
  const flags = useRoleFlags();
  const qc = useQueryClient();
  const [itemName, setItemName] = useState("");
  const [unitId, setUnitId] = useState("");
  const [unitName, setUnitName] = useState("");
  const [search, setSearch] = useState("");

  const { data: units = [] } = useQuery({
    queryKey: ["units"],
    queryFn: async () => {
      const { data, error } = await supabase.from("units").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["items-full"],
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("*, units(name)").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  async function addUnit() {
    if (!unitName) return;
    const { error } = await supabase.from("units").insert({ name: unitName });
    if (error) {
      toast.error("تعذّر إضافة الوحدة");
      return;
    }
    setUnitName("");
    toast.success("تمت إضافة الوحدة");
    void qc.invalidateQueries({ queryKey: ["units"] });
  }

  async function addItem() {
    if (!itemName || !unitId) {
      toast.error("أدخل اسم الصنف واختر الوحدة");
      return;
    }
    const { error } = await supabase.from("items").insert({ name: itemName, unit_id: unitId });
    if (error) {
      toast.error("تعذّر إضافة الصنف");
      return;
    }
    setItemName("");
    toast.success("تمت إضافة الصنف");
    void qc.invalidateQueries({ queryKey: ["items-full"] });
    void qc.invalidateQueries({ queryKey: ["items"] });
  }

  async function toggle(id: string, isActive: boolean) {
    const { error } = await supabase.from("items").update({ is_active: !isActive }).eq("id", id);
    if (error) {
      toast.error("تعذّر التعديل");
      return;
    }
    void qc.invalidateQueries({ queryKey: ["items-full"] });
  }

  async function reorder(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const reordered = [...items];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    // نعيد توزيع نفس أرقام sort_order الموجودة على الترتيب الجديد، فمفيش تعارض أرقام
    const sortedValues = items.map((i) => i.sort_order).sort((a, b) => a - b);
    const changes = reordered
      .map((item, idx) => ({ id: item.id, sort_order: sortedValues[idx] }))
      .filter((c) => items.find((i) => i.id === c.id)?.sort_order !== c.sort_order);

    // تحديث فوري في الواجهة قبل ما ننتظر الشبكة
    qc.setQueryData(
      ["items-full"],
      reordered.map((item) => ({
        ...item,
        sort_order: changes.find((c) => c.id === item.id)?.sort_order ?? item.sort_order,
      })),
    );

    const results = await Promise.all(
      changes.map((c) => supabase.from("items").update({ sort_order: c.sort_order }).eq("id", c.id)),
    );
    if (results.some((r) => r.error)) {
      toast.error("تعذّر حفظ الترتيب");
    }
    void qc.invalidateQueries({ queryKey: ["items-full"] });
    void qc.invalidateQueries({ queryKey: ["items"] });
  }

  function onOrderCommit(index: number, raw: string) {
    const n = Number(raw);
    if (!raw || Number.isNaN(n)) return;
    const target = Math.min(Math.max(Math.round(n) - 1, 0), items.length - 1);
    void reorder(index, target);
  }

  const filteredItems = useMemo(() => {
    const q = search.trim();
    if (!q) return items;
    return items.filter((i) => i.name.includes(q));
  }, [items, search]);

  const dragFrom = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  return (
    <AppShell title="الأصناف والوحدات" subtitle={`${items.length} صنف · ${units.length} وحدة`}>
      {flags.isAdmin && (
        <div className="mb-5 grid gap-5 lg:grid-cols-3">
          <div className="glass rounded-3xl p-5 lg:col-span-2">
            <h2 className="mb-4 font-display text-lg font-bold">إضافة صنف</h2>
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1.5">
                <Label>اسم الصنف</Label>
                <Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="مثال: دقيق فاخر" />
              </div>
              <div className="space-y-1.5">
                <Label>الوحدة</Label>
                <select
                  className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm"
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                >
                  <option value="">اختر الوحدة</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button className="gradient-hot rounded-2xl font-bold" onClick={() => void addItem()}>
                إضافة
              </Button>
            </div>
          </div>

          <div className="glass rounded-3xl p-5">
            <h2 className="mb-4 font-display text-lg font-bold">إضافة وحدة</h2>
            <div className="space-y-1.5">
              <Label>اسم الوحدة</Label>
              <Input value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="كجم / كرتون / حبة" />
            </div>
            <Button variant="outline" className="mt-3 w-full rounded-2xl" onClick={() => void addUnit()}>
              إضافة الوحدة
            </Button>
          </div>
        </div>
      )}

      <div className="glass overflow-x-auto rounded-3xl p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن صنف..."
              className="pr-9"
            />
          </div>
          {flags.isAdmin && (
            <p className="text-xs text-muted-foreground">
              رتّب الأصناف بالسحب من أيقونة ⠿، أو اكتب رقم الترتيب في الخانة واضغط Enter.
            </p>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-right text-[11px] text-muted-foreground">
              {flags.isAdmin && <th className="py-2 font-medium">الترتيب</th>}
              <th className="py-2 font-medium">الصنف</th>
              <th className="font-medium">الوحدة</th>
              <th className="font-medium">الحالة</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredItems.map((i) => {
              const index = items.findIndex((x) => x.id === i.id);
              return (
                <tr
                  key={i.id}
                  draggable={flags.isAdmin}
                  onDragStart={() => {
                    dragFrom.current = index;
                  }}
                  onDragOver={(e) => {
                    if (!flags.isAdmin) return;
                    e.preventDefault();
                    if (dragOverIndex !== index) setDragOverIndex(index);
                  }}
                  onDragEnd={() => {
                    dragFrom.current = null;
                    setDragOverIndex(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = dragFrom.current;
                    dragFrom.current = null;
                    setDragOverIndex(null);
                    if (from === null) return;
                    void reorder(from, index);
                  }}
                  className={dragOverIndex === index ? "bg-brand/10" : undefined}
                >
                  {flags.isAdmin && (
                    <td className="py-2">
                      <div className="flex items-center gap-1.5">
                        <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
                        <Input
                          key={`${i.id}-${index}`}
                          type="number"
                          min={1}
                          max={items.length}
                          defaultValue={index + 1}
                          className="h-9 w-16 text-center"
                          onBlur={(e) => onOrderCommit(index, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                        />
                      </div>
                    </td>
                  )}
                  <td className="py-3 font-medium">{i.name}</td>
                  <td className="text-muted-foreground">{i.units?.name}</td>
                  <td>{i.is_active ? "نشط" : "موقوف"}</td>
                  <td className="text-left">
                    {flags.isAdmin && (
                      <Button variant="ghost" size="sm" onClick={() => void toggle(i.id, i.is_active)}>
                        {i.is_active ? "إيقاف" : "تفعيل"}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={flags.isAdmin ? 5 : 4} className="py-8 text-center text-muted-foreground">
                  {items.length === 0 ? "لا توجد أصناف بعد" : "لا يوجد صنف مطابق للبحث"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
