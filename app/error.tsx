"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="fatal">
      <h1>Something didn’t connect.</h1>
      <p>
        Try again in a moment. If this keeps happening, check the app’s service
        configuration.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
