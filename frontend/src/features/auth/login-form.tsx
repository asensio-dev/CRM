import { type LoginRequest, LoginRequestSchema } from '@axiom/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { HttpError } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

interface LoginFormProps {
  onSubmit: (values: LoginRequest) => Promise<void>;
}

function errorMessage(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.statusCode === 401) return 'Correo o contraseña incorrectos.';
    if (err.statusCode === 429) return 'Demasiados intentos. Inténtalo más tarde.';
    if (err.code === 'NETWORK_ERROR') return err.message;
  }
  return 'No se pudo iniciar sesión. Inténtalo de nuevo.';
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({
    resolver: zodResolver(LoginRequestSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setServerError(errorMessage(err));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="nombre@empresa.com"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <p id="email-error" role="alert" className="text-xs text-destructive">
            Ingresa un correo electrónico válido.
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? 'password-error' : undefined}
          {...register('password')}
        />
        {errors.password && (
          <p id="password-error" role="alert" className="text-xs text-destructive">
            La contraseña debe tener al menos 8 caracteres.
          </p>
        )}
      </div>
      {serverError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
        Iniciar sesión
      </Button>
    </form>
  );
}
