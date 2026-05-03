import { sql } from "@vercel/postgres";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const result = await sql`SELECT * FROM ingredients WHERE id = ${id}`;
    if (result.rows.length === 0) {
      return Response.json({ error: "Ingredient not found" }, { status: 404 });
    }
    return Response.json({ ingredient: result.rows[0] });
  } catch (error) {
    return Response.json(
      { error: "Failed to fetch ingredient", details: String(error) },
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
    const {
      item_name,
      generic_name,
      item_cost,
      item_measurement,
      item_unit,
      item_unit_qty,
      active,
      ingredient_text,
      allergen_alcohol,
      allergen_corn_syrup,
      allergen_egg,
      allergen_milk,
      allergen_peanuts,
      allergen_soy,
      allergen_sulfites,
      allergen_tree_nuts,
      allergen_wheat,
    } = body;

    if (!item_name || !item_name.trim()) {
      return Response.json(
        { error: "item_name is required" },
        { status: 400 }
      );
    }

    const result = await sql`
      UPDATE ingredients SET
        item_name = ${item_name},
        generic_name = ${generic_name || null},
        item_cost = ${item_cost || null},
        item_measurement = ${item_measurement || null},
        item_unit = ${item_unit || null},
        item_unit_qty = ${item_unit_qty || null},
        active = ${active ?? true},
        ingredient_text = ${ingredient_text || null},
        allergen_alcohol = ${allergen_alcohol ?? false},
        allergen_corn_syrup = ${allergen_corn_syrup ?? false},
        allergen_egg = ${allergen_egg ?? false},
        allergen_milk = ${allergen_milk ?? false},
        allergen_peanuts = ${allergen_peanuts ?? false},
        allergen_soy = ${allergen_soy ?? false},
        allergen_sulfites = ${allergen_sulfites ?? false},
        allergen_tree_nuts = ${allergen_tree_nuts ?? false},
        allergen_wheat = ${allergen_wheat ?? false}
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.rows.length === 0) {
      return Response.json({ error: "Ingredient not found" }, { status: 404 });
    }

    return Response.json({ ingredient: result.rows[0] });
  } catch (error) {
    return Response.json(
      { error: "Failed to update ingredient", details: String(error) },
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
    // Check if ingredient is used in any product_ingredients
    const usageCheck = await sql`
      SELECT COUNT(*)::int AS count FROM product_ingredients WHERE ingredient_id = ${id}
    `;
    if (usageCheck.rows[0].count > 0) {
      return Response.json(
        {
          error: "Cannot delete ingredient — it is used in recipes. Remove it from all recipes first.",
        },
        { status: 409 }
      );
    }

    // Soft-delete: set active = false
    const result = await sql`
      UPDATE ingredients SET active = false WHERE id = ${id} RETURNING *
    `;

    if (result.rows.length === 0) {
      return Response.json({ error: "Ingredient not found" }, { status: 404 });
    }

    return Response.json({ ingredient: result.rows[0] });
  } catch (error) {
    return Response.json(
      { error: "Failed to delete ingredient", details: String(error) },
      { status: 500 }
    );
  }
}
