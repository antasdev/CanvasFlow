type WorkspaceTopBarProps = {
  name: string;
  description?: string;
  role: string;
};

export default function WorkspaceTopBar({
  name,
  description,
  role,
}: WorkspaceTopBarProps): React.JSX.Element {
  return (
    <header
      className="
        flex
        items-center
        justify-between
        border-b
        bg-white
        px-8
        py-6
      "
    >
      <div>
        <h1
          className="
            text-2xl
            font-semibold
          "
        >
          {name}
        </h1>

        {description && (
          <p
            className="
              mt-2
              text-sm
              text-slate-500
            "
          >
            {description}
          </p>
        )}
      </div>

      <div
        className="
          flex
          items-center
          gap-3
        "
      >
        <span
          className="
            rounded-full
            bg-slate-100
            px-3
            py-1
            text-sm
            font-medium
          "
        >
          {role}
        </span>

        <button
          className="
            rounded-md
            border
            px-4
            py-2
            text-sm
            hover:bg-slate-50
          "
        >
          Invite
        </button>

        <button
          className="
            rounded-md
            border
            px-4
            py-2
            text-sm
            hover:bg-slate-50
          "
        >
          Settings
        </button>
      </div>
    </header>
  );
}