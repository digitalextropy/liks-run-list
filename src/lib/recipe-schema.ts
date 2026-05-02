export interface Recipe {
  name: string;
  base: {
    type: "plain" | "chocolate" | "sorbet" | "sherbet" | "vegan" | "graham" | "cheesecake";
    ingredients: string[];
  };
  addIns: {
    name: string;
    quantity: string;
    taTrigger: "always" | "conditional" | "none";
  }[];
  foldIns: {
    name: string;
    quantity: string;
  }[];
  allergens: string[];
  eligible44qt: boolean;
  notes: string | null;
}

export interface ValidationResult {
  recipe: string;
  status: "matched" | "ambiguous" | "not_found";
  matchedRecipe?: Recipe;
  suggestions?: string[];
  tubs: number;
}
