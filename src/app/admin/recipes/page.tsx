"use client";

import { useState, useEffect, useRef } from "react";
import { upload } from "@vercel/blob/client";
import type { Recipe } from "@/lib/recipe-schema";

interface PdfInfo {
  url: string;
  filename: string;
  uploadedAt: string;
}

const BASE_TYPE_LABEL: Record<Recipe["base"]["type"], string> = {
  plain: "Plain",
  chocolate: "Chocolate",
  sorbet: "Sorbet",
  sherbet: "Sherbet",
  vegan: "Vegan",
  graham: "Graham",
  cheesecake: "Cheesecake",
};

const BASE_TYPE_COLOR: Record<Recipe["base"]["type"], string> = {
  plain: "bg-gray-100 text-gray-700",
  chocolate: "bg-amber-900/10 text-amber-900",
  sorbet: "bg-pink-100 text-pink-700",
  sherbet: "bg-orange-100 text-orange-700",
  vegan: "bg-green-100 text-green-700",
  graham: "bg-yellow-100 text-yellow-700",
  cheesecake: "bg-purple-100 text-purple-700",
};

export default function AdminRecipesPage() {
  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [recipeCount, setRecipeCount] = useState<number | null>(null);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [reparsing, setReparsing] = useState(false);
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

  async function handleReparse() {
    setReparsing(true);
    setError("");
    setMessage("Re-parsing PDF...");
    try {
      const res = await fetch("/api/recipes/reparse", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Parsed ${data.recipeCount} recipes.`);
        setRecipeCount(data.recipeCount);
        await fetchRecipes();
      } else {
        setError(`Re-parse failed: ${data.error || ""} ${data.details || ""}`);
        setMessage("");
      }
    } catch (e) {
      setError(`Re-parse failed: ${e instanceof Error ? e.message : String(e)}`);
      setMessage("");
    } finally {
      setReparsing(false);
    }
  }

  const filteredRecipes = recipes
    ? search.trim()
      ? recipes.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
      : recipes
    : null;

  const selectedRecipe =
    selectedIdx !== null && filteredRecipes ? filteredRecipes[selectedIdx] : null;

  return (
    <div className="space-y-6 max-w-6xl">
      <h1 className="text-2xl font-bold text-gray-900">Recipe PDF Management</h1>

      {/* TOP ROW: PDF info card + Upload box, side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* PDF info card */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-indigo-900 mb-2 uppercase tracking-wide">
            Current Recipe PDF
          </h2>
          {pdfInfo ? (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-indigo-900 truncate">
                  {pdfInfo.filename}
                </p>
                <p className="text-xs text-indigo-700 mt-0.5">
                  Uploaded: {new Date(pdfInfo.uploadedAt).toLocaleString()}
                </p>
                {recipeCount !== null && (
                  <p className="text-xs text-indigo-600 mt-1 font-medium">
                    {recipeCount} recipes parsed
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <a
                  href={pdfInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-indigo-600 text-white text-xs font-medium px-3 py-1.5 rounded hover:bg-indigo-700 transition-colors inline-flex items-center justify-center gap-1"
                >
                  View PDF
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
                <button
                  onClick={handleReparse}
                  disabled={reparsing}
                  className="bg-white border border-indigo-300 text-indigo-700 text-xs font-medium px-3 py-1.5 rounded hover:bg-indigo-50 transition-colors inline-flex items-center justify-center disabled:opacity-50"
                >
                  {reparsing ? "Parsing…" : "Re-parse"}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-indigo-700 italic">No recipe PDF uploaded yet.</p>
          )}
        </div>

        {/* Upload box */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
            {pdfInfo ? "Replace PDF" : "Upload PDF"}
          </h2>
          <label
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`block border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors h-[calc(100%-1.75rem)] flex flex-col items-center justify-center ${
              dragActive
                ? "border-indigo-500 bg-indigo-50"
                : uploading
                ? "border-gray-200 bg-gray-50 cursor-wait"
                : "border-gray-300 hover:border-indigo-400 bg-white"
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
                <p className="text-gray-600 text-sm">
                  {dragActive
                    ? "Drop PDF to upload"
                    : "Click or drag a PDF here"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Replaces the current recipe file.
                </p>
              </>
            )}
          </label>
        </div>
      </div>

      {(error || message) && (
        <div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded border border-red-200">
              {error}
            </p>
          )}
          {message && !error && (
            <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded border border-green-200">
              {message}
            </p>
          )}
        </div>
      )}

      {/* PARSED RECIPES — master/detail */}
      {recipes && recipes.length > 0 && (
        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">
              Parsed Recipes <span className="text-sm font-normal text-gray-500">({recipes.length})</span>
            </h2>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedIdx(null);
              }}
              placeholder="Search…"
              className="text-sm px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* List */}
            <div className="max-h-[600px] overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {filteredRecipes && filteredRecipes.length > 0 ? (
                filteredRecipes.map((r, i) => (
                  <button
                    key={r.name + i}
                    onClick={() => setSelectedIdx(i)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      selectedIdx === i
                        ? "bg-indigo-50 text-indigo-900 font-semibold"
                        : "hover:bg-gray-50 text-gray-700"
                    }`}
                  >
                    {r.name}
                  </button>
                ))
              ) : (
                <p className="px-3 py-4 text-sm text-gray-400 italic">No matches</p>
              )}
            </div>

            {/* Detail */}
            <div className="md:col-span-2">
              {selectedRecipe ? (
                <RecipeDetail recipe={selectedRecipe} />
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-500">
                  Click a recipe to view details
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RecipeDetail({ recipe }: { recipe: Recipe }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-xl font-bold text-gray-900">{recipe.name}</h3>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded ${BASE_TYPE_COLOR[recipe.base.type]}`}
          >
            {BASE_TYPE_LABEL[recipe.base.type]} base
          </span>
          {recipe.eligible44qt ? (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-green-100 text-green-700">
              44 QT eligible
            </span>
          ) : (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
              44 QT not eligible
            </span>
          )}
        </div>
      </div>

      {recipe.allergens.length > 0 && (
        <DetailSection title="Allergens">
          <div className="flex flex-wrap gap-1.5">
            {recipe.allergens.map((a) => (
              <span
                key={a}
                className="text-xs font-medium px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-100"
              >
                {a}
              </span>
            ))}
          </div>
        </DetailSection>
      )}

      <DetailSection title="Base">
        {recipe.base.ingredients.length > 0 ? (
          <ul className="space-y-0.5">
            {recipe.base.ingredients.map((ing, i) => (
              <li key={i} className="text-sm text-gray-700">
                {ing}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400 italic">No base ingredients listed</p>
        )}
      </DetailSection>

      <DetailSection title={`Add-ins (${recipe.addIns.length})`}>
        {recipe.addIns.length > 0 ? (
          <ul className="space-y-1">
            {recipe.addIns.map((a, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="text-gray-700 flex-1">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-gray-400 ml-1.5">— {a.quantity}</span>
                </span>
                <TaTriggerBadge trigger={a.taTrigger} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400 italic">None</p>
        )}
      </DetailSection>

      <DetailSection title={`Fold-ins (${recipe.foldIns.length})`}>
        {recipe.foldIns.length > 0 ? (
          <ul className="space-y-1">
            {recipe.foldIns.map((f, i) => (
              <li key={i} className="text-sm text-gray-700">
                <span className="font-medium">{f.name}</span>
                <span className="text-gray-400 ml-1.5">— {f.quantity}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400 italic">None</p>
        )}
      </DetailSection>

      {recipe.notes && (
        <DetailSection title="Notes">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{recipe.notes}</p>
        </DetailSection>
      )}
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        {title}
      </h4>
      {children}
    </div>
  );
}

function TaTriggerBadge({ trigger }: { trigger: "always" | "conditional" | "none" }) {
  const styles = {
    always: "bg-red-100 text-red-700",
    conditional: "bg-amber-100 text-amber-700",
    none: "bg-gray-100 text-gray-500",
  } as const;
  const labels = {
    always: "Always TA",
    conditional: "Conditional TA",
    none: "No TA",
  } as const;
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${styles[trigger]}`}>
      {labels[trigger]}
    </span>
  );
}
