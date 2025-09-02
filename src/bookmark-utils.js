import { embed, isEnoughContent, saveAllEmbeddings, getEmbeddings, getStoredEmbeddingIds as getStoredBookmarkIds, deleteEmbeddings } from './embedding.js';
import { Semaphore } from './async-utils.js';
import { cos_sim } from '@huggingface/transformers';

// Embedding type constants
export const EMBEDDING_TYPES = {
  FOLDER_PATH: 'folderPath',
  FOLDER_TITLE: 'folderTitle',
  BOOKMARK_PAGE: 'bookmarkPage'
};

export async function getBookmarkContent(bookmarkId) {
  const bookmarkNodes = await browser.bookmarks.get(bookmarkId);
  if (!bookmarkNodes || bookmarkNodes.length === 0) {
    console.log('Bookmark not found');
    return null;
  }
  
  const bookmark = bookmarkNodes[0];
  const bookmarkUrl = bookmark.url;
  
  // Try to find any open tab with matching URL
  const matchingTabs = await browser.tabs.query({ url: bookmarkUrl });
  if (matchingTabs.length > 0) {
    return await getTabContent(matchingTabs[0].id);
  }
  
  // Give up if no matching tab found
  console.log('No matching tab found for bookmark URL');
  return null;
}

export async function getTabContent(tabId) {
  try {
    const response = await browser.tabs.sendMessage(tabId, {
      type: "extractTextContent"
    });

    if (response && response.textContent) {
      console.log("Text content extracted:", response.textContent.substring(0, 100).replace(/\s+/g, ' '));
      return response.textContent;
    }
    return null;
  } catch (error) {
    console.error(`Could not get tab content: ${error}`);
    return null;
  }
}

export async function getDestinations(excludeId = null) {
  const allNodes = await browser.bookmarks.search({});

  return allNodes
    .filter(node => node.id !== excludeId)
    .map(node => ({
      id: node.id,
      folderId: node.url ? node.parentId : node.id
    }));
}

export async function getDestinationEmbeddings(excludeId) {
  const destinations = await getDestinations(excludeId);
  const flattenedDestinations = [];

  for (const destination of destinations) {
    const embeddings = await getEmbeddings(destination.id);

    // Several embeddings possible per destination
    for (const [embeddingType, embedding] of Object.entries(embeddings)) {
      if (embedding !== null && embedding !== undefined) {
        flattenedDestinations.push({
          id: destination.id,
          folderId: destination.folderId,
          embeddingType: embeddingType,
          embedding: embedding
        });
      }
    }
  }

  return flattenedDestinations;
}

export async function getFolderContents() {
  try {
    const bookmarkTree = await browser.bookmarks.getTree();
    const folders = [];

    function traverseTree(nodes, currentPath = '') {
      for (const node of nodes) {
        if (!node.url) {
          // This is a folder
          const folderPath = currentPath ? `${currentPath} ${node.title}` : node.title;
          folders.push({
            id: node.id,
            content: folderPath,
            type: EMBEDDING_TYPES.FOLDER_PATH,
          });
          if (currentPath) {
            folders.push({
              id: node.id,
              content: node.title,
              type: EMBEDDING_TYPES.FOLDER_TITLE,
            });
          }

          // Recurse into children if they exist
          if (node.children) {
            traverseTree(node.children, folderPath);
          }
        }
      }
    }

    traverseTree(bookmarkTree);
    return folders.filter(folder => isEnoughContent(folder.content));
  } catch (error) {
    console.error('Error getting folders:', error);
    return [];
  }
}



export async function getBookmarkContents(concurrencyLimit = 2) {
  try {
    const allNodes = await browser.bookmarks.search({});
    const bookmarkNodes = allNodes.filter(node => node.url);

    // Use semaphore to throttle concurrent getPageContent calls
    const semaphore = new Semaphore(concurrencyLimit);

    const contentPromises = bookmarkNodes.map(node =>
      semaphore.execute(async () => {
        const pageContent = await getPageContent(node.url);
        return {
          id: node.id,
          content: pageContent,
          type: EMBEDDING_TYPES.BOOKMARK_PAGE,
        };
      })
    );

    const contentsResolved = await Promise.all(contentPromises);

    // TODO consider filtering this directly in the embedding methods of bookmark-utils.js
    contentsResolved.forEach(item => {
      if (!item || !isEnoughContent(item.content)) {
        console.log(`Filtered item - id: ${item?.id}`);
      }
    });

    return contentsResolved.filter(item => item && isEnoughContent(item.content));
  } catch (error) {
    console.error('Error getting bookmarks:', error);
    return null;
  }
}

export async function getPageContent(url) {
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
      }, 10000); // 10 second timeout

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

    return response?.textContent;
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
  try {
    const bookmarkNodes = await browser.bookmarks.get(bookmarkId);
    if (!bookmarkNodes || bookmarkNodes.length === 0) {
      console.log(`Folder with id ${bookmarkId} not found`);
      return null;
    }

    const folderNode = bookmarkNodes[0];
    if (folderNode.type !== 'folder') {
      console.log(`BookmarkId ${bookmarkId} is not a folder`);
      return null;
    }

    const title = folderNode.title;
    const fullPath = await getFolderFullPathContent(folderNode);

    const textsToEmbed = [];
    const embedMap = {};

    if (isEnoughContent(title)) {
      embedMap.title = textsToEmbed.length;
      textsToEmbed.push(title);
    }

    if (isEnoughContent(fullPath)) {
      embedMap.fullPath = textsToEmbed.length;
      textsToEmbed.push(fullPath);
    }

    if (textsToEmbed.length === 0) {
      console.log(`Folder "${title}" has no content with enough text to embed`);
      return { [EMBEDDING_TYPES.FOLDER_TITLE]: null, [EMBEDDING_TYPES.FOLDER_PATH]: null };
    }

    const embedResult = await embed(textsToEmbed);
    if (!embedResult || embedResult.length !== textsToEmbed.length) {
      console.log('Failed to generate content embeddings for folder');
      return { [EMBEDDING_TYPES.FOLDER_TITLE]: null, [EMBEDDING_TYPES.FOLDER_PATH]: null };
    }

    const folderTitleEmbedding = embedMap.hasOwnProperty('title') ? embedResult[embedMap.title] : null;
    const folderPathEmbedding = embedMap.hasOwnProperty('fullPath') ? embedResult[embedMap.fullPath] : null;

    console.log(`Folder embeddings calculated - title: ${folderTitleEmbedding ? 'yes' : 'no'}, path: ${folderPathEmbedding ? 'yes' : 'no'}`);


    return { [EMBEDDING_TYPES.FOLDER_TITLE]: folderTitleEmbedding, [EMBEDDING_TYPES.FOLDER_PATH]: folderPathEmbedding };
  } catch (error) {
    console.error(`Error embedding folder ${bookmarkId}:`, error);
    return { [EMBEDDING_TYPES.FOLDER_TITLE]: null, [EMBEDDING_TYPES.FOLDER_PATH]: null };
  }
}

export async function embedBookmark(bookmarkId) {
  const content = await getBookmarkContent(bookmarkId);

  if (!isEnoughContent(content)) {
    console.log('Not enough text content to embed bookmark');
    return { [EMBEDDING_TYPES.BOOKMARK_PAGE]: null };
  }

  const embedResult = await embed([content]);
  if (!embedResult || embedResult.length === 0) {
    console.log('Failed to generate content embedding for bookmark');
    return { [EMBEDDING_TYPES.BOOKMARK_PAGE]: null };
  }

  const bookmarkEmbedding = embedResult[0];
  console.log("New bookmark embedding calculated:", bookmarkEmbedding);

  return { [EMBEDDING_TYPES.BOOKMARK_PAGE]: bookmarkEmbedding };
}

export async function relocateBookmark(bookmarkPageEmbedding, bookmarkId) {
  const destinations = await getDestinationEmbeddings(bookmarkId);
  if (destinations.length === 0) {
    console.log('No destinations with embeddings found, skipping relocation');
    return;
  }

  // Calculate cosine similarity of bookmarkEmbedding vs each destination.embedding
  const similarities = destinations.map(destination => ({
    ...destination,
    similarity: cos_sim(bookmarkPageEmbedding, destination.embedding)
  })).filter(item => !isNaN(item.similarity));

  // Sort by similarity (highest first)
  similarities.sort((a, b) => b.similarity - a.similarity);

  console.log('\n=== Top 30 most similar destinations ===');
  for (let i = 0; i < Math.min(30, similarities.length); i++) {
    const dest = similarities[i];
    console.log(`${i + 1}. ${dest.id} (type: ${dest.embeddingType}, similarity: ${dest.similarity.toFixed(4)})`);
  }

  // Pick highest cosine similarity and relocate bookmark to that folderId
  const bestMatch = similarities[0];
  const targetFolderId = bestMatch.folderId;

  console.log(`Relocating bookmark to folder ${targetFolderId} (similarity: ${bestMatch.similarity.toFixed(4)})`);
  await browser.bookmarks.move(bookmarkId, { parentId: targetFolderId });
}

export async function initDestinationEmbeddings() {
  console.log(`Init of destination embeddings`);
  const bookmarks = await getBookmarkContents();
  const folders = await getFolderContents();
  const destinations = [...bookmarks, ...folders];

  console.log(`\n=== Total destination contents: ${destinations.length} ===`);

  for (const destination of destinations) {
    console.log(`destination: id=${destination.id}, type=${destination.type}, content="${destination.content?.substring(0, 100).replace(/\s+/g, ' ') || 'null'}"`);
  }

  const allContents = destinations.map(item => item.content);
  const embeddings = await embed(allContents);

  const embeddingStorage = {};
  for (let i = 0; i < destinations.length; i++) {
    const embedding = embeddings[i];
    if (embedding === null || embedding === undefined) {
      continue;
    }

    const destination = destinations[i];
    const id = destination.id;
    const type = destination.type;

    if (!embeddingStorage[id]) {
      embeddingStorage[id] = {};
    }
    embeddingStorage[id][type] = embedding;
  }

  await saveAllEmbeddings(embeddingStorage);
  console.log(`Done initialising destination embeddings`);
}

export async function syncDestinationEmbeddings() {
  console.log('Starting sync of destination embeddings...');
  // TODO still need to add missing embeddings
  
  // remove orphaned embeddings
  const allNodes = await browser.bookmarks.search({});
  const allNodeIds = new Set(allNodes.map(node => node.id));
  console.log(`Found ${allNodeIds.size} bookmark/folder nodes`);
  
  const storedBookmarkIds = await getStoredBookmarkIds();
  console.log(`Found ${storedBookmarkIds.length} embedding entries in storage`);
  
  const orphanedNodeIds = storedBookmarkIds.filter(id => !allNodeIds.has(id));
  console.log(`Found ${orphanedNodeIds.length} orphaned embeddings`);
  
  if (orphanedNodeIds.length > 0) {
    await deleteEmbeddings(orphanedNodeIds);
  }
  
  console.log('Sync of destination embeddings completed');
}