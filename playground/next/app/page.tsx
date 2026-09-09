"use client";

// Line numbers here are asserted by check.mjs. Keep the shape stable.
import { memo } from "react";

export function Panel() {
  return <section className="panel">panel</section>;
}

export const Card = memo(function CardImpl() {
  return (
    <div className="card">
      <span>nested</span>
    </div>
  );
});

export default function Page() {
  return (
    <main>
      <Panel />
      <Card />
    </main>
  );
}
