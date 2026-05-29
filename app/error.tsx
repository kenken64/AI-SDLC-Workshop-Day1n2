"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="container">
      <section className="card" style={{ padding: "1rem" }}>
        <h1>Something went wrong</h1>
        <p className="muted">{error.message}</p>
        <button className="btn primary" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
