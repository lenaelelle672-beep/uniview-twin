import { ErrorBoundary } from './components/ErrorBoundary'
import { UIShell } from './components/UIShell'

export function App() {
  return (
    <ErrorBoundary>
      <UIShell />
    </ErrorBoundary>
  )
}
