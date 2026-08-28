// ScanCart mock product database.
// A barcode is only a product identifier. Every field carries its own
// data source + confidence so the UI never pretends the barcode itself
// encoded calories, MRP or expiry.

export type DataSource = "Database" | "OCR" | "User Entered" | "None";
export type Confidence = "Verified" | "Detected" | "User Entered" | "Unavailable";

export type FieldValue<T> = {
  value: T | null;
  source: DataSource;
  confidence: Confidence;
};

export type Diet = "veg" | "non-veg";

export interface Product {
  barcode: string;
  name: string;
  brand: string;
  category: string;
  icon: "ramen" | "donut" | "water";
  servingBasis: string; // e.g. "per serving", "per pack"
  diet: FieldValue<Diet>;
  calories: FieldValue<number>; // kcal
  servingSize: FieldValue<string>;
  protein: FieldValue<number>; // g
  carbohydrates: FieldValue<number>; // g
  fat: FieldValue<number>; // g
  mrp: FieldValue<number>; // rupees
  ingredients: FieldValue<string>;
  expiry: FieldValue<string>; // ISO-ish display string
}

function db<T>(value: T): FieldValue<T> {
  return { value, source: "Database", confidence: "Verified" };
}
function none<T>(): FieldValue<T> {
  return { value: null, source: "None", confidence: "Unavailable" };
}

export const PRODUCTS: Product[] = [
  {
    barcode: "8801073110465",
    name: "Buldak Ramen",
    brand: "Samyang",
    category: "Instant Noodles",
    icon: "ramen",
    servingBasis: "per pack",
    diet: db<Diet>("non-veg"),
    calories: db(530),
    servingSize: db("140 g"),
    protein: db(11),
    carbohydrates: db(80),
    fat: db(18),
    mrp: db(130),
    ingredients: db(
      "Wheat flour, palm oil, chicken extract, soy sauce, chili powder, garlic, sugar, salt.",
    ),
    expiry: none<string>(),
  },
  {
    barcode: "0049000054520",
    name: "Dunkin Donut",
    brand: "Dunkin",
    category: "Bakery",
    icon: "donut",
    servingBasis: "per piece",
    diet: db<Diet>("veg"),
    calories: db(393),
    servingSize: db("1 piece (86 g)"),
    protein: db(4),
    carbohydrates: db(51),
    fat: db(19),
    mrp: db(209),
    ingredients: db(
      "Enriched wheat flour, sugar, vegetable shortening, milk solids, yeast, glaze.",
    ),
    expiry: none<string>(),
  },
  {
    barcode: "8901234500017",
    name: "Mineral Water",
    brand: "Varahi",
    category: "Beverage",
    icon: "water",
    servingBasis: "per bottle",
    diet: db<Diet>("veg"),
    calories: db(0),
    servingSize: db("1 L"),
    protein: db(0),
    carbohydrates: db(0),
    fat: db(0),
    mrp: db(30),
    ingredients: db("Packaged drinking water with added minerals."),
    expiry: none<string>(),
  },
];

// Barcodes that resolve to nothing, to exercise the unknown-product flow.
export const UNKNOWN_BARCODES = ["6291041500213", "0000000000000"];

export function lookupBarcode(code: string): Product | null {
  return PRODUCTS.find((p) => p.barcode === code) ?? null;
}

// Cycle the scanner through the sample set so repeated scans feel real.
export function nextSampleBarcode(index: number): string {
  const pool = [...PRODUCTS.map((p) => p.barcode), UNKNOWN_BARCODES[0]];
  return pool[index % pool.length];
}

export interface CartLine {
  product: Product;
  qty: number;
  expiry: FieldValue<string>; // per-line, may be OCR/user entered after adding
}

export interface ScanRecord {
  id: string;
  product: Product;
  scannedAt: number; // epoch ms
  expiry: FieldValue<string>;
}

export const rupee = (n: number) => `₹${n.toLocaleString("en-IN")}`;
