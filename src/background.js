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

    await seedTestBookmarks();
    await syncDestinationEmbeddings();
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