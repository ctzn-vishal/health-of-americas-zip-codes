"use client";
import Link from "next/link";
import { useEffect } from "react";

// Route error boundary (must be a client component).
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="prose-wrap">
      <header className="page-head" style={{ borderBottom: "none" }}>
        <span className="eyebrow">Something went wrong</span>
        <h1>This view hit an error</h1>
        <p className="page-lede">
          {error?.message || "An unexpected error occurred while rendering this page."}
        </p>
      </header>
      <div className="hero-actions">
        <button type="button" className="btn-lg btn-primary" onClick={() => reset()}>
          Try again
        </button>
        <Link href="/" className="btn-ghost">
          Back home
        </Link>
      </div>
    </main>
  );
}
