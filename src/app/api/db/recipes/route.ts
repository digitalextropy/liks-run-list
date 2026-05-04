import { query } from "@/lib/db/pool";

interface IngredientRow {
  pi_id: number;
  ingredient_id: number;
  role: string;
  position: number;
  volume: string | null;
  item_name: string;
  item_cost: number | null;
  ingredient_text: string | null;
  allergen_alcohol: boolean;
  allergen_corn_syrup: boolean;
  allergen_egg: boolean;
  allergen_milk: boolean;
  allergen_peanuts: boolean;
  allergen_soy: boolean;
  allergen_sulfites: boolean;
  allergen_tree_nuts: boolean;
  allergen_wheat: boolean;
}

function deriveAllergens(ingredients: IngredientRow[]): string[] {
  const allergens: string[] = [];
  const checks: [keyof IngredientRow, string][] = [
    ["allergen_alcohol", "Alcohol"],
    ["allergen_corn_syrup", "Corn Syrup"],
    ["allergen_egg", "Egg"],
    ["allergen_milk", "Milk"],
    ["allergen_peanuts", "Peanuts"],
    ["allergen_soy", "Soy"],
    ["allergen_sulfites", "Sulfites"],
    ["allergen_tree_nuts", "Tree Nuts"],
    ["allergen_wheat", "Wheat"],
  ];
  for (const [key, label] of checks) {
    if (ingredients.some((ing) => ing[key] === true)) {
      allergens.push(label);
    }
  }
  return allergens;
}

function deriveIngredientText(ingredients: IngredientRow[]): string {
  return ingredients
    .filter((ing) => ing.ingredient_text)
    .map((ing) => ing.ingredient_text)
    .join(", ");
}

export async function GET() {
  try {
    const productsResult = await query("SELECT * FROM products ORDER BY name ASC");

    const piResult = await query(`
      SELECT
        pi.id AS pi_id,
        pi.product_id,
        pi.ingredient_id,
        pi.role,
        pi.position,
        pi.volume,
        i.item_name,
        i.item_cost,
        i.ingredient_text,
        i.allergen_alcohol,
        i.allergen_corn_syrup,
        i.allergen_egg,
        i.allergen_milk,
        i.allergen_peanuts,
        i.allergen_soy,
        i.allergen_sulfites,
        i.allergen_tree_nuts,
        i.allergen_wheat
      FROM product_ingredients pi
      JOIN ingredients i ON i.id = pi.ingredient_id
      ORDER BY pi.role, pi.position
    `);

    const recipes = productsResult.rows.map((product) => {
      const productIngredients = piResult.rows.filter(
        (pi) => pi.product_id === product.id
      ) as unknown as (IngredientRow & { product_id: number })[];

      const mapPi = (pi: IngredientRow & { product_id: number }) => ({
        ingredient_id: pi.ingredient_id,
        item_name: pi.item_name,
        item_cost: pi.item_cost,
        volume: pi.volume,
        position: pi.position,
      });

      const bases = productIngredients.filter((pi) => pi.role === "base").map(mapPi);
      const addins = productIngredients.filter((pi) => pi.role === "addin").map(mapPi);
      const foldins = productIngredients.filter((pi) => pi.role === "foldin").map(mapPi);

      return {
        ...product,
        bases,
        addins,
        foldins,
        derived_ingredients: deriveIngredientText(productIngredients),
        derived_allergens: deriveAllergens(productIngredients),
      };
    });

    return Response.json({ recipes });
  } catch (error) {
    return Response.json(
      { error: "Failed to fetch recipes", details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, sold_id, tagline, notes, label_text, label_type, active, bases, addins, foldins } = body;

    if (!name || !name.trim()) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }

    const productResult = await query(
      `INSERT INTO products (name, sold_id, tagline, notes, label_text, label_type, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, sold_id || null, tagline || null, notes || null, label_text || null, label_type || null, active ?? true]
    );
    const product = productResult.rows[0];

    const validBases = (bases || []).filter((b: { ingredient_id: number }) => b.ingredient_id);
    const validAddins = (addins || []).filter((a: { ingredient_id: number }) => a.ingredient_id);
    const validFoldins = (foldins || []).filter((f: { ingredient_id: number }) => f.ingredient_id);

    const ingredientRows = [
      ...validBases.map((b: { ingredient_id: number; volume?: string }, i: number) => ({
        ...b, role: "base", position: i + 1,
      })),
      ...validAddins.map((a: { ingredient_id: number; volume?: string }, i: number) => ({
        ...a, role: "addin", position: i + 1,
      })),
      ...validFoldins.map((f: { ingredient_id: number; volume?: string }, i: number) => ({
        ...f, role: "foldin", position: i + 1,
      })),
    ];

    for (const row of ingredientRows) {
      await query(
        `INSERT INTO product_ingredients (product_id, ingredient_id, role, position, volume)
         VALUES ($1, $2, $3, $4, $5)`,
        [product.id, row.ingredient_id, row.role, row.position, row.volume || null]
      );
    }

    return Response.json({ recipe: product }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: "Failed to create recipe", details: String(error) },
      { status: 500 }
    );
  }
}
