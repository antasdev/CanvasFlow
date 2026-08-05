import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export default function Button({
  className,
  type = "button",
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex w-full items-center justify-center rounded-md",
        "bg-gray-900 px-4 py-2 text-sm font-medium text-white",
        "transition-colors",
        "hover:bg-gray-800",
        "focus:outline-none focus:ring-2 focus:ring-gray-900/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}