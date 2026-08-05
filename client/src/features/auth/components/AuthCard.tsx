import type { ReactNode } from "react";

type AuthCardProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export default function AuthCard({
  title,
  subtitle,
  children,
}: AuthCardProps): React.JSX.Element {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
      <header className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">
          {title}
        </h2>

        {subtitle && (
          <p className="mt-2 text-sm text-gray-500">
            {subtitle}
          </p>
        )}
      </header>

      {children}
    </section>
  );
}