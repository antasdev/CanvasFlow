import * as React from "react";

import { cn } from "@/lib/utils";

type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export default function Label({
  className,
  ...props
}: LabelProps): React.JSX.Element {
  return (
    <label
      className={cn(
        "mb-2 block text-sm font-medium text-gray-900",
        className
      )}
      {...props}
    />
  );
}