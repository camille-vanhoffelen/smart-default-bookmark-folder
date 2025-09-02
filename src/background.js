import {
  initDestinationEmbeddings,
  embedBookmark,
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
    console.log(`New folder created: ${bookmarkInfo.id}`);

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
    console.log(`New bookmark created: ${bookmarkInfo.id}`);

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

async function handleChanged(id, changeInfo) {
  const bookmarkNodes = await browser.bookmarks.get(id);
  if (!bookmarkNodes || bookmarkNodes.length === 0) {
    console.log(`Bookmark/folder with id ${id} not found`);
    return;
  }
  // folder title change
  const bookmarkNode = bookmarkNodes[0];

  if (bookmarkNode.type === 'folder' && changeInfo.title !== undefined) {
    console.log(`Folder name changed: re-embedding folder with new title "${changeInfo.title}"`);

    const folderEmbeddings = await embedFolder(id);
    if (folderEmbeddings && (folderEmbeddings[EMBEDDING_TYPES.FOLDER_TITLE] || folderEmbeddings[EMBEDDING_TYPES.FOLDER_PATH])) {
      await saveEmbeddings(id, folderEmbeddings);
      console.log(`Folder embeddings saved for new title "${changeInfo.title}"`);
    } else {
      console.log(`Failed to calculate folder embedding for title change, skipping`);
    }
  }

  // bookmark url change
  if (bookmarkNode.type === 'bookmark' && changeInfo.url !== undefined) {
    console.log(`Bookmark URL changed: re-embedding bookmark with new URL "${changeInfo.url}"`);

    const bookmarkEmbeddings = await embedBookmark(id);
    if (bookmarkEmbeddings && bookmarkEmbeddings[EMBEDDING_TYPES.BOOKMARK_PAGE]) {
      await saveEmbeddings(id, bookmarkEmbeddings);
      console.log(`Bookmark embeddings saved for new URL "${changeInfo.url}"`);
    } else {
      console.log(`Failed to calculate bookmark embedding for URL change, skipping`);
    }
  }
}

async function handleMoved(id, moveInfo) {
  const bookmark = await browser.bookmarks.get(id);
  if (bookmark[0] && bookmark[0].type === 'folder') {
    console.log(`Folder moved: re-embedding folder "${bookmark[0].title}"`);

    const folderEmbeddings = await embedFolder(id);
    if (folderEmbeddings && (folderEmbeddings[EMBEDDING_TYPES.FOLDER_TITLE] || folderEmbeddings[EMBEDDING_TYPES.FOLDER_PATH])) {
      await saveEmbeddings(id, folderEmbeddings);
      console.log(`Folder embeddings saved for moved folder "${bookmark[0].title}"`);
    } else {
      console.log(`Failed to calculate folder embedding for moved folder, skipping`);
    }
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
  await new Promise(resolve => setTimeout(resolve, 10000));
  await syncDestinationEmbeddings();
});

browser.bookmarks.onCreated.addListener(handleCreated);
browser.bookmarks.onChanged.addListener(handleChanged);
browser.bookmarks.onMoved.addListener(handleMoved);