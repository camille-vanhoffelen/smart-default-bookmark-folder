import {
  initDestinationEmbeddings,
  embedBookmark,
  relocateBookmark,
  embedFolder,
  EMBEDDING_TYPES
} from './bookmark-utils.js';
import { saveEmbeddings, deleteEmbeddingsWithChildren } from './embedding.js';
import { preloadModel } from './model.js';
import { seedTestBookmarks, getIsSeeding } from './seed.js';

async function handleCreated(id, bookmarkInfo) {
  console.log(`New bookmark ID: ${id}`);
  console.log(`New bookmark URL: ${bookmarkInfo.url}`);
  console.log(`New bookmark title: ${bookmarkInfo.title}`);
  console.log(`New bookmark parent ID: ${bookmarkInfo.parentId}`);

  // Skip during seeding
  if (getIsSeeding()) {
    console.log(`Skipping smart bookmark relocation: seeding`)
    return;
  }

  if (bookmarkInfo.type === 'folder') {
    console.log(`New bookmark folder created: ${bookmarkInfo.title}`);
    
    const folderEmbeddings = await embedFolder(id);
    if (folderEmbeddings && (folderEmbeddings[EMBEDDING_TYPES.FOLDER_TITLE] || folderEmbeddings[EMBEDDING_TYPES.FOLDER_PATH])) {
      await saveEmbeddings(id, folderEmbeddings);
      console.log(`Folder embeddings saved for "${bookmarkInfo.title}"`);
    } else {
      console.log(`No valid embeddings to save for folder "${bookmarkInfo.title}"`);
    }
    return;
  }


  if (bookmarkInfo.type === 'bookmark') {
    // TODO what if bookmark created for non-active tab? consider using URL instead? or bookmark info?
    // Maybe search in open tabs for that url, and if not found, then open it on your own?
    // Is that more robust than getting current open tab?

    const bookmarkEmbeddings = await embedBookmark(id);
    if (!bookmarkEmbeddings || !bookmarkEmbeddings[EMBEDDING_TYPES.BOOKMARK_PAGE]) {
      console.warn(`Failed to calculate bookmark embedding, skipping relocation`);
      return;
    }

    await saveEmbeddings(id, bookmarkEmbeddings);
    const bookmarkPageEmbedding = bookmarkEmbeddings[EMBEDDING_TYPES.BOOKMARK_PAGE];
    await relocateBookmark(bookmarkPageEmbedding, id);
    return;
  }
}


browser.runtime.onInstalled.addListener(async () => {
  // TODO put this back
  // await preloadModel();

  // TODO remove delay
  await new Promise(resolve => setTimeout(resolve, 3000));

  await seedTestBookmarks();
  await initDestinationEmbeddings();
});

browser.runtime.onStartup.addListener(async () => {
  // TODO put this back
  // await preloadModel();
});

browser.bookmarks.onCreated.addListener(handleCreated);

async function handleRemoved(id, removeInfo) {
  console.log(`Bookmark removed: ${id}`);
  await deleteEmbeddingsWithChildren(id, removeInfo);
}

browser.bookmarks.onRemoved.addListener(handleRemoved);