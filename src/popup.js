async function clearAllEmbeddings() {
  const allStorage = await browser.storage.local.get();
  const embeddingKeys = Object.keys(allStorage).filter(key => key.startsWith('embedding_'));
  await browser.storage.local.remove(embeddingKeys);
  console.log(`Cleared ${embeddingKeys.length} cache entries`);
  return embeddingKeys.length;
}

async function syncDestinationEmbeddings() {
  // Send message to background script to trigger sync
  try {
    const response = await browser.runtime.sendMessage({
      type: 'syncDestinationEmbeddings'
    });
    return response;
  } catch (error) {
    console.error('Failed to send sync message to background script:', error);
    throw error;
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const clearButton = document.getElementById('clear-button');
  const syncButton = document.getElementById('sync-button');
  const status = document.getElementById('status');

  clearButton.addEventListener('click', async function() {
    try {
      clearButton.disabled = true;
      syncButton.disabled = true;
      status.textContent = 'Clearing...';
      
      const clearedCount = await clearAllEmbeddings();
      
      status.textContent = `Cleared ${clearedCount} cache entries`;
      status.style.color = '#495057';
      
    } catch (error) {
      console.error('Failed to clear cache:', error);
      status.textContent = 'Error clearing cache';
      status.style.color = '#dc3545';
    } finally {
      clearButton.disabled = false;
      syncButton.disabled = false;
    }
  });

  syncButton.addEventListener('click', async function() {
    try {
      clearButton.disabled = true;
      syncButton.disabled = true;
      status.textContent = 'Syncing...';
      
      await syncDestinationEmbeddings();
      
      status.textContent = 'Cache synced successfully';
      status.style.color = '#495057';
      
    } catch (error) {
      console.error('Failed to sync cache:', error);
      status.textContent = 'Error syncing cache';
      status.style.color = '#dc3545';
    } finally {
      clearButton.disabled = false;
      syncButton.disabled = false;
    }
  });
});