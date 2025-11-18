/**
 * =================================================================
 * SHARED UTILITY FUNCTIONS
 * =================================================================
 * This file contains common utility functions used across the application.
 *
 * How to use:
 * 1. Include this script AFTER config.js and BEFORE other app scripts in your HTML:
 *    <script src="config.js"></script>
 *    <script src="utils.js"></script>
 *    <script src="weather.js" defer></script>
 *    <script src="clock.js" defer></script>
 */

// --- Shared Constants ---
const MS_IN_SECOND = 1000;
const MS_IN_HOUR = 3600000;
const MS_IN_MINUTE = 60000;

/**
 * Adds a leading zero to single-digit numbers.
 * @param {number} num - The number to format.
 * @returns {string} Formatted number string.
 */
const addZero = (num) => String(num).padStart(2, '0');

/**
 * Gets the date string in YYYY-MM-DD format for the local timezone from a Date object.
 * @param {Date} date - The date object to format.
 * @returns {string} Date string (e.g., "2023-04-23").
 */
const getLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = addZero(date.getMonth() + 1);
    const day = addZero(date.getDate());
    return `${year}-${month}-${day}`;
};

/**
 * Calculates a future date string in YYYY-MM-DDTHH format.
 * @param {Date} baseDate - The starting date object.
 * @param {number} daysOffset - Number of days to add.
 * @param {number} hour - Specific hour (0-23). Must be provided.
 * @returns {string} Date string in YYYY-MM-DDTHH format (e.g., "2024-02-01T06").
 */
const getFutureDateString = (baseDate, daysOffset, hour) => {
    if (hour === undefined || hour === null || hour < 0 || hour > 23) {
        console.error("getFutureDateString requires a valid hour (0-23).");
        return "INVALID_DATE_FORMAT";
    }

    const targetDate = new Date(baseDate); // Create a copy to avoid modifying the original
    targetDate.setDate(targetDate.getDate() + daysOffset);

    const year = targetDate.getFullYear();
    const month = addZero(targetDate.getMonth() + 1);
    const day = addZero(targetDate.getDate());

    return `${year}-${month}-${day}T${addZero(hour)}`;
};

/**
 * Calculates the 'feels like' temperature using the wind chill formula.
 * The formula is generally applied for temperatures at or below 10°C and wind speeds above 4.8 km/h.
 * @param {number} tempCelsius - The air temperature in degrees Celsius.
 * @param {number} windSpeedMs - The wind speed in meters per second.
 * @returns {number | null} The calculated wind chill temperature in Celsius, or null if conditions aren't met.
 */
const calculateWindChill = (tempCelsius, windSpeedMs) => {
    if (tempCelsius == null || windSpeedMs == null) return null;

    const windSpeedKmh = windSpeedMs * 3.6;

    // Only calculate if temperature is low enough and wind is strong enough
    if (tempCelsius > 10 || windSpeedKmh <= 4.8) {
        return null;
    }

    const windChill = 13.12 +
        (0.6215 * tempCelsius) -
        (11.37 * Math.pow(windSpeedKmh, 0.16)) +
        (0.3965 * tempCelsius * Math.pow(windSpeedKmh, 0.16));

    return Math.round(windChill);
};
/**
 * A helper function to create a delay.
 * @param {number} ms - The number of milliseconds to wait.
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * A wrapper for the fetch API that includes automatic retry logic.
 * @param {string} url - The URL to fetch.
 * @param {object} [retryOptions={}] - Options for the retry mechanism.
 * @param {number} [retryOptions.maxRetries=3] - Maximum number of retries. Defaults to 3.
 * @param {number} [retryOptions.retryDelay=1000] - Initial delay between retries in ms. This will be increased exponentially. Defaults to 1000.
 * @param {function} [retryOptions.onRetry] - Callback function executed on each retry attempt. It receives the attempt number and total retries.
 * @returns {Promise<any>} A promise that resolves with the parsed JSON data.
 * @throws {Error} Throws an error if all fetch attempts fail.
 */
const fetchWithRetry = async (url, { maxRetries = 3, retryDelay = 1000, onRetry = () => { } } = {}) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url);

            // If the response is successful, parse and return the JSON.
            if (!response.ok) {
                // For client-side errors (4xx) that are not rate-limiting, don't retry.
                // The request is likely malformed or the resource is not found.
                if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                    console.error(`Client error: ${response.status} ${response.statusText}. Not retrying.`);
                    // Throw a specific error to stop retries.
                    throw new Error(`API request failed with client error: ${response.status} ${response.statusText}`);
                }

                // For server errors (5xx) or rate limiting (429), we will retry.
                // Create an error to be caught by the catch block below.
                const error = new Error(`API request failed: ${response.status} ${response.statusText}`);
                error.response = response; // Attach response to the error object
                throw error;
            }

            return await response.json(); // Success, parse and return JSON

        } catch (error) {
            console.error(`Fetch attempt ${attempt}/${maxRetries} for ${url} failed:`, error.message);

            if (attempt < maxRetries) {
                onRetry(attempt, maxRetries); // Execute the on-retry callback

                // Exponential backoff with jitter
                // 1. Calculate exponential delay: 1s, 2s, 4s, etc.
                const exponentialDelay = retryDelay * Math.pow(2, attempt - 1);
                // 2. Add jitter: a random value to prevent synchronized retries
                const jitter = exponentialDelay * 0.2 * Math.random(); // e.g., up to 20% jitter
                const totalDelay = exponentialDelay + jitter;

                console.log(`Retrying in ${(totalDelay / 1000).toFixed(2)}s...`);
                await delay(totalDelay); // Wait before the next attempt

            } else {
                throw new Error(`All ${maxRetries} fetch attempts failed for ${url}. Last error: ${error.message}`);
            }
        }
    }
};