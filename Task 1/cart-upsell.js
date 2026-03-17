/**
 * CartUpsell Class
 * Manages dynamic product recommendations within the Shopify Dawn Cart Drawer.
 * * Logic:
 * - Listens for cart changes via Dawn's PubSub and MutationObservers.
 * - Fetches recommendations using the Shopify Product Recommendations API.
 * - Filters out items already present in the cart.
 * - Injects custom HTML UI into the cart drawer footer.
 */

class CartUpsell {
  constructor() {
    this.isFetching = false;
    this.lastAnchorId = null;
    this.init();
  }

  init() {
    this.fetchRecommendations();

    // Listen for Dawn's internal cart update
    if (typeof subscribe === 'function') {
      subscribe(PUB_SUB_EVENTS.cartUpdate, () => {
        this.debouncedFetch();
      });
    }
    
    // Mutation Observer with a guard to prevent infinite loops
    const drawer = document.querySelector('cart-drawer');
    if (drawer) {
      const observer = new MutationObserver((mutations) => {
        // Only trigger if nodes were actually added/removed
        const hasChange = mutations.some(m => m.addedNodes.length > 0 || m.removedNodes.length > 0);
        if (hasChange && !this.isFetching) {
          this.debouncedFetch();
        }
      });
      observer.observe(drawer, { childList: true, subtree: true });
    }
  }

  debouncedFetch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fetchRecommendations(), 300);
  }

  /**
   * Function to execute Upsell lifecycle:
   * 1. Fetches product recommendations based on the first item in the cart.
   * 2. Cross-references the current cart state to filter out already-purchased items.
   * 3. Prevents infinite loops and API rate-limiting via state tracking (isFetching) 
   * and anchor product comparison.
   */

  async fetchRecommendations() {
    const container = document.querySelector('#cart-upsell');
    if (!container || this.isFetching) return;

    const productId = container.dataset.anchorId;
  
    if (productId === this.lastAnchorId && container.querySelector('.upsell-card')) return;

    this.isFetching = true;

    try {
      const response = await fetch(`${container.dataset.url}.json?product_id=${productId}&limit=4`);
    
      if (!response.ok) throw new Error('Network response was not ok');
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new TypeError("Oops, we didn't get JSON!");
      }

      const { products } = await response.json();
      const cartRes = await fetch(window.Shopify.routes.root + 'cart.js');
      const cart = await cartRes.json();
      const cartIds = cart.items.map(item => item.product_id);

      const filtered = products.filter(p => !cartIds.includes(p.id)).slice(0, 2);
      
      this.lastAnchorId = productId;
      this.render(container, filtered);
    } catch (e) {
      console.error('Upsell Error:', e);
    } finally {
      this.isFetching = false;
    }
  }

  render(container, products) {
    const output = container.querySelector('#upsell-output');
    if (!output) return;

    if (products.length === 0) {
      container.style.display = 'none';
      return;
    }
    
    container.style.display = 'block';
    output.innerHTML = products.map(product => `
      <div class="upsell-card">
        <img src="${product.featured_image}" alt="${product.title}" width="100" height="100" loading="lazy">
        <div class="upsell-card__info">
          <p class="upsell-card__title" style="margin:0; font-weight:bold;">${product.title}</p>
          <span class="upsell-card__price">${(product.price / 100).toFixed(2)}</span>
          <button type="button" class="upsell-card__button" onclick="window.addUpsell(${product.variants[0].id}, this)">
            + Add
          </button>
        </div>
      </div>
    `).join('');
  }
}

// Global Add to Cart function
window.addUpsell = async (variantId, button) => {
  if (button) {
    button.innerText = '...';
    button.disabled = true;
  }

  try {
    await fetch(window.Shopify.routes.root + 'cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ id: variantId, quantity: 1 }] })
    });

    // Refresh Dawn's Drawer
    const drawer = document.querySelector('cart-drawer');
    if (drawer) {
      const res = await fetch(`${window.Shopify.routes.root}cart?section_id=cart-drawer`);
      const text = await res.text();
      const html = new DOMParser().parseFromString(text, 'text/html');
      const newContent = html.querySelector('#CartDrawer').innerHTML;
      document.querySelector('#CartDrawer').innerHTML = newContent;
    } else {
      window.location.reload();
    }
  } catch (error) {
    console.error('Add failed:', error);
  }
};

new CartUpsell();