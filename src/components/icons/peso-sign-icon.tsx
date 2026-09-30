
import type { SVGProps } from 'react';

export function PesoSignIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M10 7h5.5a4.5 4.5 0 0 1 0 9H10V7z" />
      <line x1="8" y1="10" x2="12" y2="10" />
      <line x1="8" y1="14" x2="12" y2="14" />
    </svg>
  );
}
