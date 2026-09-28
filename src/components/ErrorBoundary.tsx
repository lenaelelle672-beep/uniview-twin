import type { ReactNode } from 'react'
import { Component } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  message: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null }

  static getDerivedStateFromError(error: Error): State {
    return { message: error.message || '未知错误' }
  }

  render() {
    if (this.state.message) {
      return (
        <div className="fatal" role="alert">
          <h1>页面出现错误</h1>
          <p>{this.state.message}</p>
        </div>
      )
    }
    return this.props.children
  }
}
