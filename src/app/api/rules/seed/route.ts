import { NextResponse } from "next/server";
import { saveRules } from "@/lib/blob";
import type { ProductionRules } from "@/lib/rules-schema";

const INITIAL_RULES: ProductionRules = {
  machines: [
    {
      name: "Batch A",
      capacity_gallons: 6,
      tubs_per_run: 2,
      rules: "Mix-ins OK. Fold-ins OK. All recipe types. Primary batch freezer.",
      warnings: [],
    },
    {
      name: "Batch B",
      capacity_gallons: 6,
      tubs_per_run: 2,
      rules: "Mix-ins OK. Fold-ins OK. All recipe types. Secondary batch freezer.",
      warnings: [],
    },
    {
      name: "44 QT",
      capacity_gallons: 12,
      tubs_per_run: 4,
      rules: "Mix-ins OK.",
      warnings: [
        "NO FOLD-INS — too much volume for quality hand-stirring across 4 tubs.",
        "NO SORBETS/SHERBETS — high water content = very long freeze time.",
      ],
      highlight: true,
    },
  ],
  machines_callouts: [
    {
      type: "info",
      text: "Each machine is run by a separate operator. No need to stagger or coordinate cleaning between machines — each operator follows their own run list top to bottom.",
    },
  ],

  cleaning_tiers: [
    {
      name: "No Clean",
      level: "NO_CLEAN",
      definition: "No action needed",
      description:
        "Same base type, ascending boldness, and any mix-in carryover masked by the next flavor. Also between identical back-to-back runs. Also valid when a fold-in-only recipe ascends into a bolder flavor (e.g. Fluffernutter → Samoan Cookie).",
      duration_minutes: 0,
    },
    {
      name: "Water Rinse Only",
      level: "WATER_RINSE",
      definition: "2 hot, 1 cold",
      description:
        "Minor transitions within the same flavor family. Clearing mild color residue (e.g. yellow shade). Used only when flavors are closely related and ascending boldness covers the carryover.",
      duration_minutes: 3,
    },
    {
      name: "Rinse",
      level: "RINSE",
      definition: "3 hot, 1 sanitize, 1 cold",
      description:
        "Required for any major flavor component change (berry→mint, mint→coffee, cheesecake→vanilla, cake→coffee). Also for switching base types (sorbet→dairy, chocolate base→plain base). Also when going bold→mild.",
      duration_minutes: 8,
    },
    {
      name: "Take Apart",
      level: "TAKE_APART",
      definition: "3 hot, disassemble, 1 sanitize, 1 cold",
      description:
        "After any run with add-in ingredients that physically stick within the blades of the machine. See take-apart trigger list below.",
      duration_minutes: 25,
    },
  ],
  cleaning_tiers_callouts: [
    {
      type: "warning",
      text: "Major flavor changes always require a full Rinse. Examples: huckleberry→MCC, MCC→sleepless, berry→mint, mint→coffee, cheesecake→vanilla. Water Rinse is only for minor transitions within the same family.",
    },
  ],

  ta_triggers: [
    { name: "Strawberries", category: "always", note: "Unless very next run also contains strawberry (see same-ingredient chaining rule below)" },
    { name: "Cherries", category: "always" },
    { name: "Pineapple", category: "always", note: "Sticks like cherries" },
    { name: "Bananas", category: "always", note: "Coats blades, including as puree in base" },
    { name: "Peaches", category: "always", note: "Sticks like cherries" },
    { name: "Apple base", category: "always", note: "Contains chunks — not a liquid" },
    { name: "Espresso beans / pillows", category: "always", note: "Sleepless always requires TA" },
    { name: "All nuts", category: "always", note: "Pecans, almonds, walnuts, pistachios" },
    { name: "Coconut", category: "always", note: "Shredded or in base · also tree nut allergen" },
    { name: "Honey", category: "always" },
    { name: "Caramel topping", category: "always", note: "As add-in only — NOT caramel sauce fold-in" },
    { name: "Nerds candy", category: "always" },
    { name: "Marshmallow / charms", category: "always" },
    { name: "Peanut butter", category: "always", note: "As add-in only · also allergen" },
    { name: "Sprinkles", category: "always" },
    { name: "Cookie dough pieces", category: "always" },

    { name: "Choco chips / choco flakes", category: "conditional" },
    { name: "Toffee / butter crunchettes", category: "conditional" },
    { name: "Cookie pieces / oreos", category: "conditional", note: "As add-in only" },
    { name: "Candy cane pieces", category: "conditional" },

    { name: "Brownie pieces", category: "never" },
    { name: "Rice crispy pieces", category: "never" },
    { name: "All variegates & marbles", category: "never", note: "Fudge, cookie crumb, graham, butterscotch, raspberry, blueberry" },
    { name: "Caramel sauce", category: "never", note: "As fold-in (different from caramel topping add-in)" },
    { name: "Nilla wafers", category: "never" },
    { name: "Malo cream", category: "never" },
    { name: "Peanut butter as fold-in", category: "never" },
    { name: "Oreos as fold-in", category: "never" },
    { name: "Teddy grahams", category: "never" },
    { name: "M&M Minis", category: "never" },
    { name: "Biscoff cookies as fold-in", category: "never" },

    { name: "Tasters Choice (coffee)", category: "dissolving", note: "Dissolves completely · used in Coffee, CCC, Coffee CC, Sleepless, Colorado Mud" },
    { name: "Chai tea powder blend", category: "dissolving", note: "Dissolves completely" },
    { name: "Vanilla extract / Classic Blend", category: "dissolving", note: "Liquid, dissolves completely" },
    { name: "Espresso flavor extract", category: "dissolving", note: "Liquid, dissolves completely" },
    { name: "Food coloring / shade", category: "dissolving", note: "Liquid, dissolves · affects color sequencing only" },
    { name: "Flavor extracts", category: "dissolving", note: "Lemon, toffee, butter pecan, peppermint, etc. · all liquid, dissolve completely" },
    { name: "Cocoa powder", category: "dissolving", note: "Dissolves into base" },
    { name: "Cinnamon", category: "dissolving", note: "Dissolves into base" },
  ],
  ta_triggers_callouts_top: [
    {
      type: "critical",
      text: "CRITICAL: Only ingredients listed under \"Add Ins\" on the recipe PDF (added during the freezing stage) affect cleaning decisions. \"Fold Ins\" happen outside the machine by hand after freezing — they never touch the blades and are completely ignored for cleaning purposes. Always verify against the recipe PDF — ingredient names can be misleading (e.g. \"caramel sauce\" is a fold-in in CCC, while \"caramel topping\" is an add-in in Salty Cookie).",
    },
  ],
  ta_triggers_callouts_bottom: [
    {
      type: "info",
      text: "Same-ingredient chaining: The \"skip TA if the next run also contains the same ingredient\" rule applies to all always-TA triggers, not just strawberry. If two consecutive runs both have cherries, both have pineapple, both have the same fruit — skip the TA between them. The ingredient is already in the machine and will be again. Only take apart after the last run in the chain.",
    },
  ],
  ta_triggers_dissolving_intro:
    "These ingredients are listed under \"Add Ins\" on recipes (added during freezing), but they fully dissolve into the mix and leave no physical residue on the blades. They do not trigger any cleaning — no TA, no rinse, nothing. They only affect flavor sequencing (e.g. coffee flavor may require a rinse before switching to a non-coffee family).",

  allergen_rules: [
    "Vegan batches run first of the day. No dairy milk residue in the machine, and vegan base contains coconut which is a tree nut allergen that must be isolated. Take apart after vegan block before dairy begins.",
    "Nut recipes run last of the day. Peanuts and tree nuts (pecans, almonds, walnuts, pistachios, coconut) are positioned at end of day to minimize cross-contamination risk. Final take-apart at day's end clears it.",
    "Peanut butter as fold-in (e.g. Fluffernutter) does not trigger a machine take-apart since it never enters the machine, but the flavor should still sequence late in the day due to allergen handling during production. It can chain directly into a nut recipe with no clean if ascending boldness covers it.",
    "Same nut type can chain. If consecutive recipes on the same machine both contain the same nut type (e.g. pecan → pecan), skip the take-apart between them. A rinse may still be needed for base or flavor change.",
  ],
  allergen_rules_callouts: [
    {
      type: "info",
      text: "We do not have a wheat/gluten allergen sequencing rule. Only three allergen rules exist: vegan first, nuts last, peanut absolute last. Do not group or sequence by wheat.",
    },
  ],

  sequencing_rules: [
    "Base type ordering: Plain ice cream mix base runs before chocolate base (Van Gold D) or other specialty bases on the same machine. Don't run a plain-base flavor after a chocolate-base flavor without cleaning — the chocolate base carries over heavily.",
    "Ascending boldness: Within the same base type, always sequence mild → bold. Vanilla → Mint Cookie → MCC. Never reverse without at least a rinse.",
    "Same-family chaining: Flavors in the same family can skip cleaning entirely. Coffee → Coffee Caramel Cookie → Coffee Choc Chip.",
    "Mix-ins can be present during no-clean chains as long as ascending boldness covers the carryover. E.g. Vanilla → Chocolate Chip → Cookie Dough, or Vanilla → Vanilla Bean → Mint Cookie → MCC.",
    "Major flavor changes require a Rinse: Any time the flavor profile shifts significantly (berry→mint, mint→coffee, cheesecake→vanilla, cake→coffee), use a full Rinse. WR is only for minor transitions within the same family.",
    "Color matters: Light → dark is safe. After strongly colored flavors (cotton candy pink, mint green, cherry red), at minimum a water rinse is needed before lighter colors.",
    "Sorbets and sherbets use a different base (water + sorbet base) and should be grouped together on Batch A or B — never 44 QT. Full Rinse required when switching between sorbet base and dairy base.",
  ],

  optimization_rules: [
    "Minimize total take-aparts. The run list should be optimized for time. Fewer take-aparts = faster production day. Every rule below serves this goal.",
    "Same nut = skip TA. If consecutive recipes on the same machine both contain the same nut type (e.g. pecan → pecan), skip the take-apart between them. A rinse may still be needed for base or flavor change, but the disassembly is unnecessary.",
    "Chain identical recipes. When multiple runs of the same recipe are needed, run them back-to-back with no cleaning between. Only take apart after the last one. Mark with ×2, ×3, etc.",
    "Chain conditional-TA recipes. If two consecutive recipes both have choco flakes (or similar conditional-TA ingredient), the first run can skip its TA since the next run also has that ingredient. A rinse may still be needed if the flavor families differ.",
    "Chain fold-in recipes into bold flavors. A fold-in-only recipe (e.g. Fluffernutter) leaves only base flavor in the machine. If the next recipe is bolder and same base type, no clean is needed (e.g. Fluffernutter → Creamy Praline).",
    "Run entire blocks on one machine. Group related recipes (all fruit, all nuts, all chocolate-base) on the same machine rather than splitting across machines. Creates cleaner operations and more chaining opportunities.",
    "Use water rinse instead of full rinse when appropriate. Only for minor transitions within the same flavor family. All major flavor changes require a full Rinse.",
  ],

  forty_four_qt_rule:
    "Assign flavors that are high-volume, have NO fold-ins, and are NOT sorbet or sherbet.",
  forty_four_qt_callouts: [
    {
      type: "success",
      text: "Good candidates: Vanilla, Vanilla Bean, Chocolate, MCC, Strawberry, Cotton Candy, Coffee family (no fold-in variants), Cookies N Cream, Sleepless, JDCC, Huckleberry, Lemon Choc Chip, Birthday Cake.",
    },
    {
      type: "critical",
      text: "Never assign: Any recipe with fold-ins — Double Brownie, Rice Crispy, Fluffernutter, cheesecake flavors, Butterscotch Fudge Ripple, Yellow Cake (M&M fold-in), Coffee Caramel Cookie (caramel sauce fold-in), Colorado Mud (variegate fold-ins). Also no sorbets or sherbets.",
    },
    {
      type: "warning",
      text: "The 44 QT should NEVER have fold-ins. At 12 gallons (4 tubs), the volume is too great for an employee to hand-stir fold-ins and maintain quality. Always verify the recipe PDF — some recipes that appear simple (e.g. Yellow Cake, CCC) have fold-ins that disqualify them.",
    },
  ],

  recipe_notes: [
    {
      recipe: "Coffee Caramel Cookie",
      note: "Zero TA-triggering ingredients. Only add-in is Tasters Choice (dissolves). Caramel sauce and cookie variegate are both fold-ins. Chains freely within coffee family. NOT eligible for 44 QT (has fold-ins).",
    },
    {
      recipe: "Sleepless",
      note: "Always requires TA after. Chocolate espresso beans/pillows get stuck in the blades. Add-ins: espresso pillows + Tasters Choice + espresso flavor.",
    },
    {
      recipe: "Cotton Candy",
      note: "Always requires a full Rinse after (not TA, not WR). The flavor is very strong and lingers in the machine. No sticky add-ins — no disassembly needed.",
    },
    {
      recipe: "Apple Pie / Apple Cobbler",
      note: "Apple Ice Cream Flavor Base is an add-in that contains chunks (not a smooth liquid). Always requires TA after, same as strawberry and cherry.",
    },
    {
      recipe: "Yellow Cake",
      note: "M&M Minis are fold-ins (not add-ins). No TA trigger from machine perspective. But NOT eligible for 44 QT because of the fold-in.",
    },
    {
      recipe: "Butterscotch Fudge Ripple",
      note: "Zero add-ins. Butterscotch crinkle and fudge variegate are both fold-ins. Chains freely. NOT eligible for 44 QT.",
    },
    {
      recipe: "Cheesecake Flavors (Blueberry CK, WR CK, Cheesman)",
      note: "Zero add-ins. All variegates are fold-ins. Machine only sees plain base + NY Cheesecake flavor. Chain freely within cheesecake family. NOT eligible for 44 QT.",
    },
    {
      recipe: "Fluffernutter",
      note: "Peanut butter is a fold-in (no TA from machine). But schedule late in day due to peanut allergen handling during production. Can chain directly into nut recipes if ascending boldness covers it.",
    },
    {
      recipe: "Banana Cream Pie",
      note: "Banana puree is in the base (not an add-in), but it coats the blades — always TA. Nilla wafers and malo cream are fold-ins (don't affect machine).",
    },
  ],

  day_structure: [
    { order: 1, phase: "Vegan Block", description: "First of day, one machine. Take apart after to clear vegan base + coconut before dairy." },
    { order: 2, phase: "Light Block", description: "Fold-in-only and base-only recipes (no TAs). Creates long chains with zero take-aparts." },
    { order: 3, phase: "Sorbet / Sherbet Block", description: "Different base, group on Batch A or B (never 44 QT). Rinse after before dairy." },
    { order: 4, phase: "Plain Base Block", description: "Ascending boldness, chain where possible. Fruit recipes (all TA) together. Rinse between major flavor changes." },
    { order: 5, phase: "Chocolate Base Block", description: "After all plain-base runs on that machine. Chain ascending (e.g. Chocolate → Chocolate → JDCC)." },
    { order: 6, phase: "Peanut Handling", description: "Late in day. Fold-in-only PB recipes can chain directly into nut block if ascending boldness covers it." },
    { order: 7, phase: "Nut Block", description: "End of day. Same-nut types together to skip TAs. Ascending boldness within. Take apart after final run." },
  ],
};

export async function POST() {
  await saveRules(INITIAL_RULES);
  return NextResponse.json({ success: true, message: "Rules seeded successfully" });
}
