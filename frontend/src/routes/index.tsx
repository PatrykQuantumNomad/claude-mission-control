import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => <main className="cmc-main">Mission Control online.</main>,
})
