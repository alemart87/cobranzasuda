import Link from "next/link";

interface ComingSoonProps {
  module: string;
  description: string;
  badges: string[];
  color: string;
  bgGradient: string;
}

export function ComingSoon({ module, description, badges, color, bgGradient }: ComingSoonProps) {
  return (
    <div className="mb-2 text-xs text-brand-slate">
      <Link href="/operativas" className="hover:text-brand-primary">Operativas</Link>
      <span className="mx-2">/</span>
      <span className="text-brand-ink font-semibold">{module}</span>

      <div className="mt-6 card overflow-hidden">
        <div className="h-2" style={{ background: bgGradient }} />
        <div className="p-12 text-center">
          <div
            className="w-20 h-20 rounded-full mx-auto flex items-center justify-center text-white font-display text-4xl uppercase shadow-elevated mb-6"
            style={{ background: bgGradient }}
          >
            {module.charAt(0)}
          </div>
          <h1 className="font-display text-4xl text-brand-ink uppercase">{module}</h1>
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-bg text-[11px] uppercase tracking-wider2 font-semibold text-brand-slate">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />
            Próximamente
          </div>
          <p className="text-base text-brand-slate mt-6 max-w-xl mx-auto">{description}</p>

          <div className="flex flex-wrap gap-2 justify-center mt-8">
            {badges.map((b) => (
              <span
                key={b}
                className="text-[11px] uppercase tracking-wider2 font-semibold px-3 py-1.5 rounded border border-brand-border text-brand-slate"
              >
                {b}
              </span>
            ))}
          </div>

          <Link
            href="/operativas"
            className="btn-secondary mt-10 inline-flex"
          >
            ← Volver a Operativas
          </Link>
        </div>
      </div>
    </div>
  );
}
