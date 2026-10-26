import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { safeRedirect } from './guards';
import { LoginForm } from './login-form';
import { useSessionStore } from './session-store';

const route = getRouteApi('/login');

/** Alturas ilustrativas de los 21 días de un ciclo (pista fantasma del panel lateral). */
const CYCLE_DAYS = [
  38, 52, 61, 47, 70, 0, 0, 44, 58, 66, 72, 63, 0, 0, 55, 69, 78, 74, 86, 0, 0,
] as const;

function CyclePanel() {
  return (
    <div className="relative hidden overflow-hidden bg-linear-to-b from-wash to-background lg:flex lg:flex-col lg:justify-between lg:p-12">
      <img
        src="/brand/axiom-logo.png"
        alt=""
        width={248}
        height={192}
        className="h-24 w-auto self-start drop-shadow-[0_6px_14px_rgb(42_98_242/0.18)]"
      />
      <div className="space-y-8">
        <div
          aria-hidden="true"
          className="flex h-48 items-end gap-1.5 rounded-2xl border bg-card/70 p-5 shadow-md"
        >
          {CYCLE_DAYS.map((h, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: ilustración estática.
              key={i}
              className="relative h-full flex-1 overflow-hidden rounded-md bg-track"
            >
              {h > 0 && (
                <div
                  className="bg-fill-fade-y absolute inset-x-0 bottom-0 rounded-md"
                  style={{ height: `${h}%` }}
                />
              )}
            </div>
          ))}
        </div>
        <div className="max-w-md space-y-2">
          <p className="text-xl font-semibold tracking-[-0.01em]">
            Tres semanas por ciclo, veinte contactos por semana.
          </p>
          <p className="text-sm text-muted-foreground">
            Tu cartera rota sola: lo que no avanza vuelve al pool y llegan empresas nuevas.
          </p>
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const { redirect } = route.useSearch();
  const login = useSessionStore((s) => s.login);

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex items-center justify-center bg-card p-6 sm:p-10">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex items-center gap-3">
            <img
              src="/brand/axiom-logo.png"
              alt=""
              width={52}
              height={40}
              className="h-10 w-auto lg:hidden"
            />
            <div>
              <h1 className="text-2xl font-semibold tracking-[-0.02em]">AXIOM CRM</h1>
              <p className="text-sm text-muted-foreground">Gestión de cartera de empresas</p>
            </div>
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Iniciar sesión</h2>
            <p className="text-sm text-muted-foreground">
              Ingresa tus credenciales para continuar.
            </p>
          </div>
          <LoginForm
            onSubmit={async (values) => {
              await login(values);
              await navigate({ to: safeRedirect(redirect) ?? '/mi-semana' });
            }}
          />
        </div>
      </div>
      <CyclePanel />
    </main>
  );
}
