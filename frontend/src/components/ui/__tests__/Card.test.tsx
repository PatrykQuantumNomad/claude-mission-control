import { describe, it, expect } from 'vitest'
import { render, screen } from '../../../test/utils'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../Card'

describe('Card', () => {
  it('renders the compound API as a single article landmark with all sub-parts', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Live sessions</CardTitle>
          <CardDescription>Recently active Claude conversations</CardDescription>
        </CardHeader>
        <CardContent>Body content</CardContent>
        <CardFooter>Footer slot</CardFooter>
      </Card>,
    )
    const article = screen.getByRole('article')
    expect(article).toBeInTheDocument()
    expect(article).toHaveClass('cmc-card')
    // Title is an h2 — exposed as a level-2 heading by name
    expect(screen.getByRole('heading', { level: 2, name: 'Live sessions' })).toBeInTheDocument()
    expect(screen.getByText('Recently active Claude conversations')).toBeInTheDocument()
    expect(screen.getByText('Body content')).toBeInTheDocument()
    expect(screen.getByText('Footer slot')).toBeInTheDocument()
  })

  it('forwards refs and merges custom className without dropping the base class', () => {
    let captured: HTMLDivElement | null = null
    render(
      <Card ref={(el) => { captured = el }} className="custom-class">
        <CardContent>x</CardContent>
      </Card>,
    )
    expect(captured).not.toBeNull()
    expect(captured!.classList.contains('cmc-card')).toBe(true)
    expect(captured!.classList.contains('custom-class')).toBe(true)
  })
})
