const features = [
  {
    title: "Fiber To Source",
    description: "Hold Shift and click any rendered element to walk up the React Fiber tree and open the nearest component file.",
  },
  {
    title: "React Dev Mode",
    description: "The browser client reads React internals in development, so the tool stays focused on actual component boundaries.",
  },
  {
    title: "Editor Jump",
    description: "By default the plugin launches VS Code at the component definition, but you can override it with the EDITOR env var.",
  },
];

export function App() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Web Element Code Locator</p>
        <h1>Inspect the UI by clicking the live element.</h1>
        <p className="lead">
          Start the Vite dev server, hold Shift, and click anything in this page. The plugin finds the closest React
          component behind that DOM node and opens its source definition in your editor.
        </p>
        <div className="actions">
          <button className="primary">Shift + Click Me</button>
          <button className="secondary">Any JSX Element Works</button>
        </div>
      </section>

      <section className="grid">
        {features.map((feature) => (
          <article className="card" key={feature.title}>
            <h2>{feature.title}</h2>
            <p>{feature.description}</p>
          </article>
        ))}
      </section>

      <section className="panel">
        <div>
          <h2>How it maps back</h2>
          <p>
            A Babel transform tags React component definitions with source metadata during development. The click
            handler climbs the React Fiber tree from the clicked DOM node and uses the nearest tagged component.
          </p>
        </div>
        <aside className="note">
          <strong>Tip</strong>
          <p>If you prefer a different modifier key, change `triggerKey` in `vite.config.ts`.</p>
        </aside>
      </section>
    </main>
  );
}
