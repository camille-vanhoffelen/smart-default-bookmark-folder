/**
 * Popup UI for extension management - sync and reset bookmark data.
 */

/**
 * Gets the current sync status from background script.
 */
async function getSyncStatus() {
  try {
    const response = await browser.runtime.sendMessage({
      type: 'GET_SYNC_STATUS'
    });
    return response;
  } catch (error) {
    console.error('Failed to get sync status:', error);
    throw error;
  }
}

/**
 * Updates the sync status display in the popup.
 */
function updateSyncStatusDisplay(status) {
  const syncStatusDiv = document.getElementById('sync-status');
  const syncIndicator = document.getElementById('sync-indicator');

  if (status.isSynced) {
    syncStatusDiv.className = 'sync-status synced';
    syncIndicator.textContent = `${status.syncedBookmarks} / ${status.totalBookmarks} bookmarks synced ✓`;
  } else {
    syncStatusDiv.className = 'sync-status needs-sync';
    syncIndicator.textContent = `${status.syncedBookmarks} / ${status.totalBookmarks} bookmarks synced ⚠️`;
  }
}

/**
 * Clears all stored embedding data from browser storage.
 */
async function clearAllEmbeddings() {
  const allStorage = await browser.storage.local.get();
  const embeddingKeys = Object.keys(allStorage).filter(key => key.startsWith('embedding_'));
  await browser.storage.local.remove(embeddingKeys);
  console.log(`Cleared ${embeddingKeys.length} bookmark data points`);
  return embeddingKeys.length;
}

/**
 * Triggers background script to sync embedding data.
 */
async function syncDestinationEmbeddings() {
  try {
    const response = await browser.runtime.sendMessage({
      type: 'SYNC_DESTINATION_EMBEDDINGS'
    });
    return response;
  } catch (error) {
    console.error('Failed to send sync message to background script:', error);
    throw error;
  }
}

/**
 * Sets up popup UI event listeners and loads initial sync status.
 */
document.addEventListener('DOMContentLoaded', async function() {
  const resetButton = document.getElementById('reset-button');
  const syncButton = document.getElementById('sync-button');
  const status = document.getElementById('status');

  // Load and display initial sync status
  try {
    const syncStatus = await getSyncStatus();
    updateSyncStatusDisplay(syncStatus);
  } catch (error) {
    console.error('Failed to load sync status:', error);
    document.getElementById('sync-indicator').textContent = 'Unable to load sync status';
  }

  // Reset button: clears and re-syncs all bookmark data
  resetButton.addEventListener('click', async function() {
    // Ask for confirmation before proceeding
    const confirmed = confirm(
      "Reset will rebuild your bookmark index from scratch and may take several minutes.\n\n" +
      "This is rarely needed. Only use if bookmark suggestions seem incorrect.\n\n" +
      "Continue with reset?"
    );

    if (!confirmed) {
      return; // User cancelled, do nothing
    }

    try {
      resetButton.disabled = true;
      syncButton.disabled = true;
      status.textContent = 'Resetting...';

      // Clear all embeddings
      const clearedCount = await clearAllEmbeddings();
      console.log(`Cleared ${clearedCount} bookmark data points`);

      // Update status to show data is cleared
      const statusAfterClear = await getSyncStatus();
      updateSyncStatusDisplay(statusAfterClear);

      status.textContent = 'Re-syncing...';

      // Re-sync all bookmarks
      await syncDestinationEmbeddings();

      // Update status display
      const finalStatus = await getSyncStatus();
      updateSyncStatusDisplay(finalStatus);

      status.textContent = 'Bookmark data reset successfully';
      status.style.color = '#495057';

    } catch (error) {
      console.error('Failed to reset bookmark data:', error);
      status.textContent = 'Error resetting bookmark data';
      status.style.color = '#dc3545';
    } finally {
      resetButton.disabled = false;
      syncButton.disabled = false;
    }
  });

  // Sync button: syncs bookmark data
  syncButton.addEventListener('click', async function() {
    try {
      resetButton.disabled = true;
      syncButton.disabled = true;
      status.textContent = 'Syncing...';

      await syncDestinationEmbeddings();

      // Update status display
      const syncStatus = await getSyncStatus();
      updateSyncStatusDisplay(syncStatus);

      status.textContent = 'Bookmark data synced successfully';
      status.style.color = '#495057';

    } catch (error) {
      console.error('Failed to sync bookmark data:', error);
      status.textContent = 'Error syncing bookmark data';
      status.style.color = '#dc3545';
    } finally {
      resetButton.disabled = false;
      syncButton.disabled = false;
    }
  });
});