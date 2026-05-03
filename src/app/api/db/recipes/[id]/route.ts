import { sql } from "@vercel/postgres";

interface Params {
  id: string;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<Params> }
) {
  const { id } = await params;
  try {
    const productResult = await sql`
      SELECT * FROM products WHERE id = ${id}
    `;
    if (productResult.rows.length === 0) {
      return Response.json({ error: "Recipe not found" }, { status: 404 });
    }

    const product = productResult.rows[0];

    const piResult = await sql`
      SELECT
        pi.ingredient_id,
        pi.role,
        pi.position,
        pi.volume,
        i.item_name,
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
      WHERE pi.product_id = ${id}
      ORDER BY pi.role, pi.position
    `;

    const bases = piResult.rows
      .filter((r) => r.role === "base")
      .map((r) => ({ ingredient_id: r.ingredient_id, item_name: r.item_name, volume: r.volume, position: r.position }));
    const addins = piResult.rows
      .filter((r) => r.role === "addin")
      .map((r) => ({ ingredient_id: r.ingredient_id, item_name: r.item_name, volume: r.volume, position: r.position }));
    const foldins = piResult.rows
      .filter((r) => r.role === "foldin")
      .map((r) => ({ ingredient_id: r.ingredient_id, item_name: r.item_name, volume: r.volume, position: r.position }));

    // Derive allergens
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
  { params }: { params: Promise<Params> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { name, sold_id, tagline, notes, label_text, label_type, active, bases, addins, foldins } = body;

    if (!name || !name.trim()) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }

    // Update product fields
    await sql`
      UPDATE products
      SET name = ${name},
          sold_id = ${sold_id || null},
          tagline = ${tagline || null},
          notes = ${notes || null},
          label_text = ${label_text || null},
          label_type = ${label_type || null},
          active = ${active ?? true}
      WHERE id = ${id}
    `;

    // Replace product_ingredients: delete old, insert new
    await sql`DELETE FROM product_ingredients WHERE product_id = ${id}`;

    const ingredientRows = [
      ...(bases || []).map((b: { ingredient_id: number; volume?: string }, i: number) => ({
        ...b,
        role: "base",
        position: i + 1,
      })),
      ...(addins || []).map((a: { ingredient_id: number; volume?: string }, i: number) => ({
        ...a,
        role: "addin",
        position: i + 1,
      })),
      ...(foldins || []).map((f: { ingredient_id: number; volume?: string }, i: number) => ({
        ...f,
        role: "foldin",
        position: i + 1,
      })),
    ];

    for (const row of ingredientRows) {
      await sql`
        INSERT INTO product_ingredients (product_id, ingredient_id, role, position, volume)
        VALUES (${id}, ${row.ingredient_id}, ${row.role}, ${row.position}, ${row.volume || null})
      `;
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
  request: Request,
  { params }: { params: Promise<Params> }
) {
  const { id } = await params;
  try {
    await sql`UPDATE products SET active = false WHERE id = ${id}`;
    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { error: "Failed to delete recipe", details: String(error) },
      { status: 500 }
    );
  }
}
