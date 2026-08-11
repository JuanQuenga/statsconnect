import type { CSSProperties, ImgHTMLAttributes } from "react";

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height"> & {
  src: string;
  width?: number | string;
  height?: number | string;
  priority?: boolean;
  fill?: boolean;
};

const fillStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
};

export default function Image({ priority = false, fill = false, style, ...props }: ImageProps) {
  return (
    <img
      {...props}
      loading={priority ? "eager" : props.loading ?? "lazy"}
      fetchPriority={priority ? "high" : props.fetchPriority}
      style={fill ? { ...fillStyle, ...style } : style}
    />
  );
}
