import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Application error", error, errorInfo.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main
          style={{
            minHeight: "100dvh",
            display: "grid",
            placeItems: "center",
            padding: "24px",
            textAlign: "center",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <section>
            <h1>Une erreur est survenue</h1>
            <p>Recharge la page pour retrouver ton espace de formation.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop: "12px",
                padding: "10px 16px",
                border: 0,
                borderRadius: "10px",
                cursor: "pointer",
              }}
            >
              Recharger
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
