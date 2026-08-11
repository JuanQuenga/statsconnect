export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="compact-panel p-4">
      <div className="text-2xl font-black">{value}</div>
      <div className="mt-1 text-sm muted">{label}</div>
    </div>
  );
}
