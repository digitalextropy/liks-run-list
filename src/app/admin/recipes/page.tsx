"use client";

import { useState, useEffect } from "react";

interface PdfInfo {
  url: string;
  filename: string;
  uploadedAt: string;
}

export default function AdminRecipesPage() {
  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [recipeCount, setRecipeCount] = useState<number | null>(null);
  const [recipes, setRecipes] = useState<{ name: string }[] | null>(null);

  useEffect(() => {
    fetchPdfInfo();
    fetchRecipes();
  }, []);

  async function fetchPdfInfo() {
    try {
      const res = await fetch("/api/recipes/info");
      if (res.ok) {
        const data = await res.json();
        setPdfInfo(data);
      } else {
        setPdfInfo(null);
      }
    } catch { /* no pdf yet */ }
  }

  async function fetchRecipes() {
    try {
      const res = await fetch("/api/recipes/parse");
      if (res.ok) {
        const data = await res.json();
        setRecipeCount(data.count);
        setRecipes(data.recipes);
      }
    } catch { /* no pdf yet */ }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/recipes/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (res.ok) {
        setMessage(`Uploaded ${data.filename}. Found ${data.recipeCount} recipes.`);
        setRecipeCount(data.recipeCount);
        await fetchPdfInfo();
        await fetchRecipes();
      } else {
        setMessage(data.error || "Upload failed");
      }
    } catch {
      setMessage("Upload failed");
    } finally {
      setUploading(false);
    }
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
        <label className="block border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-400 transition-colors">
          <input
            type="file"
            accept=".pdf"
            onChange={handleUpload}
            className="hidden"
            disabled={uploading}
          />
          <p className="text-gray-500">
            {uploading ? "Uploading..." : "Click or drag to upload recipe PDF"}
          </p>
          <p className="text-xs text-gray-400 mt-1">PDF only. Replaces any existing recipe file.</p>
        </label>

        {message && (
          <p className={`mt-3 text-sm ${message.includes("failed") ? "text-red-500" : "text-green-600"}`}>
            {message}
          </p>
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
