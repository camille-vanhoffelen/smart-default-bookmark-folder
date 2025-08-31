import { cos_sim } from '@huggingface/transformers';
import {
  getCurrentTabContent,
  getDestinationEmbeddings,
  initDestinationEmbeddings
} from './bookmark-utils.js';
import { embed, isEnoughContent } from './embedding.js';
import { preloadModel } from './model.js';

// Flag to disable smart relocation during seeding
let isSeeding = false;

async function handleCreated(id, bookmarkInfo) {
  // Skip during seeding
  if (isSeeding) {
    console.log(`Skipping smart bookmark relocation: seeding`)
    return;
  }

  if (bookmarkInfo.type === 'folder') {
    console.log(`New bookmark folder, skipping smart bookmark relocation`);
    return;
  }

  console.log(`New bookmark ID: ${id}`);
  console.log(`New bookmark URL: ${bookmarkInfo.url}`);
  console.log(`New bookmark title: ${bookmarkInfo.title}`);
  console.log(`New bookmark parent ID: ${bookmarkInfo.parentId}`);

  // TODO what if bookmark created for non-active tab? consider using URL instead? or bookmark info?
  // Maybe search in open tabs for that url, and if not found, then open it on your own?
  // Is that more robust than getting current open tab?

  const content = await getCurrentTabContent();

  if (!isEnoughContent(content)) {
    console.log('Not enough text content, skipping smart bookmark relocation');
    return;
  }

  const destinations = await getDestinationEmbeddings(id);
  if (destinations.length === 0) {
    console.log('No destinations with embeddings found, skipping relocation');
    return;
  }

  const embedResult = await embed([content]);
  if (!embedResult || embedResult.length === 0) {
    console.log('Failed to generate content embedding, skipping relocation');
    return;
  }

  const contentEmbedding = embedResult[0];
  console.log("Embedding calculated:", contentEmbedding);

  // Calculate cosine similarity of contentEmbedding vs each destination.embedding
  const similarities = destinations.map(destination => ({
    ...destination,
    similarity: cos_sim(contentEmbedding, destination.embedding)
  })).filter(item => !isNaN(item.similarity));

  // Sort by similarity (highest first)
  similarities.sort((a, b) => b.similarity - a.similarity);

  console.log('\n=== Top 30 most similar destinations ===');
  for (let i = 0; i < Math.min(30, similarities.length); i++) {
    const dest = similarities[i];
    console.log(`${i + 1}. ${dest.id} (similarity: ${dest.similarity.toFixed(4)})`);
  }

  // Pick highest cosine similarity and relocate bookmark to that folderId
  const bestMatch = similarities[0];
  const targetFolderId = bestMatch.folderId;

  console.log(`Relocating bookmark to folder ${targetFolderId} (similarity: ${bestMatch.similarity.toFixed(4)})`);
  await browser.bookmarks.move(id, { parentId: targetFolderId });
}

async function seedTestBookmarks() {
  try {
    isSeeding = true; // Disable smart relocation
    console.log('Seeding test bookmarks...');

    // Create folders and bookmarks
    const testData = [
      {
        folder: 'Vegetables',
        bookmarks: [
          { title: 'Carrot - Wikipedia', url: 'https://en.wikipedia.org/wiki/Carrot' },
          { title: 'Broccoli - Wikipedia', url: 'https://en.wikipedia.org/wiki/Broccoli' }
        ]
      },
      {
        folder: 'Geography',
        bookmarks: [
          { title: 'Mount Everest - Wikipedia', url: 'https://en.wikipedia.org/wiki/Mount_Everest' },
          { title: 'Amazon River - Wikipedia', url: 'https://en.wikipedia.org/wiki/Amazon_River' }
        ]
      },
      {
        folder: 'Celebrities',
        bookmarks: [
          { title: 'Albert Einstein - Wikipedia', url: 'https://en.wikipedia.org/wiki/Albert_Einstein' },
          { title: 'Leonardo da Vinci - Wikipedia', url: 'https://en.wikipedia.org/wiki/Leonardo_da_Vinci' }
        ]
      },
      {
        folder: 'Science',
        bookmarks: [
          { title: 'Quantum mechanics - Wikipedia', url: 'https://en.wikipedia.org/wiki/Quantum_mechanics' },
          { title: 'DNA - Wikipedia', url: 'https://en.wikipedia.org/wiki/DNA' }
        ]
      }
    ];

    for (const category of testData) {
      // Create folder (omit url to create folder)
      const folder = await browser.bookmarks.create({
        title: category.folder
      });

      console.log(`Created folder: ${category.folder}`);

      // Create bookmarks in folder
      for (const bookmark of category.bookmarks) {
        await browser.bookmarks.create({
          title: bookmark.title,
          url: bookmark.url,
          parentId: folder.id
        });
        console.log(`  Added bookmark: ${bookmark.title}`);
      }
    }

    console.log('Test bookmarks seeded successfully');
  } catch (error) {
    console.error('Error seeding test bookmarks:', error);
  } finally {
    isSeeding = false; // Re-enable smart relocation
  }
}

browser.runtime.onInstalled.addListener(async () => {
  await preloadModel();
  await seedTestBookmarks();
  await initDestinationEmbeddings();
});

browser.runtime.onStartup.addListener(async () => {
  await preloadModel();
});

browser.bookmarks.onCreated.addListener(handleCreated);