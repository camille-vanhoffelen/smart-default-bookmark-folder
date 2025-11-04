/**
 * Utilities for bookmark management, embeddings, and default folder suggestions.
 */

import { embed, saveAllEmbeddings, getEmbeddings, getStoredNodeIds, deleteEmbeddings } from './embedding.js';
import { Semaphore } from './async-utils.js';
import { cos_sim } from '@huggingface/transformers';

export const EMBEDDING_TYPES = {
  FOLDER_PATH: 'folderPath',
  FOLDER_TITLE: 'folderTitle',
  BOOKMARK_PAGE: 'bookmarkPage'
};

const EXCLUDED_FOLDER_IDS = new Set([
  'unfiled_____',  // Other Bookmarks folder
  'mobile______',  // Mobile Bookmarks folder
  'menu________',  // Bookmarks Menu folder
  'toolbar_____',  // Bookmarks Toolbar folder
  'tags________'   // Tags folder
]);

/**
 * Gets content from a new bookmark by finding matching open tab.
 * Gives up if no matching tab found.
 */
export async function getNewBookmarkContent(bookmarkId) {
  const bookmarkNodes = await browser.bookmarks.get(bookmarkId);
  if (!bookmarkNodes || bookmarkNodes.length === 0) {
    throw new Error(`Bookmark with id ${bookmarkId} not found`);
  }

  const bookmark = bookmarkNodes[0];
  const bookmarkUrl = bookmark.url;

  const matchingTabs = await browser.tabs.query({ url: bookmarkUrl });
  if (matchingTabs.length > 0) {
    return await getTabContent(matchingTabs[0].id);
  }

  throw new Error(`No matching tab found for bookmark URL: ${bookmarkUrl}`);
}

/**
 * Extracts text content from an open tab.
 */
export async function getTabContent(tabId) {
  const response = await browser.tabs.sendMessage(tabId, {
    type: "extractTextContent"
  });

  if (response && response.textContent) {
    console.log("Text content extracted:", response.textContent.substring(0, 100).replace(/\s+/g, ' '));
    return response.textContent;
  }
  throw new Error(`Could not get tab content for tab ID: ${tabId}`);
}

/**
 * Gets all bookmarks/folders as potential destinations, excluding specified ID.
 */
export async function getDestinations(excludeId = null) {
  const allNodes = await browser.bookmarks.search({});

  return allNodes
    .filter(node => node.id !== excludeId)
    .map(node => ({
      id: node.id,
      folderId: node.url ? node.parentId : node.id,
      title: node.title
    }));
}

/**
 * Gets embeddings for all destination folders/bookmarks.
 * Several embeddings are possible per destination, 
 * so the returned array is flattened.
 */
export async function getDestinationEmbeddings(excludeId) {
  const destinations = await getDestinations(excludeId);
  const flattenedDestinations = [];

  for (const destination of destinations) {
    const embeddings = await getEmbeddings(destination.id);

    for (const [embeddingType, embedding] of Object.entries(embeddings)) {
      flattenedDestinations.push({
        id: destination.id,
        title: destination.title,
        folderId: destination.folderId,
        embeddingType: embeddingType,
        embedding: embedding
      });
    }
  }

  return flattenedDestinations;
}

/**
 * Loads page content for multiple bookmarks.
 * Uses semaphore to throttle concurrent loadPageContent calls
 * Optionally reports progress via callback
 */
export async function loadBookmarkContents(bookmarkNodes, concurrencyLimit = 3, progressCallback = null) {
  const semaphore = new Semaphore(concurrencyLimit);
  const results = [];
  let completed = 0;

  const contentPromises = bookmarkNodes.map(node =>
    semaphore.execute(async () => {
      const pageContent = await loadPageContent(node.url);
      const result = {
        id: node.id,
        content: pageContent,
        type: EMBEDDING_TYPES.BOOKMARK_PAGE,
      };

      completed++;
      if (progressCallback) {
        progressCallback(completed, bookmarkNodes.length);
      }

      return result;
    })
  );

  return Promise.all(contentPromises);
}

/**
 * Loads page content by creating temporary tab and extracting text.
 */
export async function loadPageContent(url) {
  let tab = null;
  try {
    // Create a new tab (hidden/inactive)
    tab = await browser.tabs.create({ url, active: false });

    // Wait for page to load
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn(`Page load timed out for ${url}, extracting content from partially loaded page`);
        browser.tabs.onUpdated.removeListener(listener);
        resolve(); 
      }, 5000); 

      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          browser.tabs.onUpdated.removeListener(listener);
          clearTimeout(timeout);
          resolve();
        }
      };
      browser.tabs.onUpdated.addListener(listener);
    });

    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    const response = await browser.tabs.sendMessage(tab.id, {
      type: "extractTextContent"
    });

    return response.textContent;
  } catch (error) {
    console.error(`Error getting page content for ${url}:`, error);
    return null;
  } finally {
    if (tab) {
      try {
        await browser.tabs.remove(tab.id);
      } catch (closeError) {
        console.error(`Error closing tab ${tab.id}:`, closeError);
      }
    }
  }
}

/**
 * Builds full folder path string from root to current folder.
 * Root folders and special system folders are excluded.
 * e.g:
 * `Bookmarks Menu > Work > Programming > JavaScript` -> "Work Programming JavaScript"
 * 
 */
async function getFolderFullPathContent(folderNode) {
  const pathParts = [];
  let currentNode = folderNode;

  while (currentNode && currentNode.parentId) {
    try {
      const parentNodes = await browser.bookmarks.get(currentNode.parentId);
      if (parentNodes && parentNodes.length > 0) {
        const parentNode = parentNodes[0];
        if (parentNode.title && parentNode.title.trim() && !EXCLUDED_FOLDER_IDS.has(parentNode.id)) {
          pathParts.unshift(parentNode.title);
        }
        currentNode = parentNode;
      } else {
        break;
      }
    } catch (error) {
      console.error(`Error getting parent node for ${currentNode.parentId}:`, error);
      break;
    }
  }

  // Add the current folder's title
  if (folderNode.title && folderNode.title.trim()) {
    pathParts.push(folderNode.title);
  }

  return pathParts.join(' ');
}

/**
 * Creates embeddings for folder title and full path.
 */
export async function embedFolder(bookmarkId) {
  const bookmarkNodes = await browser.bookmarks.get(bookmarkId);
  if (!bookmarkNodes || bookmarkNodes.length === 0) {
    throw new Error(`Folder with id ${bookmarkId} not found`);
  }

  const folderNode = bookmarkNodes[0];
  if (folderNode.type !== 'folder') {
    throw new Error(`BookmarkId ${bookmarkId} is not a folder`);
  }

  const title = folderNode.title;
  const fullPath = await getFolderFullPathContent(folderNode);

  const textsToEmbed = [title, fullPath];

  const embedResult = await embed(textsToEmbed);

  const folderTitleEmbedding = embedResult[0]; 
  const folderPathEmbedding = embedResult[1]; 

  console.log(`Folder embeddings calculated - title: ${folderTitleEmbedding ? 'yes' : 'no'}, path: ${folderPathEmbedding ? 'yes' : 'no'}`);

  return { [EMBEDDING_TYPES.FOLDER_TITLE]: folderTitleEmbedding, [EMBEDDING_TYPES.FOLDER_PATH]: folderPathEmbedding };
}

/**
 * Creates embedding for new bookmark's page content.
 */
export async function embedNewBookmark(bookmarkId) {
  const content = await getNewBookmarkContent(bookmarkId);

  const embedResult = await embed([content]);

  const bookmarkEmbedding = embedResult[0];
  if (!bookmarkEmbedding) {
    console.warn("New bookmark content could not be embedded")
  }

  return { [EMBEDDING_TYPES.BOOKMARK_PAGE]: bookmarkEmbedding };
}

/**
 * Compares bookmark embedding against all stored embeddings (folders and bookmarks),
 * ranks by similarity score, and relocates bookmark to folder of best match.
 */
export async function relocateBookmark(bookmarkPageEmbedding, bookmarkId) {
  if (!bookmarkPageEmbedding || !Array.isArray(bookmarkPageEmbedding) || bookmarkPageEmbedding.length === 0) {
    console.warn('Bookmark contents could not be embedded, skipping relocation');
    return;
  }

  const destinations = await getDestinationEmbeddings(bookmarkId);
  if (destinations.length === 0) {
    console.log('No destinations with embeddings found, skipping relocation');
    return;
  }

  const similarities = destinations
    // filter destinations with unembeddable content
    .filter(destination => destination.embedding && Array.isArray(destination.embedding) && destination.embedding.length > 0)
    .map(destination => ({
      ...destination,
      similarity: cos_sim(bookmarkPageEmbedding, destination.embedding)
    })).filter(item => !isNaN(item.similarity));

  similarities.sort((a, b) => b.similarity - a.similarity);

  // TODO remove this logging
  console.log('\n=== Top 30 most similar destinations ===');
  for (let i = 0; i < Math.min(30, similarities.length); i++) {
    const dest = similarities[i];
    console.log(`${i + 1}. ${dest.id} (type: ${dest.embeddingType}, similarity: ${dest.similarity.toFixed(4)}, title: ${dest.title})`);
  }

  const bestMatch = similarities[0];
  const targetFolderId = bestMatch.folderId;

  console.log(`Relocating bookmark to folder ${targetFolderId} (similarity: ${bestMatch.similarity.toFixed(4)})`);
  await browser.bookmarks.move(bookmarkId, { parentId: targetFolderId });
}

/**
 * Removes embeddings for deleted bookmarks/folders.
 */
async function removeOrphanedEmbeddings(allNodeIds, storedNodeIds) {
  const orphanedNodeIds = storedNodeIds.filter(id => !allNodeIds.has(id));
  console.log(`Found ${orphanedNodeIds.length} orphaned embeddings`);

  if (orphanedNodeIds.length > 0) {
    await deleteEmbeddings(orphanedNodeIds);
  }
}

/**
 * Creates embeddings for bookmarks/folders that don't have them.
 * Optionally reports progress via callback
 */
async function addMissingEmbeddings(allNodes, storedNodeIds, progressCallback = null) {
  const storedNodeIdSet = new Set(storedNodeIds);
  const missingNodes = allNodes.filter(node => !storedNodeIdSet.has(node.id));

  console.log(`Found ${missingNodes.length} nodes without embeddings`);

  if (missingNodes.length > 0) {
    const missingFolders = missingNodes.filter(node => node.type === 'folder');
    const missingBookmarks = missingNodes.filter(node => node.type === 'bookmark');

    console.log(`Processing ${missingFolders.length} folders and ${missingBookmarks.length} bookmarks`);

    const destinations = [];
    let processedCount = 0;

    // folders (these are fast, so we process them all at once)
    for (const folder of missingFolders) {
      const title = folder.title;
      const fullPath = await getFolderFullPathContent(folder);

      destinations.push({
        id: folder.id,
        content: title,
        type: EMBEDDING_TYPES.FOLDER_TITLE,
      });

      destinations.push({
        id: folder.id,
        content: fullPath,
        type: EMBEDDING_TYPES.FOLDER_PATH,
      });

      processedCount++;
      if (progressCallback) {
        progressCallback(processedCount, missingNodes.length);
      }
    }

    // bookmarks (these load pages, so we report progress)
    const bookmarkContents = await loadBookmarkContents(missingBookmarks, 3, (current, total) => {
      if (progressCallback) {
        progressCallback(processedCount + current, missingNodes.length);
      }
    });
    for (const bookmarkContent of bookmarkContents) {
      destinations.push(bookmarkContent);
    }

    console.log(`Total destination contents to embed: ${destinations.length}`);

    if (destinations.length > 0) {
      const allContents = destinations.map(item => item.content);
      const embeddings = await embed(allContents);

      const embeddingStorage = {};
      for (let i = 0; i < destinations.length; i++) {
        const embedding = embeddings[i];
        const destination = destinations[i];
        const id = destination.id;
        const type = destination.type;

        if (!embeddingStorage[id]) {
          embeddingStorage[id] = {};
        }
        embeddingStorage[id][type] = embedding;
      }

      await saveAllEmbeddings(embeddingStorage);
      console.log(`Saved embeddings for ${Object.keys(embeddingStorage).length} nodes`);
    }
  }
}

/**
 * Syncs embeddings with current bookmarks - removes orphaned, adds missing.
 * Optionally reports progress via callback
 */
export async function syncDestinationEmbeddings(progressCallback = null) {
  console.log('Starting sync of destination embeddings...');

  const allNodes = await browser.bookmarks.search({});
  const allNodeIds = new Set(allNodes.map(node => node.id));
  console.log(`Found ${allNodeIds.size} bookmark/folder nodes`);

  const storedNodeIds = await getStoredNodeIds();
  console.log(`Found ${storedNodeIds.length} embedding entries in storage`);

  await removeOrphanedEmbeddings(allNodeIds, storedNodeIds);

  await addMissingEmbeddings(allNodes, storedNodeIds, progressCallback);

  console.log('Sync of destination embeddings completed');
}