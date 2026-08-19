// import type { Shape } from "../types";

// import RectangleNode from "./RectangleNode";

// type ShapeRendererProps = {
//     shape: Shape;
// };

// export default function ShapeRenderer({
//     shape,
// }: ShapeRendererProps): React.JSX.Element | null {
//     switch (shape.type) {
//     case "rectangle":
//         return <RectangleNode shape={shape} />;

//     // case "circle":
//     //     return <CircleNode shape={shape} />;

//     // case "line":
//     //     return <LineNode shape={shape} />;

//     // case "text":
//     //     return <TextNode shape={shape} />;

//     default:
//         return null;
// }
// }
import type { Shape } from "../types";

import RectangleNode from "./RectangleNode";

type ShapeRendererProps = {
    shape: Shape;
};

export default function ShapeRenderer({
    shape,
}: ShapeRendererProps): React.JSX.Element | null {
    switch (shape.type) {
        case "rectangle":
            return <RectangleNode shape={shape} />;

        default:
            return null;
    }
}