<script lang="ts">
  import { onMount } from 'svelte';
  import { cart, removeFromCart, updateQuantity, cartSubtotal, MAX_QUANTITY, type CartItem } from '~/lib/cart';

  let open = $state(false);
  let items = $state<CartItem[]>([]);
  let loading = $state(false);
  let error = $state('');

  onMount(() => {
    const unsub = cart.subscribe((v) => (items = v));
    const handler = () => {
      error = '';
      open = true;
    };
    window.addEventListener('cart:open', handler);
    return () => {
      unsub();
      window.removeEventListener('cart:open', handler);
    };
  });

  const subtotal = $derived(cartSubtotal(items));
  const UNAVAILABLE = 'Checkout is temporarily unavailable. Please try again shortly.';
  const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  async function checkout() {
    if (items.length === 0) return;
    loading = true;
    error = '';
    try {
      // Only slug + quantity: the server prices everything from the catalog.
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: items.map((i) => ({ slug: i.slug, quantity: i.quantity })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || UNAVAILABLE);
      window.location.href = data.url;
    } catch (err) {
      error = err instanceof Error && err.message !== 'Failed to fetch' ? err.message : UNAVAILABLE;
      loading = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (open = false)} />

{#if open}
  <div class="fixed inset-0 z-50 bg-black/70" onclick={() => (open = false)} role="presentation"></div>
  <aside
    class="fixed top-0 right-0 bottom-0 z-50 flex w-full max-w-md flex-col border-l border-gilt/40 bg-plum-deep"
    aria-label="Shopping cart"
  >
    <div class="flex items-center justify-between border-b border-gilt/30 p-6">
      <h2 class="font-display text-2xl">Your Basket</h2>
      <button onclick={() => (open = false)} class="text-2xl text-parchment-dim hover:text-parchment" aria-label="Close cart">&times;</button>
    </div>

    <div class="flex-1 space-y-4 overflow-y-auto p-6">
      {#if items.length === 0}
        <p class="text-parchment-dim italic">Your basket is empty.</p>
      {:else}
        {#each items as item (item.slug)}
          <div class="flex gap-4 border-b border-gilt/20 pb-4">
            <img src={item.image} alt={item.name} class="h-20 w-16 object-cover" />
            <div class="flex-1">
              <p class="font-display text-lg leading-tight">{item.name}</p>
              <p class="mt-1 text-sm text-gilt">{usd(item.priceUsd)}</p>
              <div class="mt-2 flex items-center gap-2 text-sm">
                <button onclick={() => updateQuantity(item.slug, item.quantity - 1)} class="border border-gilt/40 px-2" aria-label="Decrease quantity">−</button>
                <span>{item.quantity}</span>
                <button onclick={() => updateQuantity(item.slug, item.quantity + 1)} disabled={item.quantity >= MAX_QUANTITY} class="border border-gilt/40 px-2 disabled:opacity-40" aria-label="Increase quantity">+</button>
                <button onclick={() => removeFromCart(item.slug)} class="ml-auto text-xs text-mauve hover:text-parchment">Remove</button>
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>

    {#if items.length > 0}
      <div class="space-y-3 border-t border-gilt/30 p-6">
        <div class="flex items-baseline justify-between">
          <span class="eyebrow">Subtotal</span>
          <span class="price">{usd(subtotal)}</span>
        </div>
        <p class="text-xs text-parchment-dim">Shipping calculated at checkout.</p>
        {#if error}
          <p class="text-sm text-mauve" role="alert">{error}</p>
        {/if}
        <button onclick={checkout} disabled={loading} class="btn btn-primary w-full">
          {loading ? 'Preparing…' : 'Checkout'}
        </button>
      </div>
    {/if}
  </aside>
{/if}
