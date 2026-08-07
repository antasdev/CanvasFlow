import { Button } from "@/components/ui";

type EmptyBoardStateProps = {
  onCreate: () => void;
};

export const EmptyBoardState = ({
  onCreate,
}: EmptyBoardStateProps): React.JSX.Element => {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
        <span className="text-2xl text-gray-600">+</span>
      </div>

      <h2 className="text-lg font-semibold text-gray-900">
        No boards yet
      </h2>

      <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">
        Create your first board to start organizing ideas,
        planning projects, and collaborating with your team.
      </p>

      <Button
        type="button"
        onClick={onCreate}
        className="mt-6 w-auto"
      >
        Create Board
      </Button>
    </div>
  );
};