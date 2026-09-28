import { useEffect, useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { UIShell } from './components/UIShell'
import { isReportPath, TWIN_NAVIGATE_EVENT } from './report/navigate'
import { ReportPage } from './report/ReportPage'

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

  return <ErrorBoundary>{isReportPath(pathname) ? <ReportPage /> : <UIShell />}</ErrorBoundary>
}
