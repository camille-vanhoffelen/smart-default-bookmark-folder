import { Readability } from '@mozilla/readability';

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

browser.runtime.onMessage.addListener((request) => {
    if (request.type === "extractTextContent") {
        console.log("Extracting page content")
        var textContent = extractTextContent();
        return Promise.resolve({ textContent: textContent });
    }
});