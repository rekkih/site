// Both canvas and chat mount together. Share the initial request so a fresh
// visitor cannot receive two different cookies while canvas caches one token.
let inFlight: Promise<{ token: string }> | null = null;

export function getCanvasSession(): Promise<{ token: string }> {
    if (!inFlight) {
        inFlight = fetch("/api/canvas/session", { credentials: "same-origin" })
            .then(async response => {
                if (!response.ok) throw new Error("session request failed");
                return await response.json() as { token: string };
            })
            .finally(() => { inFlight = null; });
    }
    return inFlight;
}
