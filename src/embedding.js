import { Tensor } from '@huggingface/transformers';
import { ModelSingleton } from './model.js';

export class EmbeddingError extends Error {
  constructor(message, originalError = null) {
    super(message);
    this.name = 'EmbeddingError';
    this.originalError = originalError;
  }
}

export async function embed(texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('texts must be a non-empty array');
  }

  try {
    // Filter out insufficient content and keep track of original indices
    const validTexts = [];
    const indexMap = []; // maps validTexts index to original texts index
    
    for (let i = 0; i < texts.length; i++) {
      if (isEnoughContent(texts[i])) {
        indexMap.push(i);
        validTexts.push(texts[i]);
      }
    }

    // If no valid texts, return array of nulls
    if (validTexts.length === 0) {
      return new Array(texts.length).fill(null);
    }

    const model = await ModelSingleton.getModelInstance((data) => {
      console.log('progress', data)
    });
    const tokenizer = await ModelSingleton.getTokenizerInstance((data) => {
      console.log('progress', data)
    });
    console.log('Model loaded:', model);
    console.log('Tokenizer loaded:', tokenizer);

    const { input_ids } = await tokenizer(validTexts, { add_special_tokens: false, return_tensor: false });

    const cumsum = arr => arr.reduce((acc, num, i) => [...acc, num + (acc[i - 1] || 0)], []);
    const offsets = [0, ...cumsum(input_ids.slice(0, -1).map(x => x.length))];

    const flattened_input_ids = input_ids.flat();
    const modelInputs = {
      input_ids: new Tensor('int64', flattened_input_ids, [flattened_input_ids.length]),
      offsets: new Tensor('int64', offsets, [offsets.length])
    };

    const { embeddings } = await model(modelInputs);
    const validEmbeddings = embeddings.tolist();

    // Reconstruct result array with nulls for insufficient content
    const result = new Array(texts.length).fill(null);
    for (let i = 0; i < validEmbeddings.length; i++) {
      const originalIndex = indexMap[i];
      result[originalIndex] = validEmbeddings[i];
    }

    return result;
  } catch (error) {
    throw new EmbeddingError('Failed to generate embeddings', error);
  }
}

export function isEnoughContent(content) {
  return content && content.trim().replace(/\s+/g, '').length >= 3;
}

function nodeIdToStorageKey(bookmarkNodeId) {
  return `embedding_${bookmarkNodeId}`;
}

export function storageKeyToNodeId(storageKey) {
  return storageKey.startsWith('embedding_') ? storageKey.slice(10) : null;
}

export async function saveAllEmbeddings(embeddingStorage) {
  for (const [bookmarkNodeId, embeddings] of Object.entries(embeddingStorage)) {
    const key = nodeIdToStorageKey(bookmarkNodeId);
    await browser.storage.local.set({ [key]: embeddings });
  }
}

export async function saveEmbeddings(bookmarkNodeId, embeddings) {
  const key = nodeIdToStorageKey(bookmarkNodeId);
  console.log(`Saving embeddings for bookmark node ${bookmarkNodeId}`);
  await browser.storage.local.set({ [key]: embeddings });
}

export async function getEmbeddings(bookmarkNodeId) {
  const key = nodeIdToStorageKey(bookmarkNodeId);
  const result = await browser.storage.local.get(key);
  const embeddings = result[key] || {};
  console.log(`Retrieved embeddings for bookmark node ${bookmarkNodeId}`);
  return embeddings;
}

export async function deleteEmbeddings(bookmarkNodeIds) {
  if (Array.isArray(bookmarkNodeIds)) {
    const keys = bookmarkNodeIds.map(id => nodeIdToStorageKey(id));
    console.log(`Deleting embeddings for ${bookmarkNodeIds.length} bookmarks:`, bookmarkNodeIds);
    await browser.storage.local.remove(keys);
  } else {
    const key = getStorageKey(bookmarkNodeIds);
    console.log(`Deleting embeddings for bookmark ${bookmarkNodeIds}`);
    await browser.storage.local.remove(key);
  }
}

export async function getStoredNodeIds() {
  const allStorage = await browser.storage.local.get();
  return Object.keys(allStorage).map(key => storageKeyToNodeId(key)).filter(id => id !== null);
}

export async function clearAllEmbeddings() {
  const allStorage = await browser.storage.local.get();
  const embeddingKeys = Object.keys(allStorage).filter(key => key.startsWith('embedding_'));
  await browser.storage.local.remove(embeddingKeys);
  console.log(`Cleared ${embeddingKeys.length} embedding entries`);
  return embeddingKeys.length;
}

