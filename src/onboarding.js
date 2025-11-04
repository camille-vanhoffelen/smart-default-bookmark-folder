// UI Elements
const saveButton = document.getElementById('saveButton');
const closeButton = document.getElementById('closeButton');
const actionSection = document.getElementById('actionSection');
const progressSection = document.getElementById('progressSection');
const completeSection = document.getElementById('completeSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const progressCount = document.getElementById('progressCount');

browser.runtime.onMessage.addListener((message) => {
  if (message.type === 'SYNC_PROGRESS') {
    updateProgress(message.current, message.total);
  } else if (message.type === 'SYNC_COMPLETE') {
    showComplete();
  }
});

saveButton.addEventListener('click', async () => {
  actionSection.classList.add('hidden');
  progressSection.classList.remove('hidden');
  progressSection.classList.add('fade-in');

  saveButton.disabled = true;

  try {
    await browser.runtime.sendMessage({ type: 'START_ONBOARDING_SYNC' });
  } catch (error) {
    console.error('Error starting sync:', error);
    progressText.textContent = 'Error: Could not start sync. Please try again.';
    progressText.style.color = '#f44336';
  }
});

closeButton.addEventListener('click', () => {
  window.close();
});

function updateProgress(current, total) {
  const percentage = total > 0 ? (current / total) * 100 : 0;

  progressFill.style.width = `${percentage}%`;
  progressText.textContent = 'Processing bookmarks...';
  progressCount.textContent = `${current} / ${total}`;
}

function showComplete() {
  progressSection.classList.add('hidden');
  completeSection.classList.remove('hidden');
  completeSection.classList.add('fade-in');
}
