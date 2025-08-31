import { AutoModel, AutoTokenizer, env } from '@huggingface/transformers';

// Self-host WASM binaries for strict CSP
env.backends.onnx.wasm.wasmPaths = browser.runtime.getURL('static/wasm/');

export class ModelSingleton {
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

export async function preloadModel() {
  try {
    console.log('Preloading model...');
    await ModelSingleton.getModelInstance();
    await ModelSingleton.getTokenizerInstance();
    console.log('Model preloaded successfully');
  } catch (error) {
    console.error('Failed to preload model:', error);
  }
}