import type { ReactNode } from "react";

type AuthLayoutProps = {
  children: ReactNode;
};

export default function AuthLayout({
  children,
}: AuthLayoutProps): React.JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            CanvasFlow
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            Collaborative Whiteboard
          </p>
        </div>

        {children}
      </div>
    </main>
  );
}