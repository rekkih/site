// Coordinates normalized to [0,1] for consistent rendering across viewports.
export type Point = { x: number; y: number };

export type Stroke = {
    id: string;
    userId: string;
    color: string;
    width: number;
    points: Point[];
    ts: number;
    erase?: boolean;
};

export type ServerEvent =
    | { type: "init"; you: { userId: string; color: string }; strokes: Stroke[]; isMod: boolean }
    | { type: "stroke"; stroke: Stroke }
    | { type: "clear"; by: string }
    | { type: "count"; count: number }; // number of other connected users
