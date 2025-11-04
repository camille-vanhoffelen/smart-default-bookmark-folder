// UI Elements
const saveButton = document.getElementById('saveButton');
const closeButton = document.getElementById('closeButton');
const actionSection = document.getElementById('actionSection');
const progressSection = document.getElementById('progressSection');
const completeSection = document.getElementById('completeSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const progressCount = document.getElementById('progressCount');

// Listen for progress updates from background script
browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'SYNC_PROGRESS') {
    updateProgress(message.current, message.total);
  } else if (message.type === 'SYNC_COMPLETE') {
    showComplete();
  }
});

// Handle "Save Bookmark Data" button click
saveButton.addEventListener('click', async () => {
  // Hide action section, show progress section
  actionSection.classList.add('hidden');
  progressSection.classList.remove('hidden');
  progressSection.classList.add('fade-in');

  // Disable button
  saveButton.disabled = true;

  // Send message to background script to start sync
  try {
    await browser.runtime.sendMessage({ type: 'START_ONBOARDING_SYNC' });
  } catch (error) {
    console.error('Error starting sync:', error);
    progressText.textContent = 'Error: Could not start sync. Please try again.';
    progressText.style.color = '#f44336';
  }
});

// Handle "Get Started" button click
closeButton.addEventListener('click', () => {
  window.close();
});

// Update progress bar and text
function updateProgress(current, total) {
  const percentage = total > 0 ? (current / total) * 100 : 0;

  progressFill.style.width = `${percentage}%`;
  progressText.textContent = 'Processing bookmarks...';
  progressCount.textContent = `${current} / ${total}`;
}

// Show completion message
function showComplete() {
  progressSection.classList.add('hidden');
  completeSection.classList.remove('hidden');
  completeSection.classList.add('fade-in');
}
