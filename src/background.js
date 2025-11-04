/**
 * Background script for smart bookmark folder extension.
 * Handles bookmark events and makes content-aware default folder suggestions.
 */

import {
  embedNewBookmark,
  relocateBookmark,
  embedFolder,
  syncDestinationEmbeddings,
  getSyncStatus,
  EMBEDDING_TYPES
} from './bookmark-utils.js';
import { saveEmbeddings, deleteEmbeddings } from './embedding.js';
import { preloadModel } from './model.js';

/**
 * Handles bookmark/folder creation. Embeds new items and relocates bookmarks to best folder.
 */
async function handleCreated(id, bookmarkInfo) {
  if (bookmarkInfo.type === 'folder') {
    try {
      console.log(`New folder created: ${bookmarkInfo.id}, ${bookmarkInfo.title}`);
      const folderEmbeddings = await embedFolder(id);
      await saveEmbeddings(id, folderEmbeddings);
      console.log(`Folder embeddings saved for "${bookmarkInfo.title}"`);
      return;
    } catch (error) {
      console.error(`Failed to save folder embeddings, skipping:`, error);
      return;
    }
  }


  if (bookmarkInfo.type === 'bookmark') {
    try {
      console.log(`New bookmark created: ${bookmarkInfo.id}, ${bookmarkInfo.title}`);

      const bookmarkEmbeddings = await embedNewBookmark(id);
      await saveEmbeddings(id, bookmarkEmbeddings);
      const bookmarkPageEmbedding = bookmarkEmbeddings[EMBEDDING_TYPES.BOOKMARK_PAGE];
      await relocateBookmark(bookmarkPageEmbedding, id);
      return;
    } catch (error) {
      console.error(`Failed to save embeddings and relocate bookmark, skipping:`, error);
      return;
    }
  }
}

/**
 * Handles bookmark/folder changes. Re-embeds items when title or URL changes.
 */
async function handleChanged(id, changeInfo) {
  try {
    const bookmarkNodes = await browser.bookmarks.get(id);
    if (!bookmarkNodes || bookmarkNodes.length === 0) {
      console.error(`Bookmark/folder with id ${id} not found, skipping`);
      return;
    }
    const bookmarkNode = bookmarkNodes[0];

    // folder title change
    if (bookmarkNode.type === 'folder' && changeInfo.title !== undefined) {
      console.log(`Folder name changed: re-embedding folder with new title "${changeInfo.title}"`);
      const folderEmbeddings = await embedFolder(id);
      await saveEmbeddings(id, folderEmbeddings);
      console.log(`Folder embeddings saved for new title "${changeInfo.title}"`);
      return;
    }

    // bookmark url change
    if (bookmarkNode.type === 'bookmark' && changeInfo.url !== undefined) {
      console.log(`Bookmark URL changed: re-embedding bookmark with new URL "${changeInfo.url}"`);
      const bookmarkEmbeddings = await embedNewBookmark(id);
      await saveEmbeddings(id, bookmarkEmbeddings);
      console.log(`Bookmark embeddings saved for new URL "${changeInfo.url}"`);
      return;
    }
  } catch (error) {
    console.error(`Failed to handle changed embeddings, skipping:`, error);
  }
}

/**
 * Handles folder moves. Re-embeds folder paths.
 */
async function handleMoved(id, moveInfo) {
  try {
    const bookmark = await browser.bookmarks.get(id);
    if (bookmark[0] && bookmark[0].type === 'folder') {
      console.log(`Folder moved: re-embedding folder "${bookmark[0].title}"`);
      const folderEmbeddings = await embedFolder(id);
      await saveEmbeddings(id, folderEmbeddings);
      console.log(`Folder embeddings saved for moved folder "${bookmark[0].title}"`);
      return;
    }
  } catch (error) {
    console.error(`Failed to handle moved embeddings, skipping:`, error);
  }
}

/**
 * Handles bookmark/folder removal. Deletes associated embeddings.
 */
async function handleRemoved(id, removeInfo) {
  try {
    console.log(`Bookmark/folder removed: ${id}, deleting embeddings`);
    await deleteEmbeddings([id]);
    console.log(`Embeddings deleted for removed bookmark/folder ${id}`);
  } catch (error) {
    console.error(`Failed to delete embeddings for removed bookmark/folder, skipping:`, error);
  }
}



browser.runtime.onInstalled.addListener(async (details) => {
  try {
    await preloadModel();

    if (details.reason === 'install') {
      await browser.tabs.create({ url: browser.runtime.getURL('onboarding.html') });
    } else if (details.reason === 'update') {
      await syncDestinationEmbeddings();
    }
  } catch (error) {
    console.error('CRITICAL: Extension failed to initialize:', error);
    throw error;
  }
});

browser.runtime.onStartup.addListener(async () => {
  try {
    await preloadModel();
  } catch (error) {
    console.error('CRITICAL: Extension failed to start up:', error);
    throw error;
  }
});

browser.bookmarks.onCreated.addListener(handleCreated);
browser.bookmarks.onChanged.addListener(handleChanged);
browser.bookmarks.onMoved.addListener(handleMoved);
browser.bookmarks.onRemoved.addListener(handleRemoved);

browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'GET_SYNC_STATUS') {
    try {
      const status = await getSyncStatus();
      return status;
    } catch (error) {
      console.error('Failed to get sync status:', error);
      throw error;
    }
  }

  if (message.type === 'SYNC_DESTINATION_EMBEDDINGS') {
    try {
      await syncDestinationEmbeddings();
      return { success: true };
    } catch (error) {
      console.error('Failed to sync destination embeddings:', error);
      throw error;
    }
  }

  if (message.type === 'START_ONBOARDING_SYNC') {
    try {
      const onboardingTabId = sender.tab?.id;

      await syncDestinationEmbeddings((current, total) => {
        if (onboardingTabId) {
          browser.tabs.sendMessage(onboardingTabId, {
            type: 'SYNC_PROGRESS',
            current: current,
            total: total
          }).catch(err => {
            console.warn('Could not send progress update:', err);
          });
        }
      });

      if (onboardingTabId) {
        browser.tabs.sendMessage(onboardingTabId, {
          type: 'SYNC_COMPLETE'
        }).catch(err => {
          console.warn('Could not send completion message:', err);
        });
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to sync during onboarding:', error);
      throw error;
    }
  }
});