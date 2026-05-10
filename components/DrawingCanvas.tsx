"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { ServerEvent, Stroke, Point } from "@/lib/shared/canvas-types";
import { pageKeyFromPath } from "@/lib/shared/utils";

const ERASER_WIDTH = 30; // px, fixed size
const STROKE_SPEED = 1;   // px/ms — speed at which other users' strokes are animated
const SEND_EVERY_MS = 2000;

// Fixed canonical canvas dimensions — all strokes are stored/rendered relative to
// this size so drawings look identical across every screen size. On smaller
// viewports the canvas is simply cropped (off-screen content is fine).
const CANVAS_W = 1920;
const CANVAS_H = 1920;

export default function DrawingCanvas() {
    const pathname = usePathname();
    const pageKey = pageKeyFromPath(pathname);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const clearBtnRef = useRef<HTMLButtonElement>(null);
    const eraseBtnRef = useRef<HTMLButtonElement>(null);
    const eraseCursorRef = useRef<HTMLDivElement>(null);

    useEffect(() => { // eslint-disable-line react-hooks/exhaustive-deps
        const canvas = canvasRef.current;
        const clearBtn = clearBtnRef.current;
        const eraseBtn = eraseBtnRef.current;
        const eraseCursor = eraseCursorRef.current;
        if (!canvas || !clearBtn || !eraseBtn || !eraseCursor) return;

        const ctx = canvas.getContext("2d")!;
        // Performance optimizations
        ctx.imageSmoothingEnabled = false;

        // modToken is still needed to authenticate requests (clear, erase)
        const modToken = localStorage.getItem("canvas-mod-token");
        // isMod is set by the server via the init event — localStorage is not the source of truth
        let isMod = false;

        // State
        const allStrokes: Stroke[] = [];
        const drawnIds = new Set<string>();
        let myColor = "rgba(27,26,23)";
        let token: string | null = null;
        let hasDrawn = false;
        let eraseMode = false;
        // Incremented whenever a clear or init arrives; in-flight animations check this
        // against the value they captured at start and self-cancel when it changes.
        let animGeneration = 0;

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

        // Animate a single stroke being drawn incrementally at `pxPerMs` pixels/millisecond.
        // Captures the current animGeneration and stops itself if it changes (clear/init).
        function animateStroke(s: Stroke, pxPerMs: number, onDone?: () => void) {
            const gen = animGeneration;
            const w = canvas!.width;
            const h = canvas!.height;
            const pts = s.points;
            if (pts.length < 2) { onDone?.(); return; }

            function setup() {
                if (s.erase) {
                    ctx.globalCompositeOperation = "destination-out";
                    ctx.strokeStyle = "rgba(0,0,0,1)";
                } else {
                    ctx.globalCompositeOperation = "source-over";
                    ctx.strokeStyle = s.color;
                }
                ctx.lineWidth = s.width;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";
            }

            function drawSegment(i: number) {
                setup();
                if (i === 1) {
                    const p0 = pts[0], p1 = pts[1];
                    ctx.beginPath();
                    ctx.moveTo(p0.x * w, p0.y * h);
                    ctx.lineTo(p1.x * w, p1.y * h);
                    ctx.stroke();
                } else {
                    const pp = pts[i - 2], p0 = pts[i - 1], p1 = pts[i];
                    const midPrev = { x: (pp.x + p0.x) / 2, y: (pp.y + p0.y) / 2 };
                    const midCurr = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
                    ctx.beginPath();
                    ctx.moveTo(midPrev.x * w, midPrev.y * h);
                    ctx.quadraticCurveTo(p0.x * w, p0.y * h, midCurr.x * w, midCurr.y * h);
                    ctx.stroke();
                }
                ctx.globalCompositeOperation = "source-over";
            }

            let idx = 1;
            let lastTs: number | null = null;

            function frame(ts: number) {
                if (animGeneration !== gen) return; // cancelled by clear / init
                if (lastTs === null) lastTs = ts;
                const dt = Math.min(ts - lastTs, 100); // cap to avoid big jump after tab switch
                lastTs = ts;

                let budget = pxPerMs * dt;
                // Always draw at least one segment per frame so the first frame isn't blank
                do {
                    if (idx >= pts.length) break;
                    const p0 = pts[idx - 1], p1 = pts[idx];
                    budget -= Math.hypot((p1.x - p0.x) * w, (p1.y - p0.y) * h);
                    drawSegment(idx);
                    idx++;
                } while (budget > 0 && idx < pts.length);

                if (idx < pts.length) {
                    requestAnimationFrame(frame);
                } else {
                    onDone?.();
                }
            }

            requestAnimationFrame(frame);
        }

        // Replay historical strokes one by one at STROKE_SPEED.
        function replayStrokes(strokes: Stroke[]) {
            if (strokes.length === 0) return;
            const gen = animGeneration;
            let i = 0;
            function next() {
                if (animGeneration !== gen || i >= strokes.length) return;
                animateStroke(strokes[i], STROKE_SPEED, () => { i++; next(); });
            }
            next();
        }

        // Fixed canvas size — no resize needed.
        canvas.width = CANVAS_W;
        canvas.height = CANVAS_H;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        renderAll();

        // Convert viewport client coordinates to canvas-local coordinates.
        function clientToCanvas(cx: number, cy: number) {
            const rect = canvas!.getBoundingClientRect();
            return { x: cx - rect.left, y: cy - rect.top };
        }

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
        // Index into pts[] of the first point not yet submitted to the server.
        // Kept at pts.length - 1 after each periodic flush so the next segment
        // starts from the last submitted point, maintaining visual continuity.
        let lastSentPtIdx = 0;
        let strokeIntervalId: ReturnType<typeof setInterval> | null = null;

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
            showClearBtn();
        }

        function submitPartialStroke() {
            if (!drawing || pts.length - lastSentPtIdx < 2) return;
            const slice = pts.slice(lastSentPtIdx);
            // Overlap: next segment starts from the last point of this one.
            lastSentPtIdx = pts.length - 1;

            const MAX = 600;
            const step = Math.max(1, Math.ceil(slice.length / MAX));
            const points: Point[] = [];
            for (let i = 0; i < slice.length; i += step) {
                points.push({ x: slice[i].x, y: slice[i].y });
            }
            const last = slice[slice.length - 1];
            if (points[points.length - 1] !== last) points.push({ x: last.x, y: last.y });
            if (points.length < 2) return;
            sendStroke(points, eraseMode ? ERASER_WIDTH : liveWidth, eraseMode);
        }

        function beginStroke(cx: number, cy: number) {
            drawing = true;
            smoothSpd = 0;
            liveWidth = eraseMode ? ERASER_WIDTH : 1.5;
            const { x, y } = clientToCanvas(cx, cy);
            pts = [{ x: x / canvas!.width, y: y / canvas!.height, t: performance.now() }];
            lastSentPtIdx = 0;
            if (strokeIntervalId) clearInterval(strokeIntervalId);
            strokeIntervalId = setInterval(submitPartialStroke, SEND_EVERY_MS);
        }

        function extendStroke(cx: number, cy: number) {
            if (!drawing) return;
            const w = canvas!.width;
            const h = canvas!.height;
            const now = performance.now();
            const { x: cx2, y: cy2 } = clientToCanvas(cx, cy);
            pts.push({ x: cx2 / w, y: cy2 / h, t: now });
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
            if (strokeIntervalId) { clearInterval(strokeIntervalId); strokeIntervalId = null; }
            // Flush any pending draw before ending
            if (rafId && pendingDraw) {
                flushDraw();
            }
            const captured = pts;
            pts = [];

            // Only send points that haven't been submitted yet by the interval.
            const slice = captured.slice(lastSentPtIdx);
            lastSentPtIdx = 0;
            if (slice.length < 2) return;

            const MAX = 600;
            const step = Math.max(1, Math.ceil(slice.length / MAX));
            const points: Point[] = [];
            for (let i = 0; i < slice.length; i += step) {
                points.push({ x: slice[i].x, y: slice[i].y });
            }
            const last = slice[slice.length - 1];
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
                await fetch(`/api/canvas/stroke?page=${pageKey}`, {
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
                await fetch(`/api/canvas/clear?page=${pageKey}`, {
                    method: "POST",
                    headers: { "x-canvas-token": token, "x-mod-token": modToken },
                });
            } catch (err) {
                console.warn("[canvas] clear failed", err);
            }
        }

        function clearLocally() {
            animGeneration++; // cancel all in-flight animations
            allStrokes.length = 0;
            drawnIds.clear();
            hasDrawn = false;
            hideClearBtn();
            ctx.clearRect(0, 0, canvas!.width, canvas!.height);
        }

        // Erase mode (mod only)
        function setEraseMode(on: boolean) {
            eraseMode = on;
            eraseBtn!.textContent = on ? "draw" : "erase";
            eraseBtn!.setAttribute("aria-pressed", String(on));
            document.body.style.cursor = on ? "none" : "";
            eraseCursor!.style.display = on ? "block" : "none";
        }

        function onEraseToggle() {
            setEraseMode(!eraseMode);
        }

        function moveEraseCursor(x: number, y: number) {
            eraseCursor!.style.left = `${x}px`;
            eraseCursor!.style.top = `${y}px`;
        }

        // eraseBtn visibility is updated when the server confirms isMod in handleEvent

        // Server-Sent Events for live updates
        let es: EventSource | null = null;

        function handleEvent(evt: ServerEvent) {
            if (evt.type === "init") {
                myColor = evt.you.color;
                isMod = evt.isMod;
                eraseBtn!.style.display = isMod ? "block" : "none";
                animGeneration++; // cancel any replay in progress
                allStrokes.length = 0;
                drawnIds.clear();
                for (const s of evt.strokes) {
                    allStrokes.push(s);
                    drawnIds.add(s.id);
                }
                ctx.clearRect(0, 0, canvas!.width, canvas!.height);
                canvas!.style.opacity = "1";
                if (allStrokes.length > 0) {
                    hasDrawn = true;
                    showClearBtn();
                    replayStrokes(allStrokes);
                }
            } else if (evt.type === "stroke") {
                if (drawnIds.has(evt.stroke.id)) return;
                drawnIds.add(evt.stroke.id);
                allStrokes.push(evt.stroke);
                animateStroke(evt.stroke, STROKE_SPEED);
                onFirstDraw();
                showClearBtn();
            } else if (evt.type === "clear") {
                clearLocally();
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
            es = new EventSource(`/api/canvas/stream?page=${pageKey}${modToken ? `&token=${encodeURIComponent(modToken)}` : ''}`);
            es.onmessage = (ev) => {
                try { handleEvent(JSON.parse(ev.data) as ServerEvent); } catch { /* ignore */ }
            };
        }
        init();
        // Fallback: ensure canvas fades in even if the init event is slow or missing
        const fadeInTimer = setTimeout(() => { canvas.style.opacity = "1"; }, 1500);

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
        let longPressTimer: ReturnType<typeof setTimeout> | null = null;
        let longPressTouch: { x: number; y: number } | null = null;

        function cancelLongPress() {
            if (longPressTimer !== null) { clearTimeout(longPressTimer); longPressTimer = null; }
            longPressTouch = null;
        }

        const onTouchStart = (e: TouchEvent) => {
            const t = e.touches[0];
            if (!t) return;
            // Don't prevent default yet — wait to see if this becomes a long press
            longPressTouch = { x: t.clientX, y: t.clientY };
            longPressTimer = setTimeout(() => {
                longPressTimer = null;
                if (!longPressTouch) return;
                // Vibrate briefly as haptic feedback if supported
                if (navigator.vibrate) navigator.vibrate(30);
                beginStroke(longPressTouch.x, longPressTouch.y);
                longPressTouch = null;
            }, 400);
        };
        const onTouchMove = (e: TouchEvent) => {
            const t = e.touches[0];
            if (!t) return;
            if (longPressTimer !== null && longPressTouch) {
                // If finger moved more than ~8px, cancel the long-press
                const dx = t.clientX - longPressTouch.x;
                const dy = t.clientY - longPressTouch.y;
                if (dx * dx + dy * dy > 64) cancelLongPress();
            }
            if (!drawing) return;
            e.preventDefault();
            scheduleDraw(t.clientX, t.clientY);
            if (eraseMode) moveEraseCursor(t.clientX, t.clientY);
        };
        const onTouchEnd = () => { cancelLongPress(); endStroke(); };
        const onKeyDown = (e: KeyboardEvent) => {
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
        document.addEventListener("keydown", onKeyDown);
        clearBtn.addEventListener("click", requestClear);
        eraseBtn.addEventListener("click", onEraseToggle);

        return () => {
            if (rafId) cancelAnimationFrame(rafId);
            if (strokeIntervalId) clearInterval(strokeIntervalId);
            document.removeEventListener("mousedown", onMouseDown);
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            document.removeEventListener("mouseleave", onMouseLeave);
            document.removeEventListener("mouseenter", onMouseEnter);
            document.removeEventListener("touchstart", onTouchStart);
            document.removeEventListener("touchmove", onTouchMove);
            document.removeEventListener("touchend", onTouchEnd);
            document.removeEventListener("keydown", onKeyDown);
            clearBtn.removeEventListener("click", requestClear);
            eraseBtn.removeEventListener("click", onEraseToggle);
            cancelLongPress();
            clearTimeout(fadeInTimer);
            document.body.style.cursor = "";
            es?.close();
        };
    }, [pageKey]);

    return (
        <>
            <canvas
                ref={canvasRef}
                aria-hidden="true"
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-crosshair -z-1 pointer-events-none"
                style={{ opacity: 0 }}
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

            {/* Mod controls (clear + erase toggle) */}
            <div className="fixed bottom-6 left-6 z-10 flex items-center gap-4">
                <button
                    ref={clearBtnRef}
                    aria-label="Clear drawing"
                    className="text-sm text-muted-foreground opacity-0 pointer-events-none transition-opacity duration-200 hover:text-foreground cursor-pointer"
                >
                    clear ✕
                </button>
                <button
                    ref={eraseBtnRef}
                    aria-label="Toggle erase mode"
                    aria-pressed="false"
                    className="text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground cursor-pointer aria-pressed:text-foreground"
                    style={{ display: "none" }}
                >
                    erase
                </button>
            </div>
        </>
    );
}
