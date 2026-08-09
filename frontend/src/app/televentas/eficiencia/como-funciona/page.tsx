"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PrintButton, PrintHeader } from "@/components/PrintButton";

function S({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-6 mb-5">
      <h2 className="font-display text-xl text-brand-ink uppercase mb-3">
        <span className="text-brand-primary mr-2">{n}</span>{title}
      </h2>
      <div className="text-sm text-brand-graphite leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

function Caja({ peso, titulo, detalle, color }: { peso: string; titulo: string; detalle: string; color: string }) {
  return (
    <div className="flex-1 min-w-[150px] rounded-md border border-brand-border overflow-hidden">
      <div className="px-3 py-1.5 text-white text-sm font-bold" style={{ background: color }}>{peso}</div>
      <div className="px-3 py-2">
        <div className="text-sm font-semibold text-brand-ink">{titulo}</div>
        <div className="text-[11px] text-brand-slate leading-snug">{detalle}</div>
      </div>
    </div>
  );
}

function Paso({ n, titulo, detalle, color }: { n: string; titulo: string; detalle: string; color: string }) {
  return (
    <div className="flex-1 min-w-[130px] rounded-md border-t-4 bg-white border border-brand-border px-3 py-2.5" style={{ borderTopColor: color }}>
      <div className="text-[10px] font-bold uppercase tracking-wider2" style={{ color }}>{n}</div>
      <div className="text-sm font-semibold text-brand-ink leading-tight">{titulo}</div>
      <div className="text-[11px] text-brand-slate leading-snug mt-0.5">{detalle}</div>
    </div>
  );
}

function Beneficio({ titulo, detalle, color }: { titulo: string; detalle: string; color: string }) {
  return (
    <div className="rounded-md border border-brand-border bg-brand-bg-soft p-3 border-l-4" style={{ borderLeftColor: color }}>
      <div className="text-sm font-bold text-brand-ink">{titulo}</div>
      <p className="text-[12px] text-brand-graphite leading-snug mt-0.5">{detalle}</p>
    </div>
  );
}

function Escala({ rango, estado, decision, color, texto = "#fff" }: { rango: string; estado: string; decision: string; color: string; texto?: string }) {
  return (
    <div className="flex items-stretch gap-2">
      <div className="w-24 shrink-0 rounded-md flex items-center justify-center text-sm font-bold" style={{ background: color, color: texto }}>
        {rango}
      </div>
      <div className="flex-1 rounded-md bg-brand-bg-soft border border-brand-border px-3 py-2">
        <span className="text-sm font-semibold text-brand-ink">{estado}</span>
        <span className="text-xs text-brand-slate"> — {decision}</span>
      </div>
    </div>
  );
}

export default function ComoFuncionaScoringPage() {
  return (
    <AppShell>
      <PrintHeader titulo="Modelo de Eficiencia Predictivo Voicenter" subtitulo="Eficiencia del Negocio · Televentas — explicado para la toma de decisiones" />
      <div className="mb-2 text-xs text-brand-slate no-print">
        <Link href="/televentas" className="hover:text-brand-primary">Televentas</Link>
        <span className="mx-2">/</span>
        <Link href="/televentas/eficiencia" className="hover:text-brand-primary">Eficiencia</Link>
        <span className="mx-2">/</span>
        <span className="text-brand-ink font-semibold">Modelo Predictivo</span>
      </div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Modelo de Eficiencia Predictivo Voicenter</h1>
          <p className="text-sm text-brand-slate mt-1 max-w-2xl">
            El modelo que convierte los datos del mes en decisiones de dotación: qué mide, cómo decide
            y por qué hace más eficiente el negocio.
          </p>
        </div>
        <PrintButton />
      </div>

      <div className="max-w-3xl">
        <S n="1" title="El principio del modelo">
          <p>
            Sudameris paga este servicio <b>por hora</b>. Detrás de cada hora hay una persona con un teléfono —
            y la pregunta correcta no es "¿quién vende más?", sino <b>"¿qué produce cada hora que pagamos?"</b>.
            El Modelo de Eficiencia Predictivo Voicenter responde eso comparando a cada operador <b>con la media real de su propio equipo</b>,
            en el mismo mes, con las mismas bases y el mismo mercado. Nadie se mide contra una vara arbitraria:
            se mide contra lo que sus compañeros demostraron que es posible.
          </p>
        </S>

        <S n="2" title="El esquema: un solo número por persona">
          <p>
            Cada operador recibe un <b>índice de eficiencia</b>. 100 significa "rinde como la media del equipo".
            El índice mezcla tres cosas, con pesos que reflejan lo que le importa al negocio:
          </p>
          <div className="flex flex-wrap gap-2 items-stretch">
            <Caja peso="60%" titulo="Producción por día trabajado" detalle="Prima emitida ÷ días activos. Es lo que la hora pagada produce." color="#E6332A" />
            <Caja peso="25%" titulo="Conversión" detalle="Pólizas por cada 100 contactos. La calidad de la gestión." color="#F39200" />
            <Caja peso="15%" titulo="Ritmo de marcación" detalle="Llamadas por día. El esfuerzo, aunque el día no acompañe." color="#0EA5E9" />
          </div>
          <div className="bg-brand-bg-soft rounded-md p-4 text-[13px]">
            <b>Ejemplo:</b> si la media del equipo produce Gs 2.000.000 por día y un operador produce Gs 1.000.000,
            su componente de producción vale 50. Si además convierte y marca como el promedio, su índice queda
            cerca de <b>70</b> — la zona de "a mejorar". El número no opina: describe.
          </div>
          <p className="text-xs text-brand-slate">
            Detalle que importa: la media se calcula solo con operadores establecidos — los nuevos no la
            distorsionan ni son distorsionados por ella.
          </p>
        </S>

        <S n="3" title="Cómo se toma la decisión">
          <p>Con el índice, la decisión es una escala clara. Para operadores con más de 60 días:</p>
          <div className="space-y-2">
            <Escala rango="100+" estado="Óptimo" decision="sostener y aprender de lo que hace bien." color="#10B981" />
            <Escala rango="70–99" estado="A mejorar" decision="coaching puntual; está cerca de la media." color="#F39200" />
            <Escala rango="45–69" estado="Crítico" decision="plan de recuperación inmediato, con revisión al mes siguiente." color="#E6332A" />
            <Escala rango="< 45" estado="Se recomienda baja" decision="la producción no justifica la hora pagada. También si pasa dos meses seguidos debajo de 60." color="#0F1116" />
          </div>
          <p>Y para los <b>nuevos asesores</b>, una regla de justicia primero: <b>con menos de 15 días nadie se
            clasifica</b> — no hay datos suficientes para juzgar a una persona. Entre 15 y 60 días se los mira
            con su propia curva de aprendizaje:</p>
          <div className="space-y-2">
            <Escala rango="90+" estado="Nuevo sobresaliente" decision="ya rinde casi como el equipo: talento a retener." color="#00B2BF" />
            <Escala rango="55–89" estado="Nuevo en desarrollo" decision="despegando con curva normal: acompañar." color="#0EA5E9" />
            <Escala rango="< 55" estado="Nuevo crítico" decision="muy por debajo aun con la curva a favor: reforzar ya o decidir temprano, antes de que cueste más." color="#F39200" />
          </div>
          <p>
            Cada clasificación se muestra <b>con los números que la sustentan</b> — quien recibe la noticia puede
            ver exactamente por qué. La regla de los dos meses evita bajas por un mes malo aislado; el umbral
            duro evita sostener improductividad con excusas.
          </p>
        </S>

        <S n="4" title="Por qué esto hace más eficiente el negocio">
          <p className="text-xs text-brand-slate uppercase tracking-wider2 font-bold">El ciclo, de punta a punta</p>
          <div className="flex flex-wrap items-stretch gap-1.5">
            <Paso n="1" titulo="Datos del mes" detalle="Llamadas, producción y CRM publicados." color="#0EA5E9" />
            <div className="self-center text-brand-mist font-bold">→</div>
            <Paso n="2" titulo="Análisis online" detalle="Un click: índice y estado por operador, al instante." color="#662483" />
            <div className="self-center text-brand-mist font-bold">→</div>
            <Paso n="3" titulo="Decisión inmediata" detalle="Sostener, coaching, plan de recuperación o baja." color="#E6332A" />
            <div className="self-center text-brand-mist font-bold">→</div>
            <Paso n="4" titulo="Registro" detalle="Informe PDF, notas y reglas quedan archivados." color="#F39200" />
            <div className="self-center text-brand-mist font-bold">→</div>
            <Paso n="5" titulo="Mes siguiente" detalle="Se mide el efecto: el ciclo vuelve a empezar." color="#10B981" />
          </div>
          <div className="grid md:grid-cols-2 gap-2.5 mt-1">
            <Beneficio color="#E6332A" titulo="Cada guaraní pagado por hora rinde más"
              detalle="La improductividad se detecta el mismo mes, no cuando ya costó un trimestre." />
            <Beneficio color="#662483" titulo="Decisión inmediata, instantánea y online"
              detalle="Sin esperar informes manuales a fin de mes: se decide con el dato fresco y queda registrado." />
            <Beneficio color="#0EA5E9" titulo="Conversaciones honestas"
              detalle="Nadie discute percepciones: se conversa sobre un índice, sus componentes y su evolución." />
            <Beneficio color="#00B2BF" titulo="El talento se ve rápido"
              detalle="Un nuevo sobresaliente se identifica en semanas y se retiene; un crítico recibe ayuda antes de fracasar solo." />
            <Beneficio color="#F39200" titulo="Trazabilidad total"
              detalle="Cada análisis conserva sus reglas, sus números y las notas de lo decidido: auditable meses después." />
            <Beneficio color="#10B981" titulo="El equipo mejora todos los meses"
              detalle="La media del equipo sube cuando la improductividad sale y el talento se replica — el estándar se corre solo." />
          </div>
        </S>

        <S n="5" title="Las alertas: los costos no se controlan solos">
          <p>
            Cuando se genera un análisis de eficiencia, cada operador fuera de objetivo (Crítico, Se recomienda
            baja o Nuevo crítico) <b>genera automáticamente una alerta con su informe específico</b>: índice,
            producción vs la media, motivo y evolución. Una alerta abierta es costo por hora sin retorno —
            por eso no desaparece sola: alguien tiene que atenderla.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1.5 rounded-md text-sm font-bold bg-brand-primary text-white">Activa</span>
            <span className="text-brand-mist font-bold">→</span>
            <span className="px-3 py-1.5 rounded-md text-sm font-bold bg-brand-orange text-white">En mitigación</span>
            <span className="text-brand-mist font-bold">→</span>
            <span className="px-3 py-1.5 rounded-md text-sm font-bold bg-emerald-100 text-emerald-700">Mitigada</span>
            <span className="text-brand-mist mx-1">|</span>
            <span className="px-3 py-1.5 rounded-md text-sm font-bold bg-brand-ink text-white">Apagada</span>
          </div>
          <ul className="list-disc pl-5 space-y-1.5 text-[13px]">
            <li><b>Mitigar</b>: alguien toma la alerta con un plan concreto (coaching, cambio de base, revisión).</li>
            <li><b>Mitigada</b>: el plan se ejecutó y el riesgo quedó controlado.</li>
            <li><b>Apagada</b>: se cierra con justificación — baja ejecutada, caso resuelto por otra vía.</li>
            <li>Toda acción <b>exige un comentario</b> y queda en el seguimiento con autor y fecha: meses después
              se puede auditar quién atendió cada alerta y qué se decidió.</li>
          </ul>
        </S>

        <S n="6" title="Nuestro compromiso">
          <p>
            Medimos con reglas públicas, decidimos rápido y dejamos registro. Ser exigentes con los resultados
            y justos con las personas no son cosas opuestas: son exactamente el mismo sistema. Eso es lo que
            Sudameris compra cuando paga cada hora — y lo que este modelo garantiza, todos los meses.
          </p>
        </S>

        <div className="no-print">
          <Link href="/televentas/eficiencia" className="btn-primary inline-flex items-center gap-2">← Volver a Eficiencia del Negocio</Link>
        </div>
      </div>
    </AppShell>
  );
}
