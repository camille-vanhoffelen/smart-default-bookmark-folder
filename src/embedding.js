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

function getStorageKey(bookmarkId) {
  return `embedding_${bookmarkId}`;
}

export async function saveAllEmbeddings(embeddingStorage) {
  // TODO error handling
  for (const [bookmarkId, embeddings] of Object.entries(embeddingStorage)) {
    const key = getStorageKey(bookmarkId);
    await browser.storage.local.set({ [key]: embeddings });
  }
}

export async function saveEmbeddings(bookmarkId, embeddings) {
  // TODO error handling
  const key = getStorageKey(bookmarkId);
  console.log(`Saving embeddings for bookmark ${bookmarkId}`);
  await browser.storage.local.set({ [key]: embeddings });
}

export async function getEmbeddings(bookmarkId) {
  // TODO error handling
  const key = getStorageKey(bookmarkId);
  const result = await browser.storage.local.get(key);
  const embeddings = result[key] || {};
  console.log(`Retrieved embeddings for bookmark ${bookmarkId}`);
  return embeddings;
}

export async function deleteEmbeddings(bookmarkId) {
  const key = getStorageKey(bookmarkId);
  console.log(`Deleting embeddings for bookmark ${bookmarkId}`);
  await browser.storage.local.remove(key);
}

export async function deleteEmbeddingsWithChildren(id, removeInfo) {
  console.log('removeInfo:', removeInfo);
  console.log(`Deleting embeddings for bookmark/folder ${id}`);
  
  // Delete embeddings for the removed bookmark/folder
  await deleteEmbeddings(id);
  
  // If it was a folder, we need to clean up embeddings for all its descendants
  // since Firefox only sends one notification for the parent folder
  if (removeInfo.node && removeInfo.node.children) {
    await deleteEmbeddingsRecursively(removeInfo.node.children);
  }
  
  console.log(`Deleted embeddings for bookmark/folder ${id}`);
}

async function deleteEmbeddingsRecursively(children) {
  for (const child of children) {
    console.log(`Deleting embeddings for child: ${child.id}`);
    await deleteEmbeddings(child.id);
    
    // If this child is also a folder with children, recurse
    if (child.children && child.children.length > 0) {
      await deleteEmbeddingsRecursively(child.children);
    }
  }
}