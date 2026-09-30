import Image from 'next/image';
import type { HTMLAttributes } from 'react';
import { cn } from "@/lib/utils";

interface EZLitePayLogoIconProps extends HTMLAttributes<HTMLDivElement> {
  alt?: string;
  src?: string | null;
}

const DEFAULT_LOGO_URL = "https://i.ibb.co/QjnMdhfN/App-Logo-v1.png";

export function EZLitePayLogoIcon({ className, alt = "EZLitePay Logo", src, ...props }: EZLitePayLogoIconProps) {
  const logoSrc = src || DEFAULT_LOGO_URL;

  return (
    <div className={cn("relative", className)} {...props}>
      <Image
        src={logoSrc}
        alt={alt}
        fill
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        style={{ objectFit: "contain" }}
        priority
      />
    </div>
  );
}
