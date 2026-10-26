import {
  CreateUserSchema,
  ResetPasswordSchema,
  USER_ROLES,
  type UserDto,
  type UserRole,
} from '@axiom/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import '@/shared/lib/zod-es';
import { ROLE_LABELS } from '@/app/navigation';
import { HttpError } from '@/shared/api';
import { errorMessage, fieldErrorsFromApi } from '@/shared/lib/api-errors';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { FormField } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { useCreateUser, useResetPassword, useUpdateUser } from './queries';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Footer({
  pending,
  label,
  onCancel,
}: {
  pending: boolean;
  label: string;
  onCancel: () => void;
}) {
  return (
    <DialogFooter className="-mx-6 mt-2 border-t px-6 pt-4">
      <Button variant="outline" onClick={onCancel} disabled={pending}>
        Cancelar
      </Button>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
        {label}
      </Button>
    </DialogFooter>
  );
}

function RoleSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: UserRole;
  onChange: (role: UserRole) => void;
}): ReactNode {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value as UserRole)}>
      {USER_ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </Select>
  );
}

// ───────────────────────────── Crear ─────────────────────────────

type CreateValues = z.input<typeof CreateUserSchema>;

export function CreateUserDialog({ open, onOpenChange }: DialogProps) {
  const create = useCreateUser();
  const form = useForm<CreateValues, unknown, z.output<typeof CreateUserSchema>>({
    resolver: zodResolver(CreateUserSchema),
    defaultValues: { fullName: '', email: '', password: '', role: 'EJECUTIVO' },
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset();
  }, [open, form]);

  const submit = form.handleSubmit(async (values) => {
    try {
      const user = await create.mutateAsync(values);
      toast.success(`Usuario creado: ${user.fullName}`);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof HttpError && err.code === 'EMAIL_TAKEN') {
        form.setError('email', { message: 'Ya existe un usuario con ese correo.' });
        return;
      }
      const fields = fieldErrorsFromApi(err);
      if (Object.keys(fields).length > 0) {
        for (const [k, message] of Object.entries(fields)) form.setError(k as never, { message });
        return;
      }
      toast.error(errorMessage(err, 'No se pudo crear el usuario.'));
    }
  });

  const f = (k: keyof CreateValues) => ({
    id: `new-user-${k}`,
    'aria-invalid': !!errors[k],
    'aria-describedby': errors[k] ? `new-user-${k}-error` : undefined,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
          <DialogDescription>Crea una cuenta con una contraseña inicial.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <FormField
            id="new-user-fullName"
            label="Nombre completo"
            error={errors.fullName?.message}
          >
            <Input autoComplete="off" {...f('fullName')} {...form.register('fullName')} />
          </FormField>
          <FormField id="new-user-email" label="Correo electrónico" error={errors.email?.message}>
            <Input type="email" autoComplete="off" {...f('email')} {...form.register('email')} />
          </FormField>
          <FormField
            id="new-user-password"
            label="Contraseña inicial"
            error={errors.password?.message}
            hint="Mínimo 8 caracteres."
          >
            <Input
              type="password"
              autoComplete="new-password"
              {...f('password')}
              {...form.register('password')}
            />
          </FormField>
          <FormField id="new-user-role" label="Rol" error={errors.role?.message}>
            <RoleSelect
              id="new-user-role"
              value={form.watch('role')}
              onChange={(r) => form.setValue('role', r)}
            />
          </FormField>
          <Footer
            pending={isSubmitting}
            label="Crear usuario"
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────── Editar ─────────────────────────────

interface EditValues {
  fullName: string;
  role: UserRole;
  isActive: boolean;
}

export function EditUserDialog({ user, open, onOpenChange }: DialogProps & { user: UserDto }) {
  const update = useUpdateUser(user.id);
  const form = useForm<EditValues>({
    defaultValues: { fullName: user.fullName, role: user.role, isActive: user.isActive },
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset({ fullName: user.fullName, role: user.role, isActive: user.isActive });
  }, [open, user, form]);

  const submit = form.handleSubmit(async (values) => {
    const fullName = values.fullName.trim();
    if (!fullName) {
      form.setError('fullName', { message: 'El nombre es obligatorio.' });
      return;
    }
    // Solo se envía lo que cambió.
    const changes: Partial<EditValues> = {};
    if (fullName !== user.fullName) changes.fullName = fullName;
    if (values.role !== user.role) changes.role = values.role;
    if (values.isActive !== user.isActive) changes.isActive = values.isActive;
    if (Object.keys(changes).length === 0) {
      onOpenChange(false);
      return;
    }
    try {
      await update.mutateAsync(changes);
      toast.success('Usuario actualizado');
      onOpenChange(false);
    } catch (err) {
      // Reglas de negocio (LAST_ADMIN, CANNOT_DEACTIVATE_SELF, ...) se muestran como toast.
      toast.error(errorMessage(err, 'No se pudo actualizar el usuario.'));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <FormField
            id="edit-user-fullName"
            label="Nombre completo"
            error={errors.fullName?.message}
          >
            <Input
              id="edit-user-fullName"
              aria-invalid={!!errors.fullName}
              {...form.register('fullName')}
            />
          </FormField>
          <FormField id="edit-user-role" label="Rol">
            <RoleSelect
              id="edit-user-role"
              value={form.watch('role')}
              onChange={(r) => form.setValue('role', r)}
            />
          </FormField>
          <div className="flex items-center gap-2">
            <Checkbox
              id="edit-user-active"
              checked={form.watch('isActive')}
              onCheckedChange={(c) => form.setValue('isActive', c === true)}
            />
            <label htmlFor="edit-user-active" className="text-sm">
              Usuario activo
            </label>
          </div>
          <Footer
            pending={isSubmitting}
            label="Guardar cambios"
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────── Restablecer contraseña ─────────────────────────────

type ResetValues = z.input<typeof ResetPasswordSchema>;

export function ResetPasswordDialog({ user, open, onOpenChange }: DialogProps & { user: UserDto }) {
  const reset = useResetPassword(user.id);
  const form = useForm<ResetValues>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { newPassword: '' },
  });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    if (open) form.reset();
  }, [open, form]);

  const submit = form.handleSubmit(async (values) => {
    try {
      await reset.mutateAsync(values);
      toast.success(`Contraseña restablecida para ${user.fullName}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo restablecer la contraseña.'));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restablecer contraseña</DialogTitle>
          <DialogDescription>
            Define una nueva contraseña para {user.fullName}. Compártela por un canal seguro.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <FormField
            id="reset-password"
            label="Nueva contraseña"
            error={errors.newPassword?.message}
            hint="Mínimo 8 caracteres."
          >
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.newPassword}
              {...form.register('newPassword')}
            />
          </FormField>
          <Footer pending={isSubmitting} label="Restablecer" onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
