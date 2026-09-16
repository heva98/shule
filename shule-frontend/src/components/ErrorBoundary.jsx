import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import Card from './ui/Card'
import Button from './ui/Button'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <Card padding="p-10" className="max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-5">
            <AlertTriangle size={28} className="text-red-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-sm text-gray-500 mb-6">
            An unexpected error occurred. Your data is safe — please try again or refresh the page.
          </p>

          {import.meta.env.DEV && this.state.error && (
            <pre className="text-left text-xs bg-gray-100 text-red-600 rounded-lg p-3 mb-6 overflow-auto max-h-40">
              {this.state.error.message}
            </pre>
          )}

          <div className="flex gap-3 justify-center">
            <Button onClick={this.handleReset} icon={RefreshCw}>
              Try again
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </div>
        </Card>
      </div>
    )
  }
}
