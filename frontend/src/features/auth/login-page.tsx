import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { LockKeyhole, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/shared/hooks/use-theme';
import { Button } from '@/shared/ui/button';
import { safeRedirect } from './guards';
import { LoginForm } from './login-form';
import { useSessionStore } from './session-store';

const route = getRouteApi('/login');

/** Alturas ilustrativas de los 21 días de un ciclo: la pista fantasma en miniatura. */
const CYCLE_DAYS = [
  38, 52, 61, 47, 70, 18, 12, 44, 58, 66, 72, 63, 20, 14, 55, 69, 78, 74, 86, 24, 16,
] as const;

const managuaHour = new Intl.DateTimeFormat('es-NI', {
  hour: 'numeric',
  hourCycle: 'h23',
  timeZone: 'America/Managua',
});

/** Saludo según la hora de Managua (la del equipo comercial, no la del navegador). */
export function greeting(now: Date = new Date()): string {
  const hour = Number(managuaHour.format(now));
  if (hour >= 5 && hour < 12) return 'Buenos días';
  if (hour >= 12 && hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function BrandPanel() {
  return (
    <div className="relative isolate flex flex-col items-center justify-center overflow-hidden bg-[#0b1633] px-8 py-10 text-center text-white lg:py-16">
      {/* Malla de luz azul: el destello del logo extendido a todo el panel. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div className="absolute -left-24 -top-28 size-[26rem] rounded-full bg-[#2a62f2] opacity-70 blur-[90px]" />
        <div className="absolute -right-20 top-10 size-80 rounded-full bg-[#38bdf8] opacity-45 blur-[90px]" />
        <div className="absolute -bottom-32 left-6 size-96 rounded-full bg-[#6366f1] opacity-55 blur-[100px]" />
        <div className="absolute -bottom-16 -right-10 size-72 rounded-full bg-[#9fbcff] opacity-30 blur-[90px]" />
        <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_40%,rgb(255_255_255/0.06)_50%,transparent_60%)]" />
      </div>

      <img
        src="/brand/axiom-logo.png"
        alt=""
        width={248}
        height={192}
        className="h-16 w-auto drop-shadow-[0_8px_24px_rgb(56_189_248/0.35)] lg:h-24"
      />
      <p className="mt-5 text-[2.6rem] font-bold leading-none tracking-[0.16em] pl-[0.16em] lg:text-[3.6rem]">
        AXIOM
      </p>
      <p className="mt-2 text-sm font-medium tracking-[0.3em] pl-[0.3em] text-white/70">CRM</p>
      <p className="mt-6 hidden max-w-xs text-[15px] leading-relaxed text-white/80 sm:block">
        Tu cartera rotativa en un solo lugar: plan semanal, pipeline y cobertura del ciclo.
      </p>

      <div
        aria-hidden="true"
        className="mt-8 hidden h-12 w-56 items-end gap-[3px] sm:flex"
        title="Ciclo de 21 días"
      >
        {CYCLE_DAYS.map((h, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: ilustración estática.
            key={i}
            className="relative h-full flex-1 overflow-hidden rounded-[3px] bg-white/12"
          >
            <div
              className="absolute inset-x-0 bottom-0 rounded-[3px] bg-linear-to-t from-[#9fbcff] to-white"
              style={{ height: `${h}%` }}
            />
          </div>
        ))}
      </div>
      <p className="mt-4 hidden text-xs text-white/65 sm:block">
        Ciclos de tres semanas, veinte contactos por semana.
      </p>
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggle}
      aria-label={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      className="absolute right-4 top-4 rounded-full sm:right-5 sm:top-5"
    >
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const { redirect } = route.useSearch();
  const login = useSessionStore((s) => s.login);

  return (
    <main className="bg-workspace flex min-h-screen items-center justify-center bg-background p-4 sm:p-8">
      <div className="grid w-full max-w-[60rem] overflow-hidden rounded-2xl border bg-card shadow-lg lg:min-h-[36rem] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <BrandPanel />
        <div className="relative flex items-center justify-center px-6 py-10 sm:px-12 lg:py-14">
          <ThemeToggle />
          <div className="w-full max-w-sm space-y-7">
            <div className="space-y-2">
              <h1 className="text-[1.65rem] font-semibold leading-tight tracking-[-0.02em]">
                Iniciar sesión
              </h1>
              <p className="text-sm text-muted-foreground">
                {greeting()}. Ingresa con tu correo para continuar.
              </p>
            </div>
            <LoginForm
              onSubmit={async (values) => {
                await login(values);
                await navigate({ to: safeRedirect(redirect) ?? '/mi-semana' });
              }}
            />
            <div className="space-y-3">
              <p className="flex items-start gap-2.5 rounded-xl border bg-muted/50 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground">
                <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  Acceso solo por invitación: un administrador crea tu cuenta y te asigna tu
                  cartera.
                </span>
              </p>
              <p className="text-center text-xs text-muted-foreground">
                ¿Problemas para entrar? Contacta al administrador de tu equipo.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
