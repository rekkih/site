"use client";

import { useEffect, useRef, useState } from "react";
import type { Point } from "@/lib/shared/canvas-types";

// Self-contained drawing pad + template manager. Coordinates are stored
// in normalized [0,1] space so they share a coordinate system with the
// real canvas + the saved templates in KV.

type SavedTemplate = { id: string; name: string; raw: Point[] };

const PAD_SIZE = 360;

export default function ModTool() {
    const [token, setToken] = useState<string | null>(null);
    const [tokenInput, setTokenInput] = useState("");
    const [templates, setTemplates] = useState<SavedTemplate[]>([]);
    const [name, setName] = useState("");
    const [status, setStatus] = useState<string>("");
    const [score, setScore] = useState<{
        score: number;
        templateName?: string;
        threshold: number;
    } | null>(null);

    // strokes drawn in the pad, normalized to [0,1] over PAD_SIZE.
    const strokesRef = useRef<Point[][]>([]);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef(false);

    // -- token bootstrap from localStorage -----------------------------
    useEffect(() => {
        const t = localStorage.getItem("canvas-mod-token");
        if (t) setToken(t);
    }, []);

    // -- draw helpers --------------------------------------------------
    function repaint() {
        const c = canvasRef.current;
        if (!c) return;
        const ctx = c.getContext("2d")!;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#1b1a17";
        ctx.lineWidth = 3;
        for (const s of strokesRef.current) {
            if (s.length < 2) continue;
            ctx.beginPath();
            ctx.moveTo(s[0].x * c.width, s[0].y * c.height);
            for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x * c.width, s[i].y * c.height);
            ctx.stroke();
        }
    }

    useEffect(() => {
        repaint();
    });

    function ptFromEvent(e: React.PointerEvent<HTMLCanvasElement>): Point {
        const c = canvasRef.current!;
        const rect = c.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width,
            y: (e.clientY - rect.top) / rect.height,
        };
    }

    function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
        e.currentTarget.setPointerCapture(e.pointerId);
        drawingRef.current = true;
        strokesRef.current.push([ptFromEvent(e)]);
        repaint();
    }
    function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
        if (!drawingRef.current) return;
        const cur = strokesRef.current[strokesRef.current.length - 1];
        cur.push(ptFromEvent(e));
        repaint();
    }
    function onUp() {
        drawingRef.current = false;
    }

    function clearPad() {
        strokesRef.current = [];
        setScore(null);
        repaint();
    }

    // -- API calls -----------------------------------------------------
    async function api(input: string, init: RequestInit = {}) {
        if (!token) throw new Error("no token");
        const headers = new Headers(init.headers);
        headers.set("x-mod-token", token);
        if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
        const res = await fetch(input, { ...init, headers });
        if (res.status === 403) {
            setToken(null);
            localStorage.removeItem("canvas-mod-token");
            throw new Error("forbidden");
        }
        return res;
    }

    async function loadTemplates() {
        try {
            const r = await api("/api/canvas/mod-templates");
            const j = await r.json();
            setTemplates(j.templates ?? []);
        } catch (e) {
            setStatus(`load failed: ${(e as Error).message}`);
        }
    }

    useEffect(() => {
        if (token) loadTemplates();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    async function saveTemplate() {
        if (!name.trim()) { setStatus("name required"); return; }
        if (strokesRef.current.length === 0) { setStatus("draw something first"); return; }
        try {
            const r = await api("/api/canvas/mod-templates", {
                method: "POST",
                body: JSON.stringify({ name: name.trim(), strokes: strokesRef.current }),
            });
            const j = await r.json();
            if (!r.ok) { setStatus(`save failed: ${j.error}`); return; }
            setStatus(j.persisted ? "saved" : "saved (in-memory only -- KV not configured)");
            setName("");
            clearPad();
            await loadTemplates();
        } catch (e) {
            setStatus(`save failed: ${(e as Error).message}`);
        }
    }

    async function deleteTemplate(id: string) {
        if (!confirm("Delete this template?")) return;
        try {
            await api(`/api/canvas/mod-templates?id=${encodeURIComponent(id)}`, { method: "DELETE" });
            await loadTemplates();
        } catch (e) {
            setStatus(`delete failed: ${(e as Error).message}`);
        }
    }

    async function testCurrent() {
        if (strokesRef.current.length === 0) { setStatus("draw something first"); return; }
        try {
            const r = await api("/api/canvas/mod-test", {
                method: "POST",
                body: JSON.stringify({ strokes: strokesRef.current }),
            });
            const j = await r.json();
            setScore(j);
            setStatus("");
        } catch (e) {
            setStatus(`test failed: ${(e as Error).message}`);
        }
    }

    // -- token gate ----------------------------------------------------
    if (!token) {
        return (
            <div className="min-h-screen flex items-center justify-center p-8">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!tokenInput.trim()) return;
                        localStorage.setItem("canvas-mod-token", tokenInput.trim());
                        setToken(tokenInput.trim());
                    }}
                    className="flex flex-col gap-3 w-full max-w-sm"
                >
                    <h1 className="font-serif text-xl">Canvas moderation</h1>
                    <p className="text-xs text-muted-foreground">
                        Enter the <code>CANVAS_MOD_TOKEN</code> set on the server.
                    </p>
                    <input
                        type="password"
                        autoFocus
                        value={tokenInput}
                        onChange={(e) => setTokenInput(e.target.value)}
                        className="btn-muted-sm"
                        placeholder="token"
                    />
                    <button type="submit" className="btn-muted">
                        Continue
                    </button>
                </form>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-8 max-w-3xl mx-auto">
            <header className="mb-8 flex items-baseline justify-between">
                <h1 className="font-serif text-2xl">Canvas moderation</h1>
                <button
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                        localStorage.removeItem("canvas-mod-token");
                        setToken(null);
                    }}
                >
                    sign out
                </button>
            </header>

            <section className="mb-10">
                <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
                    Draw a forbidden shape
                </h2>
                <canvas
                    ref={canvasRef}
                    width={PAD_SIZE}
                    height={PAD_SIZE}
                    onPointerDown={onDown}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                    className="btn-muted-sm touch-none cursor-crosshair"
                    style={{ width: PAD_SIZE, height: PAD_SIZE }}
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="template name"
                        className="btn-muted-sm"
                    />
                    <button onClick={saveTemplate} className="btn-muted">
                        save as forbidden
                    </button>
                    <button onClick={testCurrent} className="btn-muted">
                        test against templates
                    </button>
                    <button onClick={clearPad} className="text-sm link-hover">
                        clear
                    </button>
                </div>
                {score && (
                    <div className="mt-3 text-sm">
                        Score: <span className="tabular-nums">{score.score.toFixed(3)}</span>
                        {" "}/ threshold <span className="tabular-nums">{score.threshold.toFixed(2)}</span>
                        {score.templateName ? <> — closest: <strong>{score.templateName}</strong></> : null}
                        {" "}
                        <span className={score.score >= score.threshold ? "text-red-600" : "text-muted-foreground"}>
                            {score.score >= score.threshold ? "WOULD BLOCK" : "would allow"}
                        </span>
                    </div>
                )}
                {status && <p className="mt-2 text-xs text-muted-foreground">{status}</p>}
            </section>

            <section>
                <h2 className="text-sm uppercase tracking-widest text-muted-foreground mb-3">
                    Saved templates ({templates.length})
                </h2>
                {templates.length === 0 && (
                    <p className="text-sm text-muted-foreground">No templates saved yet.</p>
                )}
                <ul className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {templates.map((t) => (
                        <li key={t.id} className="border border-border rounded p-3 flex flex-col gap-2">
                            <TemplatePreview raw={t.raw} />
                            <div className="flex items-center justify-between text-xs">
                                <span className="truncate">{t.name}</span>
                                <button
                                    onClick={() => deleteTemplate(t.id)}
                                    className="text-muted-foreground hover:text-red-600"
                                >
                                    delete
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}

function TemplatePreview({ raw }: { raw: Point[] }) {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const c = ref.current;
        if (!c) return;
        const ctx = c.getContext("2d")!;
        ctx.clearRect(0, 0, c.width, c.height);
        if (raw.length < 2) return;
        // Fit raw points (already 0..1) into the preview canvas with padding.
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of raw) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
        const w = c.width, h = c.height, pad = 8;
        const sx = (w - pad * 2) / Math.max(maxX - minX, 0.001);
        const sy = (h - pad * 2) / Math.max(maxY - minY, 0.001);
        const s = Math.min(sx, sy);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#1b1a17";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo((raw[0].x - minX) * s + pad, (raw[0].y - minY) * s + pad);
        for (let i = 1; i < raw.length; i++) {
            ctx.lineTo((raw[i].x - minX) * s + pad, (raw[i].y - minY) * s + pad);
        }
        ctx.stroke();
    }, [raw]);
    return <canvas ref={ref} width={140} height={100} className="bg-background rounded" />;
}
