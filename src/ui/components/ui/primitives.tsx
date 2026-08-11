/** Primitivos de UI estilo shadcn (accesibles, con cva). */
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

// ───────────────────────── Card ─────────────────────────
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card', className)} {...props} />;
}
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pt-5 pb-2', className)} {...props} />;
}
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('font-display text-lg font-600 text-navy-900 dark:text-navy-50', className)} {...props} />;
}
export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />;
}

// ───────────────────────── Button ─────────────────────────
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-500 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'bg-navy-900 text-white hover:bg-navy-700 dark:bg-gold-400 dark:text-navy-900 dark:hover:bg-gold-300',
        gold: 'bg-gold-400 text-navy-900 hover:bg-gold-300',
        ghost: 'bg-transparent hover:bg-navy-100 dark:hover:bg-navy-700 text-navy-700 dark:text-navy-100',
        outline: 'border border-navy-200 dark:border-navy-600 hover:bg-navy-50 dark:hover:bg-navy-700',
        danger: 'bg-signal-red text-white hover:opacity-90',
      },
      size: { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-base', icon: 'h-9 w-9' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';

// ───────────────────────── Badge ─────────────────────────
const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-600', {
  variants: {
    tone: {
      neutral: 'bg-navy-100 text-navy-700 dark:bg-navy-700 dark:text-navy-100',
      green: 'bg-green-100 text-signal-green dark:bg-green-900/40 dark:text-green-300',
      amber: 'bg-amber-100 text-signal-amber dark:bg-amber-900/40 dark:text-amber-300',
      red: 'bg-red-100 text-signal-red dark:bg-red-900/40 dark:text-red-300',
      gold: 'bg-gold-100 text-gold-700',
    },
  },
  defaultVariants: { tone: 'neutral' },
});
export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

// ───────────────────────── Select ─────────────────────────
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-10 rounded-xl border border-navy-200 bg-white px-3 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-gold-400 dark:border-navy-600 dark:bg-navy-800 dark:text-navy-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

// ───────────────────────── Input ─────────────────────────
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-xl border border-navy-200 bg-white px-3 text-sm text-navy-900 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-gold-400 dark:border-navy-600 dark:bg-navy-800 dark:text-navy-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

// ───────────────────────── Textarea ─────────────────────────
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'min-h-[5.5rem] w-full rounded-xl border border-navy-200 bg-white px-3 py-2 text-sm text-navy-900 placeholder:text-navy-300 focus:outline-none focus:ring-2 focus:ring-gold-400 dark:border-navy-600 dark:bg-navy-800 dark:text-navy-50',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

// ───────────────────────── Spinner ─────────────────────────
export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn('h-5 w-5 animate-spin rounded-full border-2 border-navy-200 border-t-gold-400', className)}
      role="status"
      aria-label="Cargando"
    />
  );
}
