import { query } from "@/lib/db/pool";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const productResult = await query("SELECT * FROM products WHERE id = $1", [id]);
    if (productResult.rows.length === 0) {
      return Response.json({ error: "Recipe not found" }, { status: 404 });
    }

    const product = productResult.rows[0];

    const piResult = await query(
      `SELECT
        pi.ingredient_id, pi.role, pi.position, pi.volume,
        i.item_name, i.ingredient_text,
        i.allergen_alcohol, i.allergen_corn_syrup, i.allergen_egg, i.allergen_milk,
        i.allergen_peanuts, i.allergen_soy, i.allergen_sulfites, i.allergen_tree_nuts, i.allergen_wheat
      FROM product_ingredients pi
      JOIN ingredients i ON i.id = pi.ingredient_id
      WHERE pi.product_id = $1
      ORDER BY pi.role, pi.position`,
      [id]
    );

    const mapRow = (r: Record<string, unknown>) => ({
      ingredient_id: r.ingredient_id,
      item_name: r.item_name,
      volume: r.volume,
      position: r.position,
    });

    const bases = piResult.rows.filter((r) => r.role === "base").map(mapRow);
    const addins = piResult.rows.filter((r) => r.role === "addin").map(mapRow);
    const foldins = piResult.rows.filter((r) => r.role === "foldin").map(mapRow);

    const allergens: string[] = [];
    const checks: [string, string][] = [
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
      if (piResult.rows.some((r) => r[key] === true)) {
        allergens.push(label);
      }
    }

    const ingredientText = piResult.rows
      .filter((r) => r.ingredient_text)
      .map((r) => r.ingredient_text)
      .join(", ");

    return Response.json({
      recipe: {
        ...product,
        bases,
        addins,
        foldins,
        derived_ingredients: ingredientText,
        derived_allergens: allergens,
      },
    });
  } catch (error) {
    return Response.json(
      { error: "Failed to fetch recipe", details: String(error) },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { name, sold_id, tagline, notes, label_text, label_type, active, bases, addins, foldins } = body;

    if (!name || !name.trim()) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }

    await query(
      `UPDATE products
       SET name = $1, sold_id = $2, tagline = $3, notes = $4,
           label_text = $5, label_type = $6, active = $7
       WHERE id = $8`,
      [name, sold_id || null, tagline || null, notes || null, label_text || null, label_type || null, active ?? true, id]
    );

    await query("DELETE FROM product_ingredients WHERE product_id = $1", [id]);

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
        [id, row.ingredient_id, row.role, row.position, row.volume || null]
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { error: "Failed to update recipe", details: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await query("UPDATE products SET active = false WHERE id = $1", [id]);
    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { error: "Failed to delete recipe", details: String(error) },
      { status: 500 }
    );
  }
}
