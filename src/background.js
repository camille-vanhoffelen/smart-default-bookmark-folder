/**
 * Background script for smart bookmark folder extension.
 * Handles bookmark events and makes content-aware default folder suggestions.
 */

import {
  embedNewBookmark,
  relocateBookmark,
  embedFolder,
  syncDestinationEmbeddings,
  EMBEDDING_TYPES
} from './bookmark-utils.js';
import { saveEmbeddings } from './embedding.js';
import { preloadModel } from './model.js';
import { seedTestBookmarks, getIsSeeding } from './seed.js';

/**
 * Handles bookmark/folder creation. Embeds new items and relocates bookmarks to best folder.
 */
async function handleCreated(id, bookmarkInfo) {
  // Skip during seeding
  if (getIsSeeding()) {
    console.log(`Skipping smart bookmark relocation: seeding`)
    return;
  }

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



browser.runtime.onInstalled.addListener(async () => {
  try {
    // TODO put this back
    // await preloadModel();

    // TODO remove delay
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Seed test bookmarks
    await seedTestBookmarks();

    // Open onboarding page instead of auto-syncing
    await browser.tabs.create({ url: browser.runtime.getURL('onboarding.html') });
  } catch (error) {
    console.error('CRITICAL: Extension failed to initialize:', error);
    throw error;
  }
});

browser.runtime.onStartup.addListener(async () => {
  try {
    // TODO put this back
    // await preloadModel();
    await new Promise(resolve => setTimeout(resolve, 10000));
    await syncDestinationEmbeddings();
  } catch (error) {
    console.error('CRITICAL: Extension failed to start up:', error);
    throw error;
  }
});

browser.bookmarks.onCreated.addListener(handleCreated);
browser.bookmarks.onChanged.addListener(handleChanged);
browser.bookmarks.onMoved.addListener(handleMoved);

browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'syncDestinationEmbeddings') {
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
      // Get the tab ID of the onboarding page
      const onboardingTabId = sender.tab?.id;

      // Sync with progress reporting
      await syncDestinationEmbeddings((current, total) => {
        // Send progress updates to the onboarding page
        if (onboardingTabId) {
          browser.tabs.sendMessage(onboardingTabId, {
            type: 'SYNC_PROGRESS',
            current: current,
            total: total
          }).catch(err => {
            // Ignore errors if tab is closed
            console.warn('Could not send progress update:', err);
          });
        }
      });

      // Send completion message
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