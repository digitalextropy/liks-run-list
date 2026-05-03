import { query } from "@/lib/db/pool";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const result = await query("SELECT * FROM ingredients WHERE id = $1", [id]);
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

    const result = await query(
      `UPDATE ingredients SET
        item_name = $1, generic_name = $2, item_cost = $3,
        item_measurement = $4, item_unit = $5, item_unit_qty = $6,
        active = $7, ingredient_text = $8,
        allergen_alcohol = $9, allergen_corn_syrup = $10,
        allergen_egg = $11, allergen_milk = $12,
        allergen_peanuts = $13, allergen_soy = $14,
        allergen_sulfites = $15, allergen_tree_nuts = $16,
        allergen_wheat = $17
      WHERE id = $18
      RETURNING *`,
      [
        item_name, generic_name || null, item_cost || null,
        item_measurement || null, item_unit || null, item_unit_qty || null,
        active ?? true, ingredient_text || null,
        allergen_alcohol ?? false, allergen_corn_syrup ?? false,
        allergen_egg ?? false, allergen_milk ?? false,
        allergen_peanuts ?? false, allergen_soy ?? false,
        allergen_sulfites ?? false, allergen_tree_nuts ?? false,
        allergen_wheat ?? false, id,
      ]
    );

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
    const usageCheck = await query(
      "SELECT COUNT(*)::int AS count FROM product_ingredients WHERE ingredient_id = $1",
      [id]
    );
    if (usageCheck.rows[0].count > 0) {
      return Response.json(
        {
          error: "Cannot delete ingredient — it is used in recipes. Remove it from all recipes first.",
        },
        { status: 409 }
      );
    }

    const result = await query(
      "UPDATE ingredients SET active = false WHERE id = $1 RETURNING *",
      [id]
    );

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
