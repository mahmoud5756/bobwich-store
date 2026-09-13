import { statusLabels, statusTone, type OrderStatus } from "@/lib/domain";

const toneClasses: Record<string, string> = {
  slate: "bg-muted text-muted-foreground",
  amber: "bg-amber/20 text-amber-strong",
  sky: "bg-sky/20 text-sky-strong",
  coral: "bg-coral/20 text-coral-strong",
  mint: "bg-mint/20 text-mint-strong",
};

const dotClasses: Record<string, string> = {
  slate: "bg-muted-foreground",
  amber: "bg-amber",
  sky: "bg-sky",
  coral: "bg-coral",
  mint: "bg-mint",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const tone = statusTone[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${toneClasses[tone]}`}
    >
      <span className={`size-1.5 rounded-full ${dotClasses[tone]}`} />
      {statusLabels[status]}
    </span>
  );
}
