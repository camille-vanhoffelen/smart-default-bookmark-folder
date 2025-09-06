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

function getStorageKey(bookmarkNodeId) {
  return `embedding_${bookmarkNodeId}`;
}

export function getBookmarkId(storageKey) {
  return storageKey.startsWith('embedding_') ? storageKey.slice(10) : null;
}

export async function saveAllEmbeddings(embeddingStorage) {
  // TODO error handling
  for (const [bookmarkNodeId, embeddings] of Object.entries(embeddingStorage)) {
    const key = getStorageKey(bookmarkNodeId);
    await browser.storage.local.set({ [key]: embeddings });
  }
}

export async function saveEmbeddings(bookmarkNodeId, embeddings) {
  // TODO error handling
  const key = getStorageKey(bookmarkNodeId);
  console.log(`Saving embeddings for bookmark node ${bookmarkNodeId}`);
  await browser.storage.local.set({ [key]: embeddings });
}

export async function getEmbeddings(bookmarkNodeId) {
  // TODO error handling
  const key = getStorageKey(bookmarkNodeId);
  const result = await browser.storage.local.get(key);
  const embeddings = result[key] || {};
  console.log(`Retrieved embeddings for bookmark node ${bookmarkNodeId}`);
  return embeddings;
}

export async function deleteEmbeddings(bookmarkIds) {
  if (Array.isArray(bookmarkIds)) {
    const keys = bookmarkIds.map(id => getStorageKey(id));
    console.log(`Deleting embeddings for ${bookmarkIds.length} bookmarks:`, bookmarkIds);
    await browser.storage.local.remove(keys);
  } else {
    const key = getStorageKey(bookmarkIds);
    console.log(`Deleting embeddings for bookmark ${bookmarkIds}`);
    await browser.storage.local.remove(key);
  }
}

export async function getStoredEmbeddingIds() {
  const allStorage = await browser.storage.local.get();
  return Object.keys(allStorage).map(key => getBookmarkId(key)).filter(id => id !== null);
}

