"use client";

import { useEffect, useRef } from "react";
import type { ServerEvent, Stroke, Point } from "@/lib/canvas-types";
import { useUserCount } from "@/components/UserCountContext";

const ERASER_WIDTH = 30; // px, fixed size

export default function DrawingCanvas() {
    const { setCount: setUserCount } = useUserCount();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const clearBtnRef = useRef<HTMLButtonElement>(null);
    const eraseBtnRef = useRef<HTMLButtonElement>(null);
    const hintRef = useRef<HTMLDivElement>(null);
    const eraseCursorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const clearBtn = clearBtnRef.current;
        const eraseBtn = eraseBtnRef.current;
        const hint = hintRef.current;
        const eraseCursor = eraseCursorRef.current;
        if (!canvas || !clearBtn || !eraseBtn || !hint || !eraseCursor) return;

        const ctx = canvas.getContext("2d")!;
        // Performance optimizations
        ctx.imageSmoothingEnabled = false;

        // Check for mod token (stored by /dev/canvas-mod)
        const modToken = localStorage.getItem("canvas-mod-token");
        const isMod = !!modToken;

        // State
        const allStrokes: Stroke[] = [];
        const drawnIds = new Set<string>();
        let myColor = "rgba(27,26,23)";
        let token: string | null = null;
        let hasDrawn = false;
        let eraseMode = false;

        // Rendering functions
        function drawStroke(s: Stroke) {
            const w = canvas!.width;
            const h = canvas!.height;
            const pts = s.points;
            if (pts.length < 2) return;

            if (s.erase) {
                ctx.globalCompositeOperation = "destination-out";
                ctx.strokeStyle = "rgba(0,0,0,1)"; // alpha is all that matters
            } else {
                ctx.globalCompositeOperation = "source-over";
                ctx.strokeStyle = s.color;
            }
            ctx.lineWidth = s.width;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            ctx.beginPath();
            ctx.moveTo(pts[0].x * w, pts[0].y * h);
            for (let i = 1; i < pts.length - 1; i++) {
                const p0 = pts[i];
                const p1 = pts[i + 1];
                ctx.quadraticCurveTo(
                    p0.x * w, p0.y * h,
                    ((p0.x + p1.x) / 2) * w,
                    ((p0.y + p1.y) / 2) * h,
                );
            }
            ctx.lineTo(pts[pts.length - 1].x * w, pts[pts.length - 1].y * h);
            ctx.stroke();

            ctx.globalCompositeOperation = "source-over";
        }

        function renderAll() {
            ctx.clearRect(0, 0, canvas!.width, canvas!.height);
            for (const s of allStrokes) drawStroke(s);
        }

        // Debounced resize handler to prevent thrashing
        let resizeRafId: number | null = null;
        const RESIZE_DEBOUNCE_MS = 100;

        function resize() {
            if (resizeRafId) cancelAnimationFrame(resizeRafId);
            resizeRafId = requestAnimationFrame(() => {
                canvas!.width = window.innerWidth;
                canvas!.height = window.innerHeight;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";
                renderAll();
            });
        }
        resize();
        window.addEventListener("resize", resize);

        // Clear button visibility (mod only)
        function showClearBtn() {
            if (!isMod) return;
            clearBtn!.style.opacity = "1";
            clearBtn!.style.pointerEvents = "auto";
        }
        function hideClearBtn() {
            clearBtn!.style.opacity = "0";
            clearBtn!.style.pointerEvents = "none";
        }

        // Local drawing state
        let drawing = false;
        let pts: Array<Point & { t: number }> = [];
        let smoothSpd = 0;
        let liveWidth = 1.5;

        // Throttled drawing state
        let pendingDraw: { x: number; y: number } | null = null;
        let rafId: number | null = null;

        function flushDraw() {
            if (pendingDraw) {
                extendStroke(pendingDraw.x, pendingDraw.y);
                pendingDraw = null;
            }
            rafId = null;
        }

        function scheduleDraw(x: number, y: number) {
            pendingDraw = { x, y };
            if (!rafId) rafId = requestAnimationFrame(flushDraw);
        }

        function onFirstDraw() {
            if (hasDrawn) return;
            hasDrawn = true;
            hint!.style.opacity = "0";
            hint!.style.pointerEvents = "none";
            showClearBtn();
        }

        function beginStroke(cx: number, cy: number) {
            drawing = true;
            smoothSpd = 0;
            liveWidth = eraseMode ? ERASER_WIDTH : 1.5;
            pts = [{ x: cx / canvas!.width, y: cy / canvas!.height, t: performance.now() }];
        }

        function extendStroke(cx: number, cy: number) {
            if (!drawing) return;
            const w = canvas!.width;
            const h = canvas!.height;
            const now = performance.now();
            pts.push({ x: cx / w, y: cy / h, t: now });
            if (pts.length < 2) return;

            const p0 = pts[pts.length - 2];
            const p1 = pts[pts.length - 1];

            if (!eraseMode) {
                const dt = Math.max(p1.t - p0.t, 1);
                const dist = Math.hypot((p1.x - p0.x) * w, (p1.y - p0.y) * h);
                smoothSpd = smoothSpd * 0.6 + (dist / dt) * 0.4;
                liveWidth = Math.max(1.5, Math.min(5, 3.5 / (smoothSpd * 0.15 + 0.7)));
                ctx.globalCompositeOperation = "source-over";
                ctx.strokeStyle = myColor;
                ctx.lineWidth = liveWidth;
            } else {
                ctx.globalCompositeOperation = "destination-out";
                ctx.strokeStyle = "rgba(0,0,0,1)";
                ctx.lineWidth = ERASER_WIDTH;
            }
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            if (pts.length === 2) {
                ctx.beginPath();
                ctx.moveTo(p0.x * w, p0.y * h);
                ctx.lineTo(p1.x * w, p1.y * h);
                ctx.stroke();
            } else {
                const pp = pts[pts.length - 3];
                const midPrev = { x: (pp.x + p0.x) / 2, y: (pp.y + p0.y) / 2 };
                const midCurr = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
                ctx.beginPath();
                ctx.moveTo(midPrev.x * w, midPrev.y * h);
                ctx.quadraticCurveTo(p0.x * w, p0.y * h, midCurr.x * w, midCurr.y * h);
                ctx.stroke();
            }

            ctx.globalCompositeOperation = "source-over";
            onFirstDraw();
        }

        function endStroke() {
            if (!drawing) return;
            drawing = false;
            // Flush any pending draw before ending
            if (rafId && pendingDraw) {
                flushDraw();
            }
            const captured = pts;
            pts = [];

            const MAX = 600;
            const step = Math.max(1, Math.ceil(captured.length / MAX));
            const points: Point[] = [];
            for (let i = 0; i < captured.length; i += step) {
                points.push({ x: captured[i].x, y: captured[i].y });
            }
            const last = captured[captured.length - 1];
            if (points[points.length - 1] !== last) points.push({ x: last.x, y: last.y });
            if (points.length < 2) return;

            sendStroke(points, eraseMode ? ERASER_WIDTH : liveWidth, eraseMode);
        }

        async function sendStroke(points: Point[], width: number, erase = false) {
            if (!token) return;
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
                "x-canvas-token": token,
            };
            if (erase && modToken) headers["x-mod-token"] = modToken;
            try {
                await fetch("/api/canvas/stroke", {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ points, width, ...(erase && { erase: true }) }),
                });
            } catch (err) {
                console.warn("[canvas] stroke send failed", err);
            }
        }

        async function requestClear() {
            if (!token || !isMod || !modToken) return;
            try {
                await fetch("/api/canvas/clear", {
                    method: "POST",
                    headers: { "x-canvas-token": token, "x-mod-token": modToken },
                });
            } catch (err) {
                console.warn("[canvas] clear failed", err);
            }
        }

        function clearLocally() {
            allStrokes.length = 0;
            drawnIds.clear();
            hasDrawn = false;
            hideClearBtn();
            renderAll();
        }

        // Erase mode (mod only)
        function setEraseMode(on: boolean) {
            eraseMode = on;
            eraseBtn!.textContent = on ? "draw" : "erase";
            eraseBtn!.setAttribute("aria-pressed", String(on));
            document.body.style.cursor = on ? "none" : "";
            eraseCursor!.style.display = on ? "block" : "none";
        }

        function moveEraseCursor(x: number, y: number) {
            eraseCursor!.style.left = `${x}px`;
            eraseCursor!.style.top = `${y}px`;
        }

        if (isMod) eraseBtn.style.display = "block";

        // Server-Sent Events for live updates
        let es: EventSource | null = null;

        function handleEvent(evt: ServerEvent) {
            if (evt.type === "init") {
                myColor = evt.you.color;
                allStrokes.length = 0;
                drawnIds.clear();
                for (const s of evt.strokes) {
                    allStrokes.push(s);
                    drawnIds.add(s.id);
                }
                if (allStrokes.length > 0) {
                    hasDrawn = true;
                    showClearBtn();
                }
                renderAll();
            } else if (evt.type === "stroke") {
                if (drawnIds.has(evt.stroke.id)) return;
                drawnIds.add(evt.stroke.id);
                allStrokes.push(evt.stroke);
                drawStroke(evt.stroke);
                onFirstDraw();
                showClearBtn();
            } else if (evt.type === "clear") {
                clearLocally();
            } else if (evt.type === "count") {
                setUserCount(evt.count);
            }
        }

        async function init() {
            try {
                const r = await fetch("/api/canvas/session", { credentials: "same-origin" });
                if (r.ok) {
                    const data = await r.json();
                    token = data.token;
                }
            } catch (err) {
                console.warn("[canvas] session failed", err);
            }
            es = new EventSource("/api/canvas/stream");
            es.onmessage = (ev) => {
                try { handleEvent(JSON.parse(ev.data) as ServerEvent); } catch { /* ignore */ }
            };
        }
        init();

        // Heartbeat ping every 5 seconds to track active connections
        const pingInterval = setInterval(async () => {
            fetch("/api/canvas/stream", { method: "POST", credentials: "same-origin" }).catch(() => { /* ignore */ });
        }, 5000);

        // Input event handlers
        const onMouseDown = (e: MouseEvent) => beginStroke(e.clientX, e.clientY);
        const onMouseMove = (e: MouseEvent) => {
            scheduleDraw(e.clientX, e.clientY);
            if (eraseMode) moveEraseCursor(e.clientX, e.clientY);
        };
        const onMouseUp = () => endStroke();
        const onMouseLeave = () => {
            endStroke();
            eraseCursor!.style.display = "none";
        };
        const onMouseEnter = () => {
            if (eraseMode) eraseCursor!.style.display = "block";
        };
        const onTouchStart = (e: TouchEvent) => {
            const t = e.touches[0]; if (t) beginStroke(t.clientX, t.clientY);
        };
        const onTouchMove = (e: TouchEvent) => {
            const t = e.touches[0];
            if (t) {
                scheduleDraw(t.clientX, t.clientY);
                if (eraseMode) moveEraseCursor(t.clientX, t.clientY);
            }
        };
        const onTouchEnd = () => endStroke();
        const onDblClick = () => requestClear();
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") requestClear();
            // E toggles erase mode for mods
            if ((e.key === "e" || e.key === "E") && isMod && !e.metaKey && !e.ctrlKey) {
                setEraseMode(!eraseMode);
            }
        };

        document.addEventListener("mousedown", onMouseDown);
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        document.addEventListener("mouseleave", onMouseLeave);
        document.addEventListener("mouseenter", onMouseEnter);
        document.addEventListener("touchstart", onTouchStart, { passive: false });
        document.addEventListener("touchmove", onTouchMove, { passive: false });
        document.addEventListener("touchend", onTouchEnd);
        document.addEventListener("dblclick", onDblClick);
        document.addEventListener("keydown", onKeyDown);
        clearBtn.addEventListener("click", requestClear);
        eraseBtn.addEventListener("click", () => setEraseMode(!eraseMode));

        const hintTimer = setTimeout(() => {
            hint.style.opacity = "0";
            hint.style.pointerEvents = "none";
        }, 5000);

        return () => {
            if (resizeRafId) cancelAnimationFrame(resizeRafId);
            if (rafId) cancelAnimationFrame(rafId);
            window.removeEventListener("resize", resize);
            document.removeEventListener("mousedown", onMouseDown);
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            document.removeEventListener("mouseleave", onMouseLeave);
            document.removeEventListener("mouseenter", onMouseEnter);
            document.removeEventListener("touchstart", onTouchStart);
            document.removeEventListener("touchmove", onTouchMove);
            document.removeEventListener("touchend", onTouchEnd);
            document.removeEventListener("dblclick", onDblClick);
            document.removeEventListener("keydown", onKeyDown);
            clearTimeout(hintTimer);
            clearInterval(pingInterval);
            document.body.style.cursor = "";
            es?.close();
        };
    }, []);

    return (
        <>
            <canvas
                ref={canvasRef}
                aria-hidden="true"
                className="fixed inset-0 w-full h-full cursor-crosshair z-0 pointer-events-none"
            />

            {/* Erase cursor — circle that tracks the mouse, only shown in erase mode */}
            <div
                ref={eraseCursorRef}
                aria-hidden="true"
                className="fixed z-20 pointer-events-none rounded-full border border-foreground/50"
                style={{
                    width: ERASER_WIDTH,
                    height: ERASER_WIDTH,
                    display: "none",
                    transform: "translate(-50%, -50%)",
                }}
            />

            <div
                ref={hintRef}
                className="fixed bottom-6 right-6 z-10 flex items-center gap-1.5 text-xs text-muted-foreground select-none pointer-events-none transition-opacity duration-500"
            >
                <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                </svg>
                draw on me
            </div>

            {/* Mod controls (clear + erase toggle) */}
            <div className="fixed bottom-6 left-6 z-10 flex items-center gap-4">
                <button
                    ref={clearBtnRef}
                    aria-label="Clear drawing"
                    className="text-xs text-muted-foreground opacity-0 pointer-events-none transition-opacity duration-200 hover:text-foreground cursor-pointer"
                >
                    clear ✕
                </button>
                <button
                    ref={eraseBtnRef}
                    aria-label="Toggle erase mode"
                    aria-pressed="false"
                    className="text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground cursor-pointer aria-pressed:text-foreground"
                    style={{ display: "none" }}
                >
                    erase
                </button>
            </div>
        </>
    );
}
