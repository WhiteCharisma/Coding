import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from './spinner';

// Pattern adapted from shadcn/ui (MIT); styles are specific to this design system.
export const buttonVariants = cva(
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-[background-color,color,border-color,box-shadow,transform,filter,opacity] duration-[var(--dur-fast)] ease-out active:scale-[0.97] active:duration-[var(--dur-instant)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4',
  {
    variants: {
      variant: {
        // Glossy Aero button: luminous gradient, a highlight on the upper half, a light sweep on hover.
        primary:
          'gloss sheen-hover border border-accent-border bg-linear-to-b from-accent-hi to-accent-lo text-accent-fg shadow-[inset_0_1px_0_var(--glass-sheen),0_6px_16px_-8px_var(--accent-glow)] hover:brightness-[1.04] hover:shadow-[inset_0_1px_0_var(--glass-sheen),0_8px_22px_-6px_var(--accent-glow)] active:brightness-[0.96] disabled:border-line disabled:from-inset disabled:to-inset disabled:text-fg-muted disabled:opacity-100 disabled:shadow-none',
        secondary:
          'gloss border border-glass-edge bg-elevated text-fg shadow-sm hover:border-accent-border hover:shadow-md',
        ghost: 'text-fg-2 hover:bg-hover hover:text-fg',
        outline: 'border border-line-strong text-fg hover:bg-hover',
        danger: 'gloss border border-danger/40 bg-danger text-danger-fg shadow-sm hover:bg-danger-hover',
        'danger-ghost': 'text-danger hover:bg-danger-soft',
        link: 'h-auto px-0 text-accent-text underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-9 px-4 text-ui',
        lg: 'h-11 px-5 text-base',
        icon: 'size-9 p-0',
        'icon-sm': 'size-8 p-0',
        'icon-xs': 'size-7 p-0 [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, loading, disabled, children, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <span className="invisible inline-flex items-center gap-2">{children}</span>
          <Spinner className="absolute size-4" />
        </>
      ) : (
        children
      )}
    </Comp>
  );
});
