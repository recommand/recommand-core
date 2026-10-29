import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cn } from '@core/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-transparent bg-clip-padding text-sm font-button transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-warning [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline:
          'border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary',
        ghost:
          'text-foreground hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent',
        destructive:
          'border-destructive-soft bg-background text-destructive hover:bg-destructive-soft',
        'destructive-solid': 'bg-destructive text-background hover:bg-destructive/90',
        'ghost-destructive': 'text-destructive hover:bg-destructive-soft',
        link: 'border-0 text-primary underline decoration-1 [text-underline-position:from-font]',
      },
      size: {
        default: 'h-control px-4 has-[>svg]:px-3',
        sm: 'h-control-sm gap-1 px-3 text-button-sm has-[>svg]:px-2.5',
        lg: 'h-control-lg px-6 has-[>svg]:px-4',
        icon: 'size-control',
        'icon-sm': 'size-control-sm',
        'icon-lg': 'size-control-lg',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0 has-[>svg]:px-0' }],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>;

/**
 * A button. To render it as another element, such as a link, pass that
 * element as `render` (and `nativeButton={false}` when it is not a button).
 */
function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

type ButtonLinkProps = useRender.ComponentProps<'a'> & VariantProps<typeof buttonVariants>;

/**
 * A link styled as a button. To navigate without a page load, pass the
 * router's link as `render`: `<ButtonLink render={<Link to="/x" />}>`.
 */
function ButtonLink({ className, variant, size, render, ...props }: ButtonLinkProps) {
  return useRender({
    defaultTagName: 'a',
    props: mergeProps<'a'>({ className: cn(buttonVariants({ variant, size, className })) }, props),
    render,
    state: { slot: 'button' },
  });
}

export type { ButtonProps };
export { Button, ButtonLink, buttonVariants };
