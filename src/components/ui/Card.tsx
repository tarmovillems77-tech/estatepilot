import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** No inner padding, e.g. for tables that run edge to edge. */
  flush?: boolean;
}

export function Card({ className = '', flush = false, ...props }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ${flush ? 'overflow-hidden' : 'p-5'} ${className}`}
      {...props}
    />
  );
}
