"use client";

import { useState } from "react";

export default function DbAdminPage() {
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function handleSeed(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setStatus("Reading files...");

    const form = e.currentTarget;
    const productsFile = (form.elements.namedItem("products") as HTMLInputElement).files?.[0];
    const ingredientsFile = (form.elements.namedItem("ingredients") as HTMLInputElement).files?.[0];
    const piFile = (form.elements.namedItem("productIngredients") as HTMLInputElement).files?.[0];

    if (!productsFile || !ingredientsFile || !piFile) {
      setStatus("Please select all 3 files.");
      setLoading(false);
      return;
    }

    const [productsText, ingredientsText, productIngredientsText] = await Promise.all([
      productsFile.text(),
      ingredientsFile.text(),
      piFile.text(),
    ]);

    setStatus("Seeding database...");
    try {
      const res = await fetch("/api/db/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productsText, ingredientsText, productIngredientsText }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(`Done! Inserted: ${data.counts.ingredients} ingredients, ${data.counts.products} products, ${data.counts.productIngredients} product-ingredient links.`);
      } else {
        setStatus(`Error: ${data.error}\n${data.details || ""}`);
      }
    } catch (err) {
      setStatus(`Network error: ${String(err)}`);
    }
    setLoading(false);
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Database Admin</h1>

      <form onSubmit={handleSeed} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">jProduct.txt</label>
          <input type="file" name="products" accept=".txt" className="block w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">jIngredients.txt</label>
          <input type="file" name="ingredients" accept=".txt" className="block w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">jProductIngredients.txt</label>
          <input type="file" name="productIngredients" accept=".txt" className="block w-full" />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Seeding..." : "Create Tables & Seed Data"}
        </button>
      </form>

      {status && (
        <pre className="mt-6 p-4 bg-gray-100 rounded text-sm whitespace-pre-wrap">{status}</pre>
      )}
    </div>
  );
}
