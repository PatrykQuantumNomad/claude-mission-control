// Button — UI-SPEC FESH-06 + DESG-05. variant=primary uses --cmc-gradient-hero
// (the only place the gradient appears on a button). Hover lift -2px is wired
// in CSS via transition (not framer-motion) so prefers-reduced-motion shorts
// the transform cleanly. Default type="button" avoids the form-submit footgun
// — callers wanting a submit pass type="submit" explicitly.

import { ButtonHTMLAttributes, ReactNode, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md'
  iconLeft?: ReactNode
  iconRight?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      iconLeft,
      iconRight,
      children,
      className = '',
      type = 'button',
      ...rest
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      className={`cmc-btn cmc-btn--${variant} cmc-btn--${size} ${className}`.trim()}
      {...rest}
    >
      {iconLeft ? <span className="cmc-btn__icon-left">{iconLeft}</span> : null}
      {children ? <span className="cmc-btn__label">{children}</span> : null}
      {iconRight ? <span className="cmc-btn__icon-right">{iconRight}</span> : null}
    </button>
  ),
)
Button.displayName = 'Button'
