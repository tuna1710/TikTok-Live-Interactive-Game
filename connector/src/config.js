require('dotenv').config();

const config = {
    tiktok: {
        username: process.env.TIKTOK_USERNAME || 'zuno_live',
        reconnectInterval: parseInt(process.env.RECONNECT_INTERVAL_MS || '5000', 10),
        maxReconnectAttempts: parseInt(process.env.MAX_RECONNECT_ATTEMPTS || '10', 10),
    },
    ports: {
        http: parseInt(process.env.HTTP_PORT || '3000', 10),
        ws: parseInt(process.env.WS_PORT || '8080', 10),
    },
    gameplay: {
        coinIncense: parseInt(process.env.GIFT_COIN_INCENSE || '1', 10),
        coinBow: parseInt(process.env.GIFT_COIN_BOW || '5', 10),
        coinLotus: parseInt(process.env.GIFT_COIN_LOTUS || '10', 10),
        queueIntervalMs: parseInt(process.env.QUEUE_INTERVAL_MS || '3000', 10),
        enableProfanityFilter: process.env.ENABLE_PROFANITY_FILTER !== 'false',
    },
    mockMode: process.env.MOCK_MODE === 'true',
};

module.exports = config;
