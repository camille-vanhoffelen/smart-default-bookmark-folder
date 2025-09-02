// Flag to disable smart relocation during seeding
let isSeeding = false;

export async function seedTestBookmarks() {
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

export function getIsSeeding() {
  return isSeeding;
}