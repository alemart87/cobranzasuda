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

export default function MetodologiaPage() {
  return (
    <AppShell>
      <PrintHeader titulo="Metodología del Simulador de Ventas" subtitulo="Cómo funciona el modelo, explicado en simple" />
      <div className="mb-2 text-xs text-brand-slate no-print">
        <Link href="/televentas" className="hover:text-brand-primary">Televentas</Link>
        <span className="mx-2">/</span>
        <Link href="/televentas/simulador" className="hover:text-brand-primary">Simulador</Link>
        <span className="mx-2">/</span>
        <span className="text-brand-ink font-semibold">Metodología</span>
      </div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-brand-ink uppercase">Cómo funciona el simulador</h1>
          <p className="text-sm text-brand-slate mt-1 max-w-2xl">
            El modelo estadístico explicado en simple: qué calcula, de dónde salen los números y cómo leer los resultados.
          </p>
        </div>
        <PrintButton />
      </div>

      <div className="max-w-3xl">
        <S n="1" title="La idea en una frase">
          <p>
            Vender por teléfono es una cadena: <b>de cada X llamadas, algunas son atendidas; de las atendidas,
            algunas terminan en póliza</b>. Si conocemos esas proporciones con datos reales, podemos calcular
            hacia atrás cuántas llamadas —y por lo tanto cuántos asesores y cuántos registros de base—
            hacen falta para llegar a una meta de venta.
          </p>
          <div className="bg-brand-bg-soft rounded-md p-4 text-[13px]">
            <b>Ejemplo:</b> si el ticket promedio es Gs 1.200.000, para vender Gs 120 millones hacen falta
            <b> 100 pólizas</b>. Si de cada 100 personas que atienden se concretan 5 ventas (conversión 5%),
            se necesitan <b>2.000 conversaciones</b>. Si atiende la mitad (contactabilidad 50%), son
            <b> 4.000 llamadas</b>. Y si cada asesor hace 800 llamadas al mes, se necesitan <b>5 asesores</b>.
          </div>
          <p>
            La misma cadena funciona en las tres direcciones: desde la <b>meta</b> (cuánta gente y base necesito),
            desde la <b>dotación</b> (cuánto puede vender mi equipo) y desde el <b>insumo</b> (tengo una base de
            N registros: qué capacidad total de producción me da y cuánta gente hace falta para trabajarla).
            En este último caso el simulador también avisa cuál es el cuello de botella: si la base rinde más
            llamadas de las que la dotación puede marcar, el límite real es la gente — y al revés, si la base
            se agota antes de fin de mes, el límite es el insumo.
          </p>
        </S>

        <S n="2" title="De dónde salen las tasas">
          <p>
            Todas las tasas del modelo salen de <b>los datos reales de la operación</b> (reportes publicados de
            llamadas y producción). Usted elige qué meses alimentan el modelo — porque un mes atípico
            (un equipo distinto, una base excepcional) puede distorsionar la foto.
          </p>
          <p>
            Con los meses elegidos <b>no promediamos porcentajes: sumamos los totales</b>. Si un mes hubo
            9.000 llamadas y otro 17.000, el segundo pesa casi el doble — como corresponde.
            A esto se lo llama <i>estimador de razón</i> y evita que un mes chico con un porcentaje raro
            mueva el resultado.
          </p>
          <div className="bg-brand-bg-soft rounded-md p-4 text-[13px]">
            <b>Por qué importa:</b> si mayo convirtió 8,5% y julio 4,3%, el promedio simple diría 6,4%.
            Pero si julio tuvo el doble de llamadas, la realidad combinada está más cerca de 5,7%.
            Y si mayo fue atípico (otro equipo), lo correcto es directamente excluirlo.
          </div>
          <p>
            <b>Asesores efectivos:</b> en los promedios "por asesor" y en la dotación solo cuentan los asesores
            con actividad significativa en el día (al menos 5 llamadas y no menos de la cuarta parte de lo que marcó
            el asesor típico de esa jornada). Un operador que rotó y dejó un puñado de llamadas residuales, o una
            cuenta de supervisión que marcó una vez, no arrastra el promedio hacia abajo ni infla la dotación.
          </p>
        </S>

        <S n="3" title="La validación estadística (regresión)">
          <p>
            Además de las tasas, el simulador hace una <b>regresión lineal</b> — una técnica estadística
            estándar — sobre <b>cada día real de operación</b>: toma los pares "llamadas atendidas del día /
            pólizas del día" y encuentra la recta que mejor explica esa relación. Como 0 llamadas producen
            0 ventas, la recta pasa por el origen.
          </p>
          <p>La regresión aporta tres cosas que un promedio no da:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <b>β (la pendiente)</b>: la conversión "marginal" — cuántas pólizas agrega, en promedio,
              cada conversación adicional.
            </li>
            <li>
              <b>El intervalo de confianza del 95% (IC 95%)</b>: el rango donde muy probablemente está la
              conversión verdadera. En lugar de decir "necesitás 41 asesores", el modelo dice
              <b> "entre 36 y 47"</b> — y esa honestidad es más útil para decidir.
            </li>
            <li>
              <b>R² (de 0 a 1)</b>: qué tan de cerca siguen las ventas a las llamadas día a día.
              Un R² alto significa que más llamadas producen más ventas de forma consistente;
              un R² bajo avisa que hay otros factores (calidad de base, desfase de emisión) y que
              conviene decidir con el rango, no con el punto.
            </li>
          </ul>
        </S>

        <S n="4" title="Cómo leer los resultados (y decidir)">
          <ul className="list-disc pl-5 space-y-2">
            <li><b>El número "base"</b> es el escenario más probable con las tasas elegidas.</li>
            <li>
              <b>El rango (IC 95%)</b> es el terreno seguro: si la meta es un <b>compromiso firme</b>,
              dimensionar con el extremo <b>conservador</b>; si es un objetivo aspiracional, el base alcanza.
            </li>
            <li>
              <b>Las palancas</b> muestran equivalencias: a veces subir la conversión medio punto
              (coaching, mejores bases) reemplaza varias contrataciones.
            </li>
            <li>
              <b>La base de datos importa tanto como la gente</b>: sin registros frescos suficientes,
              la contactabilidad cae y toda la cadena se rompe.
            </li>
          </ul>
        </S>

        <S n="5" title="Qué NO contempla el modelo (limitaciones honestas)">
          <ul className="list-disc pl-5 space-y-2">
            <li><b>Curva de aprendizaje:</b> un asesor nuevo no rinde como uno experimentado desde el día 1.</li>
            <li><b>Estacionalidad:</b> meses comercialmente distintos (aguinaldo, fiestas) pueden mover las tasas.</li>
            <li><b>Calidad de las bases:</b> el modelo asume bases similares a las de los meses elegidos.</li>
            <li><b>Desfase de emisión:</b> una venta gestionada a fin de mes puede emitirse al mes siguiente.</li>
          </ul>
          <p>
            Por eso el simulador es una herramienta de <b>orden de magnitud gerencial</b> — muy superior a la
            intuición, pero pensada para decidir con rangos y revisarse cada mes al publicar nuevos datos:
            con más historia, los intervalos se angostan solos y el modelo se vuelve más preciso.
          </p>
        </S>

        <div className="no-print">
          <Link href="/televentas/simulador" className="btn-primary inline-flex items-center gap-2">← Volver al simulador</Link>
        </div>
      </div>
    </AppShell>
  );
}
