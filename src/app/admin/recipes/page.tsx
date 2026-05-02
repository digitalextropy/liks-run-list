"use client";

import { useState, useEffect } from "react";

interface PdfInfo {
  filename: string;
  uploadedAt: string;
  url: string;
}

export default function AdminRecipesPage() {
  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [recipeCount, setRecipeCount] = useState<number | null>(null);
  const [recipes, setRecipes] = useState<{ name: string }[] | null>(null);

  useEffect(() => {
    fetchPdfInfo();
  }, []);

  async function fetchPdfInfo() {
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
        setPdfInfo({ filename: data.filename, uploadedAt: new Date().toISOString(), url: data.url });
        setRecipeCount(data.recipeCount);
        fetchPdfInfo();
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
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Upload Recipe PDF</h2>

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

        {pdfInfo && (
          <div className="mt-4 bg-gray-50 rounded p-3 text-sm">
            <p><strong>Current file:</strong> {pdfInfo.filename}</p>
            <p className="text-gray-500 text-xs">Uploaded: {new Date(pdfInfo.uploadedAt).toLocaleString()}</p>
          </div>
        )}

        {recipeCount !== null && (
          <p className="mt-3 text-sm text-indigo-600 font-medium">
            {recipeCount} recipes parsed from PDF
          </p>
        )}
      </div>

      {recipes && recipes.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Parsed Recipes</h2>
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
