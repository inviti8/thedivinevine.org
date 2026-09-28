import { persistentAtom } from '@nanostores/persistent';

// Display-only fields. The server re-prices from the product collection at
// checkout, so only { slug, quantity } is ever trusted (DESIGN.md §6).
export interface CartItem {
  slug: string;
  name: string;
  priceUsd: number;
  image: string;
  quantity: number;
}

export const cart = persistentAtom<CartItem[]>('dv-cart', [], {
  encode: JSON.stringify,
  decode: JSON.parse,
});

export function addToCart(item: Omit<CartItem, 'quantity'>, qty = 1) {
  const current = cart.get();
  const existing = current.find((i) => i.slug === item.slug);
  if (existing) {
    cart.set(current.map((i) => (i.slug === item.slug ? { ...i, quantity: i.quantity + qty } : i)));
  } else {
    cart.set([...current, { ...item, quantity: qty }]);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cart:open'));
  }
}

export function removeFromCart(slug: string) {
  cart.set(cart.get().filter((i) => i.slug !== slug));
}

export function updateQuantity(slug: string, qty: number) {
  if (qty <= 0) return removeFromCart(slug);
  cart.set(cart.get().map((i) => (i.slug === slug ? { ...i, quantity: qty } : i)));
}

export function cartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.priceUsd * i.quantity, 0);
}

export function clearCart() {
  cart.set([]);
}
