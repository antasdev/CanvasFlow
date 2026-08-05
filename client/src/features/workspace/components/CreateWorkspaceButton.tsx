type CreateWorkspaceButtonProps = {
  onClick: () => void;
};

export function CreateWorkspaceButton({
  onClick,
}: CreateWorkspaceButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="
        rounded-lg
        bg-black
        px-4
        py-2
        text-white
        transition-colors
        hover:bg-gray-800
      "
    >
      + Create Workspace
    </button>
  );
}