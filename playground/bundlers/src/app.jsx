// Shared fixture. The verify scripts assert the exact positions of these two elements,
// so any edit here must update the EXPECTED table in verify-common.mjs.
export function App() {
  return (
    <div className="root">
      <button className="btn">find me</button>
    </div>
  );
}
