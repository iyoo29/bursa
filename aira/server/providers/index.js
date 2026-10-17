/**
 * AI Provider Factory
 * Memilih provider berdasarkan konfigurasi AI_PROVIDER di environment.
 * Default: 'mock' (Aman, zero cost, tidak butuh API key).
 */

const MockAIProvider = require('./mock_provider');
const OpenAICompatibleProvider = require('./openai_provider');

function getAIProvider() {
    const providerType = (process.env.AI_PROVIDER || 'mock').toLowerCase();

    switch (providerType) {
        case 'openai':
        case 'gemini':
            return new OpenAICompatibleProvider();
        case 'mock':
        default:
            return new MockAIProvider();
    }
}

module.exports = {
    getAIProvider,
    MockAIProvider,
    OpenAICompatibleProvider
};
