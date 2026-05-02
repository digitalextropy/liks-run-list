"use client";

import { useState, useEffect, useRef } from "react";
import { upload } from "@vercel/blob/client";

interface PdfInfo {
  url: string;
  filename: string;
  uploadedAt: string;
}

export default function AdminRecipesPage() {
  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [recipeCount, setRecipeCount] = useState<number | null>(null);
  const [recipes, setRecipes] = useState<{ name: string }[] | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPdfInfo();
    fetchRecipes();
  }, []);

  async function fetchPdfInfo() {
    try {
      const res = await fetch("/api/recipes/info");
      if (res.ok) {
        setPdfInfo(await res.json());
      } else {
        setPdfInfo(null);
      }
    } catch {
      /* no pdf yet */
    }
  }

  async function fetchRecipes() {
    try {
      const res = await fetch("/api/recipes/parse");
      if (res.ok) {
        const data = await res.json();
        setRecipeCount(data.count);
        setRecipes(data.recipes);
      }
    } catch {
      /* no pdf yet */
    }
  }

  async function processFile(file: File) {
    if (file.type !== "application/pdf") {
      setError("File must be a PDF");
      return;
    }

    setUploading(true);
    setProgress(0);
    setError("");
    setMessage("");

    try {
      const blob = await upload(`recipes/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/recipes/upload-token",
        contentType: "application/pdf",
        onUploadProgress: (p) => setProgress(Math.round(p.percentage)),
      });

      // Clean up any old PDFs (keep only the one we just uploaded)
      await fetch("/api/recipes/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepUrl: blob.url }),
      });

      setMessage(`Uploaded ${file.name}. Parsing recipes...`);
      await fetchPdfInfo();
      await fetchRecipes();
      setMessage(`Uploaded ${file.name}.`);
    } catch (e) {
      setError(`Upload failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // reset so picking the same file again still triggers onChange
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragActive) setDragActive(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Recipe PDF Management</h1>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Current Recipe PDF</h2>

        {pdfInfo ? (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-indigo-900 truncate">
                  {pdfInfo.filename}
                </p>
                <p className="text-xs text-indigo-700 mt-0.5">
                  Uploaded: {new Date(pdfInfo.uploadedAt).toLocaleString()}
                </p>
                {recipeCount !== null && (
                  <p className="text-xs text-indigo-600 mt-1">
                    {recipeCount} recipes parsed
                  </p>
                )}
              </div>
              <a
                href={pdfInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-indigo-600 text-white text-xs font-medium px-3 py-1.5 rounded hover:bg-indigo-700 transition-colors shrink-0 inline-flex items-center gap-1"
              >
                View PDF
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic mb-4">No recipe PDF uploaded yet.</p>
        )}

        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          {pdfInfo ? "Replace PDF" : "Upload PDF"}
        </h3>

        <label
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragActive
              ? "border-indigo-500 bg-indigo-50"
              : uploading
              ? "border-gray-200 bg-gray-50 cursor-wait"
              : "border-gray-300 hover:border-indigo-400"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFileInput}
            className="hidden"
            disabled={uploading}
          />
          {uploading ? (
            <>
              <p className="text-gray-600 text-sm">Uploading... {progress}%</p>
              <div className="mt-2 h-1.5 w-full bg-gray-200 rounded overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-gray-500">
                {dragActive
                  ? "Drop PDF to upload"
                  : "Click or drag a PDF here to upload"}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Replaces the current recipe file.
              </p>
            </>
          )}
        </label>

        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
        )}
        {message && !error && (
          <p className="mt-3 text-sm text-green-600">{message}</p>
        )}
      </div>

      {recipes && recipes.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            Parsed Recipes <span className="text-sm font-normal text-gray-500">({recipes.length})</span>
          </h2>
          <div className="max-h-80 overflow-y-auto space-y-1">
            {recipes.map((r, i) => (
              <div key={i} className="text-sm text-gray-700 py-0.5 border-b border-gray-100">
                {r.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
