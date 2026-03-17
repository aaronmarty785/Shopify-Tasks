class CartRemoveButton extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('click', (event) => {
      event.preventDefault();
      const cartItems = this.closest('cart-items') || this.closest('cart-drawer-items');
      if (cartItems) {
        cartItems.updateQuantity(this.dataset.index, 0, event);
      }
    });
  }
}

customElements.define('cart-remove-button', CartRemoveButton);

/*
|--------------------------------------------------------------------------
| Free Gift With Purchase
|--------------------------------------------------------------------------
*/
const GWP = {
  enabled: false,
  variantId: null,
  threshold: 0,
  isProcessing: false,

  init(config) {
    if (!config || !config.enabled || !config.variantId) return;
    this.enabled = true;
    this.variantId = Number(config.variantId);
    this.threshold = Number(config.threshold);
  },

  getSubtotalExcludingGift(cart) {
    if (!cart || !cart.items) return 0;

    return cart.items
      .filter((item) => Number(item.variant_id) !== this.variantId)
      .reduce((sum, item) => sum + item.final_line_price, 0);
  },

  hasGift(cart) {
    if (!cart || !cart.items) return false;
    return cart.items.some((item) => Number(item.variant_id) === this.variantId);
  },

  getGiftItem(cart) {
    if (!cart || !cart.items) return null;
    return cart.items.find((item) => Number(item.variant_id) === this.variantId) || null;
  },

  async sync(cart, source = 'manual') {
    if (!this.enabled || this.isProcessing) return;
    if (source === 'gwp-logic') return;
    if (!cart || !cart.items) return;

    const subtotal = this.getSubtotalExcludingGift(cart);
    const giftItem = this.getGiftItem(cart);

    // Add immediately when subtotal >= threshold
    if (subtotal >= this.threshold && !giftItem) {
      await this.addGift();
      return;
    }

    // Remove immediately when subtotal < threshold
    if (subtotal < this.threshold && giftItem) {
      await this.removeGift(giftItem.key);
    }
  },

  async addGift() {
    this.isProcessing = true;

    try {
      const res = await fetch(`${window.routes.cart_add_url}.js`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          items: [
            {
              id: this.variantId,
              quantity: 1
            }
          ],
          sections: this.getSections(),
          sections_url: window.location.pathname
        })
      });

      const state = await res.json();

      if (state.sections) {
        this.renderSections(state);
      } else {
        await this.refreshCartSections();
      }

      if (typeof publish !== 'undefined') {
        publish(PUB_SUB_EVENTS.cartUpdate, {
          source: 'gwp-logic',
          cartData: state,
          variantId: this.variantId
        });
      }
    } catch (error) {
      console.error('GWP add error:', error);
    } finally {
      setTimeout(() => {
        this.isProcessing = false;
      }, 250);
    }
  },

  async removeGift(key) {
    this.isProcessing = true;

    try {
      const res = await fetch(`${window.routes.cart_change_url}.js`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          id: key,
          quantity: 0,
          sections: this.getSections(),
          sections_url: window.location.pathname
        })
      });

      const state = await res.json();

      if (state.sections) {
        this.renderSections(state);
      } else {
        await this.refreshCartSections();
      }

      if (typeof publish !== 'undefined') {
        publish(PUB_SUB_EVENTS.cartUpdate, {
          source: 'gwp-logic',
          cartData: state,
          variantId: this.variantId
        });
      }
    } catch (error) {
      console.error('GWP remove error:', error);
    } finally {
      setTimeout(() => {
        this.isProcessing = false;
      }, 250);
    }
  },

  getSections() {
    const sections = ['cart-icon-bubble', 'cart-live-region-text'];

    const mainCartItems = document.getElementById('main-cart-items');
    const mainCartFooter = document.getElementById('main-cart-footer');
    const cartDrawer = document.getElementById('CartDrawer');
    const cartDrawerItems = document.getElementById('CartDrawer-CartItems');

    if (mainCartItems?.dataset?.id) sections.push(mainCartItems.dataset.id);
    if (mainCartFooter?.dataset?.id) sections.push(mainCartFooter.dataset.id);

    // Some themes use cart-drawer section id
    if (cartDrawer) sections.push('cart-drawer');
    if (cartDrawerItems) sections.push('cart-drawer');

    return [...new Set(sections)];
  },

  renderSections(state) {
    const mapping = [
      {
        id: 'main-cart-items',
        possibleSectionKeys: [
          document.getElementById('main-cart-items')?.dataset?.id,
          'main-cart-items'
        ],
        selector: '.js-contents'
      },
      {
        id: 'main-cart-footer',
        possibleSectionKeys: [
          document.getElementById('main-cart-footer')?.dataset?.id,
          'main-cart-footer'
        ],
        selector: '.js-contents'
      },
      {
        id: 'cart-icon-bubble',
        possibleSectionKeys: ['cart-icon-bubble'],
        selector: '.shopify-section'
      },
      {
        id: 'cart-live-region-text',
        possibleSectionKeys: ['cart-live-region-text'],
        selector: '.shopify-section'
      },
      {
        id: 'CartDrawer',
        possibleSectionKeys: ['cart-drawer'],
        selector: '#CartDrawer'
      },
      {
        id: 'CartDrawer-CartItems',
        possibleSectionKeys: ['cart-drawer'],
        selector: '#CartDrawer-CartItems'
      }
    ];

    mapping.forEach((section) => {
      const targetEl = document.getElementById(section.id);
      if (!targetEl) return;

      let htmlString = null;
      for (const key of section.possibleSectionKeys) {
        if (key && state.sections?.[key]) {
          htmlString = state.sections[key];
          break;
        }
      }

      if (!htmlString) return;

      const parsed = new DOMParser().parseFromString(htmlString, 'text/html');
      const source =
        parsed.querySelector(section.selector) ||
        parsed.getElementById(section.id);

      if (!source) return;

      if (section.id === 'CartDrawer') {
        targetEl.innerHTML = source.innerHTML;
        return;
      }

      const target =
        targetEl.querySelector('.js-contents') ||
        targetEl.querySelector('.shopify-section') ||
        targetEl;

      target.innerHTML = source.innerHTML;
    });
  },

  async refreshCartSections() {
    try {
      const isDrawerOpen = document.querySelector('cart-drawer-items');

      if (isDrawerOpen) {
        const response = await fetch(`${routes.cart_url}?section_id=cart-drawer`);
        const responseText = await response.text();
        const html = new DOMParser().parseFromString(responseText, 'text/html');

        const selectors = ['#CartDrawer', 'cart-drawer-items', '.cart-drawer__footer'];
        selectors.forEach((selector) => {
          const target = document.querySelector(selector);
          const source = html.querySelector(selector);
          if (target && source) {
            target.replaceWith(source);
          }
        });
      } else {
        const response = await fetch(`${routes.cart_url}?section_id=main-cart-items`);
        const responseText = await response.text();
        const html = new DOMParser().parseFromString(responseText, 'text/html');

        const sourceItems = html.querySelector('cart-items');
        const targetItems = document.querySelector('cart-items');
        if (sourceItems && targetItems) {
          targetItems.innerHTML = sourceItems.innerHTML;
        }

        const footerResponse = await fetch(`${routes.cart_url}?section_id=main-cart-footer`);
        const footerText = await footerResponse.text();
        const footerHtml = new DOMParser().parseFromString(footerText, 'text/html');
        const sourceFooter = footerHtml.querySelector('#main-cart-footer .js-contents');
        const targetFooter = document.querySelector('#main-cart-footer .js-contents');
        if (sourceFooter && targetFooter) {
          targetFooter.innerHTML = sourceFooter.innerHTML;
        }
      }
    } catch (error) {
      console.error('GWP refresh error:', error);
    }
  },

  async initialCheck() {
    if (!this.enabled || this.isProcessing) return;

    try {
      const res = await fetch(`${window.routes.cart_url}.js`, {
        headers: { Accept: 'application/json' }
      });
      const cart = await res.json();
      await this.sync(cart, 'initial-load');
    } catch (error) {
      console.error('GWP initial check error:', error);
    }
  }
};

if (window.GWP_CONFIG) {
  GWP.init(window.GWP_CONFIG);
}

class CartItems extends HTMLElement {
  constructor() {
    super();
    this.lineItemStatusElement =
      document.getElementById('shopping-cart-line-item-status') ||
      document.getElementById('CartDrawer-LineItemStatus');

    const debouncedOnChange = debounce((event) => {
      this.onChange(event);
    }, ON_CHANGE_DEBOUNCE_TIMER);

    this.addEventListener('change', debouncedOnChange.bind(this));
  }

  cartUpdateUnsubscriber = undefined;

  connectedCallback() {
    this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
      if (event.source === 'cart-items') return;
      return this.onCartUpdate();
    });
  }

  disconnectedCallback() {
    if (this.cartUpdateUnsubscriber) {
      this.cartUpdateUnsubscriber();
    }
  }

  resetQuantityInput(id) {
    const input = this.querySelector(`#Quantity-${id}`) || this.querySelector(`#Drawer-quantity-${id}`);
    if (!input) return;
    input.value = input.getAttribute('value');
    this.isEnterPressed = false;
  }

  setValidity(event, index, message) {
    event.target.setCustomValidity(message);
    event.target.reportValidity();
    this.resetQuantityInput(index);
    event.target.select();
  }

  validateQuantity(event) {
    const inputValue = parseInt(event.target.value);
    const index = event.target.dataset.index;
    let message = '';

    if (inputValue < event.target.dataset.min) {
      message = window.quickOrderListStrings.min_error.replace('[min]', event.target.dataset.min);
    } else if (inputValue > parseInt(event.target.max)) {
      message = window.quickOrderListStrings.max_error.replace('[max]', event.target.max);
    } else if (inputValue % parseInt(event.target.step) !== 0) {
      message = window.quickOrderListStrings.step_error.replace('[step]', event.target.step);
    }

    if (message) {
      this.setValidity(event, index, message);
    } else {
      event.target.setCustomValidity('');
      event.target.reportValidity();
      this.updateQuantity(
        index,
        inputValue,
        event,
        document.activeElement ? document.activeElement.getAttribute('name') : null,
        event.target.dataset.quantityVariantId
      );
    }
  }

  onChange(event) {
    this.validateQuantity(event);
  }

  onCartUpdate() {
    if (this.tagName === 'CART-DRAWER-ITEMS') {
      return fetch(`${routes.cart_url}?section_id=cart-drawer`)
        .then((response) => response.text())
        .then((responseText) => {
          const html = new DOMParser().parseFromString(responseText, 'text/html');
          const selectors = ['cart-drawer-items', '.cart-drawer__footer'];
          for (const selector of selectors) {
            const targetElement = document.querySelector(selector);
            const sourceElement = html.querySelector(selector);
            if (targetElement && sourceElement) {
              targetElement.replaceWith(sourceElement);
            }
          }
        })
        .catch((e) => {
          console.error(e);
        });
    } else {
      return fetch(`${routes.cart_url}?section_id=main-cart-items`)
        .then((response) => response.text())
        .then((responseText) => {
          const html = new DOMParser().parseFromString(responseText, 'text/html');
          const sourceQty = html.querySelector('cart-items');
          if (sourceQty) {
            this.innerHTML = sourceQty.innerHTML;
          }
        })
        .catch((e) => {
          console.error(e);
        });
    }
  }

  getSectionsToRender() {
    const sections = [
      {
        id: 'main-cart-items',
        section: document.getElementById('main-cart-items')?.dataset.id,
        selector: '.js-contents'
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section'
      },
      {
        id: 'cart-live-region-text',
        section: 'cart-live-region-text',
        selector: '.shopify-section'
      }
    ];

    const mainCartFooter = document.getElementById('main-cart-footer');
    if (mainCartFooter?.dataset?.id) {
      sections.push({
        id: 'main-cart-footer',
        section: mainCartFooter.dataset.id,
        selector: '.js-contents'
      });
    }

    return sections.filter((section) => section.section);
  }

  updateQuantity(line, quantity, event, name, variantId) {
    const eventTarget = event.currentTarget instanceof CartRemoveButton ? 'clear' : 'change';
    const cartPerformanceUpdateMarker = CartPerformance.createStartingMarker(`${eventTarget}:user-action`);

    this.enableLoading(line);

    const body = JSON.stringify({
      line,
      quantity,
      sections: this.getSectionsToRender().map((section) => section.section),
      sections_url: window.location.pathname
    });

    fetch(`${routes.cart_change_url}`, { ...fetchConfig(), body })
      .then((response) => response.text())
      .then(async (state) => {
        const parsedState = JSON.parse(state);

        CartPerformance.measure(`${eventTarget}:paint-updated-sections`, () => {
          const quantityElement =
            document.getElementById(`Quantity-${line}`) ||
            document.getElementById(`Drawer-quantity-${line}`);
          const items = document.querySelectorAll('.cart-item');

          if (parsedState.errors) {
            if (quantityElement) {
              quantityElement.value = quantityElement.getAttribute('value');
            }
            this.updateLiveRegions(line, parsedState.errors);
            return;
          }

          this.classList.toggle('is-empty', parsedState.item_count === 0);
          const cartDrawerWrapper = document.querySelector('cart-drawer');
          const cartFooter = document.getElementById('main-cart-footer');

          if (cartFooter) cartFooter.classList.toggle('is-empty', parsedState.item_count === 0);
          if (cartDrawerWrapper) cartDrawerWrapper.classList.toggle('is-empty', parsedState.item_count === 0);

          this.getSectionsToRender().forEach((section) => {
            const container = document.getElementById(section.id);
            if (!container || !parsedState.sections?.[section.section]) return;

            const elementToReplace =
              container.querySelector(section.selector) || container;

            elementToReplace.innerHTML = this.getSectionInnerHTML(
              parsedState.sections[section.section],
              section.selector
            );
          });

          const updatedValue = parsedState.items[line - 1]
            ? parsedState.items[line - 1].quantity
            : undefined;

          let message = '';
          if (
            quantityElement &&
            items.length === parsedState.items.length &&
            updatedValue !== parseInt(quantityElement.value)
          ) {
            if (typeof updatedValue === 'undefined') {
              message = window.cartStrings.error;
            } else {
              message = window.cartStrings.quantityError.replace('[quantity]', updatedValue);
            }
          }

          this.updateLiveRegions(line, message);

          const lineItem =
            document.getElementById(`CartItem-${line}`) ||
            document.getElementById(`CartDrawer-Item-${line}`);

          if (lineItem && name && lineItem.querySelector(`[name="${name}"]`)) {
            cartDrawerWrapper
              ? trapFocus(cartDrawerWrapper, lineItem.querySelector(`[name="${name}"]`))
              : lineItem.querySelector(`[name="${name}"]`).focus();
          } else if (parsedState.item_count === 0 && cartDrawerWrapper) {
            trapFocus(
              cartDrawerWrapper.querySelector('.drawer__inner-empty'),
              cartDrawerWrapper.querySelector('a')
            );
          } else if (document.querySelector('.cart-item') && cartDrawerWrapper) {
            trapFocus(cartDrawerWrapper, document.querySelector('.cart-item__name'));
          }
        });

        publish(PUB_SUB_EVENTS.cartUpdate, {
          source: 'cart-items',
          cartData: parsedState,
          variantId: variantId
        });

        // IMPORTANT: use updated cart response directly
        if (GWP.enabled) {
          await GWP.sync(parsedState, 'cart-items');
        }
      })
      .catch(() => {
        this.querySelectorAll('.loading__spinner').forEach((overlay) => overlay.classList.add('hidden'));
        const errors =
          document.getElementById('cart-errors') ||
          document.getElementById('CartDrawer-CartErrors');
        if (errors) {
          errors.textContent = window.cartStrings.error;
        }
      })
      .finally(() => {
        this.disableLoading(line);
        CartPerformance.measureFromMarker(`${eventTarget}:user-action`, cartPerformanceUpdateMarker);
      });
  }

  updateLiveRegions(line, message) {
    const lineItemError =
      document.getElementById(`Line-item-error-${line}`) ||
      document.getElementById(`CartDrawer-LineItemError-${line}`);

    if (lineItemError) {
      const errorText = lineItemError.querySelector('.cart-item__error-text');
      if (errorText) errorText.textContent = message;
    }

    if (this.lineItemStatusElement) {
      this.lineItemStatusElement.setAttribute('aria-hidden', true);
    }

    const cartStatus =
      document.getElementById('cart-live-region-text') ||
      document.getElementById('CartDrawer-LiveRegionText');

    if (cartStatus) {
      cartStatus.setAttribute('aria-hidden', false);
      setTimeout(() => {
        cartStatus.setAttribute('aria-hidden', true);
      }, 1000);
    }
  }

  getSectionInnerHTML(html, selector) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const el = parsed.querySelector(selector);
    return el ? el.innerHTML : '';
  }

  enableLoading(line) {
    const mainCartItems =
      document.getElementById('main-cart-items') ||
      document.getElementById('CartDrawer-CartItems');

    if (mainCartItems) {
      mainCartItems.classList.add('cart__items--disabled');
    }

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

    [...cartItemElements, ...cartDrawerItemElements].forEach((overlay) =>
      overlay.classList.remove('hidden')
    );

    if (document.activeElement) document.activeElement.blur();
    if (this.lineItemStatusElement) {
      this.lineItemStatusElement.setAttribute('aria-hidden', false);
    }
  }

  disableLoading(line) {
    const mainCartItems =
      document.getElementById('main-cart-items') ||
      document.getElementById('CartDrawer-CartItems');

    if (mainCartItems) {
      mainCartItems.classList.remove('cart__items--disabled');
    }

    const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
    const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

    cartItemElements.forEach((overlay) => overlay.classList.add('hidden'));
    cartDrawerItemElements.forEach((overlay) => overlay.classList.add('hidden'));
  }
}

customElements.define('cart-items', CartItems);

if (!customElements.get('cart-note')) {
  customElements.define(
    'cart-note',
    class CartNote extends HTMLElement {
      constructor() {
        super();

        this.addEventListener(
          'input',
          debounce((event) => {
            const body = JSON.stringify({ note: event.target.value });
            fetch(`${routes.cart_update_url}`, { ...fetchConfig(), body }).then(() =>
              CartPerformance.measureFromEvent('note-update:user-action', event)
            );
          }, ON_CHANGE_DEBOUNCE_TIMER)
        );
      }
    }
  );
}

window.addEventListener('load', () => {
  if (GWP.enabled) {
    GWP.initialCheck();
  }
});