import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Camera, EyeOff, FileImage, Loader2, Upload, X } from "lucide-react";
import { IssueImage } from "../common/IssueImage";
import PrivacyImageEditor from "./PrivacyImageEditor";

interface ImageUploaderProps {
  image: string | null;
  setImage: (image: string | null) => void;
  errorMsg?: string;
  setErrorMsg: (message: string) => void;
  compact?: boolean;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function imageSource(file: File) {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file, { imageOrientation: "from-image" });
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The image could not be decoded."));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function optimize(file: File) {
  const source = await imageSource(file);
  const sourceWidth = "naturalWidth" in source ? source.naturalWidth : source.width;
  const sourceHeight = "naturalHeight" in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("This browser could not prepare the evidence image.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ("close" in source && typeof source.close === "function") source.close();
  const dataUrl = canvas.toDataURL("image/webp", .84);
  return { dataUrl, outputBytes: Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * .75), width: canvas.width, height: canvas.height };
}

export function takeSelectedImageFile(input: Pick<HTMLInputElement, "files" | "value">) {
  const file = input.files?.[0];
  input.value = "";
  return file;
}

export default function ImageUploader({ image, setImage, errorMsg, setErrorMsg, compact = false }: ImageUploaderProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [summary, setSummary] = useState("");
  const [editing, setEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (image) return;
    setSummary("");
    setEditing(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [image]);

  const openFilePicker = () => {
    if (!fileInputRef.current) return;
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  };

  const validateAndProcessFile = async (file: File) => {
    setErrorMsg("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setErrorMsg("Unsupported format. Choose a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg("The original image is larger than 10 MB. Choose a smaller photo.");
      return;
    }
    setProcessing(true);
    try {
      const result = await optimize(file);
      if (result.outputBytes > 8 * 1024 * 1024) throw new Error("The optimized image is still too large. Choose a smaller photo.");
      setImage(result.dataUrl);
      setSummary(`Optimized from ${formatBytes(file.size)} to ${formatBytes(result.outputBytes)} · ${result.width}×${result.height} · metadata removed`);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "The image could not be prepared. Please try another photo.");
    } finally {
      setProcessing(false);
    }
  };

  const clearImage = () => {
    setImage(null);
    setSummary("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-3">
      {image ? (
        <div className={`relative overflow-hidden rounded-xl border border-slate-700 bg-slate-950 ${compact ? "h-44" : "h-64"}`}>
          <IssueImage src={image} alt="Prepared citizen evidence preview" className="h-full w-full object-contain" />
          <div className="absolute right-3 top-3 flex gap-2">
            <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1.5 rounded-lg bg-slate-950/90 px-3 py-2 text-xs font-bold text-white shadow" aria-label="Hide sensitive areas in this image"><EyeOff className="h-4 w-4" /> <span className="hidden sm:inline">Hide sensitive area</span></button>
            <button type="button" onClick={clearImage} className="rounded-lg bg-red-600 p-2 text-white shadow" aria-label="Remove photo"><X className="h-4 w-4" /></button>
          </div>
          <span className="absolute bottom-3 left-3 rounded-lg bg-slate-950/85 px-2.5 py-1.5 text-[10px] font-bold text-teal-200"><FileImage className="mr-1 inline h-3 w-3" /> Evidence ready</span>
          <button type="button" onClick={openFilePicker} disabled={processing} className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-900 shadow disabled:opacity-50"><Camera className="h-4 w-4" />Replace photo</button>
        </div>
      ) : (
        <button
          type="button"
          onDragEnter={event => { event.preventDefault(); setIsDragActive(true); }}
          onDragOver={event => event.preventDefault()}
          onDragLeave={event => { event.preventDefault(); setIsDragActive(false); }}
          onDrop={event => { event.preventDefault(); setIsDragActive(false); const file = event.dataTransfer.files[0]; if (file) void validateAndProcessFile(file); }}
          onClick={openFilePicker}
          disabled={processing}
          className={`flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-7 text-center transition ${isDragActive ? "border-teal-500 bg-teal-50" : "border-slate-300 bg-slate-50 hover:border-teal-500"}`}
        >
          {processing ? <Loader2 className="h-7 w-7 animate-spin text-teal-700" /> : <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-teal-700 shadow-sm"><Camera className="h-6 w-6" /></span>}
          <span className="text-sm font-bold text-slate-800">{processing ? "Optimizing photo and removing metadata..." : "Take a photo or choose a file"}</span>
          <span className="text-xs text-slate-500">JPG, PNG, or WEBP · maximum original size 10 MB</span>
        </button>
      )}
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={event => { const file = takeSelectedImageFile(event.currentTarget); if (file) void validateAndProcessFile(file); }} />
      {summary && <p className="flex items-center gap-2 text-xs text-teal-800"><Upload className="h-3.5 w-3.5" />{summary}</p>}
      {errorMsg && <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{errorMsg}</div>}
      {editing && image && <PrivacyImageEditor image={image} onClose={() => setEditing(false)} onSave={next => { setImage(next); setEditing(false); setSummary("Privacy redactions applied · metadata removed"); }} />}
    </div>
  );
}
