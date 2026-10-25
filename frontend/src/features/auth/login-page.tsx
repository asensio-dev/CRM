import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { Hexagon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { safeRedirect } from './guards';
import { LoginForm } from './login-form';
import { useSessionStore } from './session-store';

const route = getRouteApi('/login');

export function LoginPage() {
  const navigate = useNavigate();
  const { redirect } = route.useSearch();
  const login = useSessionStore((s) => s.login);

  return (
    <main className="flex min-h-screen items-center justify-center bg-linear-to-br from-accent via-background to-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <Hexagon className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">AXIOM CRM</h1>
            <p className="text-sm text-muted-foreground">Gestión de cartera de empresas</p>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Iniciar sesión</CardTitle>
            <CardDescription>Ingresa tus credenciales para continuar.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm
              onSubmit={async (values) => {
                await login(values);
                await navigate({ to: safeRedirect(redirect) ?? '/mi-semana' });
              }}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
