import { ImageOff } from "lucide-react";
import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ImageWithFallbackProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
  fallbackSrc?: string | null;
};

export function ImageWithFallback({
  src,
  fallbackSrc,
  alt,
  className,
  onError,
  ...props
}: ImageWithFallbackProps) {
  const [activeSrc, setActiveSrc] = useState<string | null>(src || fallbackSrc || null);

  useEffect(() => {
    setActiveSrc(src || fallbackSrc || null);
  }, [src, fallbackSrc]);

  if (!activeSrc) {
    return (
      <span
        role="img"
        aria-label={alt || "Image unavailable"}
        className={cn("grid place-items-center bg-secondary text-muted-foreground", className)}
      >
        <ImageOff className="size-5" aria-hidden />
      </span>
    );
  }

  return (
    <img
      {...props}
      src={activeSrc}
      alt={alt}
      className={className}
      onError={(event) => {
        onError?.(event);
        if (fallbackSrc && activeSrc !== fallbackSrc) {
          setActiveSrc(fallbackSrc);
        } else {
          setActiveSrc(null);
        }
      }}
    />
  );
}
