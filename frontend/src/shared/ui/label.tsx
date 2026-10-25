import type { LabelHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  // biome-ignore lint/a11y/noLabelWithoutControl: el control se asocia vía htmlFor en el uso.
  return <label className={cn('text-sm font-medium leading-none', className)} {...props} />;
}
