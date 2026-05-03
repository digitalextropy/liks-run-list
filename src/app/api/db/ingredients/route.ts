import { sql } from "@vercel/postgres";

export async function GET() {
  try {
    const result = await sql`
      SELECT i.*,
        COALESCE(pi.used_count, 0)::int AS used_in_recipes
      FROM ingredients i
      LEFT JOIN (
        SELECT ingredient_id, COUNT(DISTINCT product_id) AS used_count
        FROM product_ingredients
        GROUP BY ingredient_id
      ) pi ON pi.ingredient_id = i.id
      ORDER BY i.item_name ASC
    `;
    return Response.json({ ingredients: result.rows });
  } catch (error) {
    return Response.json(
      { error: "Failed to fetch ingredients", details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
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
      INSERT INTO ingredients (
        item_name, generic_name, item_cost, item_measurement, item_unit,
        item_unit_qty, active, ingredient_text,
        allergen_alcohol, allergen_corn_syrup, allergen_egg, allergen_milk,
        allergen_peanuts, allergen_soy, allergen_sulfites, allergen_tree_nuts, allergen_wheat
      ) VALUES (
        ${item_name}, ${generic_name || null}, ${item_cost || null},
        ${item_measurement || null}, ${item_unit || null}, ${item_unit_qty || null},
        ${active ?? true}, ${ingredient_text || null},
        ${allergen_alcohol ?? false}, ${allergen_corn_syrup ?? false},
        ${allergen_egg ?? false}, ${allergen_milk ?? false},
        ${allergen_peanuts ?? false}, ${allergen_soy ?? false},
        ${allergen_sulfites ?? false}, ${allergen_tree_nuts ?? false},
        ${allergen_wheat ?? false}
      )
      RETURNING *
    `;

    return Response.json({ ingredient: result.rows[0] }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: "Failed to create ingredient", details: String(error) },
      { status: 500 }
    );
  }
}
