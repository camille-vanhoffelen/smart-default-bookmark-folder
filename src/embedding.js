/**
 * Text embedding generation and storage utilities using Transformers.js.
 */

import { Tensor } from '@huggingface/transformers';
import { ModelSingleton } from './model.js';


/**
 * Generates embeddings for array of texts using loaded model.
 * Returns null for texts with insufficient content.
 */
export async function embed(texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('texts must be a non-empty array');
  }

  try {
    const validTexts = [];
    const indexMap = [];
    
    for (let i = 0; i < texts.length; i++) {
      if (isEnoughContent(texts[i])) {
        indexMap.push(i);
        validTexts.push(texts[i]);
      }
    }

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

    const result = new Array(texts.length).fill(null);
    for (let i = 0; i < validEmbeddings.length; i++) {
      const originalIndex = indexMap[i];
      result[originalIndex] = validEmbeddings[i];
    }

    return result;
  } catch (error) {
    throw new Error('Failed to generate embeddings', { cause: error });
  }
}

/**
 * Checks if content has minimum length for embedding.
 */
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
  return embeddings;
}

export async function deleteEmbeddings(bookmarkNodeIds) {
  if (Array.isArray(bookmarkNodeIds)) {
    const keys = bookmarkNodeIds.map(id => nodeIdToStorageKey(id));
    console.log(`Deleting embeddings for ${bookmarkNodeIds.length} bookmarks:`, bookmarkNodeIds);
    await browser.storage.local.remove(keys);
  } else {
    const key = nodeIdToStorageKey(bookmarkNodeIds);
    console.log(`Deleting embeddings for bookmark ${bookmarkNodeIds}`);
    await browser.storage.local.remove(key);
  }
}

/**
 * Gets all bookmark node IDs that have stored embeddings.
 */
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

