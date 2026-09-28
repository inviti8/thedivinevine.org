# Runbook — running the site locally

How to get The Divine Vine running on your own computer, make changes, and share them back.
No deployment is involved: everything here runs only on your machine.

## 1. One-time setup

You need three free tools:

| Tool | What it's for | Get it |
|---|---|---|
| **Node.js** (version 22 LTS) | Runs the site | <https://nodejs.org> → download the **LTS** installer and click through it |
| **Git** | Downloads the code and tracks changes | Mac: open Terminal and run `xcode-select --install`. Windows: <https://git-scm.com/download/win> |
| **VS Code** (recommended) | Editing files | <https://code.visualstudio.com> |

> Prefer buttons over commands for Git? [GitHub Desktop](https://desktop.github.com) can do the
> download / update / share steps below. Running the site itself still needs the terminal steps.

Check that everything installed. Open a terminal (Mac: **Terminal** app; Windows: **PowerShell**) and run:

```bash
node -v    # should print v22.something (v20 also works)
git --version
```

## 2. Download the code (first time only)

```bash
git clone https://github.com/inviti8/thedivinevine.org.git
cd thedivinevine.org
npm install
```

`npm install` downloads the site's building blocks into a `node_modules` folder. It can take **several
minutes** the first time; that's normal. You only need to re-run it when told to (see §5).

The repository is public, so downloading needs no account. Sharing changes back (§6) does need a GitHub
account with write access.

## 3. Run the site

From inside the `thedivinevine.org` folder:

```bash
npm run dev
```

Then open **<http://localhost:4321>** in your browser.

- Leave the terminal window open while you work. The site runs from there.
- **Changes appear automatically:** save a file and the browser refreshes on its own.
- To stop the site, click the terminal and press **Ctrl + C**.
- Next time, just `cd` into the folder and run `npm run dev` again.

**Tip:** VS Code has a built-in terminal (menu **Terminal → New Terminal**) that opens in the right folder
automatically. Open the project with **File → Open Folder… → thedivinevine.org**.

## 4. What to edit

| To change… | Edit this file |
|---|---|
| A product (name, price, description, ingredients, cautions) | `src/content/products/<product>.mdx` |
| Add a product | Copy any file in `src/content/products/`, rename it, edit it. The file name becomes the page address (`/shop/<file-name>`). |
| Hide a product | Set `inStock: false` in its file |
| Show a product on the home page | Set `featured: true` in its file |
| Category descriptions (teas, tinctures, salves) | `src/content/categories/*.mdx` |
| Journal posts | `src/content/journal/*.mdx` (copy `welcome.mdx` to start a new one; `draft: true` hides it) |
| Consultation types, prices, lengths, weekly hours | `src/data/booking.json` |
| Shipping prices, free-shipping amount | `src/data/shop.json` |
| Colors and fonts | `src/styles/global.css` (the `@theme` block at the top) |
| Home page text | `src/pages/index.astro` |
| About / FAQ / Contact text | `src/pages/about.astro`, `faq.astro`, `contact.astro` |
| Policies | `src/pages/legal/*.astro` |
| Product photos | Put images in `public/images/products/`, then set `primaryImage: /images/products/your-photo.jpg` in the product file |

### Product file format

Everything between the `---` lines is the product's details. Keep the same layout (`name: value`, and
lists as `- item` lines, or `[a, b, c]`). Everything below the second `---` is the description shown on
the page. Blank lines separate paragraphs, `*text*` is italic and `**text**` is bold.

```yaml
---
name: Evening Calm Tea
category: teas              # must be teas, tinctures, or salves (a file name in src/content/categories)
priceUsd: 14
size: 40 g loose leaf
weightOz: 3
ingredients: [Chamomile flowers, Lemon balm leaf, Lavender buds]
usage: Steep 1 tablespoon in 8 oz of just-boiled water for 5–7 minutes.
cautions:                   # required, at least one
  - Avoid if allergic to plants in the daisy family.
primaryImage: /images/placeholder-product.svg
inStock: true
featured: true
---

The description goes here.
```

**Wording note:** product text can describe traditional use and how a product supports wellness. It must not
claim to diagnose, treat, cure or prevent a disease (e.g. avoid "cures colds" or "treats anxiety"). The FDA
disclaimer is added to every product page automatically.

## 5. Getting the latest changes

Before starting a session, pull down anything new:

```bash
git pull
npm install     # only needed if package.json changed, but it's always safe to run
npm run dev
```

## 6. Sharing your changes back

```bash
git status                          # see which files you changed
git add -A
git commit -m "Update tea descriptions and prices"
git pull                            # pick up anything new first
git push
```

If `git push` is refused with a permissions error, you haven't been given write access yet. Ask for it,
or send over the edited files.

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| `node: command not found` / `npm: command not found` | Node isn't installed, or the terminal was open during install. Close the terminal, open a new one, and try again. |
| The page shows a red error box after an edit | Read the message: it names the file and line. Usually a missing `---`, a missing required field (like `cautions`), a typo in `category`, or broken indentation. Undo the last change and retry. |
| An error mentions `booking.json` or `shop.json` | A config value is invalid (for example a missing comma or quote, or a time not written as `HH:MM`). The message says which field. |
| `Port 4321 is in use` | The site is already running in another terminal window. Use that one, or close it (Ctrl + C). Astro may also start on the next port (4322). Use the address it prints. |
| Changes don't show up | Check that the file is saved. Then refresh the browser. If that still doesn't work, stop the site (Ctrl + C) and run `npm run dev` again. |
| Basket shows old items | The basket is saved in the browser. Remove the items, or clear site data for `localhost`. |
| Something is badly broken after `git pull` | Run `npm install`, then `npm run dev` again. |
| Want to throw away your edits to one file | `git checkout -- path/to/file`. **This can't be undone.** |

## 8. What works locally right now

| Feature | Status |
|---|---|
| Browsing pages, shop, products, basket, journal | Works |
| Checkout button | Shows "Checkout unavailable" (payment isn't built yet) |
| Booking calendar | Not built yet; the page lists the consultation types |
| Newsletter / contact form | Not built yet |
| Animated art | Not built yet |

No accounts, keys or `.env` file are needed yet. Once payments and email are added, this runbook will explain
how to set up test keys.
