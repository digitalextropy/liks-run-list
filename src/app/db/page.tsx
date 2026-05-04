import Link from "next/link";

export default function AdminPage() {
  return (
    <div className="max-w-2xl mx-auto py-12">
      <h1 className="text-2xl font-bold text-gray-800 mb-8">Admin</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/db/ingredients"
          className="block p-6 border border-gray-200 rounded-xl bg-white shadow-sm hover:shadow-md hover:border-indigo-300 transition-all"
        >
          <h2 className="text-lg font-semibold text-indigo-700 mb-1">Ingredients</h2>
          <p className="text-sm text-gray-500">
            View, add, edit, and deactivate ingredients. Manage allergens, costs, and units.
          </p>
        </Link>
        <Link
          href="/db/recipes"
          className="block p-6 border border-gray-200 rounded-xl bg-white shadow-sm hover:shadow-md hover:border-indigo-300 transition-all"
        >
          <h2 className="text-lg font-semibold text-indigo-700 mb-1">Recipes</h2>
          <p className="text-sm text-gray-500">
            Build recipes from scratch or edit existing ones. Manage base flavors, add-ins, and fold-ins.
          </p>
        </Link>
      </div>
    </div>
  );
}
