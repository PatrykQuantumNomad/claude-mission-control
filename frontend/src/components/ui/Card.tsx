// Card family — UI-SPEC FESH-05 + DESG-04. Compound API; pass-through className.
// 14px radius default, 24px padding, surface bg. The Card root uses <article>
// for landmark accessibility — every panel-style card in Phase 6/7 inherits
// this semantic. All six exports forward refs (Phase 6 will use refs for
// scroll-to-card patterns triggered by AttentionBar focus).

import { HTMLAttributes, forwardRef } from 'react'

type DivProps = HTMLAttributes<HTMLDivElement>

export const Card = forwardRef<HTMLDivElement, DivProps>(({ className = '', ...rest }, ref) => (
  <article ref={ref} className={`cmc-card ${className}`.trim()} {...rest} />
))
Card.displayName = 'Card'

export const CardHeader = forwardRef<HTMLDivElement, DivProps>(({ className = '', ...rest }, ref) => (
  <div ref={ref} className={`cmc-card__header ${className}`.trim()} {...rest} />
))
CardHeader.displayName = 'CardHeader'

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className = '', ...rest }, ref) => (
    <h2 ref={ref} className={`cmc-card__title ${className}`.trim()} {...rest} />
  ),
)
CardTitle.displayName = 'CardTitle'

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className = '', ...rest }, ref) => (
    <p ref={ref} className={`cmc-card__description ${className}`.trim()} {...rest} />
  ),
)
CardDescription.displayName = 'CardDescription'

export const CardContent = forwardRef<HTMLDivElement, DivProps>(({ className = '', ...rest }, ref) => (
  <div ref={ref} className={`cmc-card__content ${className}`.trim()} {...rest} />
))
CardContent.displayName = 'CardContent'

export const CardFooter = forwardRef<HTMLDivElement, DivProps>(({ className = '', ...rest }, ref) => (
  <div ref={ref} className={`cmc-card__footer ${className}`.trim()} {...rest} />
))
CardFooter.displayName = 'CardFooter'
