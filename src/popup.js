async function clearAllEmbeddings() {
  const allStorage = await browser.storage.local.get();
  const embeddingKeys = Object.keys(allStorage).filter(key => key.startsWith('embedding_'));
  await browser.storage.local.remove(embeddingKeys);
  console.log(`Cleared ${embeddingKeys.length} bookmark data points`);
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
      
      status.textContent = `Cleared ${clearedCount} bookmark data points`;
      status.style.color = '#495057';
      
    } catch (error) {
      console.error('Failed to clear bookmark data:', error);
      status.textContent = 'Error clearing bookmark data';
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
      status.textContent = 'Refreshing...';
      
      await syncDestinationEmbeddings();
      
      status.textContent = 'Bookmark data refreshed successfully';
      status.style.color = '#495057';
      
    } catch (error) {
      console.error('Failed to refresh bookmark data:', error);
      status.textContent = 'Error refreshing bookmark data';
      status.style.color = '#dc3545';
    } finally {
      clearButton.disabled = false;
      syncButton.disabled = false;
    }
  });
});