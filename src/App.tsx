import { lazy, Suspense, useEffect, useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { UIShell } from './components/UIShell'
import { isReportPath, TWIN_NAVIGATE_EVENT } from './report/navigate'

const ReportPage = lazy(() => import('./report/ReportPage').then((mod) => ({ default: mod.ReportPage })))

export function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname)

  useEffect(() => {
    const sync = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', sync)
    window.addEventListener(TWIN_NAVIGATE_EVENT, sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener(TWIN_NAVIGATE_EVENT, sync)
    }
  }, [])

  return (
    <ErrorBoundary>
      {isReportPath(pathname) ? (
        <Suspense fallback={null}>
          <ReportPage />
        </Suspense>
      ) : (
        <UIShell />
      )}
    </ErrorBoundary>
  )
}
