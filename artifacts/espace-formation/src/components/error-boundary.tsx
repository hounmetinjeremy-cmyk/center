import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
  stack?: string;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message, stack: error.stack };
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
            {this.state.message && (
              <pre style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", fontSize: 11, textAlign: "left", maxWidth: "90vw", overflowX: "auto", whiteSpace: "pre-wrap" }}>
                {this.state.message}
                {this.state.stack ? `\n\n${this.state.stack}` : ""}
              </pre>
            )}
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
