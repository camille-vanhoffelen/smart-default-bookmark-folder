// background.js (or service worker)
import { AutoModel, AutoTokenizer, Tensor, env } from '@huggingface/transformers';


// Self-host WASM binaries for strict CSP
env.backends.onnx.wasm.wasmPaths = browser.runtime.getURL('static/wasm/');

class ModelSingleton {
  static modelName = 'minishlab/potion-base-8M';
  static modelConfig = {
    config: { model_type: 'model2vec' },
    revision: 'main',
    dtype: 'fp32'
  };
  static tokenizerConfig = {
    revision: 'main'
  };
  static model = null;
  static tokenizer = null;

  static async getModelInstance(progress_callback = null) {
    this.model ??= AutoModel.from_pretrained(this.modelName, this.modelConfig, { progress_callback });
    return this.model;
  }

  static async getTokenizerInstance(progress_callback = null) {
    this.tokenizer ??= AutoTokenizer.from_pretrained(this.modelName, this.tokenizerConfig, { progress_callback });
    return this.tokenizer;
  }
}

async function embed(texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('texts must be a non-empty array');
  }
  
  try {
    const model = await ModelSingleton.getModelInstance((data) => {
      console.log('progress', data)
    });
    const tokenizer = await ModelSingleton.getTokenizerInstance((data) => {
      console.log('progress', data)
    });
    console.log('Model loaded:', model);
    console.log('Tokenizer loaded:', tokenizer);

    const { input_ids } = await tokenizer(texts, { add_special_tokens: false, return_tensor: false });

    const cumsum = arr => arr.reduce((acc, num, i) => [...acc, num + (acc[i - 1] || 0)], []);
    const offsets = [0, ...cumsum(input_ids.slice(0, -1).map(x => x.length))];

    const flattened_input_ids = input_ids.flat();
    const modelInputs = {
        input_ids: new Tensor('int64', flattened_input_ids, [flattened_input_ids.length]),
        offsets: new Tensor('int64', offsets, [offsets.length])
    };

    const { embeddings } = await model(modelInputs);
    return embeddings.tolist();
  } catch (error) {
    console.error('Error in embed function:', error);
    return null;
  }
}

async function getCurrentTabContent() {
  const tabs = await browser.tabs.query({
    currentWindow: true,
    active: true,
  });

  if (tabs.length !== 1) return null;

  return await getTabContent(tabs[0].id);
}

async function getTabContent(tabId) {
  try {
    const response = await browser.tabs.sendMessage(tabId, {
      type: "extractTextContent"
    });

    if (response && response.textContent) {
      console.log("Text content extracted:", response.textContent);
      return response.textContent;
    }
    return null;
  } catch (error) {
    console.error(`Could not get tab content: ${error}`);
    return null;
  }
}

async function handleCreated(id, bookmarkInfo) {
  console.log(`New bookmark ID: ${id}`);
  console.log(`New bookmark URL: ${bookmarkInfo.url}`);
  console.log(`New bookmark title: ${bookmarkInfo.title}`);
  console.log(`New bookmark parent ID: ${bookmarkInfo.parentId}`);

  const content = await getCurrentTabContent();
  if (content) {
    const embeddings = await embed([content]);
    console.log("Embedding calculated:", embeddings);
  }
}

// Preload model on extension startup
async function preloadModel() {
  try {
    console.log('Preloading model...');
    await ModelSingleton.getModelInstance();
    await ModelSingleton.getTokenizerInstance();
    console.log('Model preloaded successfully');
  } catch (error) {
    console.error('Failed to preload model:', error);
  }
}

// Start preloading immediately
preloadModel();

browser.bookmarks.onCreated.addListener(handleCreated);