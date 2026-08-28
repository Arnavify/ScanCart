# Figma Make Prompt: ScanCart

Create a complete, high-fidelity, mobile-first functional prototype called **ScanCart**.

ScanCart is a barcode-based shopping assistant. The user scans a product while shopping. The app identifies the product using its barcode, retrieves whatever product information is available, and presents nutrition, price, product details, and expiry information. The user can then add the product to a cart, scan more products, review the cart, and complete a simulated checkout.

The prototype must feel like a real consumer mobile application, not a static UI mockup.

## Design direction

Use the existing visual style from the provided ScanCart reference.

Visual language:

* Black background.
* Dark charcoal and slightly lighter charcoal cards.
* Orange as the primary accent color.
* White primary text.
* Grey secondary text.
* Large rounded corners.
* Minimal line icons.
* High contrast.
* Clean modern typography.
* Compact mobile layout.
* Strong hierarchy.
* Subtle borders and shadows.
* Orange should be used primarily for important actions, selected states, scanning states, prices, and primary buttons.

Keep the interface visually consistent across every screen.

Do not introduce blue, green, purple, gradients, glassmorphism, or unrelated design styles.

## Core navigation

Create three main navigation destinations:

* Home
* Scan
* Cart

The Scan button should be the visually dominant center action.

Bottom navigation must remain consistent on Home, Scanner, and Cart-related screens.

## Screen 1, Home

Header:

**Track your health.**
**Scan as you shop.**

Show two summary cards:

* Total calories
* Cart value

Primary action:

**Start Scanning**

Below that, show:

**Recent Scans**

Display recently scanned products when data exists.

Each recent scan should contain:

* Product image/icon
* Product name
* Calories
* Price
* Date/time

If there are no scans, show a proper empty state:

**No recent scans**

**Scan a product to see it here.**

Tapping Start Scanning opens the Scanner.

## Screen 2, Scanner

Create a realistic barcode scanning interface.

Requirements:

* Full black camera-like background.
* Large centered scanning frame.
* Animated scanning line.
* Close button.
* Flashlight button.
* More/options button.
* Bottom instruction panel.

Text:

**Scan a barcode**

**Point your camera at the product barcode**

Primary circular scan control can remain at the bottom if appropriate.

Include a simulated scanning interaction so the prototype can actually transition to the next state.

Create at least these states:

1. Idle scanner.
2. Searching.
3. Barcode detected.
4. Product analysis.

The prototype must make the user feel like the camera is actively scanning.

## Screen 3, Product Analysis

After a successful scan, display:

**Barcode Detected**

Then transition into:

**Analyzing product...**

Show animated progress or loading indicators.

Use realistic processing steps:

* Barcode identified
* Product matched
* Nutrition found
* Price found
* Product details loaded

Do not claim that the barcode itself contains every piece of information.

The application should treat the barcode as a product identifier and then retrieve available product information.

## Screen 4, Product Detected

Example product:

**Mineral Water**

Brand:

**Varahi**

Show:

* Calories: 0 kcal
* MRP: ₹30
* Protein: 0 g

Use a product image or icon.

Include a clear data confidence system.

For example:

**Verified**

for information found from product data.

Use:

**Not available**

when information cannot be retrieved.

Never invent missing product information.

Display a small information note:

**Product information is retrieved from available product data. Always verify MRP and nutrition details on the physical package.**

Primary action:

**Add to Cart**

Secondary action:

**Scan Expiry Date**

Also provide:

**Scan Another Product**

## Expiry flow

Expiry information should NOT be assumed to be encoded inside a normal barcode.

Create a separate expiry scanning flow.

When the user selects Scan Expiry Date:

Open a camera-like OCR screen.

Header:

**Scan expiry date**

Instruction:

**Point your camera at the expiry or best-before date.**

States:

* Searching
* Date detected
* Date not detected
* OCR failed

When detected, show:

**Expiry detected**

**18 Sep 2026**

Allow:

**Confirm Date**

or:

**Enter Manually**

If OCR fails:

**Expiry date not detected**

Buttons:

**Try Again**

**Enter Manually**

## Screen 5, Add To Cart confirmation

After adding an item, show a compact confirmation state:

**Added to cart**

Product name.

Quantity control.

Buttons:

**Continue Scanning**

**View Cart**

Selecting Continue Scanning immediately returns to the scanner.

## Screen 6, Cart

Header:

**Your Cart**

**Everything in one place.**

Show all products as cards.

Each item must contain:

* Product icon/image.
* Product name.
* Calories per unit.
* MRP per unit.
* Quantity stepper.
* Delete icon.

Default quantity must always start at 1.

Quantity controls:

`-   1   +`

Never show quantity 0 inside an active cart item.

When quantity reaches zero, remove the item from the cart.

Show cart summary:

**Total Items**

**Total Calories**

**Total MRP**

Primary action:

**Proceed to Pay ₹369**

The total price must dynamically update when quantities change.

The total calories must also dynamically update.

## Screen 7, Product Details

When a user taps a product, show:

* Product name
* Brand
* Product category
* Calories
* Protein
* Carbohydrates
* Fat
* Serving size
* MRP
* Expiry date
* Ingredients if available
* Other available product information

Separate information into clear sections:

**Nutrition**

**Price**

**Expiry**

**Product Information**

Use unavailable states rather than fabricated data.

Example:

**Expiry**

Not detected

[Scan expiry]

## Screen 8, Checkout

Header:

**Checkout**

Show:

**Order Summary**

Each product:

Product name × quantity
Price

Then:

**Total Calories**

**Total**

Payment options:

### UPI

Google Pay, PhonePe, Paytm

### Credit/Debit Card

Visa, Mastercard, RuPay

### Wallet

Paytm, PhonePe, Amazon Pay

Use radio selection.

The payment button should remain disabled until a payment method is selected.

Button:

**Complete Payment ₹369**

## Screen 9, Payment Success

Show a clear success state.

**Payment successful**

**Order #SC10284**

Display:

* Total amount
* Total items
* Total calories
* Product list

Primary button:

**Back to Home**

Secondary action:

**View Order**

## Screen 10, Scan History

Create a complete scan history page.

Each entry shows:

* Product
* Date
* Calories
* Price
* Expiry status

Add filters:

**All**

**Today**

**This Week**

Tapping an entry opens Product Details.

## Screen 11, Unknown Product

Create an error state for an unknown barcode.

Message:

**Product not found**

**We could not find information for this barcode.**

Actions:

**Scan Again**

**Enter Barcode Manually**

**Add Product Manually**

If Add Product Manually is selected, create a simple product entry form with:

* Product name
* Brand
* MRP
* Calories
* Protein
* Expiry date

## Required error states

Implement functional states for:

* Camera permission denied.
* Barcode not detected.
* Unknown barcode.
* Product information unavailable.
* Expiry OCR failed.
* Expiry date unavailable.
* Payment failed.
* Empty cart.
* Network/API unavailable.

Each state must provide a clear next action.

## Functional prototype behavior

The prototype must not just link static frames.

Implement real interactive state changes wherever possible.

The main functional flow should be:

Home
→ Start Scanning
→ Scanner
→ Barcode Detected
→ Analyzing
→ Product Detected
→ Scan Expiry
→ Expiry Detected
→ Add To Cart
→ Scanner
→ Scan another product
→ Cart
→ Checkout
→ Payment Selection
→ Complete Payment
→ Payment Success
→ Home

Also allow:

Home → Recent Scans → Product Details

Cart → Product Details

Scanner → Unknown Product → Manual Entry

## Simulated product database

Because this is a prototype, create a local mock product database with realistic sample products.

Include at least:

1. Buldak Ramen

* Calories: 530 kcal
* MRP: ₹130
* Protein: 11 g
* Brand: Samyang

2. Dunkin Donut

* Calories: 393 kcal
* MRP: ₹209
* Brand: Dunkin

3. Mineral Water

* Calories: 0 kcal
* MRP: ₹30
* Protein: 0 g
* Brand: Varahi

Create barcode IDs for each product and make the scanner interaction resolve to the appropriate product.

Do not invent data beyond the sample dataset.

## Data architecture

Use a simple structured product object containing:

* barcode
* name
* brand
* category
* image
* calories
* servingSize
* protein
* carbohydrates
* fat
* mrp
* expiry
* ingredients
* dataSource
* confidence

Use dataSource values such as:

* Database
* OCR
* User Entered

Use confidence states where appropriate:

* Verified
* Detected
* User Entered
* Unavailable

## State management

Create functional state for:

* Current scanned product.
* Cart items.
* Cart quantities.
* Total calories.
* Total price.
* Selected payment method.
* Scan history.
* Expiry date.
* Scanner state.
* Product analysis state.

Make totals update dynamically.

For example:

If Buldak Ramen costs ₹130 and quantity changes from 1 to 2:

Total price must become ₹260.

If Buldak Ramen contains 530 kcal:

Total calories must become 1060 kcal.

## Important realism rules

Do not imply that ordinary retail barcodes contain:

* Calories.
* Ingredients.
* Exact expiry date.
* Exact MRP.

The barcode identifies the product.

Nutrition and product information should come from a product data source.

Expiry should usually be obtained through OCR of the printed package or manual entry.

MRP may come from product data or package OCR.

Show these distinctions in the UI where useful.

## Interactions

Add:

* Tap interactions.
* Button states.
* Hover states where applicable.
* Loading states.
* Empty states.
* Error states.
* Quantity increment/decrement.
* Delete item.
* Navigation.
* Payment selection.
* Modal confirmations.
* Animated scanner state.
* Animated loading state.
* Success state.

Use smooth, subtle transitions.

Do not use excessive animation.

## Accessibility

Use:

* High contrast.
* Large touch targets.
* Clear button labels.
* Consistent navigation.
* Do not rely only on color to communicate status.

## Responsive behavior

Primary target:

Mobile width approximately 390 px.

The UI should also adapt reasonably to:

* 375 px
* 430 px

Do not design desktop-first screens.

## Prototype quality

The final result should feel like a polished production concept suitable for a design portfolio case study.

Every important screen should have a complete visual state.

Do not leave blank placeholder screens.

Do not use lorem ipsum.

Do not use generic stock UI components that conflict with the visual language.

Use realistic content throughout.

## Deliverable

Generate the complete working prototype and package all required files into a ZIP archive.

The ZIP should contain:

* Complete application source.
* All assets.
* Product data.
* Any required mock API/data files.
* Configuration files.
* Instructions for running the prototype.

The prototype must be runnable without manually reconstructing the screens.

The final experience should clearly demonstrate:

**Scan → Identify → Analyze → Verify → Add → Cart → Checkout**

This is the central product experience and should receive the most design and interaction detail.
