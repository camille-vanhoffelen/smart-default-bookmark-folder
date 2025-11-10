# <img src="icons/logo.svg" width="48" height="48" alt="Smart Default Bookmark Folder Icon"> Smart Default Bookmark Folder

> Sometimes saves you two clicks!

A Firefox browser extension that automatically suggests the best folder for new bookmarks.

## ✨ Features

- **Content-Aware Matching**: Uses embeddings to compare bookmark contents, titles, and paths
- **Real-time Processing**: Processes new bookmarks near-instantly
- **Privacy-First**: All ML inference is done in the browser using Transformers.js

## 🛠️ How It Works

When you bookmark a page, the extension extracts clean text content using Mozilla Readability.
It then calculates furiously fast [potion static embeddings](https://huggingface.co/minishlab/potion-base-8M) with Transformers.js
The embeddings are stored locally in browser storage, keyed by bookmark/folder ID for fast retrieval.
When you create a new bookmark, its content is compared against existing folder and bookmark embeddings using cosine similarity.
Finally, the new bookmark is automatically moved to the best matching folder.

## 🚀 Getting Started

### Prerequisites

- [Node.js 18+ and npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- Firefox browser for development
- `web-ext` CLI tool for Firefox development

This build was only tested on macos 15.6.1, with node v24.4.1, and npm v11.4.2

### Installation

1. Install dependencies:
```bash
npm install
```

2. Build the extension:

```bash
npm run build
```

This bundles all the necessary source code and files under `build/`, and packages the extension as a `.zip` under `dist/`.

### Development

Run the extension in development mode:

```bash
npm run dev
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Credits

**Author**: [Camille Van Hoffelen](https://github.com/camille-vanhoffelen)

**Built with**:
- [Transformers.js](https://huggingface.co/docs/transformers.js)
- [Mozilla Readability](https://github.com/mozilla/readability)
- [minishlab/potion-base-8M](https://huggingface.co/minishlab/potion-base-8M)

**Icons made from**:
- Bookmark by Arto Moro from [Noun Project](https://thenounproject.com/browse/icons/term/bookmark/) (CC BY 3.0)
- Sparkle by Titik Kornia Sari from [Noun Project](https://thenounproject.com/browse/icons/term/sparkle/) (CC BY 3.0)