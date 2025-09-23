import { embed, saveAllEmbeddings, getEmbeddings, getStoredNodeIds, deleteEmbeddings } from './embedding.js';
import { Semaphore } from './async-utils.js';
import { cos_sim } from '@huggingface/transformers';

// Embedding type constants
export const EMBEDDING_TYPES = {
  FOLDER_PATH: 'folderPath',
  FOLDER_TITLE: 'folderTitle',
  BOOKMARK_PAGE: 'bookmarkPage'
};

export async function getNewBookmarkContent(bookmarkId) {
  const bookmarkNodes = await browser.bookmarks.get(bookmarkId);
  if (!bookmarkNodes || bookmarkNodes.length === 0) {
    throw new Error(`Bookmark with id ${bookmarkId} not found`);
  }

  const bookmark = bookmarkNodes[0];
  const bookmarkUrl = bookmark.url;

  // Try to find any open tab with matching URL
  const matchingTabs = await browser.tabs.query({ url: bookmarkUrl });
  if (matchingTabs.length > 0) {
    return await getTabContent(matchingTabs[0].id);
  }

  // Give up if no matching tab found
  throw new Error(`No matching tab found for bookmark URL: ${bookmarkUrl}`);
}

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

export async function getDestinationEmbeddings(excludeId) {
  const destinations = await getDestinations(excludeId);
  const flattenedDestinations = [];

  for (const destination of destinations) {
    const embeddings = await getEmbeddings(destination.id);

    // Several embeddings possible per destination
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

export async function loadBookmarkContents(bookmarkNodes, concurrencyLimit = 3) {
  // Use semaphore to throttle concurrent loadPageContent calls
  const semaphore = new Semaphore(concurrencyLimit);

  const contentPromises = bookmarkNodes.map(node =>
    semaphore.execute(async () => {
      const pageContent = await loadPageContent(node.url);
      return {
        id: node.id,
        content: pageContent,
        type: EMBEDDING_TYPES.BOOKMARK_PAGE,
      };
    })
  );

  return Promise.all(contentPromises);
}

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
        resolve(); // Don't reject, just mark as timed out
      }, 5000); // 5 second timeout

      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          browser.tabs.onUpdated.removeListener(listener);
          clearTimeout(timeout);
          resolve();
        }
      };
      browser.tabs.onUpdated.addListener(listener);
    });

    // Inject your existing content script
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    // Use the same message system as your content script
    const response = await browser.tabs.sendMessage(tab.id, {
      type: "extractTextContent"
    });

    return response.textContent;
  } catch (error) {
    console.error(`Error getting page content for ${url}:`, error);
    return null;
  } finally {
    // Always close the tab, even if there was an error
    if (tab) {
      try {
        await browser.tabs.remove(tab.id);
      } catch (closeError) {
        console.error(`Error closing tab ${tab.id}:`, closeError);
      }
    }
  }
}

async function getFolderFullPathContent(folderNode) {
  const pathParts = [];
  let currentNode = folderNode;

  // Traverse up the parent hierarchy
  while (currentNode && currentNode.parentId) {
    try {
      const parentNodes = await browser.bookmarks.get(currentNode.parentId);
      if (parentNodes && parentNodes.length > 0) {
        const parentNode = parentNodes[0];
        // Only add non-root folders (root folders typically have no title or system titles)
        if (parentNode.title && parentNode.title.trim()) {
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

  // Always embed both title and path (embed() handles insufficient content)
  const textsToEmbed = [title, fullPath];

  const embedResult = await embed(textsToEmbed);

  const folderTitleEmbedding = embedResult[0]; // title embedding (null if insufficient)
  const folderPathEmbedding = embedResult[1];  // path embedding (null if insufficient)

  console.log(`Folder embeddings calculated - title: ${folderTitleEmbedding ? 'yes' : 'no'}, path: ${folderPathEmbedding ? 'yes' : 'no'}`);

  return { [EMBEDDING_TYPES.FOLDER_TITLE]: folderTitleEmbedding, [EMBEDDING_TYPES.FOLDER_PATH]: folderPathEmbedding };
}

export async function embedNewBookmark(bookmarkId) {
  const content = await getNewBookmarkContent(bookmarkId);

  const embedResult = await embed([content]);

  const bookmarkEmbedding = embedResult[0];
  if (!bookmarkEmbedding) {
    console.warn("New bookmark content could not be embedded")
  }

  return { [EMBEDDING_TYPES.BOOKMARK_PAGE]: bookmarkEmbedding };
}

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

  // Calculate cosine similarity of bookmarkEmbedding vs each destination.embedding
  const similarities = destinations
    // filter destinations with unembeddable content
    .filter(destination => destination.embedding && Array.isArray(destination.embedding) && destination.embedding.length > 0)
    .map(destination => ({
      ...destination,
      similarity: cos_sim(bookmarkPageEmbedding, destination.embedding)
    })).filter(item => !isNaN(item.similarity));

  // Sort by similarity (highest first)
  similarities.sort((a, b) => b.similarity - a.similarity);

  console.log('\n=== Top 30 most similar destinations ===');
  for (let i = 0; i < Math.min(30, similarities.length); i++) {
    const dest = similarities[i];
    console.log(`${i + 1}. ${dest.id} (type: ${dest.embeddingType}, similarity: ${dest.similarity.toFixed(4)}, title: ${dest.title})`);
  }

  // Pick highest cosine similarity and relocate bookmark to that folderId
  const bestMatch = similarities[0];
  const targetFolderId = bestMatch.folderId;

  console.log(`Relocating bookmark to folder ${targetFolderId} (similarity: ${bestMatch.similarity.toFixed(4)})`);
  await browser.bookmarks.move(bookmarkId, { parentId: targetFolderId });
}

async function removeOrphanedEmbeddings(allNodeIds, storedNodeIds) {
  const orphanedNodeIds = storedNodeIds.filter(id => !allNodeIds.has(id));
  console.log(`Found ${orphanedNodeIds.length} orphaned embeddings`);

  if (orphanedNodeIds.length > 0) {
    await deleteEmbeddings(orphanedNodeIds);
  }
}

async function addMissingEmbeddings(allNodes, storedNodeIds) {
  const storedNodeIdSet = new Set(storedNodeIds);
  const missingNodes = allNodes.filter(node => !storedNodeIdSet.has(node.id));

  console.log(`Found ${missingNodes.length} nodes without embeddings`);

  if (missingNodes.length > 0) {
    // Separate folders and bookmarks using node.type
    const missingFolders = missingNodes.filter(node => node.type === 'folder');
    const missingBookmarks = missingNodes.filter(node => node.type === 'bookmark');

    console.log(`Processing ${missingFolders.length} folders and ${missingBookmarks.length} bookmarks`);

    const destinations = [];

    // folders
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
    }

    // bookmarks
    const bookmarkContents = await loadBookmarkContents(missingBookmarks);
    for (const bookmarkContent of bookmarkContents) {
      destinations.push(bookmarkContent);
    }

    console.log(`Total destination contents to embed: ${destinations.length}`);

    if (destinations.length > 0) {
      // Batch embed all content at once
      const allContents = destinations.map(item => item.content);
      const embeddings = await embed(allContents);

      // Group embeddings by node ID (include nulls for insufficient content)
      const embeddingStorage = {};
      for (let i = 0; i < destinations.length; i++) {
        const embedding = embeddings[i];
        const destination = destinations[i];
        const id = destination.id;
        const type = destination.type;

        if (!embeddingStorage[id]) {
          embeddingStorage[id] = {};
        }
        embeddingStorage[id][type] = embedding; // Store null for insufficient content
      }

      // Save all embeddings
      await saveAllEmbeddings(embeddingStorage);
      console.log(`Saved embeddings for ${Object.keys(embeddingStorage).length} nodes`);
    }
  }
}

export async function syncDestinationEmbeddings() {
  console.log('Starting sync of destination embeddings...');

  // Get IDs of all current bookmark nodes
  const allNodes = await browser.bookmarks.search({});
  const allNodeIds = new Set(allNodes.map(node => node.id));
  console.log(`Found ${allNodeIds.size} bookmark/folder nodes`);

  // Get IDs of all bookmark nodes with stored embeddings
  const storedNodeIds = await getStoredNodeIds();
  console.log(`Found ${storedNodeIds.length} embedding entries in storage`);

  await removeOrphanedEmbeddings(allNodeIds, storedNodeIds);

  await addMissingEmbeddings(allNodes, storedNodeIds);

  console.log('Sync of destination embeddings completed');
}