import React, { useEffect, useRef, useState } from "react";
import { Check, EyeOff, RotateCcw, X } from "lucide-react";

type Point = { x: number; y: number };

export default function PrivacyImageEditor({ image, onSave, onClose }: {
  image: string;
  onSave: (image: string) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalRef = useRef<HTMLImageElement | null>(null);
  const [start, setStart] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [redactions, setRedactions] = useState<Array<{ start: Point; end: Point }>>([]);

  const draw = (draft?: { start: Point; end: Point }) => {
    const canvas = canvasRef.current;
    const source = originalRef.current;
    if (!canvas || !source) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const all = draft ? [...redactions, draft] : redactions;
    for (const item of all) {
      const x = Math.min(item.start.x, item.end.x);
      const y = Math.min(item.start.y, item.end.y);
      const width = Math.abs(item.end.x - item.start.x);
      const height = Math.abs(item.end.y - item.start.y);
      if (width < 3 || height < 3) continue;
      context.save();
      context.fillStyle = "rgba(15, 23, 42, .92)";
      context.fillRect(x, y, width, height);
      context.strokeStyle = "rgba(255,255,255,.8)";
      context.lineWidth = 2;
      context.setLineDash([7, 5]);
      context.strokeRect(x, y, width, height);
      context.restore();
    }
  };

  useEffect(() => {
    const source = new Image();
    source.onload = () => {
      originalRef.current = source;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const scale = Math.min(1, 1000 / Math.max(source.naturalWidth, source.naturalHeight));
      canvas.width = Math.round(source.naturalWidth * scale);
      canvas.height = Math.round(source.naturalHeight * scale);
      draw();
    };
    source.src = image;
  }, [image]);

  useEffect(() => { draw(start && cursor ? { start, end: cursor } : undefined); }, [redactions, start, cursor]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const box = canvas.getBoundingClientRect();
    return { x: (event.clientX - box.left) * canvas.width / box.width, y: (event.clientY - box.top) * canvas.height / box.height };
  };

  const finish = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!start) return;
    const end = point(event);
    if (Math.abs(end.x - start.x) > 8 && Math.abs(end.y - start.y) > 8) setRedactions(current => [...current, { start, end }]);
    setStart(null);
    setCursor(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const save = () => {
    draw();
    const canvas = canvasRef.current;
    if (canvas) onSave(canvas.toDataURL("image/webp", .86));
  };

  return (
    <div className="fixed inset-0 z-[1400] grid place-items-center bg-slate-950/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="privacy-editor-title">
      <section className="max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-teal-700"><EyeOff className="h-4 w-4" /> Privacy editor</div>
            <h2 id="privacy-editor-title" className="mt-1 text-xl font-black text-slate-950">Drag over faces, number plates, or private details.</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">Dark redaction boxes become part of the saved evidence image. CivicGuardian does not run facial recognition.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close privacy editor"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-5 overflow-hidden rounded-xl bg-slate-950">
          <canvas
            ref={canvasRef}
            className="max-h-[60vh] w-full touch-none object-contain"
            onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); const next = point(event); setStart(next); setCursor(next); }}
            onPointerMove={event => { if (start) setCursor(point(event)); }}
            onPointerUp={finish}
            aria-label="Evidence image privacy redaction canvas"
          />
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setRedactions([])} disabled={!redactions.length} className="flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-600 disabled:opacity-40"><RotateCcw className="h-4 w-4" /> Reset</button>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-600">Cancel</button>
          <button type="button" onClick={save} disabled={!redactions.length} className="flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Check className="h-4 w-4" /> Apply privacy redactions</button>
        </div>
      </section>
    </div>
  );
}
