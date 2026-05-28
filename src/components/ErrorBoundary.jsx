import { Component } from 'react';
import { Link } from 'react-router-dom';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
          <p className="text-lg font-medium text-zinc-200 mb-2">Something went wrong</p>
          <p className="text-sm text-zinc-400 mb-6">An unexpected error occurred while rendering this page.</p>
          <Link
            to="/"
            onClick={() => this.setState({ hasError: false })}
            className="text-sm px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors"
          >
            Back to directory
          </Link>
        </div>
      );
    }

    return this.props.children;
  }
}
