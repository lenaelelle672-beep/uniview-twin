import './threeConsole'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { probeSoftwareGpu } from './scene/gpuDetect'
import { useTwinStore } from './store/store'
import { applySearchToStore } from './url/urlState'
import './index.css'

applySearchToStore(window.location.search)
const gpuProbe = probeSoftwareGpu()
if (gpuProbe.software && !useTwinStore.getState().qualityPinned) {
  useTwinStore.setState({ quality: 'perf' })
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('找不到根节点')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
