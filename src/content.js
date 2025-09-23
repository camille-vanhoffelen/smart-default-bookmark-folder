/**
 * Content script for extracting page text using Mozilla Readability.
 */

import { Readability } from '@mozilla/readability';

/**
 * Extracts clean text content from page using Readability.
 */
function extractTextContent() {
    try {
        var documentClone = document.cloneNode(true);
        var article = new Readability(documentClone).parse();
        if (article) {
            return article.textContent;
        }
        throw new Error('Readability failed to extract article content');
    } catch (error) {
        console.error('Error extracting content:', error);
        return null;
    }
}

/**
 * Message listener for background script text content extraction requests.
 */
browser.runtime.onMessage.addListener((request) => {
    if (request.type === "extractTextContent") {
        console.log("Extracting page content")
        var textContent = extractTextContent();
        return Promise.resolve({ textContent: textContent });
    }
});