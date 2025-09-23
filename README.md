# <img src="icons/logo.svg" width="48" height="48" alt="Smart Default Bookmark Folder Icon"> Smart Default Bookmark Folder

> Sometimes saves you two clicks!

A Firefox browser extension that automatically suggests the best folder for new bookmarks.

## ✨ Features

- **Content-Aware Matching**: Uses embeddings to compare bookmark contents, titles, and paths
- **Real-time Processing**: Processes new bookmarks near-instantly
- **Privacy-First**: All ML inference is done in the browser using Transformers.js

## 🛠️ How It Works

1. **Content Extraction**: When you bookmark a page, the extension extracts clean text content using Mozilla Readability
2. **Embeddings Inference**: Calculates furiously fast [potion static embeddings](https://huggingface.co/minishlab/potion-base-8M) with Transformers.js
3. **Storage**: Embeddings are stored locally in browser storage, keyed by bookmark/folder ID for fast retrieval
4. **Similarity Matching**: Compares new bookmark content against existing folder and bookmark embeddings using cosine similarity
5. **Smart Relocation**: Automatically moves the bookmark to the folder with the highest content similarity

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Firefox browser for development
- `web-ext` CLI tool for Firefox development

### Installation

1. Install dependencies:
```bash
npm install
```

2. Build the extension:
```bash
npm run build
```

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