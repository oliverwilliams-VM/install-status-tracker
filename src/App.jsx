export default function App() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] flex items-center justify-center px-4">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-2xl font-bold">Install Status Tracker</h1>
        <p className="text-muted-foreground text-sm">
          Scaffold deployed. Real board structure still being confirmed — visit{' '}
          <code className="bg-[hsl(var(--surface-2))] px-1.5 py-0.5 rounded text-xs">/api/columns-helper</code>{' '}
          to inspect the readiness boards before the real dashboard gets built here.
        </p>
      </div>
    </div>
  );
}
