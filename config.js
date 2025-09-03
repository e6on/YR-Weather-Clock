/**
 * =================================================================
 * SHARED CONFIGURATION
 * =================================================================
 * This file centralizes configuration for the entire application.
 *
 * How to use:
 * 1. Include this script BEFORE other scripts in your HTML file:
 *    <script src="config.js"></script>
 *    <script src="weather.js" defer></script>
 *    <script src="clock.js" defer></script>
 *
 * 2. Access configuration values in any script via the global `APP_CONFIG` object.
 *    For example: `APP_CONFIG.LOCATION.LATITUDE`
 */

const APP_CONFIG = {
    // --- Location (Used by Weather & Clock) ---
    LOCATION: {
        LATITUDE: 59.443,
        LONGITUDE: 24.738,
    },

    // --- Weather Widget ---
    WEATHER: {
        API_URL: "https://api.met.no/weatherapi/locationforecast/2.0/complete",
        THEME: "realistic", // "yr", "anim", "realistic"
        NUM_OF_DAYS_FORECAST: 3,
        CONTAINER_SELECTOR: ".maincontainer",
        MAX_FETCH_RETRIES: 3,
        RETRY_DELAY_MS: 5000,
    },

    // --- Clock Widget ---
    CLOCK: {
        HOLIDAY_API_URL: 'https://xn--riigiphad-v9a.ee/et/koik?output=json',
        CORS_PROXY_URL: 'https://corsproxy.io/?',
        // Moon settings
        MOON_DIAMETER: 70,
        // Special events override public holidays.
        SPECIAL_EVENTS: [
            {
                date: '1984-03-18',
                message: 'PALJU &Otilde;NNE S&Uuml;NNIP&Auml;EVAKS!',
                anniversaryFormat: '({years}a)' // Specific format for this event
            },
            {
                date: '2020-08-23',
                message: 'TUTVUSIME!',
                anniversaryFormat: '({years}a)'
            },
            {
                date: '2020-09-09',
                message: 'KOHTUSIME!',
                anniversaryFormat: '({years}a)' // null to Disable anniversary for this event
            },
            { date: '2022-03-28', message: 'KOOSELU!', anniversaryFormat: '({years}a)' }
            // Add more special events here with full date 'YYYY-MM-DD'
        ],
        // Format for the anniversary text. Use '{years}' as a placeholder.
        // This is a global fallback if an event doesn't specify its own format.
        // Set to null or an empty string to disable anniversaries by default.
        ANNIVERSARY_FORMAT: '({years}a)', // Default format
    },
};