interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  accent?: "primary" | "secondary" | "danger" | "neutral";
}

const ACCENT_CLS: Record<NonNullable<KpiCardProps["accent"]>, string> = {
  primary: "border-brand-primary",
  secondary: "border-brand-secondary",
  danger: "border-brand-accent",
  neutral: "border-brand-neutral-300",
};

export function KpiCard({ label, value, hint, accent = "neutral" }: KpiCardProps) {
  return (
    <div className={`bg-white rounded-lg p-4 border-l-4 shadow-sm ${ACCENT_CLS[accent]}`}>
      <div className="text-xs uppercase tracking-wide text-brand-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-brand-secondary">{value}</div>
      {hint && <div className="mt-1 text-xs text-brand-neutral-600">{hint}</div>}
    </div>
  );
}
