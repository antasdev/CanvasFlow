type DangerZoneProps = {
  onDelete: () => void;
};


export default function DangerZone({
  onDelete,
}: DangerZoneProps): React.JSX.Element {

  return (
    <section
      className="
        rounded-lg
        border
        border-red-300
        bg-red-50
        p-6
      "
    >

      <h2
        className="
          text-lg
          font-semibold
          text-red-700
        "
      >
        Danger Zone
      </h2>


      <p className="mt-2 text-sm text-red-600">
        Deleting this workspace is permanent.
        All related data may be removed.
      </p>


      <button
        onClick={onDelete}
        className="
          mt-4
          rounded-lg
          bg-red-600
          px-4
          py-2
          text-white
        "
      >
        Delete Workspace
      </button>

    </section>
  );
}