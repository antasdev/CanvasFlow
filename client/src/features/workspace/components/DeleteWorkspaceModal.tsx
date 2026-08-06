type DeleteWorkspaceModalProps = {
  isOpen:boolean;
  onClose:()=>void;
  onConfirm:()=>void;
  isDeleting:boolean;
};


export default function DeleteWorkspaceModal({
  isOpen,
  onClose,
  onConfirm,
  isDeleting,
}:DeleteWorkspaceModalProps):React.JSX.Element|null {


  if(!isOpen){
    return null;
  }


  return (
    <div
      className="
        fixed
        inset-0
        flex
        items-center
        justify-center
        bg-black/50
      "
    >

      <div
        className="
          rounded-lg
          bg-white
          p-6
        "
      >

        <h2 className="text-xl font-semibold">
          Delete Workspace?
        </h2>


        <p className="mt-3 text-gray-600">
          This action cannot be undone.
        </p>


        <div className="mt-6 flex gap-3">

          <button
            onClick={onClose}
            className="border px-4 py-2 rounded"
          >
            Cancel
          </button>


          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="
              rounded
              bg-red-600
              px-4
              py-2
              text-white
            "
          >
            {
              isDeleting
              ? "Deleting..."
              : "Delete"
            }
          </button>

        </div>

      </div>

    </div>
  );
}