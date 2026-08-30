"use client";

import * as React from "react";
import { Image } from "next/image";
import { cn } from "@/lib/utils";

interface AvatarProps {
  src: string;
  alt?: string;
  size?: number;
  className?: string;
}

export const Avatar = ({
  src,
  alt = "User",
  size = 40,
  className,
}: AvatarProps) => {
  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={cn("rounded-full hover:opacity-80 transition-opacity", className)}
    />
  );
};

Avatar.displayName = "Avatar";