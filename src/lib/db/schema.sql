-- Products (recipes/flavors)
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  legacy_id INTEGER UNIQUE,
  sold_id VARCHAR(50),
  name VARCHAR(100) NOT NULL,
  tagline TEXT,
  notes TEXT,
  label_text TEXT,
  label_type VARCHAR(30),
  active BOOLEAN DEFAULT true
);

-- Ingredients master list
CREATE TABLE IF NOT EXISTS ingredients (
  id SERIAL PRIMARY KEY,
  legacy_id INTEGER UNIQUE,
  item_name VARCHAR(200) NOT NULL,
  generic_name VARCHAR(100),
  item_cost DECIMAL(10,2),
  item_measurement VARCHAR(30),
  item_unit VARCHAR(30),
  item_unit_qty INTEGER,
  active BOOLEAN DEFAULT true,
  ingredient_text TEXT,
  allergen_alcohol BOOLEAN DEFAULT false,
  allergen_corn_syrup BOOLEAN DEFAULT false,
  allergen_egg BOOLEAN DEFAULT false,
  allergen_milk BOOLEAN DEFAULT false,
  allergen_peanuts BOOLEAN DEFAULT false,
  allergen_soy BOOLEAN DEFAULT false,
  allergen_sulfites BOOLEAN DEFAULT false,
  allergen_tree_nuts BOOLEAN DEFAULT false,
  allergen_wheat BOOLEAN DEFAULT false
);

-- Product ingredients (normalized junction)
-- role: 'base', 'addin', 'foldin'
CREATE TABLE IF NOT EXISTS product_ingredients (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  role VARCHAR(10) NOT NULL CHECK (role IN ('base', 'addin', 'foldin')),
  position INTEGER NOT NULL,
  volume VARCHAR(50),
  UNIQUE(product_id, role, position)
);

CREATE INDEX IF NOT EXISTS idx_product_ingredients_product ON product_ingredients(product_id);
CREATE INDEX IF NOT EXISTS idx_product_ingredients_ingredient ON product_ingredients(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
CREATE INDEX IF NOT EXISTS idx_ingredients_active ON ingredients(active);
