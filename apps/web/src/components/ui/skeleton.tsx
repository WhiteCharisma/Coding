import { cn } from '../../lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton', className)} />;
}

export function MessageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-6 px-4 py-6" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-10 rounded-avatar" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className={cn('h-3.5', i % 3 === 0 ? 'w-3/4' : i % 3 === 1 ? 'w-1/2' : 'w-2/3')} />
            {i % 2 === 0 && <Skeleton className="h-3.5 w-1/3" />}
          </div>
        </div>
      ))}
    </div>
  );
}
