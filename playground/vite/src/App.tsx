// Fixture covering the declaration shapes the Babel hook has to recognize.
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

const Plain = () => <p>plain</p>;

export default function App() {
  return (
    <main>
      <Panel />
      <Card />
      <Plain />
    </main>
  );
}
