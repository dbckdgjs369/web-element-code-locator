// No "use client" — this is a Server Component, which is the App Router default.
//
// Its jsxDEV calls run in the Node process, so hook G writes into the *server's* registry.
// The browser receives a serialized RSC payload instead of those calls. Whether any source
// position survives that trip is what app/server/e2e asserts; nothing here is assumed.

export function ServerPanel() {
  return <section className="server-panel">server panel</section>;
}

export default function ServerPage() {
  return (
    <main className="server-main">
      <ServerPanel />
      <p className="server-text">plain server paragraph</p>
    </main>
  );
}
