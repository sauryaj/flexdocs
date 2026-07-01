'use client';

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-lg animate-pulse',
        className
      )}
      style={{ backgroundColor: 'var(--border-subtle)' }}
    />
  );
}

export function StatCardSkeleton() {
  return (
    <div className="card p-6">
      <div className="flex items-center gap-4">
        <Skeleton className="w-12 h-12 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="card">
      <div className="p-4 border-b" style={{ borderColor: 'var(--card-border)' }}>
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--card-border)' }}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <Skeleton className="w-5 h-5 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-3">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="w-5 h-5 rounded" />
      </div>
      <Skeleton className="h-5 w-full mb-2" />
      <Skeleton className="h-4 w-3/4 mb-4" />
      <Skeleton className="h-16 w-full rounded-lg" />
      <div className="flex justify-between items-center mt-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}
