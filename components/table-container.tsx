import type React from 'react';

interface TableContainerProps {
  children: React.ReactNode;
}

/** A bordered box with rounded corners around a table. */
export function TableContainer({ children }: TableContainerProps) {
  return <div className="overflow-hidden rounded-xl border">{children}</div>;
}
