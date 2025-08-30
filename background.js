// background.js (or service worker)
import { pipeline, env } from '@huggingface/transformers';

// Self-host WASM binaries for strict CSP
env.backends.onnx.wasm.wasmPaths = browser.runtime.getURL('static/wasm/');

class PipelineSingleton {
  static task = 'feature-extraction';
  static model = 'Xenova/all-MiniLM-L6-v2';
  static instance = null;

  static async getInstance(progress_callback = null) {
    this.instance ??= pipeline(this.task, this.model, { progress_callback });

    return this.instance;
  }
}

async function embed(text) {
  try {
    let model = await PipelineSingleton.getInstance((data) => {
      console.log('progress', data)
    });
    console.log('Model loaded:', model);
    // TODO fix
    // const result = await model(text);
    const result = await model("This is a sentence, yay!");
    console.log('Model result:', result);
    return result;
  } catch (error) {
    console.error('Error in embed function:', error);
    return null;
  }
}

async function getCurrentTabContent() {
  const tabs = await browser.tabs.query({
    currentWindow: true,
    active: true,
  });

  if (tabs.length !== 1) return null;

  return await getTabContent(tabs[0].id);
}

async function getTabContent(tabId) {
  try {
    const response = await browser.tabs.sendMessage(tabId, {
      type: "extractTextContent"
    });

    if (response && response.textContent) {
      console.log("Text content extracted:", response.textContent);
      return response.textContent;
    }
    return null;
  } catch (error) {
    console.error(`Could not get tab content: ${error}`);
    return null;
  }
}

async function handleCreated(id, bookmarkInfo) {
  console.log(`New bookmark ID: ${id}`);
  console.log(`New bookmark URL: ${bookmarkInfo.url}`);
  console.log(`New bookmark title: ${bookmarkInfo.title}`);
  console.log(`New bookmark parent ID: ${bookmarkInfo.parentId}`);

  const content = await getCurrentTabContent();
  if (content) {
    const embedding = await embed(content);
    console.log("Embedding calculated:", embedding);
  }
}

browser.bookmarks.onCreated.addListener(handleCreated);