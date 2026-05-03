import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const products = await sql`SELECT COUNT(*) as count FROM products`;
    const ingredients = await sql`SELECT COUNT(*) as count FROM ingredients`;
    const pi = await sql`SELECT COUNT(*) as count FROM product_ingredients`;
    const activeProducts = await sql`SELECT COUNT(*) as count FROM products WHERE active = true`;

    return NextResponse.json({
      products: Number(products.rows[0].count),
      ingredients: Number(ingredients.rows[0].count),
      product_ingredients: Number(pi.rows[0].count),
      active_products: Number(activeProducts.rows[0].count),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Database not available", details: String(error) },
      { status: 500 }
    );
  }
}
