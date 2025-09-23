/**
 * Singleton wrapper for Transformers.js model and tokenizer loading.
 */

import { AutoModel, AutoTokenizer, env } from '@huggingface/transformers';

// Self-host WASM binaries for strict CSP
env.backends.onnx.wasm.wasmPaths = browser.runtime.getURL('static/wasm/');

/**
 * Manages model and tokenizer instances with lazy loading.
 */
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

  /**
   * Gets model instance, loading if needed.
   */
  static async getModelInstance(progress_callback = null) {
    this.model ??= AutoModel.from_pretrained(this.modelName, this.modelConfig, { progress_callback });
    return this.model;
  }

  /**
   * Gets tokenizer instance, loading if needed.
   */
  static async getTokenizerInstance(progress_callback = null) {
    this.tokenizer ??= AutoTokenizer.from_pretrained(this.modelName, this.tokenizerConfig, { progress_callback });
    return this.tokenizer;
  }
}

/**
 * Preloads both model and tokenizer for faster embedding generation.
 */
export async function preloadModel() {
  try {
    console.log('Preloading model...');
    const progress_callback = (progress) => console.log('Download progress:', progress);
    
    console.log('Loading model instance...');
    await ModelSingleton.getModelInstance(progress_callback);
    console.log('Model instance loaded');
    
    console.log('Loading tokenizer instance...');
    await ModelSingleton.getTokenizerInstance(progress_callback);
    console.log('Tokenizer instance loaded');
    
    console.log('Model preloaded successfully');
  } catch (error) {
    console.error('Failed to preload model:', error);
  }
}