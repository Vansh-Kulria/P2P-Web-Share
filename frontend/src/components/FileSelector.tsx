import React, { useState, useRef } from 'react';
import { UploadCloud, File, AlertTriangle, Shield } from 'lucide-react';

interface FileSelectorProps {
  onFileSelect: (file: File) => void;
  maxSizeMB?: number;
}

export const FileSelector: React.FC<FileSelectorProps> = ({ 
  onFileSelect, 
  maxSizeMB = 500 
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const validateAndSetFile = (file: File) => {
    setError(null);
    const sizeInMB = file.size / (1024 * 1024);
    
    if (sizeInMB > maxSizeMB) {
      setError(`File size exceeds the ${maxSizeMB}MB limit. Large transfers might experience browser memory constraints.`);
    }
    
    setSelectedFile(file);
    onFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      <div
        className={`relative flex flex-col items-center justify-center p-8 md:p-12 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-150 ${
          dragActive 
            ? 'border-white bg-neutral-900/50 scale-[0.99]' 
            : 'border-neutral-800 hover:border-neutral-700 bg-neutral-900/20 hover:bg-neutral-900/40'
        }`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={onButtonClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />

        {!selectedFile ? (
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="p-3.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400">
              <UploadCloud className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-200">
                Drag and drop your file here
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                or <span className="text-white hover:underline font-medium">browse your files</span>
              </p>
            </div>
            <div className="flex items-center space-x-1.5 text-[10px] text-neutral-500 pt-2 border-t border-neutral-900 w-full justify-center">
              <Shield className="w-3.5 h-3.5" />
              <span>Zero-knowledge client-side encryption</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center w-full space-y-4">
            <div className="p-3.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 flex items-center space-x-3.5 w-full">
              <File className="w-6 h-6 text-neutral-300 shrink-0" />
              <div className="text-left overflow-hidden">
                <p className="text-xs font-semibold text-neutral-200 truncate">{selectedFile.name}</p>
                <p className="text-[10px] text-neutral-500 mt-0.5">{formatBytes(selectedFile.size)}</p>
              </div>
            </div>

            {error && (
              <div className="flex items-start space-x-2 p-3 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 text-xs text-left w-full">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <p className="text-[10px] text-neutral-500 font-semibold tracking-wide uppercase hover:text-neutral-400">
              Click or drop another file to change
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
