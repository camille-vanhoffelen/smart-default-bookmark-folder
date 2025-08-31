import { Tensor } from '@huggingface/transformers';
import { ModelSingleton } from './model.js';

export async function embed(texts) {
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

export function isEnoughContent(content) {
  return content && content.trim().replace(/\s+/g, '').length >= 3;
}

export async function saveAllEmbeddings(embeddingStorage) {
  for (const [bookmarkId, embeddings] of Object.entries(embeddingStorage)) {
    const key = `embedding_${bookmarkId}`;
    await browser.storage.local.set({ [key]: embeddings });
  }
}

export async function getEmbeddings(bookmarkId) {
  const key = `embedding_${bookmarkId}`;
  const result = await browser.storage.local.get(key);
  return result[key] || [];
}