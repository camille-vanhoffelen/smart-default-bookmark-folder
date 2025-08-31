import { embed, isEnoughContent, saveAllEmbeddings, getEmbeddings } from './embedding.js';

export async function getCurrentTabContent() {
  const tabs = await browser.tabs.query({
    currentWindow: true,
    active: true,
  });

  if (tabs.length !== 1) return null;

  return await getTabContent(tabs[0].id);
}

export async function getTabContent(tabId) {
  try {
    const response = await browser.tabs.sendMessage(tabId, {
      type: "extractTextContent"
    });

    if (response && response.textContent) {
      console.log("Text content extracted:", response.textContent.substring(0, 100));
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

    for (const embedding of embeddings) {
      flattenedDestinations.push({
        id: destination.id,
        folderId: destination.folderId,
        embedding: embedding
      });
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
          });
          if (currentPath) {
            folders.push({
              id: node.id,
              content: node.title,
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


export async function getBookmarkContents(concurrencyLimit = 5) {
  try {
    const allNodes = await browser.bookmarks.search({});
    const bookmarkNodes = allNodes.filter(node => node.url);

    const titleContents = bookmarkNodes.map(node => ({
      id: node.id,
      content: node.title
    }));

    // Limit concurrent getPageContent calls
    const urlContentsResolved = [];

    for (let i = 0; i < bookmarkNodes.length; i += concurrencyLimit) {
      const batch = bookmarkNodes.slice(i, i + concurrencyLimit);
      const batchPromises = batch.map(async (node) => {
        const pageContent = await getPageContent(node.url);
        return {
          id: node.id,
          content: pageContent
        };
      });

      const batchResults = await Promise.all(batchPromises);
      urlContentsResolved.push(...batchResults);
    }

    const allContents = [...titleContents, ...urlContentsResolved];

    allContents.forEach(item => {
      if (!item || !isEnoughContent(item.content)) {
        console.log(`Filtered item - id: ${item?.id}`);
      }
    });

    return allContents.filter(item => item && isEnoughContent(item.content));
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
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        browser.tabs.onUpdated.removeListener(listener);
        reject(new Error('Page load timeout'));
      }, 20000); // 20 second timeout

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


export async function initDestinationEmbeddings() {
  console.log(`Init of destination embeddings`);
  const bookmarks = await getBookmarkContents();

  if (!bookmarks) {
    console.error('Failed to get bookmark content');
    return;
  }

  console.log(`\n=== Found ${bookmarks.length} bookmark entries ===`);

  for (const bookmark of bookmarks) {
    console.log(`bookmark: id=${bookmark.id}, content="${bookmark.content?.substring(0, 100) || 'null'}"`);
  }

  const folders = await getFolderContents();

  console.log(`\n=== Found ${folders.length} folders ===`);

  for (const folder of folders) {
    console.log(`folder: id=${folder.id}, content="${folder.content}"`);
  }

  const destinations = [...bookmarks, ...folders];
  console.log(`\n=== Total content items: ${destinations.length} ===`);

  const allContents = destinations.map(item => item.content);
  const embeddings = await embed(allContents);

  const embeddingStorage = {};
  for (let i = 0; i < destinations.length; i++) {
    const embedding = embeddings[i];
    if (embedding === null || embedding === undefined) {
      continue;
    }

    const id = destinations[i].id;
    if (!embeddingStorage[id]) {
      embeddingStorage[id] = [];
    }
    embeddingStorage[id].push(embedding);
  }

  await saveAllEmbeddings(embeddingStorage);
}