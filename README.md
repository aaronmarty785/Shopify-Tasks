# Task 1
#Test Store
https://quickstart-a356df16.myshopify.com/
password: aaronmarty

# Dynamic Cart Upsell Component

A high-performance, native Shopify upsell component built specifically for the **Dawn theme**. This project utilizes the Shopify Product Recommendations API to suggest items based on the first product in the cart, featuring a custom AJAX implementation to handle Dawn's dynamic drawer rendering.

## 🚀 Features

- **Recommendations**: Uses Shopify's native recommendation engine to suggest "Frequently Bought Together" products.
- **Real-Time Sync**: Automatically refreshes recommendations when the cart is updated without a page reload.
- **Smart Filtering**: Automatically excludes products that are already present in the user's cart to maximize conversion.
- **Loop Protection**: Built-in debouncing and state-tracking to prevent infinite API loops and `429 Too Many Requests` errors.
- **Zero Dependencies**: Built with vanilla JavaScript and Liquid; no third-party apps required.

## 🛠️ Technical Stack

- **Liquid**: For the container architecture and initial state data.
- **Vanilla JavaScript (ES6)**: For the AJAX engine and DOM manipulation.
- **Shopify Cart AJAX API**: To manage adding items and refreshing the drawer state.
- **Shopify Recommendations API**: To fetch context-aware product data.

## 📂 File Structure

- `snippets/cart-upsell.liquid`: The HTML container and CSS styling.
- `assets/cart-upsell.js`: The core logic class `CartUpsell`.
- `snippets/cart-drawer.liquid`: Integration point for the Dawn theme drawer.

## ⚙️ Installation

1. **Upload Assets**: Add `cart-upsell.js` to your theme's `assets` folder.
2. **Create Snippet**: Create `cart-upsell.liquid` in the `snippets` folder and paste the provided code.
3. **Inject Component**: Add the following line to your `snippets/cart-drawer.liquid` (above the footer):
   ```liquid
    {% render 'cart-upsell' %}
    <script src="{{ 'cart-upsell.js' | asset_url }}" defer="defer"></script>
