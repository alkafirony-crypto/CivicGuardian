import React, { useRef, useState } from "react";
import { Upload, X, FileImage, AlertCircle } from "lucide-react";
import { IssueImage } from "../common/IssueImage";

interface ImageUploaderProps {
  image: string | null;
  setImage: (img: string | null) => void;
  errorMsg?: string;
  setErrorMsg: (msg: string) => void;
}

export default function ImageUploader({ image, setImage, errorMsg, setErrorMsg }: ImageUploaderProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndProcessFile = (file: File) => {
    setErrorMsg("");
    
    // Check file type
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setErrorMsg("Unsupported file format. Please upload a JPG, PNG, or WEBP image.");
      return;
    }

    // Check size limit (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setErrorMsg("File size exceeds 10MB limit. Please upload a smaller image.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      
      // If image is very large, compress it down before sending to save bandwidth and token counts
      const img = new Image();
      img.src = result;
      img.onload = () => {
        const maxDimension = 1200;
        let width = img.width;
        let height = img.height;
        
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
          
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedBase64 = canvas.toDataURL("image/jpeg", 0.82);
            setImage(compressedBase64);
          } else {
            setImage(result);
          }
        } else {
          setImage(result);
        }
      };
    };
    reader.onerror = () => {
      setErrorMsg("Failed to read image file. Please try again.");
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndProcessFile(e.target.files[0]);
    }
  };

  const clearImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div id="image-uploader-wrapper" className="space-y-2">
      <label className="block text-xs font-mono text-gray-400 uppercase tracking-wider">
        Report Photo (Required for Vision Agent Verification)
      </label>

      {image ? (
        <div id="uploader-preview" className="relative rounded-xl overflow-hidden border border-gray-800 bg-gray-950 h-56 group shadow-lg">
          <IssueImage src={image} alt="Report Preview" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-350 flex items-center justify-center">
            <button
              type="button"
              id="btn-remove-image"
              onClick={clearImage}
              className="px-4 py-2 bg-red-600/90 hover:bg-red-500 text-white text-xs font-medium rounded-lg shadow-lg flex items-center gap-2 transition-all transform scale-95 group-hover:scale-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Remove Photo</span>
            </button>
          </div>
          <div className="absolute top-3 left-3 px-2.5 py-1 bg-gray-950/80 backdrop-blur border border-gray-850 rounded text-[9px] font-mono text-cyan-400 flex items-center gap-1">
            <FileImage className="w-3 h-3" />
            <span>PIXEL VERIFICATION SCAN READY</span>
          </div>
        </div>
      ) : (
        <div
          id="uploader-dropzone"
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer group transition-all duration-300 ${
            isDragActive 
              ? "border-cyan-500 bg-cyan-950/20 shadow-lg shadow-cyan-500/5" 
              : "border-gray-800 bg-gray-950/40 hover:bg-gray-900/10 hover:border-gray-700"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
          />
          <div className="p-4 bg-gray-900 group-hover:bg-cyan-950/40 rounded-full border border-gray-850 group-hover:border-cyan-900/50 transition-colors">
            <Upload className="w-6 h-6 text-gray-400 group-hover:text-cyan-400" />
          </div>
          <div className="text-center">
            <p className="text-xs font-semibold text-gray-200">
              Drag & drop your issue image, or <span className="text-cyan-400 hover:underline">browse files</span>
            </p>
            <p className="text-[10px] text-gray-500 font-mono mt-1">
              Supports JPEG, PNG, WEBP (Max 10MB)
            </p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 p-3 bg-red-950/30 border border-red-900/50 rounded-lg text-xs text-red-400 font-mono">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
